# electron/audio/whisper/

## Responsibility

Local, on-device automatic speech recognition (ASR) for the app. This folder
owns everything needed to transcribe microphone audio to text using
`@huggingface/transformers` v3+ running Whisper, Distil-Whisper, or Moonshine
ONNX models inside a Node.js Worker thread. It is the "local STT" backend that
competes with cloud STT (Groq/Deepgram) — it keeps audio on-device, works
offline, and streams partial transcripts in near real time.

Concretely it provides:
- A **worker** (`whisperWorker.ts`) that loads a model and runs inference.
- **Model management** (`modelManager.ts`): catalog, cache directory, cache
  status, download/delete.
- **Hardware-aware configuration** (`hardwareDetect.ts`, `inferenceConfig.ts`):
  picks the right model and ONNX execution providers / quantization per platform.
- **Audio preprocessing** (`audioResampler.ts`, `vadProcessor.ts`): converts raw
  PCM to 16 kHz Float32 and segments speech.
- **Output hygiene** (`hallucinationFilter.ts`): strips known Whisper hallucinations.
- **Warm-start** (`modelPreloader.ts`): keeps a worker warm so the first session
  starts instantly.
- **Path resolution** (`workerPathResolver.ts`): locates the worker across build layouts.
- **Shared types** (`types.ts`): the worker IPC message contract.

## Design

### Worker-thread isolation
Inference runs in a `worker_threads` Worker (`whisperWorker.ts`) so the heavy
ONNX model and CPU/GPU work never blocks the Electron main process. The worker
is ESM-only (`@huggingface/transformers`), loaded via `new Function('return
import(...)')()` to stop TypeScript from rewriting `import()` → `require()` in
the CommonJS output.

### Model families
- **Moonshine** (`onnx-community/moonshine-*-ONNX`): streaming-native ASR with
  encoder caching + decoder state reuse, ~100× lower latency than Whisper Large
  v3. English-only. The recommended default for live use.
- **Distil-Whisper** (`distil-whisper/*`): distilled Whisper, ~6× faster at
  near-equivalent WER. English-only.
- **Whisper** (`Xenova/*`, `onnx-community/whisper-large-v3-turbo-ONNX`):
  batch-architected, multilingual, slower.

### Hardware-aware inference config
`inferenceConfig.ts` resolves execution providers + per-module dtype at runtime:
- **Apple Silicon** (darwin/arm64): `['coreml','cpu']`, uniform `fp32` (CoreML
  has limited coverage of pre-quantized ops; fp32 keeps the graph on Metal/ANE).
- **Windows**: `['dml','cpu']`, per-module dtype.
- **Intel Mac / Linux / unknown**: `['cpu']`, per-module dtype.

Per-module dtype keeps the encoder at `fp32` (Whisper's encoder is sensitive to
quantization) while quantizing the decoder to `q8` (token-level, robust, and
dominates inference time). The dtype map is a superset so one map serves all
three model families.

### Cache layout
Models live under `userData/models/<org>/<name>` (flat layout, not HF Hub v2
`models--{org}--{name}`). `isModelCached` checks for the exact ONNX filenames the
active dtype will load (encoder + either merged decoder OR decoder+with_past
pair) to avoid the "available in panel but downloads mid-recording" regression.

### Streaming vs final passes
Transcribe messages carry `streaming`:
- `streaming=true` → partial pass on in-progress audio, deterministic params
  (temperature 0, no `condition_on_previous_text`), emits `partial`.
- `streaming=false` (default) → final pass, emits `result`.

### Prompt biasing
`setPrompt` messages tokenize a context string once (capped at 224 tokens,
truncated from the end) and cache the IDs; every transcribe reuses them via
`prompt_ids`. Skipped for Moonshine (no prompt mechanism). Sent out-of-band only
when the context actually changes, so the ~8KB prompt isn't copied through IPC
on every 1.5s streaming tick.

### VAD
`vadProcessor.ts` is energy-based (30ms windows, RMS 0.008, ~300ms hangover,
~120ms min speech, 15s max segment). It supports `peekOpenSegment()` for partial
passes while speaking and `softCommit()` which carries ~300ms of trailing audio
into the next segment for acoustic continuity.

## Flow

```
Raw PCM (Int16LE, any rate)
        │
        ▼
audioResampler.resampleToF32 ──► Float32Array @ 16 kHz
        │
        ▼
VadProcessor.push ──► SpeechSegment[] (closed segments)
        │                    │
        │                    └─ peekOpenSegment() → partial audio while speaking
        ▼
whisperWorker (Worker thread)
   init: load model via pipeline('automatic-speech-recognition', modelId, {dtype, progress_callback})
        │  → posts 'progress' (0..99) then 'ready'
   transcribe: pipe(audio, opts) → posts 'partial' (streaming) or 'result' (final)
        │
        ▼
hallucinationFilter.filterHallucination ──► clean text
```

Worker message flow (see `types.ts`):
- **In**: `init` (modelId, cacheDir, allowRemoteModels, executionProviders,
  dtype), `transcribe` (taskId, audio, language, streaming), `setPrompt` (prompt).
- **Out**: `ready`, `progress` (modelId, 0..99), `partial` (taskId, text),
  `result` (taskId, text), `error` (taskId?, message).

`init` validates `dtype` before entering the try/catch so a bad init surfaces as
a structured `error` message rather than an unhandled worker throw (which would
leave the host's `workerReady` stuck false).

## Integration

This folder is the local-STT backend consumed by the audio pipeline. Key
external touchpoints (referenced in code comments; files outside this folder are
not edited here):

- **`LocalWhisperSTT`** (host side, outside this folder) is the primary caller:
  - `spawnWorker` builds the `init` message via
    `buildWorkerInitMessage` (`inferenceConfig.ts`) and creates the worker at
    `resolveWhisperWorkerPath()`.
  - `start()` calls `modelPreloader.takeWarmWorker(modelId)` to grab a warm
    worker; falls back to spawning its own if none is warm.
  - Posts `transcribe` / `setPrompt` messages and consumes `ready` / `partial` /
    `result` / `progress` / `error` responses. It serializes transcribe vs
    setPrompt over the same MessagePort (Node guarantees ordering) and guards
    with a `streamingTaskInFlight` flag so the prompt cache stays consistent.
- **`modelPreloader`** (`modelPreloader.ts`) is called at app launch / when
  local-whisper is selected to warm a worker; `LocalWhisperSTT.start()` takes it.
- **`modelManager`** (`modelManager.ts`) is used by the settings/preflight UI to
  list models (`getAvailableModels`), check cache status (`isModelCached`),
  delete models (`deleteModel`), and configure the transformers cache
  (`configureTransformersCache`). `getModelsDir()` is also used by
  `buildWorkerInitMessage` (lazy `require` to avoid importing electron at module
  top).
- **IPC**: `local-whisper-start-download` (mentioned in `inferenceConfig.ts`)
  also uses `buildWorkerInitMessage` so the message shape stays consistent across
  all three callers.
- **`hardwareDetect`** (`hardwareDetect.ts`) feeds the UI's hardware
  recommendation (tier, recommended model) and informs model selection.
- **`hallucinationFilter`** is applied to worker output before it reaches the
  transcript/UI.
- **`workerPathResolver`** (`workerPathResolver.ts`) is used by both
  `modelPreloader` and `LocalWhisperSTT` to locate `whisperWorker.js` across the
  unbundled (`dist-electron/.../whisper/`) and bundled (inlined into `main.js`)
  build layouts.
