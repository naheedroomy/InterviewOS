# AnswerCue Repository Atlas

## Responsibility

AnswerCue is an AGPL-3.0 Electron desktop interview assistant. The active root application combines interview preparation, local or cloud transcription, live answer generation, screenshot/vision context, document ingestion, RAG-backed persistence, and post-interview chat. A separate Next.js marketing site lives under `website/`.

Canonical project context lives in `docs/README.md`, `docs/ARCHITECTURE.md`, and `docs/PROJECT_STATUS.md`; archived reports under `docs/archive/` are historical evidence, not current requirements.

## System Design

- **Main process:** `electron/main.ts` owns lifecycle, windows, native audio, transcription, LLM routing, IPC registration, persistence, screenshots, updates, and licensing.
- **Preload boundary:** `electron/preload.ts` exposes an allow-listed, typed `window.electronAPI` through context isolation. Renderer code must not import Electron internals directly.
- **Renderer:** root `src/` is the active Vite + React UI. `src/main.tsx` bootstraps theme/platform state; `src/App.tsx` routes window surfaces via `?window=` and composes launcher, overlay, settings, prep, meeting, and follow-up experiences.
- **Native module:** `native-module/` is a NAPI-RS Rust crate/binary for audio capture, device enumeration, hardware identity, licensing, and macOS stealth helpers.
- **Audio/STT:** `electron/audio/` wraps native microphone/system capture and multiple streaming/batch providers; `electron/audio/whisper/` runs the local Moonshine Base worker with VAD, resampling, model management, and hallucination filtering.
- **LLM layer:** `electron/llm/` provides model adapters, prompts, transcript preparation, vision fallback, structured output, and provider policy. `ProviderRouter` applies capability, privacy scope, health, circuit-breaker, latency, and quality rules.
- **Persistence/RAG:** `electron/db/` manages plaintext SQLite schema/migrations; `electron/rag/` handles chunking, embeddings, vector storage, retrieval, live indexing, and mode retrieval.
- **Services:** `electron/services/` owns settings, credentials, modes, document ingestion, context assembly, telemetry, phone mirror, calendar, updates, and other application services.
- **Premium boundary:** `premium/` may be unavailable; `electron/premium/` and `src/premium/` degrade to open-source/null implementations when private modules are absent.

## Core Flow

1. `npm start` runs Vite on port `5180` and launches Electron through the root package scripts.
2. `electron/main.ts` acquires the single-instance lock, validates native-module ABI, initializes managers, registers IPC, applies settings/stealth, prewarms cached local STT, and creates the main window.
3. Renderer calls `window.electronAPI`; preload forwards invokes/events to main-process handlers in `electron/ipcHandlers.ts`.
4. User creates an interview, builds prep context, and attaches locally ingested Markdown/TXT/PDF/DOCX documents.
5. Starting a meeting routes microphone/system audio through the native module to the selected STT provider. Transcript turns are cleaned, sparsified, assembled with typed prompt blocks, and sent through the selected LLM fallback chain.
6. Optional screenshots travel through `ScreenshotHelper` → IPC → `IntelligenceEngine` → `WhatToAnswerLLM` → `LLMHelper` vision fallback. Captured context is sent only to the configured provider when attached to a request.
7. Meetings, transcripts, AI interactions, modes, documents, RAG chunks, embeddings, and app state persist in local SQLite. Post-interview retrieval and chat reuse bounded context from this history.
8. Packaging scripts build TypeScript/Electron output, native binaries, local model assets, and platform installers; the website resolves GitHub release assets for download redirects.

## Trust and Data Boundaries

- Renderer privileges are restricted to the preload IPC contract.
- Local STT keeps audio local, but selected external LLM/cloud STT providers receive data included in requests.
- SQLite and ingested documents are currently plaintext; encryption is designed but not implemented.
- Screenshot, document, transcript, provider-scope, licensing, update, and telemetry paths have distinct policy/configuration controls.
- macOS live audio/screen/accessibility behavior and release signing/notarization still require real-device validation.

## Repository Directory Map

