# src/

Renderer (React + Vite) for the AnswerCue Electron app. Files directly under `src/` are the entrypoints, global types, and global styles; the actual UI lives in child folders (`components/`, `lib/`, `hooks/`, `utils/`, `config/`, `types/`, `premium/`, `UI_comp/`, etc.).

## Responsibility

- Bootstrap the React renderer: load global CSS, apply platform/theme attributes synchronously, and mount `<App />` into `#root`.
- Act as the single renderer entrypoint loaded by `index.html` for every Electron window (launcher, overlay, settings, model-selector, cropper).
- Route the one React tree to different window surfaces based on the `?window=` query param that the main process appends to the URL.
- Declare the renderer-side contract with Electron: the global `window.electronAPI` type that mirrors the preload bridge.

## Design

### `main.tsx` — renderer entrypoint (mount + theme bootstrap)

- Creates a `ReactDOM.createRoot(document.getElementById("root")!)` and renders `<App />` in `<React.StrictMode>`.
- **Platform attribute** (`data-platform` on `<html>`): set synchronously before first paint from `window.electronAPI?.platform` (falls back to `process.platform`), so CSS like `html[data-platform="win32"]` works without a flash.
- **Theme bootstrap** runs in three ordered steps:
  1. Read cached theme from `localStorage` (`natively_resolved_theme`), guarded against Chromium LevelDB corruption; fall back to `prefers-color-scheme` media query. A `?theme=light|dark` URL override (used for local visual preview) takes precedence and re-persists the cache.
  2. After mount, ask the main process via `window.electronAPI.getThemeMode()` for the authoritative resolved theme and sync it onto `data-theme` + cache (skipped when a preview override is active).
  3. Subscribe to `window.electronAPI.onThemeChanged()` so runtime theme switches (OS toggle, settings) propagate to every window immediately.
- Note: `index.html` already applies the cached theme inline (before this module runs) to prevent a theme flash.

### `App.tsx` — window router + top-level state

- Reads `?window=` from `location.search` to pick a surface. Allowed values: `settings`, `launcher`, `overlay`, `model-selector`, `cropper`. No param (or anything else) defaults to the launcher (`isDefault`).
- **Cropper** short-circuits with a `React.lazy(() => import('./components/Cropper'))` + `<Suspense>`.
- Each surface renders its own component wrapped in `ErrorBoundary` + `QueryClientProvider` (react-query) + `ToastProvider`/`ToastViewport` (Radix-style toast):
  - `?window=settings` → `<SettingsPopup />` (legacy standalone settings window)
  - `?window=model-selector` → `<ModelSelectorWindow />`
  - `?window=overlay` → `<AnswerCueInterface />` (transparent, click-through meeting assistant; `--overlay-opacity` CSS var set from state)
  - default/`?window=launcher` → `<Launcher />` + `<SettingsOverlay />` + `<StartupSequence />` (framer-motion `AnimatePresence` crossfade) + a large set of promo/trial/premium toaster surfaces
- **Central state**: settings open/tab, overlay opacity (from `localStorage` `natively_overlay_opacity`), meeting-interface theme, premium/license details (`licenseGetDetails`), AnswerCue API key presence, free-trial status (`getTrialStatus`/`getLocalTrial` + 30s polling + `wipeTrialProfileData` on expiry), Ollama auto-pull progress, and incompatible-provider re-index warning.
- **Meeting lifecycle IPC**: `startMeeting` (with audio input/output device IDs from `localStorage`, SCK experimental override on macOS) and `endMeeting` (fire-and-forget; main swaps launcher↔overlay windows synchronously first).
- **IPC event subscriptions** (each returns an unsubscribe fn): `onThemeChanged`, `onMeetingsUpdated`, `onOllamaPullProgress/Complete`, `onIncompatibleProviderWarning`, `onLicenseStatusChanged`, `onTrialEnded`, `onOpenSettingsTab`, `onOverlayOpacityChanged`, `onMeetingInterfaceThemeChanged`.
- **Analytics**: `lib/analytics/analytics.service` initialized once; tracks app-open/close (launcher), assistant-start/stop (overlay), and meeting-started/ended.
- Dev shortcut `Cmd/Ctrl+Shift+1..5` force-previews promo ad cards (gated by `SHOW_PROMOTIONAL_SURFACES`).

