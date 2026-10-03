# electron/llm — Code Map

This folder contains the LLM layer of the AnswerCue Electron main process. It is a
**pure prompt/type/helper layer**: it holds the system prompts, the per-mode model
adapters, provider-routing logic, transcript/context pre-processing, and post-stream
sanity checks. It does **not** own the actual provider SDK clients — those live in
`../LLMHelper.ts` (one directory up), which this folder's adapters call into.

The folder's public surface is re-exported from `index.ts`; most consumers import from
`./llm` (the barrel) rather than individual files.

---

## 1. Architecture overview

```
IPC / services / main
        │  (import from './llm' barrel)
        ▼
┌─────────────────────────────────────────────────────────────┐
│  electron/llm/                                             │
│                                                             │
│  Mode adapters (thin classes)                              │
│    AnswerLLM, AssistLLM, BrainstormLLM, ClarifyLLM,         │
│    CodeHintLLM, FollowUpLLM, FollowUpQuestionsLLM,          │
│    RecapLLM, WhatToAnswerLLM                                │
│      │  each calls LLMHelper.chat / streamChat              │
│      ▼                                                     │
│  ../LLMHelper.ts  (OWNER of provider SDK clients)          │
│    streamChat / chat / generateWithVisionFallback          │
│      │  uses ProviderRouter, modelCapabilities,            │
│      │  visionStreamFallback, GeminiPromptCache, prompts   │
│      ▼                                                     │
│  Provider SDKs: Gemini, Groq, OpenAI, Claude, DeepSeek,    │
│  Codex CLI, Ollama, custom cURL, AnswerCue API             │
└─────────────────────────────────────────────────────────────┘
```

Key split: **the adapters decide *what* to ask and *which prompt* to use; `LLMHelper`
decides *which provider* and *how* to stream it.** The `llm/` folder contributes the
routing *policy* (ProviderRouter) and the *capability model* (modelCapabilities) that
`LLMHelper` consumes.

---

## 2. Provider routing

### `ProviderRouter.ts`
Two distinct routing systems coexist in this file:

**A. Declarative fallback chain — `routeLLMProviders()` / `routeWithScopeFallback()`**
- Pure function returning an ordered `ProviderAttempt[]` for a requested
  `ProviderCapability` (`chat` | `stream_chat` | `structured` | `vision`).
- Provider specs are declared with `supports[]` capability lists and availability
  flags from `ProviderAvailabilityState` (which API keys are present).
- **Ordering differs by modality:**
  - Multimodal chain: `natively → codex → openai → geminiFlash → claude → geminiPro → groq`
  - Text-only chain: `natively → groq → codex → geminiFlash → geminiPro → openai → claude → deepseek`
  - `ollama` is appended last when available.
  - DeepSeek is intentionally **text-only** (no vision), so it is excluded from the
    multimodal chain.
- `statusFor()` marks each attempt `available` or `unavailable` with a reason:
  `missing_api_key` | `missing_config` | `unsupported_capability` | `disabled`.
- **Data-scope policy:** `ProviderDataScope[]` (transcript, screenshots, reference_files,
  profile_history, embeddings, post_call_summary) can be denied via a
  `ProviderDataScopePolicy`. `assertProviderDataScopes()` throws `ProviderScopeError`
  when a denied scope is requested; `getDeniedDataScopes()` computes the denied set.
  `routeWithScopeFallback()` is a thin alias of `routeLLMProviders()`.

**B. Policy-aware router + circuit breaker — `ProviderRouter` class**
- `selectProvider(policy: RoutingPolicy)` picks a single `ProviderChoice` using ordered
  rules: local-only mode → vision → low-latency → quality (summary/recap) → mode-based
  → default Groq.
- `CircuitBreaker` per provider (closed/open/half-open) with configurable threshold,
  reset timeout, and half-open call cap. `recordSuccess`/`recordFailure`/
  `getProviderHealth()` drive it. Defaults: threshold 5, reset 30s, halfOpenMax 1.
- Note: this class-based router is largely a **separate/parallel** mechanism from the
  declarative chain; `LLMHelper` primarily uses the declarative chain + the vision
  fallback state machine (see `visionStreamFallback.ts`).

