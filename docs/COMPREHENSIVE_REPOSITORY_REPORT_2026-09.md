# InterviewOS — Comprehensive Repository, Product, and Opportunity Report

**Audit date:** 2026-09-19  
**Repository inspected:** `/Users/naheedroomy/Documents/InterviewOS`  
**Method:** Read repository maps and active documentation, reviewed the code architecture and flows, used CodeGraph for cross-file call paths, ran the documented automated entry point, and commissioned independent code and product/model research. This report distinguishes **implemented**, **documented risk**, **audit inference**, and **recommendation**.

## 1. Executive summary

InterviewOS is a local-first-capable Electron desktop copilot for high-stakes interviews. It is intended to help a candidate prepare an interview workspace, ingest a resume/JD/notes, capture microphone and system audio during an interview, transcribe it, assemble bounded context, generate live answer assistance, optionally understand screen captures, and preserve an interview record for post-call coaching.

It is not merely a chat UI. Its important differentiators are:

- **Persistent interview workspaces and rounds:** preparation, documents, and multiple interview rounds persist together.
- **Dual-channel capture:** the app separately captures microphone and system audio through a Rust/NAPI module, which can distinguish the candidate from the meeting audio without requiring speaker diarization for the common case.
- **Bring-your-own AI:** it supports cloud providers and an Ollama route, while local Moonshine transcription and local embeddings reduce data exposure.
- **Interview-specific context:** document ingestion, modes, RAG, screen analysis, transcript cleanup, and post-call history feed an answer-generation path rather than a generic chatbot.
- **Desktop integration:** an overlay, system permissions, screen capture, device selection, automatic updates, native licensing hooks, and packaging are part of the product.

The foundation is substantial, but it is **not release-ready as a privacy- or reliability-critical interview assistant** without resolving known persistence/privacy defects and validating live Electron/audio flows on real devices. The canonical documentation explicitly says that full live audio/screen validation, complete Electron E2E coverage, Google STT/Gemini completion, database encryption, and signing/notarization verification remain open.

The most valuable next move is not adding more providers. It is to make the local/private mode trustworthy and measurable: correct data retention and provider-scope enforcement; show a per-request data-destination receipt; validate Moonshine/Whisper performance; provide a polished Ollama setup; and make screen/audio failures observable and recoverable.

---

## 2. What the product achieves

### User journey

1. **Before an interview**
   - Configure permissions, audio devices, providers, and local/cloud settings.
   - Create a persistent interview workspace with one or more rounds.
   - Upload Markdown, TXT, PDF, or DOCX material. The application converts content to Markdown, classifies it (for example resume, role spec, portfolio, notes), stores it, and can make it available to RAG/context.
   - Build concise prep-chat context: company, role, interview format, candidate stories, desired answer style, strengths, risks, and documents.

2. **During an interview**
   - The Electron main process uses the Rust native module to capture microphone and system audio.
   - The selected STT route generates transcript segments. Local STT uses a worker-isolated ONNX/Transformers.js pipeline for Moonshine/Whisper-family models; Google STT is also exposed as a selectable route.
   - Transcript text is cleaned deterministically, compacted, merged with preparation, selected documents, active mode/persona, prior assistant answers, and optional screen understanding.
   - A selected LLM provider produces live suggestions. The renderer presents these in the main workspace and/or overlay.
   - Screenshot context uses the current vision-first pipeline. Visual content is treated as untrusted evidence rather than system instructions.

3. **After an interview**
   - Meetings, transcript/AI events, documents, chunks, and embeddings support summaries, retrieval, action items, and continued chat.
   - The post-call workspace can use saved transcript and earlier prep material to review answers and plan follow-up.

### Practical value

For a user, this can replace scattered notes, a separate transcription product, an LLM tab, and an interview debrief document with one desktop workflow. For an organization, the architectural foundation could extend to recruiting practice, sales calls, technical demos, lectures, support sessions, or any prepared conversation where users need private contextual assistance.

### Important usage boundary

The code includes stealth/content-protection and keyboard-capture facilities. These should be positioned and configured for lawful, consented use. Many employers, educational institutions, conferencing platforms, and interview processes prohibit undisclosed assistance, recording, or screen capture. The product should make consent, policy compliance, and data sharing clear—not conceal them.

---

## 3. Repository shape and current architecture

The active application is the root Electron/Vite project, not `renderer/` (that folder is a dormant Create React App sample). The marketing/download site is a distinct Next.js app in `website/`.

