# src/utils/

## Responsibility

Small, dependency-light helper modules shared across the renderer. Each file owns one concern:

| File | Concern |
|------|---------|
| `platformUtils.ts` | Platform detection (macOS / Windows / Linux) and platform-aware modifier-key symbols (`⌘`/`⌥`/`⇧`/`⌃` vs `Ctrl`/`Alt`/`Shift`). |
| `keyboardUtils.ts` | Bidirectional conversion between Electron Accelerator strings and frontend key arrays. |
| `messageId.ts` | Monotonic, collision-free React key generator for chat messages. |
| `modelUtils.ts` | Static catalog of supported cloud AI models, Codex CLI model presets, and model-ID display helpers. |
| `pdfGenerator.ts` | Client-side meeting report export to PDF via `jsPDF`. |

## Design

- **No framework coupling**: pure TS modules; only `pdfGenerator.ts` has a third-party dependency (`jspdf`).
- **Platform detection is module-level**: `platformUtils.ts` resolves the platform once at import time from `window.electronAPI?.platform` (falling back to `navigator.platform`), then exports the booleans `isMac` / `isWindows` / `isLinux`. All other modules read these constants rather than re-detecting.
- **`keyboardUtils.ts` depends on `platformUtils.ts`** (`getModifierSymbol`, `isMac`) — the only intra-folder dependency. `acceleratorToKeys` renders Electron accelerators with platform symbols; `keysToAccelerator` maps frontend keys back to Electron syntax, treating `⌃`/Ctrl as `CommandOrControl` on non-Mac so Electron accepts the binding.
- **`messageId.ts`** uses `Date.now()` + an ever-increasing module-level counter seeded with a random offset. The random seed prevents Vite HMR re-evaluation from colliding with ids already living in retained React `messages` arrays (issue #253).
- **`modelUtils.ts`** is a static registry: `STANDARD_CLOUD_MODELS` maps provider → model ids/names/descriptions plus a `hasKeyCheck` predicate and the settings key (`pmKey`) for the preferred model. Gemini is special-cased to allow any non-empty model id (dynamic discovery). Codex CLI models use a `codex-cli:<modelId>` selector-id convention.
- **`pdfGenerator.ts`** is a self-contained imperative renderer: builds a `jsPDF` doc with manual `y`-cursor tracking, auto page-break helper, and sections for header, summary, action items/key points, transcript, and AI usage. Filename is derived from the meeting title.

## Flow

- **Platform → UI**: `platformUtils` exports `isMac`/`isWindows`/`isLinux` and `getModifierSymbol`/`getPlatformShortcut`. Consumers use these to render platform-correct labels and shortcut badges.
- **Shortcut round-trip**: Electron accelerator string → `acceleratorToKeys` → frontend key array (display) → user edits → `keysToAccelerator` → accelerator string (persisted / sent to Electron). `useShortcuts.ts` is the hub for this flow.
- **Chat message keys**: components call `genMessageId()` when appending a message (user message + streaming placeholder in the same handler) to get a unique React key; the timestamp prefix keeps ordering/debugging info.
- **Model selection**: `modelUtils` feeds the model pickers (list of allowed models per provider, display names, Codex CLI presets); `isAllowedStandardCloudModel` gates which model ids are valid for a provider; `prettifyModelId`/`getCodexCliModelDisplayName` produce human-readable labels.
- **PDF export**: `Launcher.tsx` passes a full meeting object (title, date, duration, summary, detailedSummary, transcript, usage) to `generateMeetingPDF`, which renders and triggers a browser download.

## Integration

- **`platformUtils.ts`** — consumed by `useShortcuts.ts`, `AnswerCueInterface.tsx`, `Launcher.tsx`, `SettingsOverlay.tsx`, `SettingsPopup.tsx`, `UpdateModal.tsx`, `WindowControls.tsx`, `LocalWhisperModelPanel.tsx`, `KeyBadge.tsx`, `settings/PhoneMirrorSettings.tsx`, `settings/HelpSettings.tsx`, and `keyboardUtils.ts`. `window.electronAPI` is the Electron preload bridge feeding platform info.
- **`keyboardUtils.ts`** — consumed by `useShortcuts.ts` (the shortcut management hook) for accelerator ↔ key-array conversion.
- **`messageId.ts`** — consumed by `AnswerCueInterface.tsx`, `Launcher.tsx`, `MeetingChatOverlay.tsx`, `GlobalChatOverlay.tsx`, `MeetingDetails.tsx`, and `help/HelpAssistant.tsx` for chat-message React keys.
- **`modelUtils.ts`** — consumed by `ModelSelectorWindow.tsx`, `ui/ModelSelector.tsx`, `settings/AIProvidersSettings.tsx`, and `AnswerCueInterface.tsx` for model lists, validation, and display names.
- **`pdfGenerator.ts`** — consumed by `Launcher.tsx` for meeting report export.