# src/components/

This folder holds the React UI layer of the AnswerCue Electron app. It is the
top-level presentation surface: every window/overlay the user sees is composed
here. It talks to the Electron main process exclusively through the
`window.electronAPI` bridge (preload-exposed IPC), and to the backend through
that same bridge. It does **not** contain business logic — it renders state and
dispatches IPC calls.

> Scope note: this map covers only the files directly under `src/components/`.
> Subfolders (`ui/`, `settings/`, `dynamic-actions/`, `help/`, `onboarding/`,
> `trial/`, `__tests__/`) are separate modules with their own `codemap.md`.

## Responsibility

- Render the two primary surfaces of the app:
  - **`Launcher.tsx`** — the main window (meetings list, interview workspace,
    preflight setup, settings entry, global search/chat).
  - **`AnswerCueInterface.tsx`** — the live interview overlay (floating widget
    shown during an interview).
- Render supporting surfaces: settings window, chat overlays, modals, banners,
  toasters, the screen-capture cropper, and the startup sequence.
- Own all UI state and translate user intent into `window.electronAPI` calls.
- Subscribe to main-process push events (`on*` handlers) to keep the UI in sync
  with backend state (transcripts, model changes, STT status, updates, etc.).

## Design

- **Single preload bridge**: every component reaches the backend through
  `window.electronAPI` (often `(window as any).electronAPI` or optional-chained
  `window.electronAPI?.method?.()`). There is no direct Node/Electron access in
  the renderer. Calls are defensive (optional chaining) because not every
  method exists in every build/window.
- **Two big "god" components**: `Launcher.tsx` (~4.9k lines) and
  `AnswerCueInterface.tsx` (~5.1k lines) each own a huge amount of state and
  IPC wiring. They are the composition roots; smaller components are leaf
  widgets or modals.
- **Push-event subscription pattern**: components register `on*` listeners in
  `useEffect` and return the unsubscribe function for cleanup. Examples:
  `onModelChanged`, `onNativeAudioTranscript`, `onSttStatusChanged`,
  `onUpdateAvailable`, `onIntelligence*`, `onRAGStream*`, `onGeminiStream*`.
- **Optimistic local state + IPC persist**: e.g. `MeetingDetails` updates local
  `meeting` state immediately, then calls `updateMeetingTitle` /
  `updateMeetingSummary` to persist.
- **Streaming chat**: chat overlays use `useStreamBuffer` + `onRAGStreamChunk` /
  `onGeminiStreamToken` events to render token-by-token responses.
- **Framer Motion** is used pervasively for animations/transitions; **lucide-react**
  for icons; **ReactMarkdown + remark/rehype + KaTeX + Prism** for rich AI output.
- **Theme**: components read `useResolvedTheme()` and use Tailwind semantic
  tokens (`bg-bg-primary`, `text-text-primary`, `overlay-*` classes).
- **Error containment**: `ErrorBoundary` wraps the tree and reports render
  errors to main via `logErrorToMain`.

## Flow

1. **App boot** → `StartupSequence` (marketing/welcome) → `Launcher`.
2. **Launcher** loads meetings/readiness via IPC, shows preflight setup
   (providers → local model → permissions), then the interview workspace
   (three-pane: prep chat, selected docs, transcript + post-interview chat).
   Global search (`TopSearchPill`) opens `GlobalChatOverlay` (RAG over all
   meetings). Settings button opens `SettingsOverlay`.
3. **Starting an interview** → `onStartMeeting` → the live overlay
   `AnswerCueInterface` mounts. It subscribes to native audio/STT events
   (`onNativeAudioTranscript`, `onSttStatusChanged`), renders the rolling
   transcript (`RollingTranscript`), and generates AI answers via
   `generateWhatToSay` / `generateFollowUp` / `generateRecap` /
   `generateClarify` / `generateFollowUpQuestions` / `generateCodeHint`,
   streaming results back through `onIntelligence*` events.