| Layer | Main responsibility | Important implementation points |
| --- | --- | --- |
| `src/` | Active React/Vite renderer | `src/App.tsx` chooses window surfaces; `src/components/Launcher.tsx` is the large primary workspace/UI coordinator. |
| `electron/preload.ts` | Trust boundary | Exposes allow-listed `window.electronAPI` calls under Electron context isolation. Renderer code should not access Node/Electron directly. |
| `electron/main.ts` | Main-process orchestrator | Starts windows, validates native module, applies settings, owns capture/transcription/LLM service lifecycle, registers IPC, and prewarms local STT. |
| `electron/ipcHandlers.ts` | IPC façade | Connects renderer requests to workspace, documents, meeting, provider, screen, settings, and persistence services. |
| `native-module/` | Rust/NAPI integration | Microphone/system capture, devices, hardware identity, licensing, and macOS-specific stealth helpers. |
| `electron/audio/` | Capture/STT adapters | Native dual-channel capture and provider abstraction. `electron/audio/whisper/` is historical naming for the local Moonshine/Whisper ONNX path. |
| `electron/llm/` + `electron/LLMHelper.ts` | LLM orchestration | Provider adapters, policy/fallback handling, prompt assembly inputs, model/model-version behavior, streaming. |
| `electron/rag/` + `electron/db/` | Long-term context | SQLite schema/migrations, document/transcript chunking, embedding providers, sqlite-vec and fallback retrieval. |
| `electron/services/` | Domain services | Settings/credentials, interview workspaces, documents, modes, context, post-call, screen, telemetry, calendar, updates. |
| `website/` | Marketing/download site | Next.js landing page and GitHub Release asset redirect logic. |

### Data stores

- API credentials and tokens use Electron `safeStorage` in the supported path.
- Workspace state is JSON-backed and uses atomic temp-file rename behavior.
- Meetings, documents, RAG chunks, embeddings, and much application state persist in SQLite and companion local files.
- **Critical distinction:** credentials have encryption-at-rest handling; the SQLite database, workspace/document JSON, and screenshot files are currently documented as plaintext.

---

## 4. End-to-end runtime flow

### 4.1 Boot and renderer boundary

1. Root scripts run Vite on port `5180`, then Electron.
2. `electron/main.ts` obtains the single-instance lock, loads boot-critical settings, validates the native ABI, initializes capture/LLM/persistence managers, registers handlers, starts windows, and can prewarm the local model worker.
3. `electron/preload.ts` exposes a typed, allow-listed API. The React renderer invokes that API; all privileged work remains in main.
4. `src/App.tsx` routes ordinary/overlay/settings-related surfaces by the `?window=` parameter. `Launcher.tsx` owns much of the primary interview workspace state and UI behavior.

### 4.2 Workspace and document flow

1. `InterviewWorkspaceStateManager` creates a workspace with an initial `Round 1` in `draft` state and maintains document IDs, rounds, prep messages, model/persona overrides, and timestamps.
2. Documents are ingested locally, converted to Markdown, classified, stored, and associated with a workspace.
3. The prep assistant receives a phase-specific prompt and a bounded context composed from selected documents plus preparation turns. Its stated behavior is intake-oriented unless the user specifically asks for questions/practice.
4. Cross-window document-change events keep the Knowledge Bank and attachment views in sync.

### 4.3 Live answer flow

1. A meeting start invokes main-process capture setup.
2. Native microphone and system-audio streams are captured separately; local STT instances can run independently for each channel.
3. Local ONNX STT emits partial/final segments. Its VAD uses 30 ms windows, an RMS threshold of `0.008`, and roughly `300 ms` hangover; the model catalog includes Moonshine and Whisper variants.
4. Deterministic transcript cleanup removes fillers/non-meaningful turns, preserves meaningful interviewer content, sparsifies to a bounded window, and labels turns as `INTERVIEWER`, `ME`, or `ASSISTANT`.
5. The context path combines temporal transcript history, selected knowledge, mode/persona blocks, relevant RAG chunks, and optional screen evidence. The RAG live indexer chunks and embeds transcript material during an active meeting.
6. `LLMHelper` routes the final request to the selected/eligible provider, with provider capabilities, availability, scope policy, rate limiting, and fallback behavior. Known IDs include Natively, Groq, Codex, Gemini, OpenAI, Claude, DeepSeek, and Ollama.
7. Streaming output returns through IPC/events to the renderer/overlay; recent answers are retained to avoid repetition and support later post-call chat.

