# native-module/

NAPI-RS (Rust → Node.js) native addon, npm package name `natively-audio`. Provides the performance-critical and OS-privileged capabilities the Electron main process can't get (or can't get fast/safely) from pure JS: low-latency audio capture with silence suppression, macOS stealth window/keyboard behavior, and licensing checks bound to hardware.

## Responsibility

This folder is the system's native extension layer. Its jobs:

- **Microphone capture** (`MicrophoneCapture` class) — real-time mic audio via CPAL, delivered to JS as 20 ms i16-LE chunks for streaming STT.
- **System audio capture** (`SystemAudioCapture` class) — loopback of the computer's output audio (meeting participants). macOS uses CoreAudio process-tap with ScreenCaptureKit fallback; Windows uses WASAPI loopback.
- **Silence suppression + VAD** — gates audio so STT only receives speech (plus keepalive silence frames), with two-stage gating (RMS + WebRTC VAD) and adaptive noise-floor tracking.
- **Stealth overlay** (macOS only) — `applyStealthToWindow` (non-activating panel attributes) and `StealthKeyboardTap` (session-wide CGEventTap keyboard interception) so AnswerCue can capture typing while the user's real app stays frontmost/key.
- **Licensing** — hardware fingerprint (`getHardwareId`) and Gumroad / Dodo Payments key activation, validation, deactivation over HTTP on libuv worker threads.
- **Device enumeration** — input/output device listing + default-output-device polling (to follow mid-meeting output route changes).
- **Module health check** — cheap ABI smoke test for the module loader.

All HAL/CoreAudio work runs on background threads so the Electron main thread never blocks (CoreAudio HAL can stall for tens of seconds during device reconfiguration).

## Design