4. **Post-interview** → `MeetingDetails` shows summary/transcript/usage tabs,
   editable via `EditableTextBlock`, with `MeetingChatOverlay` for RAG chat over
   that meeting and `FollowUpEmailModal` for drafting follow-up emails.
5. **Settings** (`SettingsOverlay`) is a tabbed window; each tab renders a
   subfolder component (`AIProvidersSettings`, `SkillsSettings`, etc.) or an
   inline section (audio, calendar, keybinds, general). `ProfileIntelligenceSettings`
   is a dedicated premium profile panel.
6. **Ambient surfaces** mount alongside the main UI: `UpdateBanner`/`UpdateModal`
   (update flow), `AnswerCueQuotaBanner` (quota warnings), `SupportToaster`
   (donation prompt), `FeatureSpotlight` (marketing carousel), `Cropper`
   (screen-area selection for screenshots).

## Integration

- **electronAPI surface used** (representative, not exhaustive):
  - Meetings/workspace: `getRecentMeetings`, `getMeetingDetails`,
    `deleteMeeting`, `updateMeetingTitle`, `updateMeetingSummary`,
    `interviewWorkspace*`, `interviewDocs*`, `getMeetingActive`,
    `onMeetingsUpdated`, `onMeetingStateChanged`.
  - Model/provider: `getStoredCredentials`, `getCurrentLlmConfig`,
    `getCustomProviders`, `getCodexCliConfig`, `getAvailableOllamaModels`,
    `fetchProviderModels`, `setModel`, `onModelChanged`, `set*ApiKey`.
  - STT/audio: `getInputDevices`, `getOutputDevices`, `startAudioTest`,
    `onAudioTestLevel`, `onNativeAudioTranscript`, `onSttStatusChanged`,
    `localWhisper*`, `onLocalWhisperDownload*`, `setSttProvider`,
    `setRecognitionLanguage`.
  - Live overlay: `generateWhatToSay`, `generateFollowUp`, `generateRecap`,
    `generateClarify`, `generateFollowUpQuestions`, `generateCodeHint`,
    `takeScreenshot`, `takeSelectiveScreenshot`, `saveScreenshotFile`,
    `onScreenshotTaken`, `onScreenshotAttached`, `onIntelligence*`,
    `onSuggestion*`, `streamGeminiChat`, `onGeminiStream*`, `ragQueryLive`.
  - Chat/RAG: `ragQueryMeeting`, `ragQueryGlobal`, `onRAGStream*`.
  - Window/overlay control: `showWindow`, `hideWindow`, `toggleWindow`,
    `toggleOverlayExpand`, `getOverlayExpanded`, `getOverlaySizingMode`,
    `setOverlayMousePassthrough`, `updateContentDimensions`, `windowMinimize`,
    `windowMaximize`, `windowClose`, `windowIsMaximized`, `onWindowMaximizedChanged`,
    `quitApp`, `toggleSettingsWindow`, `openSettingsTab`, `toggleModelSelector`.
  - Permissions: `checkPermissions`, `requestMicPermission`, `openExternal`.
  - Updates: `checkForUpdates`, `downloadUpdate`, `restartAndInstall`,
    `getCanAutoUpdate`, `getArch`, `onUpdateAvailable`, `onDownloadProgress`,
    `onUpdateDownloaded`, `onUpdateError`, `onUpdateChecking`, `onUpdateNotAvailable`.
  - Misc: `getUndetectable`/`setUndetectable`/`onUndetectableChanged`,
    `getThemeMode`/`setThemeMode`, `getOpenAtLogin`/`setOpenAtLogin`,
    `getAnswerCueUsage`, `getDonationStatus`/`setDonationComplete`/`markDonationToastShown`,
    `logErrorToMain`, `invoke` (generic channel), `platform`, `getArch`, `getOsVersion`.
