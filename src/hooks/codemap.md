# src/hooks/

## Responsibility

Home for small, self-contained React hooks that bridge the renderer to
platform/Electron concerns and smooth out high-frequency UI updates. No app
business logic lives here — each hook exposes a narrow, reusable capability:

- **`useResolvedTheme.ts`** — resolve the active theme (`'light' | 'dark'`) from
  the `<html data-theme>` attribute and keep it in sync with both DOM mutations
  and Electron IPC theme events.
- **`useShortcuts.ts`** — own the keyboard-shortcut configuration: platform-aware
  defaults, loading/customizing/resetting through the main process, and
  `isShortcutPressed()` matching for keyboard events.
- **`useStreamBuffer.ts`** — batch high-frequency streaming tokens into
  `requestAnimationFrame`-paced React state updates to avoid re-rendering on
  every token (~50-100/sec).

## Design

- **Zero-dependency hooks** — no cross-hook imports; each hook stands alone and
  is composed at the consumer site.
- **`useResolvedTheme`**: single source of truth is the `data-theme` attribute
  on `<html>`. Reads it lazily via `useState` initializer, then subscribes to two
  redundant channels: a `MutationObserver` on the attribute (catches both the
  async IPC correction in `main.tsx` and user-triggered changes) and the
  `window.electronAPI.onThemeChanged` IPC event. Both converge on the same
  `setResolvedTheme`; cleanup disconnects the observer and unsubscribes.
- **`useShortcuts`**:
  - `ShortcutConfig` is a flat map of action ids (chat, window movement,
    general) to key arrays (e.g. `['⌘', '1']`).
  - `buildDefaultShortcuts()` computes platform-aware defaults once per call
    (`⌘`/`⇧`/`⌥` glyphs on Mac, `Ctrl`/`Shift`/`Alt` on Windows) via
    `isMac` from `../utils/platformUtils`.
  - `DEFAULT_SHORTCUTS` is a module-level snapshot of the same defaults, kept as
    a named export for consumers that need defaults synchronously (currently no
    in-repo consumers).
  - Backend ↔ frontend mapping is bidirectional through two parallel switch
    chains: `mapBackendToFrontend` (backend `kb.id` → config key, using
    `acceleratorToKeys`) and the inline switch in `updateShortcut` (config key →
    backend id, using `keysToAccelerator`). Some backend ids have aliases for
    backwards compat (`chat:followUp` / `chat:followup`).
  - Writes to the main process are **optimistic**: local state updates
    immediately, then `setKeybind` is awaited with errors only logged.
  - `isShortcutPressed` normalizes Electron accelerator names to `event.key`
    values (arrows, `Space`) and does platform-aware modifier checks
    (⌘=metaKey on Mac; ⌘/Ctrl both map to ctrlKey on Win/Linux; metaKey is
    rejected on Windows).
- **`useStreamBuffer`**: mutable token buffer lives in a ref; one pending
  `requestAnimationFrame` id guards the flush. First `appendToken` in a frame
  schedules a single RAF; later tokens just append. The flush callback receives
  the full accumulated content. `getBufferedContent` supports final commit on
  stream end; `reset` clears the buffer and cancels any pending RAF.

## Flow

**Theme**: `<html data-theme>` attribute + Electron IPC → `useResolvedTheme` →
`ResolvedTheme` state → consumers derive `isLight` for styling.

**Shortcuts**:
1. Mount: `useEffect` calls `window.electronAPI.getKeybinds()` (if available)
   and applies via `mapBackendToFrontend`; also subscribes to
   `onKeybindsUpdate` for live changes (e.g. main-process registration).
2. User edits: `updateShortcut(actionId, keys)` → optimistic `setShortcuts` →
   `keysToAccelerator` → `setKeybind(backendId, accelerator)` (async, errors
   logged, no rollback).
3. Reset: `resetShortcuts` → `resetKeybinds()` IPC, falls back to local
   `buildDefaultShortcuts()` if the IPC surface is absent.
4. Consumption: `isShortcutPressed(event, actionId)` compares an incoming
   keyboard event against the configured keys.

**Streaming**: token callback → `appendToken(token, onFlush)` → ref buffer →
(≤1 per frame) `onFlush(accumulatedContent)` → consumer `setMessages(...)`
(state update with full content) → `reset()` on stream start/end/cleanup.

## Integration

Consumers (via relative imports; hook files are only read, not imported here):

- **`useResolvedTheme`**
  - `components/ModelSelectorWindow.tsx`, `Launcher.tsx`,
    `SettingsOverlay.tsx`, `settings/HelpSettings.tsx`,
    `SettingsPopup.tsx`, `ProfileIntelligenceSettings.tsx`,
    `TopSearchPill.tsx`, `MeetingDetails.tsx` — derive `isLight`/theme for
    styling.
  - `src/main.tsx` — writes the `data-theme` attribute that this hook reads
    (comment references the hook's initial-state dependency).
- **`useShortcuts`** (+ `ShortcutConfig` type / `DEFAULT_SHORTCUTS` export)
  - `components/Launcher.tsx` — `isShortcutPressed` for in-app shortcut dispatch.
  - `components/AnswerCueInterface.tsx` — `shortcuts`, `isShortcutPressed`.
  - `components/SettingsOverlay.tsx` — `shortcuts`, `updateShortcut`,
    `resetShortcuts` for the keybind editor.
  - `components/settings/HelpSettings.tsx`, `SettingsPopup.tsx` — `shortcuts`
    for displaying/listing bindings.
- **`useStreamBuffer`**
  - `components/Launcher.tsx` — two instances (two streaming surfaces, ~lines
    866 and 2009).
  - `components/GlobalChatOverlay.tsx` — `streamBuffer` for chat streaming.
  - `components/MeetingChatOverlay.tsx` — `streamBuffer` for meeting chat.
  - `components/help/HelpAssistant.tsx` — `appendToken`, `getBufferedContent`,
    `reset` for streamed assistant replies.
