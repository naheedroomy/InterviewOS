# electron/services/context/

## Responsibility

Central context/prompt assembly for the AI pipeline. This folder owns the
transformation of raw, heterogeneous inputs (live transcript, screen capture,
mode instructions, reference files, prep context, prior turns, meeting history)
into a single typed, trust-ordered, token-budgeted `ContextPacket` that is fed
to the model.

It is the single place where:
- Context blocks are typed and assigned a `TrustLevel`.
- Trust ordering is defined and enforced (`TRUST_LEVEL_ORDER`).
- Token budgeting is applied (lowest-priority blocks truncated/dropped first).
- User-controlled strings are neutralized against prompt injection and XML
  delimiter breakage before reaching the model.

It replaces the previous raw string-concatenation approach to context building.

## Design

Three files, one responsibility each:

- **`TrustLevels.ts`** — the trust model.
  - `TrustLevel` enum: 10 levels ordered from most trusted (hard system rules)
    to least trusted (unstructured evidence). Naming convention: `TRUSTED_*`
    for data that can inform answers, `UNTRUSTED_*` for evidence that must not
    override system/mode policies.
  - `TRUST_LEVEL_ORDER`: the canonical highest→lowest assembly order.
  - `ContextBlock` interface: `type`, `trustLevel`, `source`, `tokenBudget`,
    optional `recency` (ms age), `evidenceRefs`, `content`.
  - `EvidenceRef` interface: provenance for a block (`transcript` | `screen` |
    `reference` | `meeting_history`) with optional timestamp/speaker/fileId/chunkId.
  - `DANGEROUS_PATTERNS` + `containsPromptInjection()`: regex detection of
    prompt-injection attempts in user-controlled strings.

- **`ContextPacket.ts`** — the output contract.
  - `blocks: ContextBlock[]` (trust-ordered).
  - `systemPrompt`, optional `developerPrompt`, `userMessage` (flat string built
    from blocks for the streaming pipeline).
  - `metadata`: `modeTemplateType`, `activeModeId`, `screenContextAvailable`,
    `tokenBudget`, `totalTokensUsed`.

- **`PromptAssembler.ts`** — the assembler.
  - `assemble(params)` builds a `ContextPacket` from typed inputs.
  - `ScreenContext` interface: **vision-first** (`extractedText`,
    `visibleSummary`, `screenType`, `codeBlocks`, `tables`, `errors`,
    `taskDetected`, `confidence`, `source`, `providerUsed`, `modelUsed`) with
    legacy `ocrText` retained as a deprecated alias.
  - `ModeContextSource` / `ModeReferenceFile`: mode custom instructions +
    reference files.
  - `escapeUserContent()`: XML-entity escaping so user content cannot break
    `<block>` delimiters.
  - `escapePromptInjection()`: neutralizes dangerous patterns in-place (content
    is still included, but the dangerous phrasing is redacted).
  - `enforceTokenBudget()`: sorts blocks by trust, keeps highest-trust blocks,
    truncates the boundary block to fit, drops the rest.
  - `truncateToTokenBudget()`: char-based truncation with a conservative 85%
    factor and ~70-char XML-overhead buffer.
  - `blocksToString()`: flattens trust-ordered blocks into `userMessage`.

### Trust ordering (highest → lowest)

1. `SYSTEM_POLICY` — hard system rules, never overridable.
2. `MODE_POLICY` — mode-specific rules from template prompts.
3. `DEVELOPER_POLICY` — developer overrides (e.g. intent-classifier output).
4. `USER_PREFERENCES` — user settings/preferences.
5. `TRUSTED_PROFILE` — user's own profile data (resume/JD).
6. `ASSISTANT_HISTORY` — prior AI responses (anti-repetition only).
7. `UNTRUSTED_SCREEN` — vision/OCR screen evidence.
8. `UNTRUSTED_TRANSCRIPT` — live interview transcript.
9. `UNTRUSTED_REFERENCE` — user-uploaded reference files.
10. `UNTRUSTED_MEETING_HISTORY` — past meeting summaries.

### Token budgeting

- Each block declares a `tokenBudget` (per-block cap).
- `assemble` enforces a global `tokenBudget` via `enforceTokenBudget`.
- Blocks are sorted by trust; the global budget is filled highest-trust first.
- The first block that overflows is truncated to the remaining budget (with a
  `[...truncated]` marker) if >50 tokens remain; otherwise it is dropped.
- Lower-trust blocks are dropped entirely once the budget is exhausted.
- Token estimate is `ceil(chars / 4)`; truncation applies an 85% safety factor
  and a ~70-char XML-overhead buffer.

## Flow

1. Caller invokes `PromptAssembler.assemble({...})` with raw inputs:
   `transcript`, `modeTemplateType`, `modeId`, `screenContext`, `modeContext`,
   `customContext`, `interviewPreparationContext`, `meetingHistory`,
   `priorResponses`, `intentContext`, `retrievedModeContext`, `tokenBudget`,
   `systemPrompt`, `developerPrompt`.
2. `assemble` builds blocks in a fixed order (intent → interview prep →
   assistant history → screen → transcript → mode context → meeting history →
   custom context), each tagged with a `TrustLevel` and `tokenBudget`.
3. User-controlled content is escaped (`escapeUserContent`) and injection
   patterns neutralized (`escapePromptInjection`) at build time.
4. `enforceTokenBudget` re-sorts by trust and trims to the global budget.
5. `blocksToString` flattens the surviving blocks into `userMessage`.
6. Returns the `ContextPacket` (blocks + systemPrompt + developerPrompt +
   userMessage + metadata) for downstream model invocation.

## Integration

- **Consumers** (referenced from this folder's code; not edited here):
  - The **streaming pipeline** consumes `packet.userMessage` (flat string) and
    `packet.systemPrompt` / `packet.developerPrompt` for model calls.
  - **ScreenUnderstandingService → VisionProviderFallbackChain** produces
    `ScreenContext` (vision-first `extractedText`/`visibleSummary`/`screenType`,
    etc.); legacy OCR callers may still pass `ocrText`.
  - **Intent classifier** output feeds `intentContext` (tagged
    `DEVELOPER_POLICY`).
  - **Mode/template system** supplies `modeTemplateType`, `modeId`, and
    `ModeContextSource` (custom instructions + reference files).
  - **Interview workspace** supplies `interviewPreparationContext` (prep chat,
    selected document markdown, notes).
  - **Meeting history / prior-turn stores** supply `meetingHistory` and
    `priorResponses`.

- **Boundary**: this folder is the trust/budget gate before the model. It does
  not fetch data or call the model itself — it only assembles and sanitizes
  context handed to it by upstream services.