### 4.4 Screen understanding flow

`ScreenshotHelper` captures an image; the screen service optimizes it and sends it to a vision provider fallback chain. The current implementation is **vision-first**. The old OCR provider/manager classes exist for tests and possible future opt-in work but are runtime-disabled. `ScreenUnderstandingResult` retains legacy fields such as `ocrText` for compatibility, even though its current source is vision.

### 4.5 Post-call flow

The application persists a meeting and makes transcript/assistant-response history queryable. Post-call prompt building can include meeting summaries, detailed action items/key points, a bounded timeline, prep history, and selected documents. This turns a transient interview into an auditable local learning record—provided retention and deletion behavior are fixed.

---

## 5. Documentation assessment

The repository contains **153 Markdown documents / 24,480 lines** outside dependencies, including active docs, code maps, release notes, archived investigations, planning artifacts, and test fixtures. The documentation is unusually strong in architecture mapping, but it is not entirely consistent.

### Sources of truth

| Document set | How to use it |
| --- | --- |
| `codemap.md` and nested `codemap.md` files | Best directory-by-directory architecture map. |
| `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`, `docs/TESTING.md`, `docs/RELEASE.md`, `docs/ROADMAP.md` | Canonical current documentation. `PROJECT_STATUS.md` explicitly treats archive material as evidence, not current status. |
| `docs/APPLICATION_FLOW_AUDIT.md` | High-value read-only audit with concrete current risks/remediation order. |
| `REPORT.md` | A milestone/rebrand report; useful history but it conflicts with canonical docs in places and should not be treated as the present release truth without verification. |
| `docs/archive/**` | Historical evidence only. It preserves prior QA/security/vision/release investigations but does not prove current behavior. |

### Documentation drift that needs correction

- Canonical documents still brand the product **AnswerCue** and `codemap.md` identifies it as **AGPL-3.0**. `REPORT.md` calls it **InterviewOS**, claims v3.2.0, and calls the license “Proprietary / Commercial.” The repository-level `AGENTS.md` says the public fork is AGPL-3.0. This is a material legal/brand contradiction; choose the current public release identity/license and update every canonical document, package metadata, website, releases, and notices consistently.
- `REPORT.md` claims several release/website fixes and completed quality gates; canonical status docs still state release verification, E2E, and signing/notarization are incomplete. Treat the canonical docs and live artifacts as authoritative until re-validated.
- Legacy naming remains (`AnswerCue`, `LocalWhisper`, historical provider IDs, old OCR fields) partly for backward compatibility. The documentation correctly warns against a blind rename; a compatibility migration plan is needed.

---

## 6. Confirmed risks and likely broken behavior

The following are grounded in `docs/APPLICATION_FLOW_AUDIT.md`, `docs/PROJECT_STATUS.md`, CodeGraph call-path review, and the source maps. They should be treated as the priority backlog, not speculative polish.

### P0 — privacy, retention, integrity

1. **“Do not persist” may still persist live data.**
   - `MeetingPersistence` gates final save with `doNotPersist` / `meetingRetention='never'`, but live RAG begins unconditionally. Transcript segments may be chunked, embedded, stored, and potentially sent to a cloud embedding provider before meeting shutdown.
   - **Fix:** decide the exact contract (strict no storage vs. temporary live processing), block/route live indexing before it starts, clear transient data deterministically, and add network-deny + database assertions.

2. **Transcript scope policy can be bypassed.**
   - The audit reports that `LLMHelper.scopesForPayload` adds `transcript` only when no extra scopes already exist. A request containing transcript text plus another scope can declare only the latter.
   - **Fix:** derive data scopes from the actual payload as a union; test every combination of transcript/doc/screenshot/mode input and assert that denied content neither leaves the process nor appears in logs.

3. **Meeting finalization duplicates sensitive child data.**
   - A placeholder and final save both persist the full transcript and usage. `DatabaseManager.saveMeeting()` uses `INSERT OR REPLACE` for the parent but only inserts child rows; it does not clear existing transcript/interaction rows. SQLite foreign keys are declared in schema but are not enabled, so the usual cascade does not occur. The result can be duplicated transcript and AI-interaction rows, inflated storage, and distorted post-call/RAG inputs.
   - **Fix:** enable and verify `PRAGMA foreign_keys = ON` for every connection, replace parent replacement with an atomic upsert, explicitly replace child rows in the transaction, and add a temporary-real-SQLite integration test for placeholder → final save.

