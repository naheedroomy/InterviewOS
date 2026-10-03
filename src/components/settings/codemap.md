# src/components/settings/

## Responsibility

Settings/configuration UI panels for the Electron app. Renders inside a settings window (left `Sidebar` nav + active panel). Owns all user-facing configuration of:

- **AI provider credentials and model selection** — OpenAI / Google Gemini / Anthropic Claude API keys, per-provider preferred model, app-wide default chat model, and cloud data-scope privacy toggles (`AIProvidersSettings.tsx` + `ProviderCard.tsx`).
- **Durable interview context** — manual custom instructions, one attached reference file (ingested to Markdown), and an AI persona (`CustomInstructionsSettings.tsx`).
- **Skills management** — list locally discovered `SKILL.md` skills, open the skills folder (`SkillsSettings.tsx`).
- **Phone Mirror** — beta feature streaming live AI responses to a phone browser; enable/disable, LAN exposure, QR/URL pairing, token rotation (`PhoneMirrorSettings.tsx`).
- **Help & onboarding** — static documentation, quick-start guide, shortcut reference, OS-permission walkthroughs (`HelpSettings.tsx`).
- **Premium modes** — re-export stub for the private `premium/` submodule (`ModesSettings.tsx`).

The folder does **not** render the general/audio/hotkeys settings — those live elsewhere; only the panels above are defined here.

## Design

- **One self-contained component per settings tab.** Each panel owns its local React state, its IPC calls, and its styling (Tailwind semantic tokens like `bg-bg-item-surface`, `text-text-secondary`, `border-border-subtle`). No shared store; persistence is delegated to the main process.
- **Everything persists through `window.electronAPI` IPC** (preload bridge), never directly to disk. Calls are made with optional chaining (`window.electronAPI?.xxx?.()`) so the UI degrades gracefully when the bridge is missing (browser-only contexts). `SkillsSettings` explicitly surfaces a "preload may be missing" status when the bridge is absent.
- **Optimistic writes + saved-status flash.** Panels update local state immediately, fire the IPC setter, and show a transient "Saved"/"Saved!" badge on success (`CustomInstructionsSettings`, `ProviderCard`, `AIProvidersSettings`).
- **Debounced auto-save.** Custom instructions/persona save 700ms after typing stops; API keys auto-save after 5s of inactivity in `ProviderCard`.
- **Read-model snapshot on mount, event push for live updates.** Mount effect reads persisted state via getter IPC; live sources (provider data scopes, phone mirror) additionally subscribe with `on*` callbacks that return an unsubscribe function, cleaned up on unmount.
- **Stale-config reconciliation.** If the saved default/preferred model is no longer in the available list (e.g. after a key change or model discovery), the UI warns via `console.warn` and auto-selects the first available model, persisting the correction (`AIProvidersSettings` lines 143–287, `ProviderCard` lines 121–136).
- **Shared model cache between parent and card.** `ProviderCard` reports fetched Gemini models up via `onModelsFetched`; `AIProvidersSettings` caches them (`geminiDiscoveredModels`) and feeds them back down as `externalModels` plus into the global default-model selector. A generation counter (`geminiDiscoveryGenerationRef`) guards against stale async discovery results.
- **Serialization contract for attached instruction files.** `CustomInstructionsSettings` embeds the imported file inside an HTML-comment-delimited block (`<!-- custom-instructions-file:start name="..." -->` … `<!-- custom-instructions-file:end -->`) with a legacy `<custom_instruction_file>` variant; manual instructions are stored separately from the file block and recombined on save.
- **Premium gating by re-export.** `ModesSettings` re-exports from `../../premium` via the premium loader; in an open-source build the loader yields a `NullComponent` that renders nothing.
- **HelpSettings is mostly static.** Framer-motion accordions (`AccordionSection`) and animated mock UI components (`Mock*Anim`) illustrate features; `SetupGuide` is a hardcoded step list. Some content is dead code behind `{false && …}`.

## Flow

