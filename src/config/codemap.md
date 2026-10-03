# src/config/

## Responsibility

Renderer-side (Vite + React app) home for static configuration and constants. No logic, no side effects, no imports from other modules — pure data modules that describe:

- **STT providers** (`stt.constants.ts`): the registry of speech-to-text backends the app can talk to (Google gRPC, Groq, OpenAI, Deepgram, ElevenLabs, Azure, IBM Watson, AnswerCue Pro managed).
- **English language variants** (`languages.ts`): the five English regional variants offered for recognition, each with a preferred BCP-47 tag and fallback alternates.
- **Checkout URLs** (`urls.ts`): external payment links (Dodo Payments) for AnswerCue Pro and the AnswerCue API tiers.

The folder is exposed to the renderer via the `@config/*` alias (see Integration). It is the renderer-side counterpart to `electron/config/`, which holds the actively-used electron-side language constants.

## Design

- **Data-driven, declarative**: each module exports plain typed constants. UI and transport code can derive behavior (provider list, upload encoding, transcript extraction path) from the data instead of hardcoding per-provider branches.
- **Zero dependencies**: no module in this folder imports from any other module; safe to import anywhere without cycle risk.
- **`as const`** on `CHECKOUT_URLS` preserves literal string types for the checkout links.
- **Parallel-copy hazard**: `src/config/languages.ts` is a *separate, differently-shaped* copy of the language data vs. `electron/config/languages.ts` (which exports `RECOGNITION_LANGUAGES`, `AI_RESPONSE_LANGUAGES`, and an `EnglishVariant` with `bcp47`/`iso639` fields). The two must be kept in sync or consolidated; do not assume they are interchangeable.

## Contracts

### `languages.ts`

- `type EnglishVariant = { label: string; primary: string; alternates: string[] }`
  - `label`: human-readable display name.
  - `primary`: preferred BCP-47 language tag.
  - `alternates`: fallback tags, ordered by preference.
- `const ENGLISH_VARIANTS: Record<string, EnglishVariant>` — keyed by stable slug:
  `english-india`, `english-us`, `english-uk`, `english-au`, `english-ca`.
  Contract: the key is the stable identifier; `primary` is the tag to use first; `alternates` are fallbacks in priority order.

### `stt.constants.ts`

- `type SttProviderId = 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'natively'`
- `interface SttProviderConfig`:
  - `id`, `name`, `description` — identity/display.
  - `endpoint` — REST/WebSocket URL; empty string means the provider does not use a plain HTTP endpoint (Google uses gRPC; `natively` uses the managed AnswerCue API).
  - `model` — default model id; empty when not applicable.
  - `availableModels?` — selectable models for the user.
  - `uploadType?` — `'multipart'` (FormData), `'binary'` (raw body), `'websocket'` (streaming). Absent ⇒ no upload path (e.g. Google gRPC).
  - `authHeader: (apiKey: string) => Record<string, string>` — builds auth headers from the user's API key.
  - `responseContentPath` — dot-path into the JSON response where the transcript text lives (e.g. `'text'`, `'DisplayText'`, `'channel.alternatives[0].transcript'`). Empty when not applicable.
  - `extraFormFields?` — extra multipart form fields.
- `const STT_PROVIDERS: Record<SttProviderId, SttProviderConfig>` — the full registry (8 providers).
- `const STT_PROVIDER_OPTIONS = Object.values(STT_PROVIDERS)` — array form for UI iteration.
- `const DEFAULT_STT_PROVIDER: SttProviderId = 'google'` — fallback provider when none configured.

### `urls.ts`

- `const CHECKOUT_URLS` (`as const`) — keys: `pro`, `apiStandard`, `apiPro`, `apiMax`, `apiUltra`.
  Note: `pro` and `apiPro` currently point to the **same** Dodo Payments link (`pdt_0NcM6Aw0IWdspbsgUeCLA`) — likely a copy-paste duplication; verify before relying on distinct tiers.

## Flow

No runtime flow. These are static data modules consumed at import time; data flows one-way outward to consumers. The only internal derivation is `STT_PROVIDER_OPTIONS` (array projection of `STT_PROVIDERS`).

## Integration

- **Alias wiring**: `@config/*` → `./src/config/*` is registered in both `vite.config.mts` (line 17) and `tsconfig.json` (line 20), alongside `@/*` and `@hooks/*`.
- **Consumers**: **none in the current repo.** A repo-wide search finds no import of `@config/...`, `src/config/...`, `STT_PROVIDERS`, `ENGLISH_VARIANTS`, or `CHECKOUT_URLS` outside this folder. The folder is wired up but currently dead code / pending wiring.
- **Intended consumers** (by content): renderer UI for STT provider selection (`STT_PROVIDER_OPTIONS`), language selection (`ENGLISH_VARIANTS`), and checkout/paywall links (`CHECKOUT_URLS`).
- **Related but separate**: `electron/config/languages.ts` is the actively-used electron-side language module (consumed by `electron/ipcHandlers.ts` and the `electron/audio/*` STT implementations). It has a different shape and must not be confused with this folder's `languages.ts`.