### `visionCapability.ts`
Pure, dependency-free helpers deciding whether a **local** provider can accept images:
- `isOllamaVisionModelByName()` — name regex fallback.
- `ollamaVisionFromShow()` — authoritative from Ollama `/api/show` `capabilities`.
- `resolveOllamaVision()` — probe result, else name heuristic.
- `customProviderSupportsVision()` — custom cURL provider supports vision if it has an
  explicit `{{IMAGE_BASE64}}` placeholder or an OpenAI-compatible `messages` array with
  a `"role":"user"` message; explicit `multimodal` flag overrides.
- `customProviderIsLocal()` — loopback/RFC-1918/link-local URL detection for local-only
  mode; explicit `localOnly` flag wins.

### `visionStreamFallback.ts`
Pure, dependency-free **state machine** for the streaming vision-provider fallback chain
(consumed by `LLMHelper`):
- `classifyVisionError()` → `VisionErrorClass` (auth/rate/timeout/network/no_vision/
  payload/server/unknown) driving retry-vs-skip.
- `orderVisionByHealth()` — fastest-healthy-first using TTFT EWMA; never fails closed.
- `markVisionHealthy/Unhealthy`, `recordVisionTtft()` — circuit/health bookkeeping.
- `runStreamingVisionFallback()` — the core generator. Implements the **"commit point"**
  pattern: before the first content chunk a provider error is silent and falls back to
  the next provider; after the first chunk the stream is committed (a later failure ends
  gracefully rather than switching providers, which would duplicate output). TTFT and
  inter-chunk stall guards, exponential backoff, and time-bounded iterator cleanup.

---

## 3. Model adapters (per-mode classes)

All adapters are thin wrappers over `LLMHelper.chat` / `LLMHelper.streamChat`. They share
a common pattern: pick a prompt by **prompt tier** (`getPromptTier() === 'tiny'` →
`TINY_*` from `tinyPrompts.ts`, else the full `*_PROMPT` from `prompts.ts`), fit context
via `fitContextForCurrentModel()`, then stream/collect. Each catches errors and returns a
graceful empty string or fallback message.

| Class | File | Mode | Streams? | Notes |
|---|---|---|---|---|
| `AnswerLLM` | `AnswerLLM.ts` | Active answer | yes (collects) | `UNIVERSAL_ANSWER_PROMPT` / `TINY_ANSWER_PROMPT` |
| `AssistLLM` | `AssistLLM.ts` | Passive observation | no (`chat`) | `UNIVERSAL_ASSIST_PROMPT` / `TINY_ASSIST_PROMPT`; never suggests what to say |
| `BrainstormLLM` | `BrainstormLLM.ts` | Think-out-loud | yes | `BRAINSTORM_MODE_PROMPT` / `TINY_BRAINSTORM_PROMPT`; supports `imagePaths` |
| `ClarifyLLM` | `ClarifyLLM.ts` | Clarification question | both | `CLARIFY_MODE_PROMPT` / `TINY_CLARIFY_PROMPT` |
| `CodeHintLLM` | `CodeHintLLM.ts` | Live code review | yes | `CODE_HINT_PROMPT` / `TINY_CODE_HINT_PROMPT`; builds message via `buildCodeHintMessage()`; fails loud if model lacks image support |
| `FollowUpLLM` | `FollowUpLLM.ts` | Answer refinement | both | `UNIVERSAL_FOLLOWUP_PROMPT` / `TINY_FOLLOWUP_PROMPT`; message = `PREVIOUS ANSWER:\n...\n\nREQUEST: ...` |
| `FollowUpQuestionsLLM` | `FollowUpQuestionsLLM.ts` | Candidate questions | both | `UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT` / `TINY_FOLLOW_UP_QUESTIONS_PROMPT` |
| `RecapLLM` | `RecapLLM.ts` | Conversation summary | both | `UNIVERSAL_RECAP_PROMPT` / `TINY_RECAP_PROMPT`; non-stream path clamps to ≤5 bullets via `clampRecapResponse()` |
| `WhatToAnswerLLM` | `WhatToAnswerLLM.ts` | Strategic "what should I say" | yes (primary) | The most complex adapter — see §4 |