1. **Mount** → each panel reads persisted state through getter IPC:
   - `AIProvidersSettings`: `getStoredCredentials` (which keys exist + preferred models), `getDefaultModel`, `getProviderDataScopes`; if a Gemini key is stored, auto-discovers models via `fetchProviderModels('gemini', '')`.
   - `CustomInstructionsSettings`: `profileGetNotes`, `profileGetPersona`.
   - `SkillsSettings`: `skillsRefresh`; `PhoneMirrorSettings`: `phoneMirrorGetInfo` (+ subscribes to `onPhoneMirrorStatus`).
2. **Render** → panels map persisted values into form controls (password inputs, model dropdowns, checkboxes, textareas).
3. **User edit** → local state updates; debounce timer arms; on fire, setter IPC persists (`setOpenaiApiKey`/`setGeminiApiKey`/`setClaudeApiKey`, `setProviderPreferredModel`, `setDefaultModel`, `setProviderDataScopes`, `profileSaveNotes`, `profileSavePersona`). Success → transient saved badge; failure → inline error text (`result.error`).
4. **Live sync** → main-process pushes (data-scope changes, phone-mirror status) arrive via `onProviderDataScopesChanged` / `onPhoneMirrorStatus` and update state directly (phone mirror dedupes identical payloads before `setState`).
5. **Model lifecycle** → key save/removal invalidates the Gemini discovery cache (`geminiDiscoverySettled=false`, list cleared) so it re-discovers against the new key; fetch/reconcile paths persist corrected model IDs.

## Integration

- **`window.electronAPI` (preload IPC bridge) — primary integration point.** All persistence is delegated to the main process:
  - Credentials: `getStoredCredentials`, `setOpenaiApiKey`, `setGeminiApiKey`, `setClaudeApiKey` (empty string = remove), `testLlmConnection`, `fetchProviderModels`, `setProviderPreferredModel`, `getDefaultModel`/`setDefaultModel`.
  - Privacy: `getProviderDataScopes`, `setProviderDataScopes`, `onProviderDataScopesChanged`.
  - Profile: `profileGetNotes`, `profileSaveNotes`, `profileImportMarkdownContext` (native file picker; MD/TXT/PDF/DOCX → Markdown), `profileGetPersona`, `profileSavePersona`.
  - Skills: `skillsRefresh`, `skillsOpenFolder`.
  - Phone mirror: `phoneMirrorGetInfo`, `phoneMirrorEnable`, `phoneMirrorDisable`, `phoneMirrorSetLan`, `phoneMirrorRotateToken`, `onPhoneMirrorStatus`.
  - Misc: `openExternal` (provider key URLs, deep links).
- **`src/utils/modelUtils`** — `STANDARD_CLOUD_MODELS` (hardcoded model allowlists for openai/claude), `isAllowedStandardCloudModel`, `prettifyModelId`; `AIProvidersSettings` builds the default-model selector from it.
- **`src/types/electron`** — shared shape types consumed here: `SkillSummary` (`SkillsSettings`), `PhoneMirrorInfo` (`PhoneMirrorSettings`).
- **`src/hooks/useShortcuts`** — `HelpSettings` renders the live global shortcut bindings (`toggleVisibility`, `takeScreenshot`, `processScreenshots`, `captureAndProcess`, `captureAndSolveCode`).
- **`src/hooks/useResolvedTheme` + `src/utils/platformUtils`** — theme-aware mock rendering and `isMac`/`getModifierSymbol` conditional copy in `HelpSettings` and `PhoneMirrorSettings`.
- **`src/premium` loader** — `ModesSettings` re-exports the premium implementation (or `NullComponent` in OSS builds).
- **Renderer-local integrations** — `HelpSettings` manipulates `localStorage` key `answercue_help_assistant_dismissed_v1` and dispatches a `answercue-help-assistant-show` window event to restore the floating help assistant; external assets: `../icon.png`.
- **Third-party UI libs** — `lucide-react` icons, `framer-motion` (accordion animation), `react-icons/si` (provider brand icons).
