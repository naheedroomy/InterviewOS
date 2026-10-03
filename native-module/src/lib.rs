#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use ringbuf::traits::Consumer;

pub mod audio_config;
pub mod license;
pub mod microphone;
pub mod silence_suppression;
pub mod speaker;

#[cfg(target_os = "macos")]
pub mod stealth_window;

#[cfg(target_os = "macos")]
pub mod keyboard_tap;

use crate::audio_config::{CHUNK_BATCH_COUNT, CHUNK_BATCH_TIMEOUT_MS, DSP_POLL_MS};
use crate::silence_suppression::{FrameAction, SilenceSuppressionConfig, SilenceSuppressor};
use std::time::Instant;

// ============================================================================
// HELPERS — i16 slice → zero-copy LE bytes
// ============================================================================

/// Convert an i16 slice to little-endian bytes.
///
/// All targets supported by AnswerCue (macOS x64/arm64, Windows x64, Linux x64)
/// are little-endian, so `i16` in memory IS the little-endian byte
/// representation. `bytemuck::cast_slice` produces a `&[u8]` view of the same
/// memory in O(1) with no per-sample work; we then `to_vec` once into the
/// owned buffer napi requires for `Buffer::from(Vec<u8>)`.
///
/// Replaces the previous per-sample `extend_from_slice(&s.to_le_bytes())` loop,
/// which did 960 sequential 2-byte appends per 20ms chunk × 50 chunks/sec.
#[inline]
fn i16_slice_to_le_bytes(samples: &[i16]) -> Vec<u8> {
    bytemuck::cast_slice::<i16, u8>(samples).to_vec()
}

/// Coalesces up to `CHUNK_BATCH_COUNT` Send/SendSilence DSP frames into a
/// single tsfn (V8 boundary) call. Each tsfn invocation traverses the napi
/// scheduler, allocates a JS Buffer wrapper, and dispatches an event-loop
/// task — non-trivial overhead per ~1.9 KB chunk. Coalescing 3 frames cuts
/// boundary crossings 3× while keeping latency below STT framing thresholds
/// (Google / Soniox / Deepgram all accept 60–100 ms framing).
///
/// Flush triggers:
///   - `frames` == CHUNK_BATCH_COUNT (capacity reached), or
///   - `(now - first_push_at) > CHUNK_BATCH_TIMEOUT_MS` (timeout for trailing
///     speech in light traffic), or
///   - explicit `flush()` (DSP loop exit).
struct BatchEmitter {
    buffer: Vec<u8>,
    frames: usize,
    first_push_at: Option<Instant>,
}
impl BatchEmitter {
    fn new(estimated_chunk_bytes: usize) -> Self {
        Self {
            buffer: Vec::with_capacity(estimated_chunk_bytes * CHUNK_BATCH_COUNT),
            frames: 0,
            first_push_at: None,
        }
    }
    fn push(&mut self, bytes: &[u8], tsfn: &ThreadsafeFunction<Buffer>) {
        if self.first_push_at.is_none() {
            self.first_push_at = Some(Instant::now());
        }
        self.buffer.extend_from_slice(bytes);
        self.frames += 1;
        if self.frames >= CHUNK_BATCH_COUNT {
            self.flush(tsfn);
        }
    }
    fn maybe_flush_timeout(&mut self, tsfn: &ThreadsafeFunction<Buffer>) {
        if let Some(t) = self.first_push_at {
            if t.elapsed().as_millis() >= CHUNK_BATCH_TIMEOUT_MS {
                self.flush(tsfn);
            }
        }
    }
    fn flush(&mut self, tsfn: &ThreadsafeFunction<Buffer>) {
        if self.buffer.is_empty() {
            self.first_push_at = None;
            self.frames = 0;
            return;
        }
        // Move buffer's contents out into a fresh Vec for the napi Buffer.
        // Keep the original allocation for the next batch.
        let take = std::mem::take(&mut self.buffer);
        self.buffer.reserve(take.capacity());
        tsfn.call(
            Ok(Buffer::from(take)),
            ThreadsafeFunctionCallMode::NonBlocking,
        );
        self.frames = 0;
        self.first_push_at = None;
    }
}

