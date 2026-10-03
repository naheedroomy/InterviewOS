# electron/utils/

## Responsibility

A grab-bag of **pure, framework-free helper modules** shared across the Electron main
process. Each file is self-contained and side-effect-free (except `nativeModuleGuard`,
which is an explicit startup side-effect). They exist to keep the large orchestration
files (`main.ts`, `ipcHandlers.ts`, `LLMHelper.ts`, `IntelligenceEngine.ts`) free of
repetitive, security-sensitive, or domain-specific glue logic.

The folder is deliberately **not** a single cohesive subsystem — it is a collection of
independent utilities, each with its own consumer(s). Common themes:

- **Security hardening** (`curlUtils.ts` SSRF/path validation, `redactForLog.ts`).
- **Provider/LLM integration glue** (`curlUtils.ts`, `modelFetcher.ts`, `preparedTranscriptContext.ts`).
- **Feature helpers** (`emailUtils.ts`, `rollingTranscriptState.ts`).
- **Runtime resilience** (`nativeModuleGuard.ts`).

## Design

### `curlUtils.ts` — cURL provider + image/SSRF security
The largest and most security-critical file. All functions are pure (no I/O except
`fs.realpathSync` inside `validateImagePath`).

- `validateCurl(curl)` — parses a cURL command via `@bany/curl-to-json`, requires the
  `{{TEXT}}` placeholder. (Note: a near-duplicate `validateCurl` lives in
  `src/lib/curl-validator.ts` for the renderer; the electron copy is not directly
  imported by main-process code today.)
- `deepVariableReplacer(node, variables)` — recursively replaces `{{KEY}}` placeholders
  in strings/arrays/objects (used to inject prompt + image variables into request bodies).
- `imageMimeTypeFromPath(path)` — extension→MIME map, defaults to `image/png`
  (ScreenshotHelper only produces `.png`).
