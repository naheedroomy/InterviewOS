# AnswerCue Architecture

_Review date: 2026-08-20_

This document describes the current AnswerCue system boundaries, data/control flow, and trust boundaries. It is the canonical architecture reference; historical engineering reports under `docs/archive/` are evidence only and must not override this document. See [README.md](README.md) for the documentation index and [PROJECT_STATUS.md](PROJECT_STATUS.md) for implementation status.

## Overview

AnswerCue is an Electron desktop application for preparing interview context, transcribing live interviews, generating real-time answer support, and continuing the conversation afterward with the full interview history available as context. It runs on macOS 12+ (Apple Silicon or Intel) and Windows 10/11 (Intel/AMD 64-bit).

The application is split across several process and module boundaries:

- **Electron main process** — owns the window lifecycle, native audio capture, transcription, LLM routing, persistence, screenshots, updates, and licensing.
- **Preload bridge** — a narrow, context-isolated bridge that exposes a typed `electronAPI` surface to the renderer.
- **Renderer / Vite UI** — a React application served by Vite, rendered in the Electron window.
- **Rust native module** — a NAPI-RS compiled binary (`native-module/`) that provides low-level audio capture, device enumeration, hardware identification, license verification, and (on macOS) stealth window/keyboard helpers.
- **Local Moonshine STT** — a packaged local speech-to-text model (Moonshine Base) run through a worker for live transcription.
- **LLM provider routing** — routes chat/vision/structured requests across configured providers with capability, scope, and health-aware selection.
- **SQLite persistence** — a local `better-sqlite3` database storing meetings, transcripts, AI interactions, RAG chunks, embeddings, modes, and app state.
- **Document ingestion / RAG** — ingests documents to Markdown, classifies them, and builds retrievable context.
- **Screenshot / screen context** — captures screen content and analyzes it (vision-first) to provide visual evidence to the assistant.
- **Update and licensing services** — `electron-updater` for app updates and a premium/license layer for paid features.

## Process and module boundaries

### Electron main process

The main process is the orchestrator. `electron/main.ts` is the entry point: it acquires the single-instance lock, guards the native-module ABI, initializes managers, registers IPC handlers, creates windows, and wires lifecycle events (second-instance, activate, window-all-closed, before-quit, power sleep/resume).

Key collaborators in the main process:

- `AppState` (in `electron/main.ts`) — central state holder and coordinator for windows, processing, intelligence, persistence, and session tracking.
- `WindowHelper` — window creation and management, including the main launcher window and overlay behavior.
- `ProcessingHelper` — coordinates the live interview pipeline (audio → transcript → LLM response).
- `IntelligenceManager` — orchestrates answer generation and context assembly.
- `MeetingPersistence` — persists meetings, transcripts, and AI interactions.
- `ScreenshotHelper` — captures and stitches screen content.
- `SessionTracker` — tracks the active session and builds context blocks.
- `ThemeManager`, `DonationManager` — UI theme and donation/license support.

### Preload bridge

`electron/preload.ts` uses `contextBridge.exposeInMainWorld('electronAPI', ...)` to expose a typed, allow-listed API to the renderer. The renderer cannot access Node or Electron internals directly; all privileged operations go through `ipcRenderer.invoke`/`ipcRenderer.on` channels exposed here. This is the primary renderer↔main trust boundary.

### Renderer / Vite UI

The renderer is a React application (`src/`) built by Vite (`vite.config.mts`, dev server on port `5180`). It renders the launcher, settings, prep chat, live interview, and post-interview chat. It communicates with the main process only through the preload `electronAPI`.

### Rust native module

`native-module/` is a NAPI-RS Rust crate compiled to platform-specific `.node` binaries (e.g. `index.darwin-arm64.node`). `electron/audio/nativeModuleLoader.ts` loads the correct binary for the platform/arch, validates it with a functional health check, and exposes:

- `SystemAudioCapture` / `MicrophoneCapture` — low-level audio capture.
- `getInputDevices` / `getOutputDevices` / `getDefaultOutputDeviceId` — CoreAudio device enumeration.
- `getHardwareId` — hardware identification for licensing.
- `verifyGumroadKey` / `verifyDodoKey` / `validateDodoKey` / `deactivateDodoKey` — license verification (Dodo methods are optional and degrade gracefully when the binary predates them).
- macOS-only stealth helpers: `applyStealthToWindow`, `isAccessibilityGranted`, `StealthKeyboardTap`.

The loader tries packaged (`app.asar.unpacked`) and development paths and returns `null` on failure so the app degrades gracefully (audio device enumeration returns empty arrays).

### Local Moonshine STT

