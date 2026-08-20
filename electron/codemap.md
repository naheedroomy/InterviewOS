# electron/

## Responsibility

The Electron **main process** for AnswerCue. Owns the native desktop shell: window
lifecycle, OS permissions (screen recording / mic / accessibility), audio capture +
speech-to-text pipelines, screen capture, the LLM/intelligence layer, meeting
persistence, tray, auto-update, and the IPC bridge to the renderer. It is the
single entry point (`main.ts`) that wires every subsystem together and exposes a
typed API to the UI via `preload.ts`.

Scope note: this codemap covers **only the source files directly under
`electron/`** (the top-level `*.ts` files). Child folders (`audio/`, `config/`,
`db/`, `llm/`, `rag/`, `services/`, `update/`, `utils/`, `premium/`, `test/`)
hold the deeper subsystems those top-level files delegate to and are documented
elsewhere.

## Design

- **Singleton `AppState` (main.ts)** — the central composition root. Constructs
  and holds every helper/manager (WindowHelper, SettingsWindowHelper,
  ModelSelectorWindowHelper, CropperWindowHelper, ScreenshotHelper,
  ProcessingHelper, IntelligenceManager, ThemeManager, RAGManager, tray) and
  exposes getters for them. Most subsystems are reached through `AppState`.
- **Helper classes per concern** — each window type and each major capability is
  its own class (`*WindowHelper`, `ScreenshotHelper`, `ProcessingHelper`).
  Window helpers follow a **preload-and-reuse** strategy: windows are created
  once (often hidden/off-screen) and toggled via show/hide to avoid cold-start
  latency.
- **Facade pattern (IntelligenceManager)** — a thin `EventEmitter` facade that
  delegates to three focused sub-modules (`SessionTracker` for state,
  `IntelligenceEngine` for LLM mode routing, `MeetingPersistence` for
  save/recovery) and re-forwards all engine events for backward compatibility.
- **Stealth / focus-preservation** — pervasive macOS NSPanel handling
  (`type: 'panel'`, `applyStealthToWindow` native SPI, `StealthKeyboardManager`)
  so overlay/settings/cropper windows never steal focus from the user's
  foreground app (Zoom/browser/IDE) mid-meeting. Windows uses an "opacity
  shield" sequence for content protection (DWM).
- **Platform branching** — heavy `process.platform === 'darwin' | 'win32' |
  'linux'` branching for capture, window type, and permission handling.
- **IPC registration** — `ipcHandlers.ts` registers all channels via
  `safeHandle`/`safeOn` wrappers that remove stale handlers before re-registering
  (idempotent, avoids duplicate-listener bugs). `preload.ts` exposes a typed
  `window.electronAPI` via `contextBridge.exposeInMainWorld`.
- **Verbose logging gate** — `verboseLog.ts` holds a module-level flag
  (`isVerboseLogging()`) toggled from AppState, used to gate diagnostic logs.
- **LLM provider abstraction (LLMHelper)** — a large class routing to many
  providers (Gemini, Groq, OpenAI, Claude, DeepSeek, Ollama, custom/curl,
  Codex CLI, AnswerCue/Natively) with streaming, vision, and scope-policy
  (privacy) enforcement.

## Flow

1. **Bootstrap (`main.ts` `initializeApp`)** — single-instance lock → `app.whenReady()`
   → pre-emptive dock hide / activation policy → configure telemetry → init
   `CredentialsManager` → construct `AppState` singleton → `loadStoredCredentials()`
   (loads API keys into LLMHelper, re-inits IntelligenceManager + RAG) → seed
   ModesManager → `initializeIpcHandlers(appState)` → apply disguise → start
   Ollama manager → prewarm STT providers → create window(s).
2. **Renderer ↔ main** — renderer calls `window.electronAPI.*` (preload →
   `ipcRenderer.invoke/on`) → `ipcHandlers.ts` handlers → `AppState` helpers.
   Main pushes events back via `webContents.send(...)` on channels like
   `meetings-updated`, `theme:changed`, `settings-visibility-changed`,
   `screenshot-taken`, and the `PROCESSING_EVENTS` set.
3. **Meeting lifecycle** — `startMeeting()`/`endMeeting()` on AppState drive
   audio capture + STT pipelines; transcript segments flow into
   `IntelligenceManager.handleTranscript` → `SessionTracker` (context window,
   coding-question detection, epoch compaction) → `IntelligenceEngine` (mode
   routing, emits `assist_update`, `suggested_answer`, `recap`, etc.) →
   `MeetingPersistence.stopMeeting()` snapshots data, saves a placeholder row,
   then asynchronously generates title/summary and writes the final DB row
   (with crash recovery via `recoverUnprocessedMeetings`).
