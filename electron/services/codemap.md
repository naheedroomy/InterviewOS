# electron/services/

## Responsibility

The service layer for the Electron main process. These modules own the app's
cross-cutting, non-UI runtime concerns: secure credential/settings persistence,
global keyboard shortcuts and stealth input, the phone-mirroring HTTP/WebSocket
server, interview "modes" and their retrieval context, model-tier management,
and a set of small lifecycle managers (Ollama, calendar, install ping, interview
workspace state). They sit between `electron/main.ts` (app bootstrap, window
helpers, IPC wiring) and the lower-level `db/`, `rag/`, `audio/`, and `llm/`
layers. Most are singletons (`getInstance()`) that the main process and IPC
handlers call directly.

## Design

**Singleton pattern.** Nearly every class here is a process-wide singleton
exposed via `static getInstance()` (e.g. `SettingsManager`, `CredentialsManager`,
`ModesManager`, `KeybindManager`, `SkillsManager`, `CalendarManager`,
`PhoneMirrorService`, `StealthKeyboardManager`, `OllamaManager`,
`InterviewWorkspaceStateManager`, `InterviewContextDocsManager`). Constructors
are private; state is held in instance fields. Several guard on `app.isReady()`
(`SettingsManager`, `SkillsManager`) because they touch `app.getPath('userData')`.

**Persistence conventions.**
- Non-secret settings → `settings.json` in `userData` (`SettingsManager`).
- Secrets (API keys, tokens) → `credentials.enc`, encrypted with Electron
  `safeStorage` (`CredentialsManager`). `CalendarManager` mirrors this with
  `calendar_tokens.enc`.
- All JSON writes are **atomic**: write to a `.tmp` file then `fs.renameSync`
  over the target (`SettingsManager`, `CredentialsManager`, `KeybindManager`,
  `InterviewContextDocsManager`, `InterviewWorkspaceStateManager`,
  `ModelVersionManager`).
- `CredentialsManager` scrubs in-memory keys on quit/clear and deletes stale
  plaintext fallback files.

**Pure logic extracted for testability.** `toggleStateReducer.ts` is a pure
function (`decideToggle`) with no Electron imports so the "always broadcast
authoritative state" invariant is unit-testable. `RateLimiter.ts` is a plain
token-bucket class (also Electron-free). `ModelVersionManager` exposes pure
helpers (`parseModelVersion`, `compareVersions`, `versionDistance`,
`classifyModel`) alongside the stateful manager.

**Lazy `require()` to break circular deps.** `KeybindManager` and
`StealthKeyboardManager` `require('../main')` (AppState) and
`require('../audio/nativeModuleLoader')` at call time rather than at import
time, avoiding import cycles with the main module.

**Defensive, self-healing state machines.** Several managers carry explicit
ordering/race fixes documented in code comments (e.g. `StealthKeyboardManager`
flips `active=true` and broadcasts *before* `tap.start()` so the first captured
callback isn't dropped; `KeybindManager` re-registers OS-dropped shortcuts via a
health-check timer; `PhoneMirrorService` debounces status emits and uses a
registration token to avoid stale `closed` handlers).

## Flow

**Settings / credentials.** `SettingsManager` and `CredentialsManager` load on
boot (after `app.whenReady()`), expose typed getters/setters, and auto-save on
every mutation. `CredentialsManager.init()` also normalizes the STT provider and
ensures a runnable default model. `SettingsManager` migrates legacy
`screenUnderstandingMode` values on load.

**Keybinds.** `KeybindManager` loads defaults + persisted overrides from
`keybinds.json`, registers global shortcuts via `globalShortcut`, and routes
triggers to `onShortcutTriggered` callbacks. It re-registers on mode change
(launcher/overlay), on rebind, and periodically via `revalidateShortcuts()`.
`StealthKeyboardManager` owns the macOS CGEventTap lifecycle (start/stop/toggle,
idle auto-disengage, Accessibility permission handling) and broadcasts captured
keys only to the registered overlay window. `ImeDetector` gates auto-engaging
the tap when a composition IME is active.