### `WhatToAnswerLLM.ts` (the main live-answer path)
`generateStream()` is a multi-stage pipeline:
1. **Transient/direct context** — builds `intentContext` from a dynamic
   `promptInstruction` and the `SCREEN_DIRECT_VISION_INSTRUCTION` block when images are
   attached; pulls `customNotesContext` from `LLMHelper.getCustomNotesContextBlock()`.
2. **Truncation** — `fitContextForCurrentModel(cleanedTranscript, reservedForFit)` with a
   token budget reserving room for intent context, custom notes, prep context, OCR text,
   and prior responses.
3. **System prompt resolution** — base prompt (`UNIVERSAL_WHAT_TO_ANSWER_PROMPT` or
   `TINY_WHAT_TO_ANSWER_PROMPT`) layered with either an **active skill** `promptBlock`
   (replaces mode suffix) or the active **mode suffix** from `ModesManager`
   (`getActiveModeSystemPromptSuffix()`).
4. **Prompt assembly** — `PromptAssembler.assemble()` (from
   `../services/context/PromptAssembler`) builds the final user message packet.
5. **Stream** — `streamChat(packet.userMessage, imagePaths, undefined, finalPromptOverride,
   true, true, packetScopes, abortSignal)`. Data scopes are derived from whether custom
   notes / prep context / prior responses were included.
6. **Post-stream code sanity check** — buffers tokens, then `checkAnswerForCodeBugs()`
   (fire-and-forget warn; does **not** auto-rewrite — see FINDING-012).
7. **Latency telemetry** — when `MEASURE_LATENCY=true`, logs per-stage and per-token
   (avg/p50/p95/p99) breakdown.

---

## 4. Prompt / stream flow

### Prompt sources
- **`prompts.ts`** — the full prompt library. Core building blocks:
  - `CORE_IDENTITY` (identity + security + anti-AI-tells + accuracy admissions)
  - `EXECUTION_CONTRACT` (deterministic single-pass engine)
  - `CONTEXT_INTELLIGENCE_LAYER` (context prioritization)
  - `SHARED_CODING_RULES` (coding format + correctness invariants)
  - `SHARED_MODE_PREFIX` / `SHARED_MODE_PREFIX_SHORT` — dedup helpers so `ModesManager`
    can strip the shared prefix from mode suffixes (avoids shipping the ~1.5–2K token
    block twice).
  - `SECURITY_TRAILER` — appended to short prompts (recap/followup/etc.).
  - Mode prompts: `ASSIST_MODE_PROMPT` (= `HARD_SYSTEM_PROMPT`), `ANSWER_MODE_PROMPT`,
    `WHAT_TO_ANSWER_PROMPT`, `FOLLOW_UP_QUESTIONS_MODE_PROMPT`, `FOLLOWUP_MODE_PROMPT`,
    `CLARIFY_MODE_PROMPT`, `CODE_HINT_PROMPT` (+ `buildCodeHintMessage()`),
    `BRAINSTORM_MODE_PROMPT`, `CHAT_MODE_PROMPT`.
  - Per-provider variants: `GROQ_*`, `OPENAI_*`, `CLAUDE_*`, `CUSTOM_*`, `UNIVERSAL_*`
    (the `UNIVERSAL_*` set is what the adapters actually use for cloud; `GROQ_*` etc. are
    legacy/provider-specific).
  - Mode templates: `MODE_GENERAL_PROMPT`, `MODE_LOOKING_FOR_WORK_PROMPT`,
    `MODE_SALES_PROMPT`, `MODE_RECRUITING_PROMPT`, `MODE_TEAM_MEET_PROMPT`,
    `MODE_LECTURE_PROMPT`, `MODE_TECHNICAL_INTERVIEW_PROMPT`.
  - Utility prompts: `GROQ_TITLE_PROMPT`, `GROQ_SUMMARY_JSON_PROMPT`,
    `FOLLOWUP_EMAIL_PROMPT`, `GROQ_FOLLOWUP_EMAIL_PROMPT`.
- **`tinyPrompts.ts`** — compact (≤800 token) prompts for small/local models
  (4B–8B params, ≤8K context). `TINY_CORE` + per-mode `TINY_*` variants, plus
  `TINY_PROMPTS_SET` (the set that bypasses mode injection in `streamChat`).