4. **Crash recovery can create phantom meetings.**
   - The recovery path can process a transient `live-meeting-current` RAG sentinel as a genuine meeting.
   - **Fix:** give ephemeral items a non-user-visible state/type and exclude them from recovery; assert cleanup on simulated crash.

5. **Deletion and retention are incomplete.**
   - `deleteMeeting` does not fully clean queues, vector records, screenshots, and workspace references. `7d` / `30d` retention values are stored but documented as unenforced.
   - **Fix:** make deletion a transactional cascade across database/files/index queues; either implement scheduled retention with tests or remove/hide those controls.

6. **Sensitive content is plaintext at rest.**
   - SQLite, workspace/document JSON, and screenshot files are plaintext. Credentials are separately encrypted.
   - **Fix:** implement the existing encryption design with OS-keychain key management, plaintext-to-encrypted migration/recovery, export/delete capabilities, and an explicit lost-key policy.

### P1 — reliability, contract drift, product trust

7. **Provider/STT identifiers are inconsistent.**
   - Known examples are `codex` vs. `codex-cli` and `gemini` vs. `gemini_flash` / `gemini_pro`; the local Moonshine route retains `LocalWhisper*` naming. A legacy `ProviderRouter` is instantiated although the audit says its selection/health methods appear unused.
   - **Fix:** introduce one canonical `ProviderId` schema shared by preload, renderer, settings, router, and models; write migrations/adapters before retiring aliases; add contract tests.

8. **Some UI surfaces are unreachable or inert.**
   - The audit reports startup/onboarding/trial pieces behind unreachable gates and an overlay theme loaded but passed to `AnswerCueInterface` as `interfaceTheme="default"`. Settings ownership is duplicated between embedded `SettingsOverlay` and popup `SettingsPopup`.
   - **Fix:** write a route/surface inventory with an owner and user story for each component; mount or delete onboarding, pass the actual theme, keep embedded settings canonical, and make popup settings a compatibility shell or retire it.

9. **Screen understanding has no private OCR fallback today.**
   - Vision-first is intentional, but the OCR path is disabled. If a user selects strict local/privacy mode without a local visual model, screen assistance may become unavailable rather than degraded.
   - **Fix:** add an explicit private OCR fallback—not a silent revival of legacy routing—and describe its lower-quality behavior in UI.

10. **Website artifact selection must be re-verified.**
   - The flow audit states Intel Macs/unknown platforms can fall through to ARM downloads and asset assumptions do not fully match release configuration. `REPORT.md` claims a later repair. The current release assets and website resolver must be tested together against real release data before shipping.

11. **Provider integrations remain incomplete.**
   - Canonical project status calls out Gemini model discovery and Google STT end-to-end completion as unresolved.
   - **Fix:** run credentialed smoke tests in a separate test account, make health/auth errors actionable, and accurately advertise only validated provider paths.

12. **Packaged desktop validation is incomplete.**
   - Browser Playwright smoke does not prove preload/native/audio behavior. macOS permissions, system audio, screen capture, and real overlay behavior require an Electron-window suite and a real-device release checklist.

### Further independent-audit findings

13. **A remote Google Analytics script executes in an Electron renderer with a broad preload bridge.**
   - `index.html` permits Google Tag Manager and `src/lib/analytics/analytics.service.ts` dynamically loads `gtag.js`; every app surface initializes it. The same renderer receives a broad preload API with document content, arbitrary supported-path ingestion, deletion, settings, and configuration capabilities. This materially weakens the renderer/main trust boundary if the remote script or supply chain is compromised.
   - **Fix:** remove remote scripts from Electron renderers; send consented, schema-limited telemetry from a narrow main-process service; give each window a least-privilege preload; enable sandboxing; deny navigation/window creation; require short-lived native-file-selection tokens instead of arbitrary paths.

14. **Analytics starts without consent and is not disclosed accurately.**
   - GA4 initializes automatically without an analytics preference; interview actions can report model/provider/latency metadata. `PRIVACY.md` does not disclose Google Analytics. Its hard-coded `APP_VERSION` is `1.1.3` despite root version `3.2.0`, and model-name guessing mislabels cloud Llama/DeepSeek/Qwen models as local.
   - **Fix:** default analytics off until informed consent, document processor/event/retention/opt-out terms, route events from actual provider identity, and inject build version from package metadata.