// ============================================================================
// SYSTEM AUDIO CAPTURE (CoreAudio Tap / ScreenCaptureKit on macOS)
// ============================================================================

#[napi]
pub struct SystemAudioCapture {
    stop_signal: Arc<AtomicBool>,
    capture_thread: Option<thread::JoinHandle<()>>,
    /// Shared atomic sample rate — updated by the background thread once the
    /// native device is initialized. Callers always get the real hardware rate.
    sample_rate: Arc<AtomicU32>,
    device_id: Option<String>,
}

#[napi]
impl SystemAudioCapture {
    #[napi(constructor)]
    pub fn new(device_id: Option<String>) -> napi::Result<Self> {
        println!("[SystemAudioCapture] Created (device: {:?})", device_id);

        Ok(SystemAudioCapture {
            stop_signal: Arc::new(AtomicBool::new(false)),
            capture_thread: None,
            // Default to 48000 until the background thread reports the real rate.
            // 48kHz is the standard macOS CoreAudio rate.
            sample_rate: Arc::new(AtomicU32::new(48000)),
            device_id,
        })
    }

    #[napi]
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Acquire)
    }

    #[napi]
    pub fn start(
        &mut self,
        callback: ThreadsafeFunction<Buffer>,
        on_speech_ended: Option<ThreadsafeFunction<bool>>,
    ) -> napi::Result<()> {
        // Guard against double-start — prevents spawning concurrent threads
        if self.capture_thread.is_some() {
            return Err(napi::Error::from_reason("Capture already running"));
        }

        let tsfn = callback;
        let speech_ended_tsfn = on_speech_ended;

        self.stop_signal.store(false, Ordering::SeqCst);
        let stop_signal = self.stop_signal.clone();
        let sample_rate_shared = self.sample_rate.clone();
        let device_id = self.device_id.clone();

        // ALL init + DSP runs in background thread — start() returns INSTANTLY
        self.capture_thread = Some(thread::spawn(move || {
            // 1. SpeakerInput Init (takes 5-7 seconds — runs OFF main thread)
            println!("[SystemAudioCapture] Background init starting...");
            let input = match speaker::SpeakerInput::new(device_id.clone()) {
                Ok(i) => i,
                Err(e) => {
                    println!("[SystemAudioCapture] Init failed: {}. Trying default...", e);
                    match speaker::SpeakerInput::new(None) {
                        Ok(i) => i,
                        Err(e2) => {
                            let msg = format!(
                                "[SystemAudioCapture] FATAL: All init attempts failed: {}",
                                e2
                            );
                            eprintln!("{}", msg);
                            // Notify JS so it can emit 'error' and reset isRecording
                            tsfn.call(
                                Err(napi::Error::from_reason(msg)),
                                ThreadsafeFunctionCallMode::NonBlocking,
                            );
                            return;
                        }
                    }
                }
            };

            let mut stream = match input.stream() {
                Ok(s) => s,
                Err(e) => {
                    let msg = format!(
                        "[SystemAudioCapture] FATAL: stream() failed: {}",
                        e
                    );
                    eprintln!("{}", msg);
                    tsfn.call(
                        Err(napi::Error::from_reason(msg)),
                        ThreadsafeFunctionCallMode::NonBlocking,
                    );
                    return;
                }
            };
            let mut consumer = match stream.take_consumer() {
                Some(c) => c,
                None => {
                    let msg = "[SystemAudioCapture] FATAL: Failed to get consumer".to_string();
                    eprintln!("{}", msg);
                    tsfn.call(
                        Err(napi::Error::from_reason(msg)),
                        ThreadsafeFunctionCallMode::NonBlocking,
                    );
                    return;
                }
            };

            let native_rate = stream.sample_rate();
            // Publish the real native rate so JS can read it via get_sample_rate()
            sample_rate_shared.store(native_rate, Ordering::Release);
            println!(
                "[SystemAudioCapture] Background init complete. Initial Rate: {}Hz. DSP starting.",
                native_rate
            );

            // 2. DSP loop with silence suppression + WebRTC VAD
            let mut suppressor = SilenceSuppressor::new(SilenceSuppressionConfig {
                native_sample_rate: native_rate,
                ..SilenceSuppressionConfig::for_system_audio()
            });

            // 20ms chunks at native rate (e.g. 960 samples at 48kHz)
            let chunk_size = (native_rate as usize / 1000) * 20;
            let mut frame_buffer: Vec<i16> = Vec::with_capacity(chunk_size * 4);
            let mut raw_batch: Vec<f32> = Vec::with_capacity(4096);
            // PERF: pre-allocated frame scratch (avoids per-chunk Vec alloc).
            let mut frame_scratch: Vec<i16> = Vec::with_capacity(chunk_size);
            // PERF: coalesce up to CHUNK_BATCH_COUNT frames into one tsfn call.
            // Cuts V8 boundary crossings 3× with no perceptible STT-side latency.
            let mut emitter = BatchEmitter::new(chunk_size * 2);

            loop {
                if stop_signal.load(Ordering::Relaxed) {
                    break;
                }

                // Drain ALL available samples from ring buffer (lock-free)
                while let Some(sample) = consumer.try_pop() {
                    raw_batch.push(sample);
                }

                // Convert f32 -> i16 at native sample rate
                if !raw_batch.is_empty() {
                    for &f in &raw_batch {
                        let scaled = (f * 32767.0).clamp(-32768.0, 32767.0);
                        frame_buffer.push(scaled as i16);
                    }
                    raw_batch.clear();
                }

                // Process in 20ms chunks through the two-stage gate
                while frame_buffer.len() >= chunk_size {
                    frame_scratch.clear();
                    frame_scratch.extend(frame_buffer.drain(0..chunk_size));

                    let (action, speech_ended) = suppressor.process(&frame_scratch);

                    match action {
                        FrameAction::Send(data) => {
                            let bytes = i16_slice_to_le_bytes(&data);
                            emitter.push(&bytes, &tsfn);
                        }
                        FrameAction::SendSilence => {
                            // Zero-filled bytes to keep streaming APIs alive.
                            let silence = vec![0u8; chunk_size * 2];
                            emitter.push(&silence, &tsfn);
                        }
                        FrameAction::Suppress => {
                            // Do nothing — bandwidth saving. A pending partial
                            // batch can age out via the timeout check below.
                        }
                    }

                    // Fire speech_ended callback on the exact transition frame.
                    // Flush any pending batch FIRST so STT sees the trailing audio
                    // before being told the utterance ended.
                    if speech_ended {
                        emitter.flush(&tsfn);
                        if let Some(ref se_tsfn) = speech_ended_tsfn {
                            se_tsfn.call(Ok(true), ThreadsafeFunctionCallMode::NonBlocking);
                        }
                    }
                }

                // Flush partial batch on timeout so trailing speech in light
                // traffic isn't held up.
                emitter.maybe_flush_timeout(&tsfn);

                // Keep the sleep small so we quickly read the ring buffer
                thread::sleep(Duration::from_millis(DSP_POLL_MS));
            }

            // Flush any remaining batched audio before exit.
            emitter.flush(&tsfn);
            println!("[SystemAudioCapture] DSP thread stopped.");
            // stream is dropped here → SpeakerStream::Drop calls stop_with_ch
        }));

        Ok(())
    }

    #[napi]
    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.capture_thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for SystemAudioCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

