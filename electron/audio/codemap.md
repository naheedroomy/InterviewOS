# electron/audio/

## Responsibility

The audio subsystem of the Electron main process: capture raw audio from the
microphone and system output, and feed it to a pluggable Speech-to-Text (STT)
provider that emits live transcripts for the interview/meeting feature.

It owns three concerns:

1. **Capture** — two independent native (Rust/napi-rs) audio streams: one for
   the microphone (`MicrophoneCapture`) and one for system audio
   (`SystemAudioCapture`). Each emits raw PCM chunks plus a `speech_ended`
   signal from the Rust SilenceSuppressor (VAD).
2. **Device handling** — enumerating input/output devices and resolving the
   real hardware sample rate (`AudioDevices`, `nativeModuleLoader`).
3. **STT providers** — a family of interchangeable providers that all implement
   the same EventEmitter interface (`transcript`, `error`, plus lifecycle
   methods), so `main.ts` can swap cloud/local providers without changing the
   pipeline.

## Design

### Native module boundary (`nativeModuleLoader.ts`)
All capture and device enumeration lives in a compiled Rust binary (napi-rs),
loaded directly from the `.node` file (bypassing npm symlinks that break on
Windows). `loadNativeModule()`:
- Tries candidate paths in order (packaged `app.asar.unpacked` first, then dev
  paths) and caches the result.
- Validates the binary with `validateNativeModule()`: hard-required methods +
  constructors, soft-required (Dodo) methods that warn only, and a functional
  `nativeModuleHealthCheck()` smoke test that catches asar-stub false-passes.
- Returns `null` on total failure so the app degrades gracefully (device
  enumeration returns empty arrays).
- Lazily imports `electron`/`SettingsManager` so it is safe to import from
  renderer/worker/test contexts.

### Capture wrappers (`MicrophoneCapture.ts`, `SystemAudioCapture.ts`)
Both are thin `EventEmitter` wrappers over a native Rust class. Key shared
patterns:
- **Lazy init** — the constructor does zero CoreAudio work; the native monitor
  is created in `start()` (SystemAudio) or pre-warmed after teardown (Mic).
  This keeps the Electron main thread off the CoreAudio HAL.
- **Deferred, idempotent teardown** — `stop()` flips `isRecording=false`
  synchronously, then runs the blocking native `monitor.stop()` on
  `setImmediate`. It returns a `_teardownPromise` so callers can
  `await capture.stop()` to know the OS handle is truly released before
  constructing a new instance. Repeated `stop()` joins the in-flight promise.
- **Post-stop guard** — late chunks arriving after `stop()` are dropped at the
  JS boundary so `STT.finalize()` sees a clean audio-end.
- **Sample-rate polling** — the real hardware rate is only known after the
  native stream starts (CoreAudio Tap/SCK init takes ~5-7s), so
  `SystemAudioCapture` polls `getSampleRate()` at 1s and 8s and emits
  `sample_rate_changed`.
- **Orphan-handle fix** (SystemAudio) — if `start()` throws after the native
  constructor allocated resources, the dying monitor is stopped on the next
  tick so its CoreAudio handles release deterministically instead of racing the
  next start.
- **Pre-warm gating** (Mic) — after teardown, a fresh native monitor is
  constructed so the next meeting's `start()` skips the ~50ms cpal cold-start.
  `disablePreWarm()`/`destroy()` flip this off for app-quit, device-swap, and
  aborted-init paths.

### Device handling (`AudioDevices.ts`)
Static async enumeration of input/output devices backed by the native
`getInputDevices`/`getOutputDevices` (which run on a libuv worker, not the
event loop). Three protections:
- **Timeout** (8s) — a hung CoreAudio HAL returns `[]` rather than blocking.
- **In-flight dedup** — concurrent callers share one pending promise per
  direction.
- **Cache** (3.5s TTL) — rapid polling (Launcher focus, 5s watcher) doesn't
  queue unlimited native tasks. `clearCache()` forces a refresh on route change.

