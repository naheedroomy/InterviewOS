# src/components/ui/

## Responsibility

Reusable UI primitives for the AnswerCue desktop app (Vite + Electron). The
folder is a loose collection, not a unified design system:

- **Overlay/interview chrome** — components that render inside the transparent,
  always-on-top interview overlay: `TopPill`, `RollingTranscript`, `ChannelCard`,
  `GlassEffectLayer`.
- **Settings/configuration widgets** — `ModelSelector`, `KeyRecorder`,
  `KeyBadge`, `ConnectCalendarButton`.
- **Radix primitives** — thin shadcn-style wrappers: `dialog.tsx`, `toast.tsx`.
- **Empty stub** — `card.tsx` is a 0-byte placeholder (unused; do not assume a
  Card primitive exists).

All components are **presentational**. State is internal (useState) or passed in
via props; none of them own global state.

## Design

### Component inventory

| File | Export | Pattern |
|------|--------|---------|
| `TopPill.tsx` | default `TopPill` | Function declaration (not arrow). Pill UI with three segments: expand/restore, show/hide toggle, stop/quit. Styling driven by `OverlayAppearance` (`appearance.pillStyle` / `.iconStyle` / `.chipStyle`). Uses `draggable-area` + `overlay-*` CSS tokens, `interaction-base/-hover/-press` interaction classes. |
| `RollingTranscript.tsx` | default `RollingTranscript` | Live rolling STT transcript bar for the overlay. Owns the audio-diagnostics surface: derives `anyFailed` / `anyReconnecting` / `anyAwaitingAudio` / `isNormal` from two `ChannelStatus` props, collapses the diagnostics panel when channels recover, auto-scrolls transcript (scrollLeft = scrollWidth), masks edges via CSS `maskImage`. **Consumes `ChannelCard`** (2 cards: System Audio + Microphone). |
| `ChannelCard.tsx` | default `ChannelCard` | Status card for one STT channel. Status is a 4-state union `'connected' \| 'reconnecting' \| 'failed' \| 'awaiting-audio'`. Categorizes raw errors via `categorizeSttError` (from `lib/sttErrorMapper`) to show human-readable title/body, exposes raw error in a copyable `<code>` block (`navigator.clipboard`, 2s "copied" feedback). **Used only by `RollingTranscript`** in this folder. |
| `GlassEffectLayer.tsx` | default `GlassEffectLayer` | Non-blur glass chrome for the overlay: two stacked border rings (mask-composite trick) with a cursor-tracking gradient sheen. Expects the real blur to come from the OS (`vibrancy` / `backgroundMaterial`) — it does **not** blur. RAF-throttled mousemove listener, values lifted from liquid-glass-react. |
| `ModelSelector.tsx` | named `ModelSelector` (+ internal `ModelOption`) | Dropdown with Cloud / Custom / Local tabs. Lazily loads data on open via `window.electronAPI` (`getCustomProviders`, `getAvailableOllamaModels`, `getStoredCredentials`, `fetchProviderModels`). Closes on outside click. `placement` prop ('up' default | 'down'). |
| `KeyBadge.tsx` | named `KeyBadge` | Renders a key chord as badge chips. Platform-aware: `isMac` from `utils/platformUtils` decides which modifier symbols (⌘⌥⇧⌃ vs Ctrl/Alt/Shift) are styled as modifiers. Sizes `sm` | `md`. |
| `KeyRecorder.tsx` | named `KeyRecorder` | Shortcut recorder: click to start, captures next key combo (modifiers + main key via `e.code` prefixes Key/Digit), saves via `onSave`, displays `currentKeys` when idle (with arrow-key glyph mapping). |
| `ConnectCalendarButton.tsx` | default `ConnectCalendarButton` | Google-calendar connect flow. Reads initial state from `window.electronAPI.getCalendarStatus()`, connects via `calendarConnect()`, tracks event via dynamic `import('../../lib/analytics/analytics.service')`. Two render states: idle/loading button (gradient-border pill) and an animated "Connected" state (framer-motion gemstone-glass pill). |
| `dialog.tsx` | named `Dialog`, `DialogTrigger`, `DialogContent`, `DialogClose` | Radix `@radix-ui/react-dialog` wrapper. Fixed-position centered overlay (`bg-black/50`), `cn()` from `lib/utils`. shadcn-style thin wrapper; no DialogTitle/Description exports. |
| `toast.tsx` | `ToastProvider`, `ToastViewport`, `Toast`, `ToastAction`, `ToastClose`, `ToastTitle`, `ToastDescription`, types `ToastProps`/`ToastVariant`/`ToastMessage` | Radix `@radix-ui/react-toast` wrapper. Variants `neutral` (yellow) | `success` (green) | `error` (red). `ToastMessage` type pairs with a toast service elsewhere. |
| `card.tsx` | — | **Empty file (0 bytes)**. Not a component; import will fail. |