// ============================================================================
// MICROPHONE CAPTURE (CPAL) — LAZY INIT
//
// Design: The constructor does ZERO CPAL/CoreAudio work — it only stores the
// device ID. All CPAL device opening, config negotiation, stream building,
// and playback happens on a background thread spawned by start(). This
// guarantees the Electron main thread never blocks on CoreAudio HAL, even
// when a device reconfiguration (e.g. Bluetooth connect/disconnect) stalls
// the HAL for tens of seconds.
//
// Lifecycle:
//   constructor → stores device_id only
//   start()     → spawns worker thread → MicrophoneStream::new → play → DSP loop
//   stop()      → signals cancellation, detaches worker (NEVER joins)
//   drop        → calls stop()
//
// Cancellation uses a generation counter: each start() increments the
// generation; each blocking boundary in the worker checks whether its own
// generation is still active. A delayed old-init worker from a previous
// generation sees the mismatch and exits silently, preventing a stale init
// from becoming active after a restart cycle.
// ============================================================================

#[napi]
pub struct MicrophoneCapture {
    device_id: Option<String>,
    stop_signal: Arc<AtomicBool>,
    /// Monotonically increasing generation counter. Incremented on every
    /// start() call.  The worker thread captures its generation at start
    /// and checks it after each blocking CoreAudio boundary.  If the
    /// generation differs the worker is stale and exits immediately.
    generation: Arc<AtomicU32>,
    capture_thread: Option<thread::JoinHandle<()>>,
    /// Shared atomic sample rate — set to 48000 by default; updated by the
    /// worker thread once the CPAL device is opened successfully.
    sample_rate: Arc<AtomicU32>,
}