- **Composition with subfolders**: `Launcher` uses `ui/ModelSelector`,
  `ui/TopPill` (via `AnswerCueInterface`), `help/HelpAssistant`,
  `dynamic-actions/DynamicActionBar`; `SettingsOverlay` uses `settings/*`,
  `ui/KeyRecorder`, `ui/KeyBadge`; `AnswerCueInterface` uses `ui/TopPill`,
  `ui/RollingTranscript`, `ui/GlassEffectLayer`, `dynamic-actions/DynamicActionBar`,
  and `premium` (`NegotiationCoachingCard`, `ProfileVisualizer`, `PremiumUpgradeModal`).
- **External deps**: `../utils/*` (platformUtils, modelUtils, messageId,
  pdfGenerator), `../hooks/*` (useShortcuts, useResolvedTheme, useStreamBuffer),
  `../lib/*` (analytics, overlayAppearance, overlay*Dedup, streamingTokenQueue,
  meetingInterfaceTheme, promoSurfaceFlags), `../premium`.

---

## File-by-file

### Primary surfaces

- **`Launcher.tsx`** — Main window root. Header (back/forward nav, `TopSearchPill`,
  help/settings buttons, `WindowControls` on non-mac). Preflight setup wizard
  (providers → local model → permissions). Meetings list + three-pane interview
  workspace (prep chat, docs, transcript). Right sidebar: setup issues, model
  selector, audio device config. Renders `GlobalChatOverlay`, `HelpAssistant`,
  `DocumentDetailsModal`. Heavy IPC: meetings, readiness, audio devices, docs,
  workspace, model, updates, permissions.
- **`AnswerCueInterface.tsx`** — Live interview overlay widget. Owns the mode
  pill, status pills (STT, vision), rolling transcript, AI response panel,
  quick actions, input bar, model selector, dynamic action bar. Subscribes to
  native audio/STT/intelligence/screenshot/overlay events and drives AI answer
  generation. Uses `ui/TopPill`, `ui/RollingTranscript`, `ui/GlassEffectLayer`,
  `dynamic-actions/DynamicActionBar`, `premium/NegotiationCoachingCard`.

### Settings

- **`SettingsOverlay.tsx`** — Full settings window. Tabbed sidebar
  (general, ai-providers, custom-instructions, skills, calendar, audio,
  keybinds, phone-mirror, help, about). Renders `settings/*` subcomponents and
  inline sections (audio test, calendar connect, keybind recorder, overlay
  opacity mockup). Heavy IPC for credentials, devices, theme, calendar, STT,
  disguise, retention, updates.
- **`SettingsPopup.tsx`** — Compact settings popup (undetectable toggle, Groq
  fast-text, provider key presence). Reads/writes `getUndetectable`/
  `setUndetectable`/`onUndetectableChanged`, `getStoredCredentials`,
  `setActionButtonMode`, `updateContentDimensions`.
- **`ProfileIntelligenceSettings.tsx`** — Premium profile-intelligence panel
  (resume/JD upload, persona, notes, company research, negotiation generation,
  Tavily key). Uses `profile*` IPC + `licenseCheckPremium`/`licenseGetDetails`.
  Renders `premium/ProfileVisualizer` and `premium/PremiumUpgradeModal`.

### Chat overlays

- **`GlobalChatOverlay.tsx`** — Full-app RAG chat. `ragQueryGlobal` +
  `onRAGStreamChunk/Complete/Error`, falls back to `streamGeminiChat` +
  `onGeminiStream*`. Props: `isOpen`, `onClose`, `initialQuery`.
- **`MeetingChatOverlay.tsx`** — Per-meeting RAG chat. `ragQueryMeeting` +
  `onRAGStream*` / `streamGeminiChat` + `onGeminiStream*`. Props include
  `meetingContext` (id, title, summary, keyPoints, actionItems, transcript),
  `initialQuery`, `onNewQuery`. Uses `useStreamBuffer`.

### Meetings / post-interview