`electron/audio/LocalWhisperSTT.ts` runs the packaged local Moonshine Base model through a worker (`electron/audio/whisper/`) for live transcription. The model is preloaded in the background at startup. The STT provider selection in the main process (`createSTTProvider`) chooses between the local Moonshine path and cloud Google STT based on the stored `sttProvider` setting (`local-whisper` or `google`). Additional cloud STT providers exist (`DeepgramStreamingSTT`, `OpenAIStreamingSTT`, `ElevenLabsStreamingSTT`, `SonioxStreamingSTT`, `RestSTT`, `AnswerCueProSTT`).

### LLM provider routing

`electron/llm/ProviderRouter.ts` routes requests across providers (AnswerCue API, Groq, Codex CLI, Gemini Flash/Pro, OpenAI, Claude, DeepSeek, Ollama). It exposes:

- `routeLLMProviders` — returns an ordered list of provider attempts for a given capability (`chat`, `stream_chat`, `structured`, `vision`), filtering by availability, capability support, and data-scope policy.
- `ProviderRouter` — a policy-aware selector with circuit breakers, health tracking, and rules for local-only privacy mode, vision requests, low-latency requests, and quality (summary/recap) requests.

Provider keys are stored via `CredentialsManager` and loaded at startup. The `AnswerLLM`, `WhatToAnswerLLM`, and related `electron/llm/*` classes build and stream responses.

### SQLite persistence

`electron/db/DatabaseManager.ts` manages a `better-sqlite3` database at `natively.db` in the Electron `userData` directory. It creates tables for meetings, transcripts, AI interactions, RAG chunks, chunk summaries, embedding queue, user profile, resume nodes, app state, modes, mode reference files, mode note sections, profile custom notes, and profile persona.

> **Note:** The database is stored in plaintext. An encryption design exists but is not implemented. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

### Document ingestion / RAG

`electron/services/InterviewContextDocsManager.ts` ingests supported prep and custom-instruction files (`.md`, `.txt`, `.pdf`, `.docx`) into Markdown locally and saves them in the app's document library. When a newly uploaded document is classified, the user chooses a document type:

- **Resume**
- **Project**
- **Other** — requires a short description so the assistant understands how to use it.

Once a document is uploaded and classified, selecting it for a later interview attaches the existing ingested document directly without asking for its type again.

The RAG layer (`electron/rag/`) coordinates preprocessing, chunking, embedding, and retrieval:

- `RAGManager` — coordinates chunking, embedding, and retrieval; indexes meeting transcripts and answers queries.
- `SemanticChunker` — chunks transcripts into retrievable units.
- `EmbeddingPipeline` — generates embeddings (provider-resolved) and queues them.
- `VectorStore` — stores and queries vectors.
- `RAGRetriever` — retrieves relevant chunks for a query.
- `LiveRAGIndexer` — indexes live meeting content.

### Screenshot / screen context

`electron/ScreenshotHelper.ts` captures screen content (including multi-display stitching) and saves screenshots. `electron/services/screen/ScreenUnderstandingService.ts` analyzes screen content — vision-first, extracting text, summaries, screen type, code blocks, tables, and errors — to provide visual evidence to the assistant. Legacy OCR text is retained as an optional alias.

### Update and licensing services

- **Updates:** `electron-updater` (`autoUpdater`) checks for, downloads, and installs updates. Auto-install behavior depends on platform and, on macOS, on whether the build carries a real Developer ID signature.
- **Licensing:** a premium/license layer (`premium/`) provides `LicenseManager` (Gumroad/Dodo/AnswerCue API verification) and premium feature gates. `electron/premium/featureGate.ts` probes for premium modules and falls back to open-source mode when they are unavailable. `DonationManager` handles donation/license support.

### Premium-module boundaries

The `premium/` module is a separate, not-always-available code path. `featureGate.ts` detects at runtime whether premium modules (e.g. `LicenseManager`, `KnowledgeOrchestrator`) are present; when they are not, the app runs in open-source mode and premium-only features are gated off. The open-source build compiles and runs without premium code.

## Core flows

### 1. Startup and window management

1. `electron/main.ts` acquires the single-instance lock and guards the native-module ABI.
2. On `app.whenReady()`, the app configures telemetry, initializes `CredentialsManager`, seeds modes, registers IPC handlers (`initializeIpcHandlers`), applies disguise/stealth settings, starts the Ollama lifecycle manager, pre-warms STT providers, and creates the main window via `AppState.createWindow()`.
3. Global shortcuts, tray, sleep/resume recovery, and preloaded companion windows are set up.
4. A second-instance launch focuses and recenters the existing window.

### 2. Audio → transcript → LLM response