#[napi]
impl MicrophoneCapture {
    #[napi(constructor)]
    pub fn new(device_id: Option<String>) -> napi::Result<Self> {
        // LAZY CONSTRUCTOR: NO CPAL / CoreAudio work.
        // All device enumeration, stream building, and playback happens on
        // a background thread in start().  This constructor cannot block.
        println!("[MicrophoneCapture] Created (lazy). Device: {:?}", device_id);
        Ok(MicrophoneCapture {
            device_id,
            stop_signal: Arc::new(AtomicBool::new(false)),
            generation: Arc::new(AtomicU32::new(0)),
            capture_thread: None,
            // Safe default; the worker thread overwrites this once the
            // real device rate is known.
            sample_rate: Arc::new(AtomicU32::new(48000)),
        })
    }

    #[napi]
    pub fn get_sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Acquire)
    }

    #[napi]
    pub fn start(
        &mut self,
        callback: ThreadsafeFunction<Buffer>,
        on_speech_ended: Option<ThreadsafeFunction<bool>>,
    ) -> napi::Result<()> {
        // Double-start guard
        if self.capture_thread.is_some() {
            return Err(napi::Error::from_reason("Capture already running"));
        }

        // Bump generation so the new worker has a unique generation token.
        // Any stale worker from a prior start()/stop() cycle will see a
        // mismatch and exit.
        self.stop_signal.store(false, Ordering::SeqCst);
        let my_gen = self.generation.fetch_add(1, Ordering::AcqRel) + 1;

        let stop_signal = self.stop_signal.clone();
        let generation = self.generation.clone();
        let sample_rate_shared = self.sample_rate.clone();
        let device_id = self.device_id.clone();
        let tsfn = callback;
        let speech_ended_tsfn = on_speech_ended;

        self.capture_thread = Some(thread::spawn(move || {
            // ── Cancellation check helper ────────────────────────────────
            // The worker checks its generation immediately after every
            // blocking boundary (CoreAudio init, play, etc.) so a stale
            // worker exits ASAP rather than emitting data after restart.
            let is_current = || -> bool {
                !stop_signal.load(Ordering::Relaxed)
                    && generation.load(Ordering::Acquire) == my_gen
            };

            // ── 1. Create CPAL stream (MAY BLOCK on CoreAudio HAL) ─────
            let mut input = match microphone::MicrophoneStream::new(device_id.clone()) {
                Ok(i) => i,
                Err(e) => {
                    let msg = format!("[MicrophoneCapture] Init failed: {}", e);
                    eprintln!("{}", msg);
                    tsfn.call(
                        Err(napi::Error::from_reason(msg)),
                        ThreadsafeFunctionCallMode::NonBlocking,
                    );
                    return;
                }
            };

            if !is_current() { return; }

            let native_rate = input.sample_rate();
            sample_rate_shared.store(native_rate, Ordering::Release);
            println!(
                "[MicrophoneCapture] Background init complete. Rate: {}Hz. Starting DSP.",
                native_rate
            );

            // ── 2. Play stream (MAY BLOCK on CoreAudio HAL) ─────────────
            if let Err(e) = input.play() {
                let msg = format!("[MicrophoneCapture] Play failed: {}", e);
                eprintln!("{}", msg);
                tsfn.call(
                    Err(napi::Error::from_reason(msg)),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
                return;
            }

            if !is_current() { return; }

            // ── 3. Extract ring-buffer consumer ─────────────────────────
            let mut consumer = match input.take_consumer() {
                Some(c) => c,
                None => {
                    let msg = "[MicrophoneCapture] Failed to get consumer".to_string();
                    eprintln!("{}", msg);
                    tsfn.call(
                        Err(napi::Error::from_reason(msg)),
                        ThreadsafeFunctionCallMode::NonBlocking,
                    );
                    return;
                }
            };

            let err_signal = input.err_signal();

            // ── 4. DSP loop with silence suppression + WebRTC VAD ───────
            // input (MicrophoneStream) stays alive for the lifetime of this
            // closure so the CPAL Stream and its ring-buffer producer remain
            // active.
            let mut suppressor = SilenceSuppressor::new(SilenceSuppressionConfig {
                native_sample_rate: native_rate,
                ..SilenceSuppressionConfig::for_microphone()
            });

            let chunk_size = (native_rate as usize / 1000) * 20;
            let mut frame_buffer: Vec<i16> = Vec::with_capacity(chunk_size * 4);
            let mut raw_batch: Vec<f32> = Vec::with_capacity(4096);
            let mut frame_scratch: Vec<i16> = Vec::with_capacity(chunk_size);
            // PERF: coalesce up to CHUNK_BATCH_COUNT frames into one tsfn call.
            let mut emitter = BatchEmitter::new(chunk_size * 2);

            println!(
                "[MicrophoneCapture] DSP thread started (VAD + suppression active, rate={}Hz, chunk={})",
                native_rate, chunk_size
            );

            loop {
                if !is_current() { break; }

                // Surface any callback-thread error to JS exactly once.
                if let Ok(mut slot) = err_signal.lock() {
                    if let Some(msg) = slot.take() {
                        let full = format!("[MicrophoneCapture] CPAL error: {}", msg);
                        eprintln!("{}", full);
                        emitter.flush(&tsfn);
                        tsfn.call(
                            Err(napi::Error::from_reason(full)),
                            ThreadsafeFunctionCallMode::NonBlocking,
                        );
                    }
                }

                // Drain ALL available samples from ring buffer (lock-free)
                while let Some(sample) = consumer.try_pop() {
                    raw_batch.push(sample);
                }

                // Convert f32 -> i16 at native sample rate
                if !raw_batch.is_empty() {
                    for &f in &raw_batch {
                        let scaled = (f * 32767.0).clamp(-32768.0, 32767.0);
                        frame_buffer.push(scaled as i16);
                    }
                    raw_batch.clear();
                }

                // Process in 20ms chunks through the two-stage gate
                while frame_buffer.len() >= chunk_size {
                    if !is_current() { break; }

                    frame_scratch.clear();
                    frame_scratch.extend(frame_buffer.drain(0..chunk_size));

                    let (action, speech_ended) = suppressor.process(&frame_scratch);

                    match action {
                        FrameAction::Send(data) => {
                            let bytes = i16_slice_to_le_bytes(&data);
                            emitter.push(&bytes, &tsfn);
                        }
                        FrameAction::SendSilence => {
                            let silence = vec![0u8; chunk_size * 2];
                            emitter.push(&silence, &tsfn);
                        }
                        FrameAction::Suppress => {}
                    }

                    if speech_ended {
                        emitter.flush(&tsfn);
                        if let Some(ref se_tsfn) = speech_ended_tsfn {
                            se_tsfn.call(Ok(true), ThreadsafeFunctionCallMode::NonBlocking);
                        }
                    }
                }

                emitter.maybe_flush_timeout(&tsfn);
                thread::sleep(Duration::from_millis(DSP_POLL_MS));
            }

            emitter.flush(&tsfn);
            println!("[MicrophoneCapture] DSP thread stopped.");
            // input (MicrophoneStream) is dropped here → stream.stop() called
        }));

        Ok(())
    }

    #[napi]
    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        // Bump generation: any delayed old-init worker sees mismatch and exits.
        self.generation.fetch_add(1, Ordering::Release);
        // Drop handle — NEVER join. The worker may be blocked in CoreAudio
        // init (which would make join() hang the main thread indefinitely).
        // Dropping JoinHandle detaches the thread; it exits on its own when
        // is_current() returns false.
        if let Some(handle) = self.capture_thread.take() {
            drop(handle); // detach
        }
    }
}