### Prompt-tier selection
- `modelCapabilities.ts` → `getModelCapabilities(modelId, isOllama)` returns a
  `ModelCapabilities` with `tier` (`cloud` | `local-large` | `local-small`),
  context/prompt/output token budgets, `supportsXmlTags`, `supportsImages`, `name`.
- `selectPromptTier()` → `'tiny'` for `local-small`, else `'full'`.
- `LLMHelper.getPromptTier()` / `getCapabilities()` expose this to the adapters, which
  pick `TINY_*` vs full prompts accordingly.
- Also: `estimateTokens()` (chars/4), `truncateTranscriptToFit()`, `parseOllamaSize()`,
  and the `KNOWN_OLLAMA_NATIVE_CTX` family table.

### Stream flow (how a request reaches a provider)
1. Adapter calls `LLMHelper.streamChat(message, imagePaths, context, systemPromptOverride,
   ...)`.
2. `LLMHelper` resolves the active model/provider, applies mode injection (unless the
   prompt is in `TINY_PROMPTS_SET` or `skipModeInjection`), injects language suffix, and
   routes to the provider-specific streamer (`streamWithGemini`, `streamWithOllama`,
   OpenAI/Claude/Groq/DeepSeek/Codex/custom cURL, or the AnswerCue API).
3. For image-bearing requests, `LLMHelper` builds the ordered provider list and delegates
   to `runStreamingVisionFallback()` (see §2).
4. `LLMHelper` may use `GeminiPromptCache` to cache large system prompts server-side
   (keyed by sha1(model+prompt), ~10× cheaper cached-token billing; returns null on any
   failure so callers fall back to passing `systemInstruction` directly).

### Post-processing
- `postProcessor.ts`:
  - `reduceDashes()` / `reduceDashesInChunk()` — deterministic backstop stripping em/en
    dashes and connector hyphens (preserving code blocks, bullets, compound words).
  - `clampResponse()` — strips markdown/prefixes/filler, enforces sentence/word limits
    (skips clamping when code blocks are present).
  - `validateResponse()` — returns `{ valid, issues }`.
- `transcriptCleaner.ts` — deterministic (no LLM) transcript cleaning: `cleanTranscript()`
  (filler/acknowledgement removal), `sparsifyTranscript()` (prioritize interviewer turns,
  keep recent), `formatTranscriptForLLM()`, `prepareTranscriptForWhatToAnswer()`.
- `TemporalContextBuilder.ts` — builds `TemporalContext` (recent transcript, prior
  responses for anti-repetition, role context, tone signals) and formats it for prompt
  injection.
- `IntentClassifier.ts` — three-tier intent detection (regex fast-path → zero-shot SLM
  `mobilebert-uncased-mnli` → context heuristic) returning `IntentResult` with an
  `answerShape` guidance string.
- `PlannerDecision.ts` — `planNextAssistantAction()` decides the next action kind
  (`silent` | `answer` | `clarify` | `recap` | `follow_up_questions` | `brainstorm`) from
  trigger text, confidence, cooldown, and intent.
- `ConversationSummarizer.ts` — tier-2 conversation compression: `compressConversation()`
  turns N oldest turns into a structured `TurnSummary` (decisions/facts/topics/tone/
  action items/questions), `formatSummaryAsBlock()` renders it as an XML block for prompt
  injection.
- `CodeSanityCheck.ts` — `checkAnswerForCodeBugs()` post-stream detection of high-
  confidence bug shapes (subtraction-as-tuple, assignment-in-conditional, narration
  tuple bug) inside fenced code blocks.
- `WhatToAnswerFormatDiagnostics.ts` — `inspectWhatToAnswerFormat()` / logging helper to
  verify the model emitted the structured `Question:`/`Answer:` format and whether an
  IPC-question fallback is available.
- `GeminiPromptCache.ts` — see §4 stream flow.

---

## 5. Patterns

- **Thin adapters over `LLMHelper`.** Every mode class takes an `LLMHelper` in its
  constructor and delegates to `chat`/`streamChat`. No adapter owns SDK clients.
- **Prompt-tier branching.** `getPromptTier() === 'tiny' ? TINY_X : X` is the universal
  idiom for choosing compact vs full prompts.
