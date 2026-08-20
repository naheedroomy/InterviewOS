# electron/config/

## Responsibility

Central home for shared, static configuration constants used by the Electron
main process. It holds two kinds of data:

- **`constants.ts`** — a single sentinel value (`TRIAL_SENTINEL_KEY`) that
  encodes a cross-cutting "trial mode" convention.
- **`languages.ts`** — the canonical speech-recognition and AI-response
  language catalogs (types + lookup tables) consumed by every STT provider and
  exposed to the renderer over IPC.

This folder is deliberately dependency-free: it exports plain data and types
only, with no imports from other modules, so it can be imported anywhere in the
main process (and from built `dist-electron` output in tests) without pulling
in side effects.

## Design

### constants.ts — the trial sentinel

`TRIAL_SENTINEL_KEY = '__trial__'` is a magic string that stands in for a real
API key while a free trial is active. The trial token (`natively_trial_…`) is
not a valid key, but downstream code (LLMHelper, AnswerCueProSTT, ipcHandlers)
must treat "trial mode" identically to "key mode" for routing/auto-promotion.
The sentinel is stored in `nativelyApiKey` so existing `if (nativelyApiKey)`
branches light up; the auth header is swapped to `x-trial-token` only at the
actual network boundary.

Key convention: **any code that reads `nativelyApiKey` and forwards it to the
network MUST compare against `TRIAL_SENTINEL_KEY`** (never the literal
`'__trial__'`), so a single rename here updates every call site. The literal
lives only in this file.

### languages.ts — typed language catalogs

- `LanguageOption` — base shape: `label`, `code` (internal key), `bcp47`
  (Google/Azure), `iso639` (OpenAI/Groq), `group` (UI grouping), optional
  `alternates`.
- `EnglishVariant` — `LanguageOption` plus required `primary` and `alternates`
  (used for English auto-detect fallback chains).
- `ENGLISH_VARIANTS` — the five English regional variants (`english-us/uk/in/
  au/ca`), each with its primary BCP-47 tag and an ordered list of alternates.
- `AUTO_DETECT_ALTERNATES` — the BCP-47 list tried when recognition is in
  `auto` mode.
- `RECOGNITION_LANGUAGES` — the master lookup table keyed by internal `code`
  (`auto` + all English variants + 13 non-English languages). This is the
  single source of truth for STT providers.
- `AI_RESPONSE_LANGUAGES` — a flat `{label, code}` array for the AI chat
  response-language picker (note: codes are display names like `'English'`,
  distinct from the recognition `code` keys).

## Flow

1. **Recognition languages** — STT providers (`OpenAIStreamingSTT`,
   `AnswerCueProSTT`, `ElevenLabsStreamingSTT`, `SonioxStreamingSTT`,
   `GoogleSTT`, `DeepgramStreamingSTT`, `RestSTT`) import `RECOGNITION_LANGUAGES`
   and look up a `languageKey` to derive the provider-specific tag:
   - `iso639` for OpenAI/Groq-style providers,
   - `bcp47` for Google/Azure-style providers,
   - `alternates` (via `RECOGNITION_LANGUAGES.auto`) for auto-detect fallback.
2. **Renderer exposure** — `ipcHandlers.ts` returns the catalogs over IPC:
   - `get-recognition-languages` → `RECOGNITION_LANGUAGES`,
   - `get-ai-response-languages` → `AI_RESPONSE_LANGUAGES`.
3. **Trial sentinel** — `ipcHandlers.ts` writes `TRIAL_SENTINEL_KEY` into the
   credential store on `trial:start`; `LLMHelper` and `AnswerCueProSTT` read it
   back and branch on it to swap the auth header to `x-trial-token` at the
   network boundary.

## Integration

- **Consumers of `RECOGNITION_LANGUAGES`**: `electron/audio/OpenAIStreamingSTT.ts`,
  `AnswerCueProSTT.ts`, `ElevenLabsStreamingSTT.ts`, `SonioxStreamingSTT.ts`,
  `GoogleSTT.ts`, `DeepgramStreamingSTT.ts`, `RestSTT.ts`, and
  `electron/ipcHandlers.ts`.
- **Consumers of `TRIAL_SENTINEL_KEY`**: `electron/ipcHandlers.ts`,
  `electron/LLMHelper.ts`, `electron/audio/AnswerCueProSTT.ts`.
- **Tests**: `electron/services/__tests__/AnswerCueProSTTLanguageAlternates.test.mjs`
  imports `RECOGNITION_LANGUAGES` from the built `dist-electron/.../languages.js`
  to assert the auto-detect alternates include each language's BCP-47 tag.
- **Parallel renderer copy**: `src/config/languages.ts` holds a separate,
  renderer-side `ENGLISH_VARIANTS` (different shape — no `bcp47`/`iso639`).
  The two are not shared; keep them in sync deliberately when changing English
  variant keys.