### Conventions / patterns

- **Styling:** Tailwind utility classes, frequently with custom design tokens
  (`overlay-text-primary/-secondary/-muted`, `overlay-pill-surface`,
  `bg-bg-input`, `accent-primary`, `border-border-subtle`, `interaction-*`,
  `ease-sculpted`). Small text via arbitrary values (`text-[10px]`, `text-[11px]`).
- **Radix wrappers** (`dialog.tsx`, `toast.tsx`): forwardRef + `displayName`,
  `cn()` merge, re-export primitives. Do not extend the primitive — they are
  intentionally minimal.
- **Electron bridge:** components that touch the main process go through
  `window.electronAPI` (typed preload surface), never a direct IPC import.
- **Clipboard:** repeated copy-with-feedback pattern (set copied state, 2s
  timeout) in `ChannelCard` and `RollingTranscript`.
- **Animation:** `framer-motion` for overlay motion (`RollingTranscript` expanded
  panel, `ConnectCalendarButton` connected pill); CSS `animate-*`/`stt-pulse-*`
  for ambient pulse effects.
- **Icons:** inline SVG (overlay components, zero deps) and `lucide-react`
  (settings components).

## Flow

1. **Interview overlay flow** (`TopPill` → `RollingTranscript` → `ChannelCard`):
   `RollingTranscript` receives live transcript `text`, per-channel
   `ChannelStatus` objects, and optional `surfaceStyle`. It derives aggregate
   status, renders the scrolling text bar, and on failure shows a diagnostics
   panel containing two `ChannelCard`s. `ChannelCard` maps `provider` to a
   human label and `error` to a `SttErrorCategory` via `categorizeSttError`.
   Status changes collapse/expand the diagnostics panel automatically.
2. **Settings widget flows** are self-contained: user interacts → component
   calls `window.electronAPI` (models, calendar) or local state (key recorder,
   badges) → result reflected in local UI state. `ModelSelector` reloads its
   three tabs each time the dropdown opens.
3. **Toast/dialog flows**: consumer code renders a `Toast`/`Dialog` (or calls
   the matching service), controlled by the app layer; these files only provide
   the presentational primitives.

## Integration

- **`RollingTranscript` / `ChannelCard` / `TopPill` / `GlassEffectLayer`** are
  consumed by the interview-overlay components (outside this folder — e.g.
  overlay shell/session views). They depend on overlay CSS tokens and the
  `lib/overlayAppearance` types.
- **`ChannelCard`** imports `SttErrorCategory` from `lib/sttErrorMapper`;
  **`RollingTranscript`** calls `categorizeSttError` from the same module.
- **`KeyBadge`** imports `isMac` from `utils/platformUtils`; **`ModelSelector`**
  imports model helpers from `utils/modelUtils` (`getCodexCliModelDisplayName`,
  `STANDARD_CLOUD_MODELS`, `isAllowedStandardCloudModel`, `prettifyModelId`).
- **`ModelSelector`** and **`ConnectCalendarButton`** depend on the Electron
  preload bridge (`window.electronAPI`). `ConnectCalendarButton` also fires
  analytics via a dynamic import of `lib/analytics/analytics.service`.
- **`dialog.tsx` / `toast.tsx`** depend on `@radix-ui/react-dialog`,
  `@radix-ui/react-toast`, `lucide-react`, and `cn` from `lib/utils`; they are
  framework-independent of app logic and reusable anywhere in the renderer.
- **`card.tsx`** is dead code — flag before anyone imports it.