15. **The first-run terms/privacy links are blocked by the app’s own external-URL allowlist.**
   - `StartupSequence` requests Natively URLs but `open-external` only allows a Gmail URL and a macOS preferences URI. The user is asked to accept documents they cannot inspect.
   - **Fix:** add exact canonical HTTPS legal URLs to the allowlist and exercise the complete IPC route in a test while keeping noncanonical URLs blocked.

16. **Database migration v10 can mark failure as complete.**
   - Error handling advances `user_version` outside successful schema verification. A transient failure can leave a half-migrated schema that later launches do not retry.
   - **Fix:** advance schema version inside a success-only transaction, make recovery idempotent, and fault-inject every migration statement in tests.

17. **Published platform promises do not match validated functionality.**
   - Windows `ia32` packaging is configured but its native-build script does not build all Windows architectures; the package can lack its required `.node` binary. Linux installers are configured despite system-audio capture explicitly reporting unsupported on Linux. Website Windows download selection accepts the first `.exe`, so GitHub ordering can select a portable executable instead of NSIS Setup.
   - **Fix:** remove unsupported targets or build/test them on their target architecture; implement PipeWire/PulseAudio before calling Linux full-featured; prefer `Setup` installer assets deterministically and add website tests.

18. **The default test gate is too narrow.**
   - `npm test` only covers selected Electron `.mjs` directories and excludes renderer, website, Rust/native, utility, E2E, and packaging paths. Some current checks inspect source-string ordering rather than execute the persistence behavior they purport to protect.
   - **Fix:** add real SQLite integration tests first, then required renderer/Electron, website, native/Rust, and clean-package CI jobs.

### This audit’s test result

`npm test` did **not** reach the test suite in this checkout. Its build pre-step failed with:

```text
Error: Cannot find module 'esbuild'
Require stack:
- /Users/naheedroomy/Documents/InterviewOS/scripts/build-electron.js
Node.js v24.21.0
```

This demonstrates an incomplete local dependency installation/environment, not an application test failure. Re-run after the repository’s supported setup (`npm install`, Node 20+ / preferably documented Node 20 or 22 LTS, native build prerequisites). No source files were changed by this audit.

---

## 7. Recommended roadmap

### Horizon 1 — 0–6 weeks: make the existing product trustworthy

1. **Privacy/data-integrity remediation first.** Remove remote renderer scripts or sharply reduce renderer privilege; gate/disclose telemetry; implement and test no-persist semantics, scope union enforcement, reliable meeting upsert, crash cleanup, full deletion, retention behavior, and migration recovery.
2. **Local-mode truthfulness.** Add a privacy dashboard/receipt for every request: audio STT route, embeddings route, LLM route, vision route, destination, and whether data left the device. “Local STT” must not imply the rest of the request stayed local.
3. **Live reliability benchmark.** On supported Mac/Windows hardware, measure first partial latency, final latency, real-time factor, memory, CPU, dropped segments, and word error rate for representative quiet/noisy/overlap interviews.
4. **Setup/permission diagnostics.** A preflight screen should verify microphone, system audio, screen recording, accessibility, provider credentials, selected model availability, and local storage state—and produce actionable repair steps.
5. **Testing foundations.** Restore dependencies; create a real Electron harness; add tests for IPC contracts, local-only network denial, persistence/deletion, provider fallbacks, and release download selection.

### Horizon 2 — 6–12 weeks: useful local intelligence

1. **Polished Ollama private-mode wizard.** Detect Ollama, test its local URL, show installed models, recommend a model based on RAM, verify a small answer request, explain disk/RAM implications, and never auto-install a daemon without consent.
2. **Evidence-linked answers.** Each suggestion should identify the transcript timestamp, document/RAG source, screen capture source, and confidence/unknown state. This is much more valuable than another generic answer generator.
3. **Consent/redaction preview.** Detect likely PII/secrets in transcript/screenshots/documents before cloud send; allow per-turn omission and preserve an audit trail locally.
4. **Post-call feedback and rehearsal.** Generate follow-up questions, answer-structure feedback, and a role-specific rubric based on the user’s prep material. Keep scoring explainable and source-linked.
5. **Retrieval quality work.** Evaluate retrieval on real interview questions before changing defaults; add a reranker only behind a latency budget.

### Horizon 3 — 12+ weeks: durable differentiation