**Phone mirror.** `PhoneMirrorService` starts an HTTP + WebSocket server
(loopback or LAN), serves the inlined `PHONE_MIRROR_HTML` client
(`phoneMirrorClient.ts`), authenticates via a pairing token, and streams
`StreamEvent`s (history/user/token/done/error/assistant/ack) to connected phones.
IPC handlers push events via `publish*` methods; phone commands (chat/action/
screenshot) are emitted to `onPhoneCommand` listeners.

**Modes & retrieval.** `ModesManager` is the CRUD facade over the DB for modes,
reference files, and note sections, and builds LLM context blocks. It delegates
retrieval to `ModeContextRetriever`, which does lexical chunk scoring (with an
adaptive relevance threshold) and, via `retrieveHybrid`, FTS/BM25 + vector
search through `modes/ModeHybridRetriever`, `rag/VectorStore`, and
`rag/EmbeddingPipeline`, falling back to lexical on failure.

**Model tiers.** `ModelVersionManager` discovers latest models from provider
APIs (OpenAI/Gemini/Claude/Groq), classifies them into vision/text families,
applies tier-1 promotion rules, persists state with rollback, and re-runs on a
~14-day schedule or on model-not-found errors.

**Lifecycle managers.** `OllamaManager` starts/stops the local Ollama server
(only if the app launched it). `CalendarManager` runs the Google OAuth loopback
flow (token exchange proxied through the natively-api backend), refreshes
tokens, fetches upcoming events, and schedules meeting reminders.
`InstallPingManager` sends a one-time anonymous install ping.
`InterviewWorkspaceStateManager` + `InterviewContextDocsManager` persist
interview prep context, documents, and workspace/meeting state (v1→v2
migration). `SkillsManager` seeds and loads `SKILL.md` skills from `userData`.
`CodexCliService` spawns the Codex CLI (collect or stream) and parses its JSON
event output. `RateLimiter` throttles LLM API calls per provider.

## Integration

- **Main process / IPC:** Services are consumed by `electron/main.ts` and the
  IPC handlers. `KeybindManager.setupIpcHandlers()` registers `keybinds:*`
  channels; `PhoneMirrorService` is driven by `ipcHandlers` publish calls;
  `ModesManager`, `CredentialsManager`, `SettingsManager`, and the interview
  managers back their own IPC channels.
- **Renderer:** State is pushed to windows via `webContents.send` (e.g.
  `keybinds:update`, `stealth-tap-state`, `stealth-key-captured`,
  `keybinds:registration-failed`). `CalendarManager` emits `connection-changed`,
  `events-updated`, `start-meeting-requested`, `open-requested` via `EventEmitter`.
- **DB / RAG / LLM:** `ModesManager` and `ModeContextRetriever` depend on
  `db/DatabaseManager`, `rag/VectorStore`, `rag/EmbeddingPipeline`, and
  `llm/prompts`. `ModelVersionManager` and `RateLimiter` feed the LLM provider
  routing/fallback chain.
- **Native module:** `StealthKeyboardManager` loads `audio/nativeModuleLoader`
  for the Rust `StealthKeyboardTap` and `CapturedKey`/`OverlayBoundsInput` types.
- **External services:** `CalendarManager` (Google OAuth + Calendar API, token
  exchange proxied via natively-api), `ModelVersionManager` (provider model
  listing APIs), `CodexCliService` (local `codex` binary), `OllamaManager`
  (local Ollama server), `InstallPingManager` (Cloudflare Worker endpoint).
- **Settings coupling:** `PhoneMirrorService` reads/writes
  `phoneMirrorEnabled` / `phoneMirrorExposeOnLan` through `SettingsManager`;
  `CodexCliService` config is stored in `SettingsManager`; provider credentials
  and default/preferred models live in `CredentialsManager`.
