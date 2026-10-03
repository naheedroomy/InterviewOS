# electron/services/dynamic-actions/

## Responsibility

Realtime "suggestion engine" for live sessions. Watches in-flight conversation transcripts, recognizes situation cues (e.g., a pricing objection, a budget probe, a behavioral interview question, a blocker in a team meeting), and surfaces a ranked list of actionable prompts the user can trigger — each with a mode-aware answer style and instructions to feed the AI response pipeline.

The folder owns the full lifecycle of a **dynamic action**: detection → candidate → dedup → ranking → accept/dismiss → completion/expiry.

## Design

Four files, layered as pure types → store → detector → engine:

- **`DynamicAction.ts`** — Shared domain types only (no logic):
  - `DynamicAction` — the unit of work: `id`, `sessionId`, `modeId`, `modeTemplateType`, `type`, `label`, `description`, `confidence`, `priority`, `evidenceRefs[]`, `status`, `createdAt`, `expiresAt?`, `promptInstruction`, `answerStyle?`.
  - `ActionStatus` — state machine: `candidate → shown → accepted → dismissed / completed / expired`.
  - `EvidenceRef` — provenance of the trigger: `source` (`transcript | screen | reference | meeting_history`), matched `text`, `timestamp`, `speaker`, plus optional `fileId`/`chunkId`. Currently only `transcript` is minted by the detector.
  - `answerStyle` constrains downstream generation: `maxWords`, `format` (`bullets | short_script | code | checklist | summary`), `tone`.

- **`DynamicActionStore.ts`** — In-memory `Map<id, DynamicAction>` per app process. No persistence. Owns lifecycle queries:
  - `addAction`, `updateStatus`, `getAction`, `getActiveActions(sessionId)`, `getAllActions(sessionId)`.
  - `expireStaleActions(sessionId, maxAgeMs)` — flips `candidate` → `expired` when `createdAt` falls behind the cutoff.
  - `deduplicate(newAction, windowMs = 120000)` — suppresses re-triggering: returns `null` if an action with same `sessionId + modeId + type` exists within a 2-minute window that isn't `expired`/`dismissed`.

- **`DynamicActionDetector.ts`** — Pure regex matcher. Statically declares `MODE_TRIGGERS`, a `Record<modeTemplateType, ActionTrigger[]>` covering 8 modes: `general`, `negotiation`, `sales`, `recruiting`, `team_meeting`, `interview`, `lecture`, `technical_interview`. Each `ActionTrigger` bundles: `type`, `patterns: RegExp[]` (first hit per trigger wins), `priority`, `label`, `promptInstruction`, `answerStyle?`.
  - `detectTriggers({ transcript, modeTemplateType })` — runs the mode's patterns over the transcript, returns matches (`{ trigger, match, index }`); unknown modes fall back to no matches.
  - `getTriggerForType(type)` — reverse lookup across all modes.
  - Note: `TechnicalInterviewTrigger.screen_coding_problem` has no `answerStyle` — intentionally relies on screen/reference evidence rather than a canned style.

- **`DynamicActionEngine.ts`** — Facade orchestrator; the only file with side effects (store mutation + `crypto.randomUUID()`). Composes `DynamicActionStore` + `DynamicActionDetector` via constructor injection (testable with fakes).
  - `detectActions({ transcript, speaker, modeTemplateType, modeId, sessionId })` — runs detection, mints a `DynamicAction` per matched trigger (`status: 'candidate'`, `confidence`/`priority` from the trigger, evidence from the transcript, `promptInstruction`/`answerStyle` copied), dedups, and persists survivors.
  - `getTopActions(sessionId, maxAgeMs = 60000)` — expires stale candidates, then returns the top-3 active actions sorted by priority descending.
  - `acceptAction` / `dismissAction` / `completeAction` — status transitions (accept returns the action for downstream consumption).
  - `getStore()` / `getDetector()` — escape hatches for callers needing direct access.

## Flow

1. Caller (session pipeline) receives new transcript text with `modeTemplateType`, `modeId`, `sessionId`, optional `speaker`.
2. `DynamicActionEngine.detectActions(...)` → `DynamicActionDetector.detectTriggers(...)` runs the mode's regex set against the transcript; first matching pattern per trigger wins.
3. Each hit becomes a candidate `DynamicAction`: UUID `id`, evidence from transcript, trigger's priority/instruction/style.
4. `store.deduplicate(...)` rejects repeats within a 2-minute window per session/mode/type; accepted candidates are stored as `candidate`.
5. UI-side polling (or caller-initiated `getTopActions`) expires stale candidates and returns top-3 by priority.
6. User accepts/dismisses/completes; store transitions status. Dismissed/expired/completed actions drop out of `getActiveActions`; expired candidates also cannot be resurrected by dedup.

Status lifecycle: `candidate` → `shown` (externally) → `accepted` → `completed`; or `candidate` → `dismissed` / `expired` (age-out via `expireStaleActions`).

## Integration

**Internal (within folder):**
- `DynamicActionEngine` imports `DynamicAction` (types), `DynamicActionStore` (persistence/dedup), and `DynamicActionDetector` + `MODE_TRIGGERS` (detection). Store and Detector have no cross-dependencies; Detector only imports its own trigger definitions.

**External (contracts this folder exposes):**
- Consumers are expected to import `DynamicActionEngine` (and the `DynamicAction` type) from outside this folder — e.g., session/transcript handlers feeding transcript updates, and UI/preload wiring polling `getTopActions` and calling accept/dismiss/complete. This folder's integration points (who calls the engine) live outside this directory and are not documented here.
- `modeTemplateType` values must match the keys of `MODE_TRIGGERS` for detection to fire; the engine silently returns nothing for unknown modes.
- `answerStyle` and `promptInstruction` are contracts for the downstream AI/response generation pipeline — the folder produces them but does not consume them.
- Store is process-local (no persistence layer); callers relying on durability across restarts would need to add it.