- **NAPI-RS** (`napi` 3.x + `napi-derive`) compiles a `cdylib` per platform (see `index.darwin-arm64.node`); `index.js` + `index.d.ts` are generated loaders/typings. Cargo config sets `-undefined dynamic_lookup` for macOS so symbols resolve against the host Electron runtime.
- **Lock-free capture pipeline**: device callbacks only push raw `f32` into a SPSC ring buffer (`ringbuf`, `RING_BUFFER_SAMPLES = 32768`); a background DSP thread drains it — no mutexes/allocations in the audio callback.
- **DSP thread** converts `f32 → i16`, slices into 20 ms frames, runs the two-stage gate (`silence_suppression.rs`: RMS threshold, then WebRTC VAD decimated to 16 kHz), and emits `Send` / `SendSilence` / `Suppress` actions. Speech frames are never delayed; hangover only delays the switch to keepalives.
- **V8-boundary batching**: up to 3 frames (60 ms) are coalesced (`BatchEmitter`) into one threadsafe-function call; a 100 ms timeout flushes partial batches.
- **Async via `napi::Task` / `AsyncTask`** for device enumeration, default-device polling, and all license HTTP calls — they run on libuv worker threads.
- **Cancellation**: `MicrophoneCapture` uses a generation counter (start() bumps it; stale workers self-exit after blocking boundaries). `stop()` never joins the mic worker (could hang on a stalled HAL); `SystemAudioCapture.stop()` does join. `stop()` signals an `AtomicBool` the DSP loop checks each iteration.
- **macOS speaker backends** (`speaker/macos.rs`): CoreAudio process tap (requires macOS 14.4+, guarded by runtime version check to avoid the `unrecognized selector` crash of #249) with ScreenCaptureKit fallback (macOS 13+, gated similarly). A sentinel `device_id == "sck"` forces the SCK backend.
- **Stealth keyboard tap** (`keyboard_tap.rs`): session-level CGEventTap on a dedicated worker thread + CFRunLoop; events marshaled to V8 via threadsafe function; a pass-through filter preserves system shortcuts (Cmd/Modifier combos, F-keys, Tab, arrows). Accessibility permission gates `start()`. Careful UAF/refcount handling around the C callback boundary.
- **Stealth window** (`stealth_window.rs`): dereferences the Electron `NSView` handle to its `NSWindow` and sets nonactivating-panel attributes, including private SPI `_setPreventsActivation:` and `setSharingType:` — all `respondsToSelector:`-guarded for graceful degradation.
- **Platform stubs**: Linux gets a `fallback` speaker stub (type-checks only, always errors) since system capture is macOS/Windows only; keyboard/stealth modules are macOS-only behind `cfg(target_os = "macos")`.
- **Audio config** (`audio_config.rs`) centralizes DSP constants (frame size, ring buffer, batch counts, VAD thresholds).

## Flow

1. **Capture start**: JS constructs `MicrophoneCapture`/`SystemAudioCapture` (constructor is lazy — stores device id only) → `start(callback, onSpeechEnded)` spawns a worker thread, which:
   1. Opens the device (CPAL stream / CoreAudio tap / SCK stream / WASAPI loopback), reporting the real native sample rate back via an atomic (`get_sample_rate()`).
   2. Plays the stream → audio callback pushes `f32` into the ring buffer.
   3. DSP loop polls the buffer, processes 20 ms frames through silence suppression + VAD.
   4. Emits `Buffer` chunks (i16 LE) + occasional `speechEnded` to JS via threadsafe callbacks; errors also surface through the same callback channel.
2. **Data out**: chunks flow to the Electron main process, which forwards them to streaming STT.
3. **Stealth flow**: JS hotkey → `StealthKeyboardTap.start(cb, bounds)` → worker blocks on `CFRunLoopRun`; each keystroke fires `CapturedKey {keyCode, chars, flags, isKeyDown, isOutsideMouseDown}` and is swallowed unless it matches the system-shortcut pass-through filter. `updateOverlayBounds()` refreshes the overlay rect; `stop()` wakes the runloop and joins the worker.
4. **Device-route follow**: JS polls `getDefaultOutputDeviceId()` every few seconds; on change it recreates `SystemAudioCapture` so capture follows the new output route.
5. **Licensing**: `verifyDodoKey`/`validateDodoKey`/`deactivateDodoKey`/`verifyGumroadKey` hit their vendor HTTP APIs on libuv threads and return status strings (`"OK[:instance_id]"`, `"REVOKED"`, `"ERR:..."`); callers fail-open on network errors. `getHardwareId()` returns a SHA-256 of the machine UID for device-locking.

## Integration

- **Loader**: `electron/audio/nativeModuleLoader.ts` requires this package (compiled `index.js`), guards ABI via `nativeModuleHealthCheck()`, and is used by `electron/utils/nativeModuleGuard.ts` (`ensureNativeModuleAbi`).
- **Primary consumers** (Electron main process):
  - `electron/main.ts` — constructs/owns `MicrophoneCapture` + `SystemAudioCapture`, wires events, audio recovery/restart logic, output-route polling.
  - `electron/audio/MicrophoneCapture.ts`, `electron/audio/SystemAudioCapture.ts` — JS wrapper classes (EventEmitter) around the native classes.
  - `electron/audio/AudioDevices.ts` — device lists for Settings.
  - `electron/services/StealthKeyboardManager.ts` — stealth typing via `StealthKeyboardTap` + `CapturedKey`/`OverlayBoundsInput`.
  - `electron/ModelSelectorWindowHelper.ts`, `electron/SettingsWindowHelper.ts` — license verification (`verifyDodoKey`, etc.).
- **Packaging**: root `package.json` bundles this folder as `native-module` (excluding `target/`, `src/`, `.cargo`); `.npmignore` ships only the `.node` binary + JS/d.ts.
- **Build**: `npm run build:native` (root) → cargo build via napi-rs; artifacts land in `target/` and are copied to `index.<platform>-<arch>.node`.
- **Runtime permissions** the module drives the user through: Microphone (CPAL), Screen Recording (SCK), Accessibility (CGEventTap).
