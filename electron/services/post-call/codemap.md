# electron/services/post-call/

## Responsibility

Pure, side-effect-free module that turns a post-interview transcript into structured
follow-up artifacts. It is the "post-call enhancement" layer: it derives structured
action items, a follow-up email draft, and coaching insights from raw transcript
segments plus optional summary data. No I/O, no persistence, no UI — it only computes
and returns a `PostCallEnhancements` object.

## Design

- **Pure functions, no state.** Every exported function is deterministic given its
  inputs (except for `crypto.randomUUID()` used to mint stable-ish IDs). This makes the
  module trivially testable and safe to call from anywhere in the main process.
- **Single entry point.** `buildPostCallEnhancements()` is the orchestrator; it composes
  the three sub-builders and assembles the final `PostCallEnhancements` payload.
- **Schema-versioned output.** `PostCallEnhancements.schemaVersion` is pinned to `2`,
  signalling the shape consumers should expect and allowing future migrations.
- **Mode-driven behavior.** `PostCallModeType` (`general`, `looking-for-work`, `sales`,
  `recruiting`, `team-meet`, `lecture`, `technical-interview`) selects which coaching
  heuristics run and how the follow-up draft is worded (e.g. `sales`/`recruiting` use
  `"Hi,"` vs `"Hi team,"`).
- **Heuristic, regex-based extraction.** Action items are found by scanning each
  transcript segment against `ACTION_PATTERNS` (commitment verbs, `action:`/`todo:`
  prefixes, and imperative verbs like send/share/schedule). Owners and deadlines are
  pulled from `OWNER_PATTERN` / `DEADLINE_PATTERN`. This is intentionally lightweight —
  no NLP model.
- **Deduplication + caps.** Items are deduped by normalized lowercase text and capped at
  8; coaching insights are capped at 5. Keeps output bounded and stable.
- **Types are the contract.** `PostCallTranscriptSegment`, `StructuredActionItem`,
  `CoachingInsight`, and `PostCallEnhancements` are exported so consumers can type
  against the module without importing internals.

## Flow

1. Caller passes `transcript` (speaker/text/timestamp segments), an optional
   `modeTemplateType`, and optional `summaryData` (overview, actionItems, keyPoints,
   sections).
2. `buildPostCallEnhancements()` runs:
   - `extractStructuredActionItems()` — scans transcript for commitment/action phrases,
     extracts owner + deadline, then appends any summary-provided action items; dedupes
     and caps at 8.
   - `generateCoachingInsights()` — joins all transcript text and runs mode-specific
     heuristics (e.g. sales objections, recruiting logistics, uncertainty patterns,
     team-meet ownership, lecture study follow-up); caps at 5.
   - `buildFollowUpDraft()` — assembles a plain-text email: greeting, overview, "Next
     steps:" bullet list from action items (owner + deadline), fallback line when empty.
3. Returns the assembled `PostCallEnhancements` (`schemaVersion: 2`).

## Integration

- **Consumers** (outside this folder) call `buildPostCallEnhancements()` and consume the
  returned `PostCallEnhancements` — `actionItemsStructured`, `followUpDraft`, and
  `coachingInsights` — typically to persist or display post-interview follow-up content.
- **Inputs** come from the caller: transcript segments (from the interview/transcript
  pipeline) and `summaryData` (from the summary generation step), plus the selected
  `modeTemplateType`.
- **No dependencies on other services.** This module is self-contained; it neither reads
  nor writes storage and does not import from sibling services. It is a leaf utility
  invoked by the post-call orchestration layer.
