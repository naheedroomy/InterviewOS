# src/types/

## Responsibility

Central type-boundary folder for the app. It owns:

- The **`ElectronAPI` IPC contract** (`electron.d.ts`) — the complete, typed surface the renderer sees through `window.electronAPI`, plus the global `Window` augmentation that makes it available without imports.
- **Shared domain interfaces** consumed across the renderer: interview workspace state (v2), dynamic action cards, screenshots, coding-assistant solutions, audio results.
- The declared intent (see file headers) of keeping **structural, not class-based, types** so the renderer never imports `electron/*` directly — `electron.d.ts` mirrors types owned by main-process services instead.

## Design

| File | Exports | Role |
|---|---|---|
| `electron.d.ts` | `ElectronAPI`, `DynamicActionEvidenceRef`, `DynamicActionPayload`, `InterviewWorkspaceAttachment`, `InterviewWorkspaceMessage`, `InterviewWorkspaceState`, `SkillSummary`, `PhoneMirrorInfo` + `declare global { Window }` | The full preload/IPC contract (~200 methods) + supporting structural types. All `on*` methods follow a subscribe pattern: `(callback: (data: T) => void) => () => void` (returns an unsubscribe function). |
| `solutions.ts` | `Solution`, `SolutionsResponse`, `ProblemStatementData` | Coding-assistant domain types: per-problem solution scripts (identify/brainstorm/code/dry-run), a `SolutionsResponse` map keyed by problem, and parsed problem-statement metadata. |
| `index.tsx` | `Screenshot`, `Solution` | `Screenshot` (id/path/timestamp/base64 thumbnail) and a **second, identical `Solution` definition** — duplicate of `solutions.ts`. |
| `audio.ts` | `AudioResult` | Minimal `{ text, timestamp }` transcript result. |

Key design decisions visible in `electron.d.ts`:

- **Structural mirroring**: `DynamicActionPayload` "mirrors `electron/services/dynamic-actions/DynamicAction.ts`"; `InterviewWorkspace*` "mirror `electron/services/InterviewWorkspaceStateManager.ts` types" — kept structural to preserve the strict main↔renderer boundary.
- **Canonical string-literal unions** where main-process values are constrained: provider names (`'ollama' | 'gemini' | 'custom' | 'codex-cli' | 'natively' | 'groq' | 'openai' | 'claude' | 'deepseek'`), STT providers, action/dynamic-action statuses, retention values, disguise modes, sizing modes.
- **Deprecated aliases retained** for older renderer builds (e.g. `*DirectVision` → maps to `*VisionFirst`).
- **`any`-typed payloads** in several `on*` events (`onProblemExtracted`, `onDebugSuccess`, `onIntelligenceNegotiationCoaching`) — contract surface is looser in those areas.

## Flow

1. Renderer calls `window.electronAPI.<method>(...)` for invoke-style requests; every method resolves a `Promise<...>` whose shape is declared inline in the signature.
2. Main-process events flow to the renderer via `on*` subscription methods; each returns an unsubscribe function so React hooks can clean up on unmount.
3. `declare global { Window { electronAPI: ElectronAPI } }` wires the whole surface onto `window` at the type level — no per-call casts.
4. Domain data (workspace state, dynamic actions, screenshots) is passed as plain structural payloads across the boundary — never class instances.

## Integration

Consumers, by contract surface (inferred from the type names; only this folder was inspected):

- **`ElectronAPI`** — the de-facto renderer ↔ Electron preload/main bridge. Feature areas: window/overlay management, screenshots, LLM provider + model config, API-key/credential management, STT providers (local Whisper, Groq, OpenAI, Deepgram, ElevenLabs, Azure, IBM Watson, Soniox), permissions/TCC repair, free trial, interview/meeting lifecycle, modes, interview workspace (v2), dynamic actions, intelligence mode (assist/what-to-say/clarify/code-hint/brainstorm/follow-up/recap), RAG, calendar, auto-update, keybinds, stealth typing, profile/JD/negotiation engine, Tavily search, license management, phone mirror, theme, logging, arch/platform.
- **`InterviewWorkspaceState` / `Message` / `Attachment`** — shared by interview prep UI and the v2 workspace IPC methods (`interviewWorkspaceResolveDraft`, `interviewWorkspaceUpdatePrep`, `interviewWorkspaceBeginRun`, `interviewWorkspaceFinishRun`, `interviewWorkspaceList`).
- **`DynamicActionPayload` / `DynamicActionEvidenceRef`** — consumed by the dynamic-action card UI and `onIntelligenceDynamicAction`, `acceptDynamicAction`, `dismissDynamicAction`, `listDynamicActions`.
- **`Solution` / `SolutionsResponse` / `ProblemStatementData`** — coding-assistant feature (transcript/solution pipelines); `onSolutionsReady`/`onSolutionSuccess`/`onProblemExtracted` events carry related data.
- **`Screenshot`** — screenshot gallery / capture UI; `getScreenshots`, `onScreenshotTaken`, `onScreenshotAttached`.
- **`AudioResult`** — audio-capture/transcription pipeline (transcript records).
- **`SkillSummary` / `PhoneMirrorInfo`** — skills manager UI and phone-mirror panel respectively.

## Concerns / Notes

- **Duplicated `Solution`**: defined identically in `solutions.ts` and `index.tsx`. Drift risk — prefer a single definition (`solutions.ts` is the richer module).
- **Folder is mixed-purpose**: `index.tsx` (a `.tsx` file) exports types only — no JSX, but the extension invites component use.
- **`any` payloads** in several event signatures mean those channels lack compile-time shape guarantees.