impl Drop for MicrophoneCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

// ============================================================================
// HEALTH CHECK — cheap non-CoreAudio smoke test for module-loader validation
// ============================================================================

/// Returns `true` if the native module loaded and its basic ABI is functional.
/// Does NOT touch CoreAudio, CPAL, or any HAL resource — safe to call
/// synchronously from the main thread during module-load validation.
#[napi]
pub fn native_module_health_check() -> bool {
    true
}

// ============================================================================
// DEVICE ENUMERATION — via napi `Task` (runs on libuv worker thread)
// ============================================================================

#[napi(object)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
}

// ── Input device enumeration task ─────────────────────────────────────────────

pub struct AsyncInputDevices;

#[napi]
impl Task for AsyncInputDevices {
    type Output = Vec<AudioDeviceInfo>;
    type JsValue = Vec<AudioDeviceInfo>;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        match microphone::list_input_devices() {
            Ok(devs) => Ok(devs
                .into_iter()
                .map(|(id, name)| AudioDeviceInfo { id, name })
                .collect()),
            Err(e) => {
                eprintln!("[get_input_devices] Error: {}", e);
                Ok(Vec::new())
            }
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

/// Enumerate audio input devices. Runs on a libuv worker thread so the
/// CoreAudio HAL query cannot block the Node.js / Electron main thread.
#[napi]
pub fn get_input_devices() -> AsyncTask<AsyncInputDevices> {
    AsyncTask::new(AsyncInputDevices)
}

// ── Output device enumeration task ────────────────────────────────────────────

pub struct AsyncOutputDevices;

#[napi]
impl Task for AsyncOutputDevices {
    type Output = Vec<AudioDeviceInfo>;
    type JsValue = Vec<AudioDeviceInfo>;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        match speaker::list_output_devices() {
            Ok(devs) => Ok(devs
                .into_iter()
                .map(|(id, name)| AudioDeviceInfo { id, name })
                .collect()),
            Err(e) => {
                eprintln!("[get_output_devices] Error: {}", e);
                Ok(Vec::new())
            }
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

/// Enumerate audio output devices. Runs on a libuv worker thread so the
/// CoreAudio HAL query cannot block the Node.js / Electron main thread.
#[napi]
pub fn get_output_devices() -> AsyncTask<AsyncOutputDevices> {
    AsyncTask::new(AsyncOutputDevices)
}

// ── Default-output-device-ID task ─────────────────────────────────────────────

pub struct AsyncDefaultOutputDeviceId;

#[napi]
impl Task for AsyncDefaultOutputDeviceId {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(speaker::default_output_device_uid())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(output)
    }
}

/// Returns the platform-native ID of the current default output device.
/// macOS: CoreAudio device UID. Windows: WASAPI device id (eMultimedia/eConsole role).
/// Empty string on error or unsupported platform.
///
/// Runs on a libuv worker thread so the CoreAudio HAL query cannot block the
/// Node.js main thread.
///
/// JS polls this every few seconds during an active meeting; when the value
/// changes, main.ts recreates SystemAudioCapture so the CoreAudio Tap follows
/// the new output route. Without this, switching output devices mid-meeting
/// (plug in headphones, swap AirPods, route to virtual cable) leaves the tap
/// bound to the original device, capturing silence.
#[napi]
pub fn get_default_output_device_id() -> AsyncTask<AsyncDefaultOutputDeviceId> {
    AsyncTask::new(AsyncDefaultOutputDeviceId)
}