1. The user starts an interview; `ProcessingHelper` begins audio capture via the native module (`SystemAudioCapture` / `MicrophoneCapture`).
2. Audio is routed to the selected STT provider — local Moonshine Base (`LocalWhisperSTT`) or a cloud STT provider — producing a live transcript.
3. The transcript is assembled with context (see the prompt-context model below) and sent to the routed LLM provider for a real-time answer.
4. The answer is streamed back to the renderer and persisted.

### 3. Document → RAG context

1. The user uploads a supported document; `InterviewContextDocsManager` ingests it to Markdown locally and saves it to the document library.
2. The user classifies the document as Resume, Project, or Other (Other requires a description).
3. Selected documents and prep-chat notes form the interview preparation context for the live assistant.
4. Meeting transcripts are chunked (`SemanticChunker`), embedded (`EmbeddingPipeline`), stored (`VectorStore`), and retrieved (`RAGRetriever`) for post-interview questions.

### 4. Screenshot capture → analysis

1. `ScreenshotHelper` captures screen content (with multi-display stitching) and saves screenshots.
2. `ScreenUnderstandingService` analyzes the capture — vision-first — extracting text, summaries, screen type, code blocks, tables, and errors.
3. The extracted screen context is delivered to `PromptAssembler` as untrusted visual evidence for the assistant.

### 5. Persistence

1. `MeetingPersistence` saves meetings, transcripts, and AI interactions to SQLite.
2. RAG chunks and embeddings are queued and written to the database.
3. Modes, reference files, profile data, and app state are persisted in SQLite.

## Prompt-context model

The live interview assistant receives context assembled by `electron/services/context/PromptAssembler.ts`. Blocks are typed and ordered by trust level (highest first), and a token budget is enforced (lowest-priority blocks are truncated or dropped first). The conceptual ordering of context, as documented for the product, is:

1. **Custom instructions** — typed custom instructions and ingested custom-instruction file Markdown.
2. **AI persona** — the user's preferred assistant behavior and voice.
3. **Interview preparation context** — prep-chat notes plus selected document Markdown for this interview.
4. **Live interview transcript** — the current transcript and generated AI responses from the live interview.
5. **User request** — the current live answer request or follow-up chat question.

The prep context must be included in live interview answer generation, not only in the pre-interview chat. In the current implementation, `PromptAssembler` assembles typed blocks (intent context, interview preparation, assistant history, screen context, transcript, mode context/reference files, meeting history, custom context) and orders them by trust level, with prompt-injection and XML-escaping applied to user-controlled content.

## Trust boundaries

- **Renderer ↔ main IPC:** The renderer is context-isolated and reaches privileged functionality only through the preload `electronAPI`. IPC handlers are registered in `electron/ipcHandlers.ts` (and related helpers) via `ipcMain.handle`/`ipcMain.on`.
- **Native audio:** Low-level audio capture and device enumeration run in the Rust native module, loaded and validated by `nativeModuleLoader.ts`.
- **Local storage:** SQLite persistence and ingested documents live on the local machine. The database is currently plaintext; encryption is designed but not implemented.
- **Selected external LLM providers:** When an external provider is selected, prompts, transcripts, documents, and screenshots are sent to that provider over the network.
- **Optional cloud STT:** When a cloud STT provider is selected, audio is sent to that provider for transcription.
- **Licensing / network calls:** License verification (Gumroad/Dodo/AnswerCue API), update checks, and anonymous install pings make network calls.

> **Important:** Local STT does **not** mean prompts, transcripts, documents, or screenshots stay local when an external provider is selected. Local speech recognition keeps audio local, but any external LLM or cloud STT provider receives the data it needs to operate.

## Implementation anchors

- `electron/main.ts` — main-process entry point, `AppState`, startup and lifecycle.
- `electron/ipcHandlers.ts` — IPC handler registration (`initializeIpcHandlers`).
- `electron/preload.ts` — preload bridge exposing `electronAPI`.
- `electron/audio/nativeModuleLoader.ts` — Rust native-module loading and validation.
- `electron/llm/ProviderRouter.ts` — provider routing, capability/scope filtering, circuit breakers.
- `electron/db/DatabaseManager.ts` — SQLite persistence.
- `electron/services/InterviewContextDocsManager.ts` — document ingestion and classification.
- `electron/rag/` — RAG chunking, embedding, and retrieval.
- `electron/services/context/PromptAssembler.ts` — prompt-context assembly.
- `electron/ScreenshotHelper.ts` and `electron/services/screen/ScreenUnderstandingService.ts` — screenshot capture and analysis.
- `electron/premium/featureGate.ts` — premium-module boundary detection.
