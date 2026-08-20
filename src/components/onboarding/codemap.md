# src/components/onboarding/

## Responsibility

Hosts the first-launch **permissions onboarding** surface for the AnswerCue desktop app.

The folder's single component, `PermissionsToaster.tsx`, is a premium, Apple-style modal card that
appears once on first launch (after the launcher UI is visible) to walk the user through granting the
two OS-level permissions the app needs to do its job:

- **Microphone** — required for speech transcription (STT).
- **Screen Recording** — required to capture meeting content (macOS only).

It is the "before we start" gate that makes the OS permission contract explicit to the user instead of
letting the first meeting fail silently.

## Design

- **Single self-contained component.** `PermissionsToaster` is a controlled React component taking
  `{ isOpen, onDismiss }`. It owns all its own state, styling, and animation; there is no shared
  permission store or context.
- **Platform branching.** The component is macOS-first. On `darwin` it renders real permission status
  rows and action buttons; on Windows/Linux it renders a simple informational notice ("Windows will
  prompt you the first time…") because those platforms have no TCC concept and the OS handles
  permissions at first use.
- **Status model.** A `PermStatus` union (`'granted' | 'denied' | 'not-determined' | 'restricted' |
  'loading'`) drives each row's color (green/red/amber), dot indicator, and action button visibility.
- **Design tokens.** A local `T` token object (violet/green/amber palette, glass surfaces, SF Pro font
  stack) plus framer-motion `STAGGER`/`ITEM` variants. Uses `useReducedMotion()` to disable heavy
  animation for users who prefer reduced motion.
- **Defense-in-depth on the screen-settings URL.** `openScreenSettings()` refuses to even construct the
  `x-apple.systempreferences:…Privacy_ScreenCapture` URL unless `platform === 'darwin'`, even though the
  IPC allowlist already rejects it on non-darwin (see Integration).
- **Persistence.** Dismissal is recorded in `localStorage` under `natively_perms_shown_v1` so the card
  only shows once.

## Flow

1. Parent mounts `<PermissionsToaster isOpen={…} onDismiss={…} />` (see Integration — currently the
   component is exported but **not yet mounted** anywhere in the app).
2. When `isOpen` becomes true, the component waits `STARTUP_DELAY_MS` (1.4s), then calls
   `window.electronAPI.checkPermissions()` to fetch current status + platform, then fades the card in.
3. It re-checks permissions whenever the window regains focus (user returned from System Preferences),
   so statuses update live without a manual refresh.
4. **Microphone row** → "Request Access" calls `window.electronAPI.requestMicPermission()` (triggers the
   macOS system mic dialog), then refreshes status.
5. **Screen Recording row** (macOS only) → "Open Settings" calls
   `window.electronAPI.openExternal('x-apple.systempreferences:…Privacy_ScreenCapture')` to deep-link
   into System Preferences.
6. The CTA button shows "All set — continue" once `allGranted` (mic + screen on macOS, mic only
   elsewhere); otherwise "Continue". Any dismiss path writes the storage key and calls `onDismiss()`.

## Integration

- **Electron IPC bridge** — all OS interaction goes through `window.electronAPI` (typed in
  `src/types/electron.d.ts`, exposed in `electron/preload.ts`):
  - `checkPermissions()` → `ipcRenderer.invoke('permissions:check')`.
  - `requestMicPermission()` → `ipcRenderer.invoke('permissions:request-mic')`.
  - `openExternal(url)` → `ipcRenderer.invoke('open-external')`.
- **Main-process handlers** (`electron/ipcHandlers.ts`):
  - `permissions:check` — on darwin reads `systemPreferences.getMediaAccessStatus('microphone'/'screen')`
    and `isTrustedAccessibilityClient`; on non-darwin returns everything `'granted'` (no TCC).
  - `permissions:request-mic` — darwin-only `systemPreferences.askForMediaAccess('microphone')`.
  - `open-external` — allowlist-gated: only `https://mail.google.com/mail/` and the
    `x-apple.systempreferences:` scheme **on darwin** are opened via `shell.openExternal`. This is the
    last line of defense behind the component's own platform guard.
- **Sibling permission UI in `Launcher.tsx`.** The launcher has its own parallel permission handling:
  `handleRequestMicPermission()` and `openPermissionSettings('screen' | 'accessibility')` use the same
  IPC calls and the same `Privacy_ScreenCapture` deep-link URL. So the permission flow exists in two
  places; `PermissionsToaster` is the first-launch onboarding variant, while Launcher covers it during
  the preflight/readiness flow.
- **Shared storage key with trial promo.** `TrialPromoToaster` (`src/components/trial/`) reads the same
  `natively_perms_shown_v1` key to decide whether it may show: the trial promo only appears on
  **non-first** launches (i.e. after the permissions toaster has already been dismissed). This couples
  the two onboarding surfaces through localStorage.
- **Mount status (important).** `PermissionsToaster` is exported but currently **not imported/mounted**
  anywhere in `src/` — the grep for its symbol finds only its own definition. The first-launch
  permissions gate is therefore not yet wired into `App.tsx` (which mounts `StartupSequence`,
  `Launcher`, `SettingsOverlay`, and `TrialPromoToaster`). The component is ready to be mounted; the
  parent orchestrator owns deciding where/when to integrate it.