1. **Managed local engine (only after a packaging spike).** A signed `llama.cpp` sidecar plus separately downloaded GGUF weights could provide a no-daemon private answer mode. Do not commit until macOS/Windows packaging, updates, support cost, and performance are proven.
2. **Offline multimodal assistance.** Offer an optional local vision model for code/diagrams/screenshots, with OCR fallback for text-heavy screens.
3. **Speaker-aware review.** Use the existing mic/system attribution first; add diarization only for imported recordings or multi-speaker system audio, likely as post-call processing.
4. **Team/coach workflows only after privacy maturity.** Sharing, coaching, or analytics greatly amplify the need for encryption, consent, RBAC, and data lifecycle controls.

---

## 8. Local model and on-device processing strategy

### Design principle

Do not replace the architecture wholesale. It already has seams for local STT, Ollama LLM routing, local embeddings, provider data-scope policy, and `private_vision`. Improve those seams, benchmark them, and use optional model downloads rather than bloating the installer.

### 8.1 Speech-to-text

| Candidate | Recommendation | Why / integration |
| --- | --- | --- |
| **Moonshine Base / Tiny** | **Adopt and harden** | Already integrated through the local ONNX worker. Base is the practical default for low-latency English; Tiny is a low-RAM option. Clearly label English/language limitations. |
| **Distil-Whisper (English)** | **Add as opt-in quality fallback** | Fits the current worker/catalog; useful where English accuracy matters more than minimal latency. |
| **Whisper Large-v3-Turbo ONNX** | **Opt-in multilingual/batch only** | Useful multilingual fallback but roughly a 1 GB catalog artifact and poor default for cold start/RAM. |
| **whisper.cpp / faster-whisper** | **Pilot only** | Mature alternatives, but add native sidecar/architecture/signing complexity. First benchmark current ONNX behavior; do not maintain two runtimes without a demonstrated win. |

Model catalog sizes found in the code/research are approximately Moonshine Tiny **26 MB**, Moonshine Base **280 MB**, and Whisper Large-v3-Turbo **~1,031 MB**. These are download-size signals, not reliable runtime-memory measurements.

### 8.2 Local answer models

| Candidate | Recommendation | Trade-off |
| --- | --- | --- |
| **Ollama + Qwen3 4B/8B** | **Best next product step** | Existing integration route, good model-choice UX, strong 4B/8B practicality. Validate exact artifact license and benchmark on actual interview prompts. |
| **Ollama + local vision model** | **Pilot through existing `private_vision` seam** | Supports screenshots/code/diagrams locally but has high RAM/latency. Do not bundle model weights. |
| **llama.cpp + GGUF** | **Packaging spike** | Most credible managed local runtime across CPU/Metal/CUDA/Vulkan, but requires signed binaries per OS/arch, model lifecycle UI, and support for hardware variance. |
| **Gemma 3** | **Optional after license review** | Potentially capable, but uses Google-specific terms; do not treat “open weights” as redistribution permission. |
| **MLX-only / CUDA-only path** | **Defer as defaults** | Excellent platform optimizations but not a cross-platform core. Use later as optional acceleration only. |

A local 4B–8B quantized model is a sensible target for many 8–16 GB machines, but this requires real performance validation. The product should ask about available memory/GPU, recommend tiers, and make model downloads/deletion visible.

### 8.3 Local vision/OCR

| Candidate | Recommendation | Why |
| --- | --- | --- |
| **Tesseract** | **Add as explicit private OCR fallback** | Deterministic, Apache-2.0, low memory, and suited to slide/browser text. Return the existing screen-result shape. It will not match vision reasoning for diagrams/code. |
| **Local VLM via Ollama** | **Pilot** | Best local understanding of code/diagrams; use the current `private_vision` policy path. Carefully bound image size, request rate, and user expectations. |
| **PaddleOCR / exported ONNX subset** | **Research spike** | Better layout/multilingual potential but Python/Paddle distribution is inappropriate for the current desktop installer unless a reliable ONNX route is proven. |

### 8.4 Retrieval, VAD, and speaker intelligence