| Directory | Responsibility | Detailed map |
| --- | --- | --- |
| `electron/` | Main-process orchestration, IPC, windows, meeting pipeline, persistence integration | [`electron/codemap.md`](electron/codemap.md) |
| `electron/audio/` | Native capture wrappers, device enumeration, STT provider adapters | [`electron/audio/codemap.md`](electron/audio/codemap.md) |
| `electron/audio/whisper/` | Local Moonshine worker, VAD, models, inference helpers | [`electron/audio/whisper/codemap.md`](electron/audio/whisper/codemap.md) |
| `electron/config/` | Main-process language and static configuration | [`electron/config/codemap.md`](electron/config/codemap.md) |
| `electron/db/` | SQLite schema, migrations, serialization, vector tables | [`electron/db/codemap.md`](electron/db/codemap.md) |
| `electron/llm/` | Provider routing, prompts, adapters, streaming, vision, transcript tooling | [`electron/llm/codemap.md`](electron/llm/codemap.md) |
| `electron/rag/` | Chunking, embeddings, vector storage, retrieval, live indexing | [`electron/rag/codemap.md`](electron/rag/codemap.md) |
| `electron/rag/providers/` | Pluggable local/cloud embedding implementations | [`electron/rag/providers/codemap.md`](electron/rag/providers/codemap.md) |
| `electron/services/` | Settings, credentials, modes, docs, phone/calendar, service orchestration | [`electron/services/codemap.md`](electron/services/codemap.md) |
| `electron/services/context/` | Trust-ranked prompt blocks and token-budgeted assembly | [`electron/services/context/codemap.md`](electron/services/context/codemap.md) |
| `electron/services/modes/` | Hybrid FTS/vector custom-mode retrieval | [`electron/services/modes/codemap.md`](electron/services/modes/codemap.md) |
| `electron/services/post-call/` | Post-interview summary and follow-up workflows | [`electron/services/post-call/codemap.md`](electron/services/post-call/codemap.md) |
| `electron/services/screen/` | Vision-first screen understanding and image processing | [`electron/services/screen/codemap.md`](electron/services/screen/codemap.md) |
| `electron/services/telemetry/` | Local JSONL telemetry and sanitized event sinks | [`electron/services/telemetry/codemap.md`](electron/services/telemetry/codemap.md) |
| `electron/services/dynamic-actions/` | Trigger detection and in-memory suggested-action lifecycle | [`electron/services/dynamic-actions/codemap.md`](electron/services/dynamic-actions/codemap.md) |
| `electron/update/` | GitHub release-note/update metadata helper | [`electron/update/codemap.md`](electron/update/codemap.md) |
| `electron/utils/` | Main-process validation, redaction, fetch, persistence, and platform helpers | [`electron/utils/codemap.md`](electron/utils/codemap.md) |
| `electron/test/` | Node-based service/provider test harnesses and diagnostics | [`electron/test/codemap.md`](electron/test/codemap.md) |
| `electron/premium/` | Runtime detection and fallback gate for private premium modules | [`electron/premium/codemap.md`](electron/premium/codemap.md) |
| `src/` | Active Vite renderer entrypoint, global styles, shared contracts | [`src/codemap.md`](src/codemap.md) |
| `src/components/` | Main renderer surfaces and feature components | [`src/components/codemap.md`](src/components/codemap.md) |
| `src/components/help/` | Persistent in-app help assistant | [`src/components/help/codemap.md`](src/components/help/codemap.md) |
| `src/components/onboarding/` | Permission toaster UI (currently exported but not mounted) | [`src/components/onboarding/codemap.md`](src/components/onboarding/codemap.md) |
| `src/components/trial/` | Trial banner, modal, and promo toaster | [`src/components/trial/codemap.md`](src/components/trial/codemap.md) |
| `src/components/dynamic-actions/` | Suggested-action cards and acceptance/dismissal interactions | [`src/components/dynamic-actions/codemap.md`](src/components/dynamic-actions/codemap.md) |
| `src/components/settings/` | Settings tabs and persistence-oriented controls | [`src/components/settings/codemap.md`](src/components/settings/codemap.md) |
| `src/components/ui/` | Reusable overlay, settings, Radix, and visual primitives | [`src/components/ui/codemap.md`](src/components/ui/codemap.md) |
| `src/hooks/` | Theme, shortcut, and streaming-buffer hooks | [`src/hooks/codemap.md`](src/hooks/codemap.md) |
| `src/types/` | Typed ElectronAPI and shared renderer domain contracts | [`src/types/codemap.md`](src/types/codemap.md) |
| `src/lib/` | Renderer streaming, overlay state, theme, flags, and mapping utilities | [`src/lib/codemap.md`](src/lib/codemap.md) |
| `src/lib/analytics/` | Lazy GA4 event service with privacy safeguards | [`src/lib/analytics/codemap.md`](src/lib/analytics/codemap.md) |
| `src/config/` | Renderer static config; currently largely unused/dead wiring | [`src/config/codemap.md`](src/config/codemap.md) |
| `src/utils/` | Platform, keyboard, model, message-ID, and PDF helpers | [`src/utils/codemap.md`](src/utils/codemap.md) |
| `src/premium/` | Thin dynamic loader with null fallbacks for private UI modules | [`src/premium/codemap.md`](src/premium/codemap.md) |
| `native-module/` | Rust/NAPI audio, device, stealth, and licensing implementation | [`native-module/codemap.md`](native-module/codemap.md) |
| `scripts/` | Build, native, model, packaging, signing, notarization, and maintenance tooling | [`scripts/codemap.md`](scripts/codemap.md) |
| `renderer/` | Dormant Create React App package, not used by root build | [`renderer/codemap.md`](renderer/codemap.md) |
| `renderer/src/` | Legacy CRA renderer bootstrap and sample UI | [`renderer/src/codemap.md`](renderer/src/codemap.md) |
| `website/` | Next.js marketing/download site | [`website/codemap.md`](website/codemap.md) |
| `website/app/` | App Router shell, landing page, and global styles | [`website/app/codemap.md`](website/app/codemap.md) |
| `website/components/` | Marketing animation, download, spotlight, and app mock components | [`website/components/codemap.md`](website/components/codemap.md) |
| `website/lib/` | GitHub Releases fetch and asset-resolution helpers | [`website/lib/codemap.md`](website/lib/codemap.md) |
| `website/app/api/` | API route namespace | [`website/app/api/codemap.md`](website/app/api/codemap.md) |
| `website/app/api/download/` | Dynamic platform download redirect routes | [`website/app/api/download/codemap.md`](website/app/api/download/codemap.md) |
| `website/app/api/download/[platform]/` | Platform whitelist and GitHub asset redirect handler | [`website/app/api/download/[platform]/codemap.md`](website/app/api/download/[platform]/codemap.md) |

## Operational Anchors

- Setup and development: root `README.md` and `AGENTS.md`.
- Architecture and trust boundaries: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Current shipped status and known gaps: [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).
- Tests and manual checks: [`docs/TESTING.md`](docs/TESTING.md).
- Packaging/signing: [`docs/RELEASE.md`](docs/RELEASE.md).
- Local STT setup: [`docs/LOCAL_STT_ANSWERCUE_SETUP.md`](docs/LOCAL_STT_ANSWERCUE_SETUP.md).
