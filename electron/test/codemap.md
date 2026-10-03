# electron/test/

## Responsibility

This folder is the Electron-process test harness for AnswerCue. It validates the behavior of the main-process modules (`LLMHelper`, `WhatToAnswerLLM`, `SessionTracker`, `ModesManager`, audio capture, IPC handlers) without requiring a full running Electron app. It is not a single unified suite — it is a collection of standalone, mostly independent test scripts plus one eval harness.

The harness covers three broad responsibilities:

1. **Standalone behavior tests** (run with `npx tsx electron/test/<file>.test.ts`): deterministic, no-network checks of lifecycle logic, permission/TCC edge cases, input validation, and memory-safety properties.
2. **LLM eval harness** (`modes-live-response-eval.ts` + `__tests__/evalHarnessPatterns.test.mjs`): live and regression evaluation of mode-specific model output against `mustInclude`/`mustNotInclude` regex contracts, per mode, with latency budgets.
3. **ERP-mode stress tests** (`erp-1hour-real.test.ts`, `erp-3hour-stress.test.ts`, `erp-mode-stress.test.ts`, `erp-mode-stress.ts`): endurance and compliance validation for long discovery interviews against a custom mode prompt (B1 English + Polish dual-output, flag system, 2-3 follow-up question rule, no finance questions, token-budget math).

## Design

**No test framework dependency.** Most scripts are self-contained `main()` runners that print `✅/❌` and call `process.exit(0|1)`. Only `__tests__/evalHarnessPatterns.test.mjs` uses `node:test`. All tests run via `tsx` (TypeScript executed directly).

**Isolation strategy — three patterns:**

- **Pure-function reimplementation.** `audio-lifecycle-handoff.test.ts` and `tcc-edge-cases.test.ts` copy the relevant production logic (audio-test handoff, zero-fill detector, stuck watchdog, `getMacScreenCaptureStatus`) out of `main.ts` into standalone functions and test the reimplementation with mocks. They validate behavior contractually, not the shipped code itself.
- **Source scanning.** `memory-leak-long-session.test.ts` reads production source files (`LLMHelper.ts`, `SessionTracker.ts`, `audio/*.ts`, `CredentialsManager.ts`) and asserts structural properties (e.g. `scrubKeys()` nulls keys, `fullTranscript` is reset, no `while(true)` loops, no redundant `Buffer.from(chunk)` copies). Testable in isolation because LLMHelper needs Electron's `app.getPath`.
- **Electron mocking.** `modes-live-response-eval.ts` patches `Module._load` to stub the `electron` module (`app.getPath` → tmpdir, `safeStorage` plain passthrough). `preload.cjs` installs a global `app` mock via `node -r ./test/preload.cjs` for scripts that import modules touching Electron globals at module load time.

**Env-gated live tests.** Tests that make real API calls refuse to run without explicit opt-in:
- `ANSWERCUE_LIVE_LLM_TESTS=1` — `modes-live-response-eval.ts`
- API keys (GROQ/GEMINI/OPENAI/CLAUDE) — `erp-1hour-real.test.ts`, `what-to-answer-latency.test.ts`
- `MEASURE_LATENCY=true` — enables per-stage timing output in `what-to-answer-latency.test.ts`

**Eval harness design.** `modes-live-response-eval.ts` defines `EvalScenario` (id, mode, transcript, contextBlock, `mustInclude`, `mustNotInclude`, `maxLatencyMs`). 35 baseline + 16 stress scenarios across 7 modes (general, sales, recruiting, team-meet, looking-for-work, technical-interview, lecture) plus long-context scenarios. `ANSWERCUE_EVAL_SUITE` (baseline/stress/all) and `ANSWERCUE_EVAL_IDS` (comma list) select scenarios; `ANSWERCUE_EVAL_MODEL` overrides the model; `ANSWERCUE_EVAL_USE_OLLAMA=1` routes to a local Ollama server with tiny-tier prompts (`tinyPrompts.ts`). The `__tests__/evalHarnessPatterns.test.mjs` file is a regression guard (S454 sub-issue 3) pinning the eval regex behavior so future tightening doesn't reintroduce false negatives/positives; it also asserts mode-specific safety wording lives in the per-mode prompt and not in bloated `TINY_CORE` (loaded from `dist-electron/electron/llm/tinyPrompts.js`, so it needs a build first).

## Flow

1. **Deterministic tests**: runner constructs mocks → calls reimplemented logic / source checks → prints per-assert results → exits nonzero on any failure. No network, no Electron.
2. **ERP stress tests**: build a large synthetic interview transcript (1h: ~90 turns; 3h: 180+ turns across 8 focus areas × 3 cycles; 30-min: ~65 turns) → run simulated per-turn compliance checks (Polish chars, B1 vocabulary blocklist, flag emoji presence, follow-up question count, finance-keyword scan) → optionally hit the real `WhatToAnswerLLM.generateStream()` for the real-LLM variants → aggregate pass rates (80% threshold for the simulated stress run; all-or-nothing for the 3h suite).
3. **Live eval**: `buildHelper()` constructs `LLMHelper` from env keys (or Ollama) → for each selected scenario, `ask()` builds prompt = contextBlock + `<current_transcript>` and calls `helper.chat(latestQuestion, undefined, prompt, modePrompt, true)` → validates each `mustInclude` (required regex) and `mustNotInclude` (forbidden regex) against the response → measures latency against `maxLatencyMs` (multipliable via `ANSWERCUE_EVAL_LATENCY_MULT`, capped at 5× unless forced) → scans for hidden prompt leakage (`system prompt`/`<core_identity>` etc.) → JSON summary, exit 1 on any failure.
4. **Audio/TCC lifecycle**: simulate chunk feeds (`feed()` per chunk with time cadence) → assert detector triggers at the expected window (zero-fill ~12-14s, stuck watchdog ~8s) and does not fire on noise / clears on first chunk; simulate media-access states for screen/mic capability resolution.
5. **Input fuzzing**: feed adversarial payloads (SQL injection, XSS, null bytes, 1MB strings, wrong-typed objects) through simulated IPC handler boundary logic for `generate-what-to-say`, `test-inject-transcript`, `modes:create`, `modes:update` → assert no unhandled exception; SQL-injection patterns are flagged but noted as mitigated by parameterized queries.