### DNS helpers (`dnsHelpers.ts`)
`ipv4OnlyLookup` + `streamingStttWsOptions()` work around a macOS dual-stack
bug where Node's `getaddrinfo(AF_UNSPEC)` returns hard `ENOTFOUND` for
IPv4-only CNAME chains. Forces `family: 4` (with a `dns.resolve4` fallback) and
caps the TLS+upgrade handshake at 15s. Used by every WebSocket STT provider.

### STT provider interface
All providers extend `EventEmitter` and expose a common surface:
- Events: `'transcript'` `{ text, isFinal, confidence }`, `'error'` (Error),
  plus provider-specific extras (`connected`, `warning`, `languageDetected`).
- Methods: `start()`, `stop()`, `write(chunk)`, `setSampleRate()`,
  `setAudioChannelCount()`, `setRecognitionLanguage()`, `setCredentials()`,
  `notifySpeechEnded()`, `finalize()`.

Providers fall into three transport families:

**WebSocket streaming** (server-side VAD, interim + final transcripts):
- `AnswerCueProSTT` — first-party API (`wss://api.natively.software/v1/transcribe`).
  Sends an auth/config frame (`key`/`trial_token`, `sample_rate`, `language`,
  `language_alternates`, `audio_channels`, `channel`) then binary LINEAR16 PCM.
  Handles auto language detection (reconnects with the detected BCP-47),
  capped exponential backoff with jitter, DNS-failure fixed retry, a bounded
  reconnect buffer (500 chunks), and fatal-error latching. Uses a `guard`
  (`ws === this.ws`) so stale events from a closed socket can't corrupt a new
  session.
- `SonioxStreamingSTT`, `ElevenLabsStreamingSTT` — raw `ws` clients with
  keep-alive, capped reconnect (10 attempts), and debounced 250ms restarts on
  config change to avoid double-handshake reconnect storms. ElevenLabs
  downsamples to 16kHz and batches base64 `input_audio_chunk` messages.
- `DeepgramStreamingSTT` — `@deepgram/sdk` `listen.live` (Nova-3), keep-alive,
  capped reconnect.
- `OpenAIStreamingSTT` — the most complex: a priority chain
  `gpt-4o-transcribe` → `gpt-4o-mini-transcribe` (Realtime WS) → `whisper-1`
  REST fallback. Uses a rolling ring-buffer to pre-buffer audio during
  handshake, a `OpenAITranscriptTurnCoalescer` to merge word-level GA
  `completed` events into one final per utterance, server-VAD turn detection,
  rate-limit warnings, and Bearer-token scrubbing. Custom endpoints (e.g.
  Speaches) skip WS and go straight to REST.

**gRPC streaming**:
- `GoogleSTT` — `@google-cloud/speech` `streamingRecognize` with lazy
  reconnect on write, proactive restart at 4:30 to preempt Google's 305s hard
  limit, permanent-error latching (codes 3/7/16), and idle-timeout (code 11)
  suppression.

**REST batch** (client-side VAD flush):
- `RestSTT` — buffers PCM, prepends a WAV header, and uploads every ~3s (or on
  `speech_ended`/safety-net). Supports Groq, OpenAI Whisper, ElevenLabs
  (multipart) and Azure, IBM Watson (raw binary). Resamples to 16kHz mono,
  skips silent buffers, and gates every flush on `isActive` to prevent
  post-stop upload leaks.

**Local on-device**:
- `LocalWhisperSTT` — runs Whisper/Distil-Whisper/Moonshine in a Node worker
  thread (`whisper/`). Dual-channel: `createSTTProvider()` instantiates it
  twice (mic + system), so speaker attribution is free from hardware. Uses a
  per-model streaming profile (Moonshine: fast 750ms ticks, no agreement check;
  Whisper: 1500ms ticks + LocalAgreement-2 longest-common-prefix stabilization),
  energy-based VAD, hallucination filtering, context-prompt biasing, and
  latency telemetry (first-partial/final p50/p95/p99).