- `injectImageIntoMessages(body, base64Image, imagePath)` — auto-upgrades the last
  user message in an OpenAI-compatible `messages` array to a multimodal content array
  with an `image_url` part; idempotent (won't duplicate an existing image part).
- `validateUrlForSsrf(url)` — blocks loopback/private/link-local hosts, `data:`/`file:`/
  `javascript:`/protocol-relative URLs, path traversal, and non-HTTPS (except localhost).
- `validateImagePath(imagePath, userDataPath)` — allowlist-based path validation using
  `fs.realpathSync` to detect symlink escapes; allows only app-owned dirs
  (`userData`, `userData/screenshots`, `userData/extra_screenshots`), Windows
  case-insensitive handling. **This is the P0 security gate for the screenshot→vision
  pipeline.**
- `getByPath(obj, path)` — dot/bracket-notation traversal (e.g. `choices[0].message.content`).

### `modelFetcher.ts` — dynamic model discovery
Fetches available models from provider APIs. `fetchProviderModels(provider, apiKey)`
dispatches per provider (openai/groq/claude/gemini/deepseek). Each provider fetcher
filters to chat-capable models and sorts. Notable patterns:
- **Injectable HTTP** — `HttpGet` type + `fetchGeminiModelsPaginated(apiKey, httpGet)`
  takes the HTTP function as a parameter so pagination/failure can be unit-tested
  without network. Production entry `fetchGeminiModels` wires in `axios.get`.
- **Curated fallbacks** — `FALLBACK_GEMINI_MODELS` and `DEEPSEEK_DEFAULT_MODELS` are
  used only when the live fetch throws; a successful-but-empty fetch returns `[]`
  (not the fallback).
- `processGeminiModels(raw)` — pure filter/dedup/sort helper (no I/O).

### `emailUtils.ts` — follow-up email feature
Pure string/URL builders for the post-meeting follow-up email flow:
- `extractEmailsFromTranscript(transcript)` — regex-extracts unique emails.
- `buildMailtoLink` / `buildGmailComposeUrl` — pre-filled mailto / Gmail compose URLs.
- `generateEmailSubject(title, type)` — subject line from meeting title.
- `buildFollowUpEmailPromptInput(input)` — serializes a `FollowUpEmailInput` into the
  context string fed to the LLM.
- `extractRecipientName(attendeeInfo)` — first name from email or full name.
- `copyToClipboard(text)` — renderer-only helper (uses `navigator.clipboard`).

### `nativeModuleGuard.ts` — ABI mismatch recovery (startup side-effect)
The one impure module. `ensureNativeModuleAbi()` probes `better-sqlite3` and `keytar`
for `NODE_MODULE_VERSION` mismatch (`ERR_DLOPEN_FAILED`). On mismatch:
- **Packaged build** → logs error and `app.exit(1)` (can't rebuild at runtime).
- **Dev** → locates `electron-rebuild`, spawns it (stripping `ELECTRON_RUN_AS_NODE` so
  system node runs node-gyp), then `app.relaunch()`.

### `preparedTranscriptContext.ts` — What-to-Answer context assembly
`buildPreparedTranscriptContext(session, lastSeconds=180)` composes the transcript
context for the What-to-Answer feature: cleaned turns via
`prepareTranscriptForWhatToAnswer` (from `../llm/transcriptCleaner`), temporal context
via `buildTemporalContext` (from `../llm/TemporalContextBuilder`), plus recent assistant
responses. Pure given a `PreparedContextSession` interface.

### `redactForLog.ts` — centralized log redaction
Framework-free, side-effect-free (safe to require from main **and** preload). Two entry
points:
- `redactForLog(args)` → lossy string for console/log lines.
- `redactValue(value)` → sanitized structured clone.
Redaction is three-layered: sensitive-key property redaction (`SENSITIVE_KEY_RE`),
bulky-content removal (`REMOVE_VALUE_KEY_RE`), and free-text credential-pattern
scrubbing (`VALUE_PATTERNS`: Bearer tokens, `sk-`/`gsk_`/`dg_`/`AIza`/`sk-ant-api03-`
keys, JWT-shaped strings). Handles circular refs and truncates strings to 120 chars.

### `rollingTranscriptState.ts` — overlay rolling transcript bar
Pure string-merging helpers for the overlay STT rolling transcript. Coalesced OpenAI STT
emits growing partial previews + one final per utterance. `mergeRollingTranscriptPartial`
replaces the in-progress tail; `mergeRollingTranscriptFinal` commits a segment without
duplicating text that already matches the preview. Segments separated by `'  ·  '`.

### `__tests__/validateImagePath.test.mjs`
Node test runner regression suite for `validateImagePath` (observation 2631 — macOS
`userData` ordering). Imports the **built** `dist-electron/electron/utils/curlUtils.js`.

## Flow

Data/control flow is **consumer-driven** — each util is called at the point of need:

1. **Startup**: `main.ts` calls `ensureNativeModuleAbi()` (nativeModuleGuard) before the
   app proceeds; `main.ts` also lazily wires `redactForLog` into its console/log path.
2. **Custom cURL provider request** (`LLMHelper.ts`): `curl2Json` → `deepVariableReplacer`
   (inject `{{TEXT}}`/variables) → `injectImageIntoMessages` (attach screenshot) →
   `validateUrlForSsrf` → send → `getByPath` to extract the answer.
3. **Screenshot→vision**: `ScreenUnderstandingService.ts` and `ipcHandlers.ts` call
   `validateImagePath(path, userDataDir)` before reading/attaching any screenshot.
4. **Model discovery**: `ipcHandlers.ts` `fetch-provider-models` handler calls
   `fetchProviderModels(provider, key)` and returns `{ id, label }[]` to the renderer.
5. **What-to-Answer**: `IntelligenceEngine.ts` calls
   `buildPreparedTranscriptContext(session, lastSeconds)` to build context for LLM calls.
6. **Follow-up email**: `ipcHandlers.ts` handlers call `buildFollowUpEmailPromptInput`,
   `extractEmailsFromTranscript`, and `buildMailtoLink` (then `shell.openExternal`).
7. **Overlay transcript**: `src/components/AnswerCueInterface.tsx` imports
   `mergeRollingTranscriptPartial`/`mergeRollingTranscriptFinal` directly (crossing the
   `electron/` boundary) to update the rolling transcript bar on STT events.

## Integration

- **`main.ts`** — `ensureNativeModuleAbi` (startup), `redactForLog` (log redaction).
- **`ipcHandlers.ts`** — `validateImagePath` (multiple screenshot handlers),
  `fetchProviderModels` (`fetch-provider-models`), `buildFollowUpEmailPromptInput` /
  `extractEmailsFromTranscript` / `buildMailtoLink` (follow-up email handlers).
- **`LLMHelper.ts`** — `deepVariableReplacer`, `getByPath`, `injectImageIntoMessages`,
  `validateUrlForSsrf` (custom cURL / OpenAI-compatible request execution).
- **`IntelligenceEngine.ts`** — `buildPreparedTranscriptContext` (What-to-Answer context).
- **`services/screen/ScreenUnderstandingService.ts`** — `validateImagePath` (vision gate).
- **`preload.ts`** — exposes `extractEmailsFromTranscript` to the renderer via IPC bridge.
- **`src/components/AnswerCueInterface.tsx`** — imports `rollingTranscriptState` helpers
  directly (renderer consumes an `electron/` util — the one cross-boundary import).
- **`src/lib/overlaySttPersistence.d.mts`** — type-declares the rolling-transcript merge
  function signatures for the overlay STT persistence layer.
- **`electron/llm/`** (`transcriptCleaner.ts`, `TemporalContextBuilder.ts`) — upstream
  dependencies of `preparedTranscriptContext.ts` (via the `../llm` barrel).

**Note on `validateCurl`**: `electron/utils/curlUtils.ts` exports `validateCurl`, but the
main-process cURL provider validation path in `ipcHandlers.ts` uses its own local
`validateCurlProviderPayload`, and the renderer has a separate `src/lib/curl-validator.ts`.
The electron `validateCurl` is not currently imported by main-process code — treat it as
legacy/duplicate unless a new consumer is added.