## Integration

- **Targets code in `electron/`** (one level up): `main.ts` (audio lifecycle, TCC wiring), `LLMHelper.ts`, `SessionTracker.ts`, `CredentialsManager.ts`, `audio/MicrophoneCapture.ts`, `audio/SystemAudioCapture.ts`, `llm/WhatToAnswerLLM.ts`, `llm/prompts.ts`, `llm/tinyPrompts.ts`, `llm/modelCapabilities.ts`, `services/ModesManager.ts`, and IPC handler inputs.
- **Run entry points** (from `electron/`):
  - `npx tsx test/audio-lifecycle-handoff.test.ts`
  - `npx tsx test/tcc-edge-cases.test.ts`
  - `NODE_ENV=test npx tsx test/input-fuzzing.test.ts`
  - `node --require tsx/dist/register test/memory-leak-long-session.test.ts`
  - `ANSWERCUE_LIVE_LLM_TESTS=1 npx tsx test/modes-live-response-eval.ts` (+ `ANSWERCUE_EVAL_SUITE=stress|all`, `ANSWERCUE_EVAL_IDS=...`, `ANSWERCUE_EVAL_USE_OLLAMA=1`)
  - `npx tsx test/erp-mode-stress.test.ts` / `npx tsx test/erp-mode-stress.ts` (simulated)
  - `npx tsx test/erp-1hour-real.test.ts` / `npx tsx test/erp-3hour-stress.test.ts` (real API / simulated, API keys required)
  - `MEASURE_LATENCY=true npx tsx test/what-to-answer-latency.test.ts`
  - `node --test __tests__/evalHarnessPatterns.test.mjs` (needs `dist-electron/electron/llm/tinyPrompts.js` built first)
  - `node -r ./test/preload.cjs ...` for scripts needing a pre-installed Electron `app` global
- **Known limitations** (by design): `ModesManager`-dependent tests (`erp-3hour-stress.test.ts` TC-09/TC-10, `erp-mode-stress.ts` Step 1) skip when `DatabaseManager` is uninitialized outside a running app; memory-leak test is component-level only (full E2E leak testing needs the Electron runtime); browser/Playwright tests are not part of this folder.
- **Not wired into `npm test`**: scripts are manual/opt-in. Live tests additionally gate on env flags to avoid accidental API cost.

## Coverage Areas (per file)

| File | Coverage |
|---|---|
| `__tests__/evalHarnessPatterns.test.mjs` | Eval-harness regex regressions (2-sum subtraction, upsell pressure, lecture word-boundaries, strong-hire phrase, competitor value vocabulary, scale assumption vs question, p-value analogy vocab, deadline-leak negative lookahead, mode-prompt micro-rule invariants incl. prompt-injection defenses and recency placement of confidential-pricing rules) |
| `audio-lifecycle-handoff.test.ts` | Settings-audio-test → meeting mic handoff: stop order, bounded/conditional quiescence, synchronous ref nulling before await, epoch-based cancellation after permission await, concurrent-stop idempotency, failure isolation |
| `erp-1hour-real.test.ts` | Real-LLM 1h ERP transcript end-to-end: pipeline correctness, mode context injection, token budget under load, Polish/B1/flag/follow-up compliance per turn |
| `erp-3hour-stress.test.ts` | 12 cases (TC-01..12): 60K mode-context truncation, token budget math for 3h, 8-focus-area coverage, finance-question detection, Polish dual-output, B1 compliance, flag system, 2-3 follow-up rule, `generateSuggestion` no-mode fallback, WhatToAnswerLLM wiring, 540+ Q&A simulation, special chars in mode prompt |
| `erp-mode-stress.test.ts` | Simulated 30-min ERP discovery: per-turn compliance (flags/Polish/B1/follow-ups/finance), 80% pass threshold, token-budget warnings during context growth |
| `erp-mode-stress.ts` | ModesManager customContext/modePromptSuffix injection verification + simulated answer compliance (Polish, B1, flags, 1-3 follow-ups) |
| `input-fuzzing.test.ts` | IPC handler input validation: adversarial/malformed payloads for `generate-what-to-say`, `test-inject-transcript`, `modes:create`, `modes:update`; SQL injection pattern detection |
| `memory-leak-long-session.test.ts` | Component memory safety: `scrubKeys()` nulls API keys, SessionTracker bounded arrays/eviction, `removeAllListeners` correctness, no redundant Buffer copies in audio path, CredentialsManager `scrubMemory` |
| `modes-live-response-eval.ts` | Live LLM eval: 35 baseline + 16 stress scenarios across 7 modes + long-context; hallucination traps, injection defenses, negotiation constraints, latency budgets, prompt-leakage scan |
| `preload.cjs` | Shared preload mock of Electron `app` global for standalone runs |
| `tcc-edge-cases.test.ts` | macOS TCC: zero-fill detector (12-14s), stuck watchdog (~8s), noise non-trigger, chunk-clears-watchdog, screen-capture status states (denied/granted/restricted), dev-mode bypass, denied-but-capturable probe resolution, mic access |
| `what-to-answer-latency.test.ts` | Real-LLM per-stage latency measurement (`MEASURE_LATENCY=true`) across short/ERP/technical cases |