- **Streaming with graceful degradation.** Adapters that stream wrap the generator in
  try/catch and yield a user-facing fallback string on failure; non-streaming variants
  collect chunks and return `""` on error.
- **Deterministic post-processing backstops.** Prompt-level rules (anti-AI-tells, coding
  invariants) are reinforced by deterministic code (`reduceDashes`, `clampResponse`,
  `CodeSanityCheck`) because providers don't fully respect prompt constraints.
- **Pure, dependency-free cores.** `visionCapability.ts` and `visionStreamFallback.ts`
  keep decision logic free of SDK/Electron deps so it is unit-testable; `LLMHelper`
  supplies the I/O.
- **Data-scope policy enforcement.** Outbound payloads are tagged with
  `ProviderDataScope[]`; `ProviderRouter` asserts/denies scopes against a policy and can
  throw `ProviderScopeError`.
- **Prompt dedup.** `SHARED_MODE_PREFIX` lets `ModesManager` strip the shared prefix from
  mode suffixes to avoid shipping the identity block twice.
- **Fail-safe caching.** `GeminiPromptCache` never throws; it returns null and callers
  fall back to passing `systemInstruction` directly.

---

## 6. Consumers

Consumers import from the `./llm` barrel (`index.ts`) or specific files:

- **`../LLMHelper.ts`** — the primary consumer. Imports prompts, tinyPrompts,
  modelCapabilities, GeminiPromptCache, visionStreamFallback, visionCapability,
  ProviderRouter, transcriptCleaner types. Owns provider SDK clients and the
  `streamChat`/`chat`/`generateWithVisionFallback` entry points the adapters call.
- **`../IntelligenceEngine.ts`** — imports the LLM adapters (AnswerLLM, AssistLLM,
  BrainstormLLM, ClarifyLLM, CodeHintLLM, FollowUpLLM, FollowUpQuestionsLLM, RecapLLM,
  WhatToAnswerLLM, etc.) and `logWhatToAnswerFormatDiagnostics`; constructs them with the
  shared `LLMHelper` and drives live-interview features.
- **`../SessionTracker.ts`** — uses `RecapLLM` for conversation recaps.
- **`../MeetingPersistence.ts`** — uses `GROQ_TITLE_PROMPT`, `GROQ_SUMMARY_JSON_PROMPT`,
  and `ProviderDataScopePolicy` for meeting title/summary generation.
- **`../ipcHandlers.ts`** — uses `CHAT_MODE_PROMPT` and (lazily) the follow-up email
  prompts.
- **`../main.ts`** — calls `warmupIntentClassifier()` at startup.
- **`../utils/preparedTranscriptContext.ts`** — imports transcript/context helpers from
  the barrel.
- **`../services/ModesManager.ts`** — imports mode prompts from `prompts.ts` and manages
  the active-mode suffix consumed by `WhatToAnswerLLM`.
- **`../rag/EmbeddingProviderResolver.ts`**, **`../rag/RAGManager.ts`** — use
  `ProviderScopeError`, `assertProviderDataScopes`, `ProviderDataScopePolicy` from
  `ProviderRouter`.
- **`../services/screen/VisionProviderRegistry.ts`** — funnels vision requests through
  `LLMHelper.streamChat` (via the global `__nativelyGetLLMHelper` accessor).
- **Tests** — `__tests__/` (unit) and `../test/` (integration, e.g. `WhatToAnswerLLM`
  latency/stress tests) exercise the pure helpers and adapters.

---

## 7. Tests

`__tests__/` contains unit tests for the pure logic:
- `ProviderRouter.test.mjs`, `PlannerDecision.test.mjs`, `ConversationSummarizer.test.mjs`,
  `CodeSanityCheck.test.mjs`, `WhatToAnswerFormatDiagnostics.test.mjs`,
  `VisionCapability.test.mjs`, `VisionStreamFallback.test.mjs`, `ModelDefaults.test.mjs`,
  `IdentityGuard.test.mjs`, plus prompt-assembly tests (`modePrompts.test.mjs`,
  `suggestionPromptAssembly.test.mjs`, `whatToAnswerOutputFormat.test.mjs`).