### `whisper/` submodule
The local-inference engine behind `LocalWhisperSTT`:
- `whisperWorker.ts` — the worker thread; loads `@huggingface/transformers`
  via a real dynamic `import()` (ESM-only package, bypassing TS→CJS rewrite),
  runs `automatic-speech-recognition` with per-model dtype/providers, reports
  monotonic download progress, and caches tokenized context prompts.
- `vadProcessor.ts` — energy-based VAD (30ms windows, RMS 0.008, ~300ms
  hangover, 15s max segment) with `peekOpenSegment()` for streaming partials
  and `softCommit()` tail-keep for cross-segment continuity.
- `audioResampler.ts` — Int16LE PCM → Float32Array @16kHz (linear interp).
- `hallucinationFilter.ts` — drops known Whisper hallucinations (`[music]`,
  `thank you for watching`, bracketed tags, etc.).
- `modelManager.ts` — model catalog, cache dir under `userData/models`,
  `isModelCached` (dtype-aware ONNX file check), delete.
- `inferenceConfig.ts` — per-platform execution providers + dtype strategy
  (Apple Silicon: CoreML fp32; Windows: DirectML with fp32-encoder/q8-decoder;
  else CPU).
- `hardwareDetect.ts` — tiers hardware and recommends a default model
  (Moonshine everywhere).
- `modelPreloader.ts` — keeps one warm worker alive so the first session
  starts instantly; `takeWarmWorker()` hands it off.
- `workerPathResolver.ts` — resolves `whisperWorker.js` across unbundled (tsc)
  and bundled (esbuild) layouts.

## Flow

```
Rust native module (napi-rs)
  ├─ MicrophoneCapture ──┐
  └─ SystemAudioCapture ─┤  emit 'data' (raw PCM chunks) + 'speech_ended'
                         ▼
              main.ts pipeline (per channel: 'mic' | 'system')
                         │  write(chunk) / notifySpeechEnded() / finalize()
                         ▼
              STT provider (one of the classes above)
                         │  emit 'transcript' { text, isFinal, confidence }
                         ▼
              renderer / transcript UI
```

1. `AudioDevices.getInputDevices()/getOutputDevices()` enumerate devices
   (cached/deduped/timeout-guarded) so the user can pick input/output.
2. On meeting start, `main.ts` constructs a capture wrapper for the selected
   device and an STT provider per channel. The capture's real sample rate is
   discovered after start and pushed to the STT via `setSampleRate()`.
3. The capture emits PCM chunks; `main.ts` forwards them to the STT's
   `write()`. The Rust SilenceSuppressor fires `speech_ended`, which the STT
   uses to flush (REST/local) or ignores (server-VAD providers).
4. The STT emits `transcript` events (interim + final) that flow to the UI.
5. On stop, `main.ts` calls `finalize()` (flush trailing audio), then
   `stop()`/`destroy()` on the capture (deferred native teardown) and the STT.

## Integration

- **`main.ts`** is the orchestrator: it selects the STT provider based on
  settings, wires capture → STT per channel, handles device swap
  (`reconfigureAudio`), audio recovery, and app-quit teardown (calling
  `disablePreWarm()`/`destroy()`).
- **`nativeModuleLoader.ts`** is the single entry point to the Rust binary,
  shared by capture wrappers, `AudioDevices`, and license/stealth features
  (Gumroad/Dodo verification, `applyStealthToWindow`, `StealthKeyboardTap`).
- **`../config/languages`** (`RECOGNITION_LANGUAGES`) maps AnswerCue language
  keys to BCP-47 / ISO-639 codes consumed by every STT provider.
- **`../config/constants`** (`TRIAL_SENTINEL_KEY`) and
  **`../services/CredentialsManager`** supply the trial-token path for
  `AnswerCueProSTT`.
- **`../services/SettingsManager`** drives `verboseLogging` in the native
  loader.
- **`whisper/`** is consumed only by `LocalWhisperSTT` (and the model
  download/preload IPC paths).
- **`__tests__/`** contains `.mjs` unit tests covering the trickiest behaviors
  (deferred teardown, pre-warm gating, reconnect storms, orphan handles,
  buffer overflow, coalescing, DNS retry, etc.).