4. **Coding-solution flow** — screenshots captured by `ScreenshotHelper` are
   queued; `ProcessingHelper.processScreenshots()` drives LLM rolling-script /
   solution / debug generation and emits `PROCESSING_EVENTS` to the renderer.
5. **Window toggling** — `WindowHelper` manages launcher/overlay modes and
   bounds persistence; `SettingsWindowHelper` / `ModelSelectorWindowHelper` /
   `CropperWindowHelper` manage their popup/selection windows and return
   selections (e.g. cropper resolves a `Promise<Rectangle|null>`).

## Integration

- **`main.ts`** is the hub: imports and constructs all top-level helpers and
  delegates to child subsystems (`audio/`, `db/`, `llm/`, `rag/`, `services/`,
  `update/`, `utils/`, `premium/`). `AppState` is imported by `ipcHandlers.ts`
  and `ProcessingHelper.ts`.
- **`preload.ts`** ↔ **`ipcHandlers.ts`** form the renderer boundary; channel
  names must stay in sync (preload invokes the channels ipcHandlers registers).
- **`IntelligenceManager`** is the public intelligence API consumed by
  `main.ts` (and IPC handlers); it composes `SessionTracker`,
  `IntelligenceEngine`, and `MeetingPersistence`, and re-exports their types.
- **`LLMHelper`** is injected into `IntelligenceManager`/`IntelligenceEngine`
  and `ProcessingHelper`; it also reaches into `services/` (CredentialsManager,
  SettingsManager, CodexCliService, ProviderRouter) for keys, scopes, and
  provider config.
- **`ThemeManager`** broadcasts `theme:changed` to all windows; **`DonationManager`**
  gates the donation toaster via its own encrypted `electron-store` file.
- **`verboseLog.ts`** is a shared flag consumed by `SessionTracker` and others
  across the main process.

## Important Anchors

- `main.ts`: `export class AppState` (line ~471), `PROCESSING_EVENTS` (~550),
  `startMeeting()` (~3369), `endMeeting()` (~3661), `setupIntelligenceEvents()`
  (~3890), `initializeApp()` (~4936, module bootstrap).
- `ipcHandlers.ts`: `export function initializeIpcHandlers(appState)` (line 24)
  — the single registration point for all IPC channels.
- `preload.ts`: `contextBridge.exposeInMainWorld('electronAPI', ...)` (line 884)
  and `PROCESSING_EVENTS` (line 866).
- `IntelligenceManager.ts`: facade constructor wiring the three sub-modules and
  `forwardEngineEvents()` (line 51).
- `IntelligenceEngine.ts`: `IntelligenceMode` union (line 21) and
  `IntelligenceModeEvents` (line 58).
- `SessionTracker.ts`: `TranscriptSegment` / `SuggestionTrigger` / `ContextItem`
  types (lines 8–28), `compactTranscriptIfNeeded()` (line 604).
- `MeetingPersistence.ts`: `stopMeeting()` (line 104) and
  `processAndSaveMeeting()` (line 249).
- `LLMHelper.ts`: `export class LLMHelper` (line 79); provider model constants
  (lines 60–74); `chatWithGemini` (line 1529), `generateMeetingSummary` path.
- `WindowHelper.ts`: `export class WindowHelper` (line 22), `createWindow()`
  (line 382), overlay/launcher switching (`switchToOverlay` line 1126,
  `switchToLauncher` line 1254).
- `CropperWindowHelper.ts`: `showCropper()` (line 277) — promise-based area
  selection; `validateBounds()` (line 153).
- `ScreenshotHelper.ts`: `takeScreenshot()` (line 612), `takeSelectiveScreenshot()`
  (line 674), multi-display stitching helpers.
- `ProcessingHelper.ts`: `loadStoredCredentials()` (line 55),
  `processScreenshots()` (line 151).
- `SettingsWindowHelper.ts` / `ModelSelectorWindowHelper.ts`: popup window
  lifecycle (preload/show/toggle/hide).
- `DonationManager.ts`: `shouldShowToaster()` (line 48).
- `ThemeManager.ts`: `setMode()` / `broadcastThemeChange()` (lines 67/90).
- `verboseLog.ts`: `isVerboseLogging()` / `setVerboseLoggingFlag()`.

Note: `LLMHelper.ts.orig` is a backup copy of `LLMHelper.ts` (not a live source
file); ignore it when editing.