### `index.css` — global styles (Tailwind + design tokens)

- `@tailwind base/components/utilities` directives (Tailwind configured in `tailwind.config.js`).
- `@font-face` for bundled fonts (`font/`).
- Semantic CSS variable token system on `:root` (dark default) and `[data-theme='light']`: brand colors, background/text/border tokens, primary-button tokens, and a large `--overlay-*` family that derives from `--overlay-opacity`.
- ~4.8k lines; the overlay styling and `[data-theme]` / `[data-platform]` selectors are the parts that depend on the attributes set in `main.tsx`.

### `vite-env.d.ts` — global type augmentation

- `/// <reference types="vite/client" />` for Vite's `import.meta.env` and asset typing.
- Imports `ElectronAPI` from `./types/electron` and augments `Window` with `electronAPI: ElectronAPI`. This is what makes `window.electronAPI` type-safe across the renderer. (The full API surface lives in `src/types/electron.d.ts`; other shared renderer types: `index.tsx`, `audio.ts`, `solutions.ts`.)

## Flow

1. `electron/main.ts` (`AppState`) boots; `WindowHelper`/`SettingsWindowHelper`/`ModelSelectorWindowHelper`/`CropperWindowHelper` create `BrowserWindow`s that all point at the same renderer origin: `http://localhost:5180` in dev (Vite), or the packaged `index.html` in prod — each with `?window=<name>` appended.
2. Each window loads `index.html`, which (a) applies cached theme inline, (b) mounts `/src/main.tsx`.
3. `main.tsx` sets `data-platform` + `data-theme` synchronously, then renders `<App />`.
4. `App` switches on the `?window=` param and renders the matching surface inside provider wrappers. All surfaces talk to the main process through the single `window.electronAPI` context-bridge surface (preload), typed by `src/types/electron.d.ts`.
5. Surface components render UI; user actions (start/end meeting, settings changes, license/trial flows) invoke `window.electronAPI.*` IPC calls; main-process events push back through `on*` subscriptions registered in `App` and its children.

## Integration

- **`index.html`** (repo root): the only HTML shell; loads `/src/main.tsx`; includes a CSP meta tag and the inline pre-paint theme script. The renderer origin in dev is fixed at `http://localhost:5180` (`WindowHelper.ts` etc.), and browser-only Playwright smoke tests use port `5173` instead.
- **`electron/preload.ts`**: `contextBridge.exposeInMainWorld('electronAPI', {...})` — the runtime counterpart of the `ElectronAPI` interface in `src/types/electron.d.ts`. Every renderer IPC call maps 1:1 to an `ipcRenderer.invoke(...)` / `ipcRenderer.on(...)` in preload, handled in `electron/ipcHandlers.ts`. The renderer **never imports from `electron/*` directly**; the type boundary is structural and maintained by hand (several tests under `electron/services/__tests__/` assert preload↔renderer-type parity).
- **`electron/main.ts`** owns window lifecycle, meeting state, license/trial, audio, and persistence; `App.tsx` is its primary renderer client.
- **Sibling folders** (referenced, not documented here): `components/` (UI surfaces incl. `Launcher`, `AnswerCueInterface`, `SettingsOverlay`, `Cropper`), `lib/` (analytics, overlay appearance/theme helpers, feature flags), `hooks/` (e.g. `useResolvedTheme`), `utils/` (platform detection used for the SCK output-device guard), `config/` (URLs, STT, languages), `types/` (shared renderer + Electron API types), `premium/` (ad campaigns, license UI).