- **`MeetingDetails.tsx`** — Post-interview detail view. Tabs: summary
  (markdown overview, editable action items/key points via `EditableTextBlock`,
  structured next steps, coaching insights, follow-up draft, mode sections),
  transcript (filtered), usage (Q&A + screenshots). Floating ask bar opens
  `MeetingChatOverlay`. Persists edits via `updateMeetingTitle`/
  `updateMeetingSummary`; saves screenshots via `saveScreenshotFile`.
- **`FollowUpEmailModal.tsx`** — Drafts a follow-up email for a meeting.
  Resolves recipient from calendar attendees or transcript, generates body via
  `invoke('generate-followup-email')`, opens Gmail/mailto via `invoke('open-external')`/
  `invoke('open-mailto')`.

### Overlay / capture

- **`Cropper.tsx`** — Screen-area selection for selective screenshots. Draws
  DPI-aware canvas guides, commits via `cropperConfirmed`, cancels via
  `cropperCancelled`, resets via `onResetCropper`. Theme-aware, ESC to cancel.
- **`SuggestionOverlay.tsx`** — Legacy live-suggestion overlay subscribing to
  `onNativeAudio*` and `onSuggestion*` events.

### Banners / toasters / modals

- **`UpdateBanner.tsx`** — Listens for update events (`onUpdateAvailable`,
  `onDownloadProgress`, `onUpdateDownloaded`, `onUpdateError`), decides
  auto-update vs manual DMG fallback, renders `UpdateModal`.
- **`UpdateModal.tsx`** — Presentational update modal (release notes, download
  progress, install/restart via `restartAndInstall`, manual instructions).
- **`AnswerCueQuotaBanner.tsx`** — Startup banner when quota buckets ≥90%
  (`getAnswerCueUsage`); upgrade link via `openExternal`.
- **`SupportToaster.tsx`** — Donation prompt (`getDonationStatus`,
  `markDonationToastShown`, `setDonationComplete`, `openExternal`).
- **`FeatureSpotlight.tsx`** — Marketing carousel (premium/support slides);
  `openExternal` for support link, localStorage for interest state.

### Startup / marketing

- **`StartupSequence.tsx`** — Welcome/marketing screen with hero video and
  `AnswerCueInterfaceCard` mockup; `onComplete` callback; `openExternal` for
  terms/privacy.
- **`AnswerCueInterfaceCard.tsx`** — Static/marketing mockup of the overlay
  widget (hotkeys, query bubble, input). No IPC.
- **`AboutSection.tsx`** — About/version/what's-new panel; `openExternal` for
  repo links.

### Small reusable widgets

- **`EditableTextBlock.tsx`** — ContentEditable inline editor with debounced
  save, blur save, Escape revert, double-Enter callback. Used heavily by
  `MeetingDetails`.
- **`WindowControls.tsx`** — Custom minimize/maximize/close (non-mac only;
  returns null on macOS). Uses `windowIsMaximized`, `onWindowMaximizedChanged`,
  `windowMinimize/Maximize/Close`.
- **`ErrorBoundary.tsx`** — Class error boundary; reports to main via
  `logErrorToMain`, offers soft/hard reload.
- **`LocalWhisperModelPanel.tsx`** — Local STT model manager (list, download,
  delete, channel config). Uses `localWhisperGetModels/GetHardware/GetChannelConfig`,
  `localWhisperStartDownload/DeleteModel/SetModel/SetChannelConfig`,
  `onLocalWhisperDownload*`.
- **`ModelSelectorWindow.tsx`** — Compact model picker window (cloud/custom/
  codex-cli/ollama). Loads via `getStoredCredentials`, `getCustomProviders`,
  `getCodexCliConfig`, `getAvailableOllamaModels`, `fetchProviderModels`,
  `getCurrentLlmConfig`; selects via `setModel`; syncs via `onModelChanged`.
- **`TopSearchPill.tsx`** — Spotlight-style search pill (⌘K). Fuzzy-matches
  meetings, offers AI query / literal search / open meeting. No direct IPC;
  delegates via `onAIQuery`/`onLiteralSearch`/`onOpenMeeting` callbacks.