| Candidate | Recommendation | Integration seam |
| --- | --- | --- |
| **Current `all-MiniLM-L6-v2`** | **Keep as always-available offline baseline** | Existing 384-dimensional local embedding provider. |
| **BGE-M3** | **Pilot as a new provider, never silent replacement** | Better multilingual retrieval but larger/slower; use explicit dimensional migration/reindex. |
| **BGE reranker-v2-m3** | **Pilot after retrieval over-fetch** | Rerank top 16–32 chunks in a worker under a firm latency budget. |
| **Silero VAD** | **Optional robust VAD experiment** | Replace/augment RMS VAD behind the existing segment interface; benchmark false cuts/latency. |
| **pyannote diarization** | **Post-call pilot only** | The app’s separate mic/system streams are already stronger for interviewer/candidate attribution. Use diarization only for mixed/imported audio; model terms and runtime cost need review. |

Avoid Jina rerankers as a shipped default until the exact artifact license is verified; some model cards use non-commercial terms.

### Model governance checklist

For each model/runtime shipped or recommended, record: exact upstream revision and artifact hash; license and redistribution terms; input data destination; download size and measured peak RAM; supported OS/architecture; model-card limitations; offline/deletion behavior; test corpus metrics; and fallback behavior. “Open” does not establish commercial redistribution rights.

---

## 9. Product feature opportunities, prioritized

### Highest-value features using existing seams

1. **Verifiable Privacy Mode** — one switch that only succeeds when STT, embeddings, LLM, and screen route are all local; show live routing receipts and fail closed if an allowed local dependency is missing.
2. **Answer provenance** — attach transcript timestamps, RAG excerpts, document names, or screenshot origin to every suggestion. Allow users to open the evidence and report “not supported by context.”
3. **Send-preview / redaction gate** — show what data is about to go to which provider; highlight PII and allow removal. This makes the privacy policy tangible.
4. **Interview readiness preflight** — permissions, mic/system channel levels, local model readiness, cloud credential check, test capture, disk availability, and a compact diagnostic export.
5. **Post-call review workspace** — answer-by-answer evidence, STAR/rubric feedback, gaps, follow-up email draft, and role/JD mapping. This has a much safer and clearer value proposition than stealth live assistance.
6. **Source-aware Knowledge Bank** — versioned documents, stale-context warning, per-workspace relevance, selective citation, and clear deletion/usage impact.
7. **Reliability timeline** — expose capture interruptions, STT restarts, provider retries, dropped/partial segments, and fallbacks to help users trust or correct a session.

### Lower-priority / later

- Offline multimodal model download manager.
- Imported-recording diarization and speaker separation.
- Coach/recruiter review sharing after encryption/consent is solved.
- Plugin ecosystem or mobile app. These are explicitly deferred in canonical roadmap documentation and should not compete with safety/reliability work.

---

## 10. Research sources

The independent research used upstream projects and model cards rather than comparison/SEO pages. Verify revision-specific licenses again at release time.

- Moonshine: <https://github.com/usefulsensors/moonshine> and <https://huggingface.co/onnx-community/moonshine-base-ONNX>
- OpenAI Whisper: <https://github.com/openai/whisper>
- Distil-Whisper: <https://huggingface.co/distil-whisper/distil-small.en>
- Ollama API/runtime: <https://github.com/ollama/ollama/blob/main/docs/api.md>
- llama.cpp: <https://github.com/ggml-org/llama.cpp>
- Qwen3: <https://huggingface.co/Qwen/Qwen3-8B>
- Gemma terms: <https://ai.google.dev/gemma/terms>
- Tesseract: <https://github.com/tesseract-ocr/tesseract>
- PaddleOCR: <https://github.com/PaddlePaddle/PaddleOCR>
- Ollama vision: <https://ollama.com/blog/vision-models>
- BGE-M3: <https://huggingface.co/BAAI/bge-m3>
- BGE reranker: <https://huggingface.co/BAAI/bge-reranker-v2-m3>
- Silero VAD: <https://github.com/snakers4/silero-vad>
- pyannote: <https://github.com/pyannote/pyannote-audio>

---

## 11. Bottom line

InterviewOS has the shape of a differentiated interview operating system: it combines preparation, capture, local/cloud intelligence, contextual retrieval, and post-call learning in one desktop product. Its strongest strategic asset is not any individual LLM—it is the assembled interview context, dual-channel capture, and potential for genuinely auditable private assistance.

To realize that advantage, prioritize correctness and trust: fix storage/scope/finalization/deletion, complete real-device validation, resolve brand/license/documentation contradictions, and turn local mode into a provable user promise. Once those foundations are in place, Ollama/Qwen3, local OCR/VLM, improved VAD, and evidence-linked coaching are the most natural, high-value expansions.
