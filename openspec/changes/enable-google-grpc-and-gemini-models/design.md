## Context

AnswerCue currently hard-forces every STT provider path to Moonshine Base (`local-whisper`) at three independent enforcement points — `CredentialsManager.getSttProvider()`, `CredentialsManager.setSttProvider()`, and the `get-stored-credentials` IPC handler — while the SettingsOverlay's full STT provider selector is hidden behind `{false && …}`. The Google Cloud Speech-to-Text gRPC client (`GoogleSTT`), its `select-service-account` IPC, and `updateGoogleCredentials()` are alive and wired, but unreachable from the UI. Meanwhile Gemini model discovery in `fetchGeminiModels()` hits `v1beta/models` but ignores pagination (`nextPageToken`), and the fetched results are discarded by the renderer's `STANDARD_CLOUD_MODELS` allowlist (three hardcoded IDs: `gemini-3.5-flash`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-pro-preview`). The `ProviderCard` for Gemini fetches discovered models but the `AIProvidersSettings` default-model selector only reads `STANDARD_CLOUD_MODELS.gemini.ids`, so discovered models never appear in the global default picker.

## Goals / Non-Goals

**Goals:**

- Expose exactly two STT choices pre-interview: **Moonshine Base** (`local-whisper`) and **Google Cloud Speech-to-Text** (`google`).
- Replace the hidden `{false && …}` STT section with a visible two-option selector and service-account file picker.
- Gate interview-start: when `google` is selected but no service-account path is saved, show a blocking warning and prevent the interview from launching.
- Skip Moonshine worker preload/warm when Google STT is selected.
- Normalize unknown/legacy persisted `sttProvider` values (e.g. `natively`, `groq`, `soniox`) to `local-whisper` on credential load with a single migration pass.
- Ensure byte-exact all-zero PCM chunks are dropped in `wireSystemCapture` and `wireMicCapture` before `this.googleSTT?.write()` for either provider; the separate peak-to-peak silence detector remains unchanged.
- Fix Gemini model discovery: full `v1beta/models?pageSize=...` pagination via `nextPageToken`, use `generateContent` as the sole capability gate, preserve exact API model names, return stable/preview/latest/experimental aliases as-is, and remove the post-fetch hardcoded three-ID allowlist.
- Curated defaults (`gemini-3.5-flash`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-pro-preview`) retained **only** as the fallback when the paginated request sequence throws. A successful empty discovery result remains empty.
- Deterministic deduplication and stable sort of discovered models (by display name, then ID).
- Cover stale-selected-model handling: if the user's `geminiPreferredModel` no longer exists in the discovered list, auto-select the first available model and persist.
- Scope: pre-interview provider selection only. No mid-interview reconfiguration.

**Non-Goals:**

- Re-enabling any dormant STT providers (Groq Whisper, OpenAI Whisper, Deepgram, ElevenLabs, Azure, IBM Watson, Soniox, AnswerCue Pro STT). These remain hidden.
- Custom JSON parse validation for the service-account file (Electron's `dialog.showOpenDialog` with JSON filter is sufficient; the file is consumed by `@google-cloud/speech` which handles parse errors).
- Mid-interview STT provider switching.
- Diagnostic PCM dumping.
- Credential storage redesign (the `StoredCredentials.sttProvider` union type already includes `'google'` and `'local-whisper'`).
- Gemini: custom model training, tuning, or deployment listing. Only `generateContent`-capable models from the public API.

## Decisions

### D1: Normalize unsupported legacy STT providers at credential load time

**Decision:** In `CredentialsManager.init()` (and/or `getStoredCredentials` IPC handler), add a one-time migration that checks `this.credentials.sttProvider`. If the value is anything other than `'google'` or `'local-whisper'` (including `undefined`, `'none'`, `'natively'`, `'groq'`, etc.), rewrite it to `'local-whisper'` and save. After migration, `getSttProvider()` and `setSttProvider()` also enforce the same two-value domain.

**Rationale:** Currently `getSttProvider()` force-returns `'local-whisper'` for every call but silently writes the forced value back to disk. This is confusing and loses signal about what the user originally selected. A single upfront migration is clearer and avoids silent mutation on every read. The IPC handler `get-stored-credentials` also hardcodes `sttProvider: 'local-whisper'` — that must be replaced with the actual normalized value.

### D2: Expose a two-option STT selector in SettingsOverlay (replace `{false && …}`)

**Decision:** Replace the existing `{false && (` block (line 2314) with a visible section that uses a stripped-down provider picker showing exactly two options:
- `local-whisper` → "Moonshine Base" (CPU icon, green)
- `google` → "Google Cloud Speech-to-Text" (Mic icon, blue)

**Rationale:** The full `ProviderSelect` component already supports this pattern; the same inline conditional rendering that shows the service-account picker for `sttProvider === 'google'` already exists (line 2376). The change is purely presentational — remove the `false &&` and filter the options array to two entries. Remove the Groq model selector, API key inputs, test-connection buttons, and the custom URL fields for all other providers from the rendered DOM (they remain in source, behind the `{false && …}` guard, for a future re-enable).

### D3: Interview-start gating via Launcher readiness

**Decision:** Enhance `Launcher.tsx`'s `hasConfiguredStt()` (line 203) so that when `sttProvider === 'google'`, it returns `true` only if `googleServiceAccountPath` is non-empty and points to an existing file (checked via a new `fileExists` IPC). If the path is missing, set `sttReady: false` with the hint `"Select a service-account JSON in Settings"`. The Start Interview button remains disabled until the gate passes.

**Rationale:** The Launcher already has a `SessionReadiness` model with `sttReady`/`sttHint` fields (line 87-100). `hasConfiguredStt()` already has a `case 'google': return !!creds?.googleServiceAccountPath` branch (line 206). The file-exists check prevents a stale path from silently failing at interview start.

### D4: Skip Moonshine preload when Google STT is selected

**Decision:** In the existing `setImmediate` preload block (main.ts line 595-614), the check `CredentialsManager.getInstance().getSttProvider() === 'local-whisper'` already bails when the provider is not local-whisper. After the D1 normalization this will naturally skip preload for `google`. No additional code needed — verify correctness.

### D5: GoogleSTT instantiation via createSTTProvider

**Decision:** Replace `createSTTProvider`'s unconditional `new LocalWhisperSTT()` with a switch on `CredentialsManager.getInstance().getSttProvider()`:
- `'local-whisper'` → `new LocalWhisperSTT(DEFAULT_LOCAL_TRANSCRIPTION_MODEL_ID)` (existing path)
- `'google'` → `new GoogleSTT(speaker)` and call `.setCredentials(keyPath)` if `googleServiceAccountPath` is available

Wire the same `'transcript'`, `'error'` event listeners for both. `GoogleSTT` already emits matching event shapes. Ensure `googleSTT` / `googleSTT_User` field names are used uniformly (they already are — the field is called `googleSTT` regardless of provider; this is technical debt, rename to `sttProviderInterviewer` / `sttProviderUser` is out of scope).

**Rationale:** `GoogleSTT` is already a drop-in `EventEmitter` with the same `write()`, `start()`, `stop()`, `finalize()`, `setSampleRate()`, `setRecognitionLanguage()` interface. The PCM zero-fill guard in `wireSystemCapture`/`wireMicCapture` fires before `.write()` so it works for both providers. No architectural change needed — only the factory logic.

### D6: Google gRPC permanent-failure handling stays as-is

**Decision:** `GoogleSTT` already classifies gRPC codes 3 (INVALID_ARGUMENT), 7 (PERMISSION_DENIED), 16 (UNAUTHENTICATED) as permanent and sets `isFatalError = true` to stop the reconnect loop (line 330-344). The idle-timeout code 11 is already swallowed (line 321-326). No changes needed.

### D7: Gemini model discovery — full v1beta pagination

**Decision:** Replace the single `GET /v1beta/models?key=...` call in `fetchGeminiModels()` with a paginated loop:
1. `GET /v1beta/models?pageSize=100&key=${apiKey}` (pageSize=100 is the max the API accepts).
2. Collect all `models[]` entries.
3. If `nextPageToken` is present in the response, append `&pageToken=${nextPageToken}` and repeat.
4. Cap at 10 pages (1000 models) — a safety stop, not expected to trigger.
5. Apply only the `generateContent` capability filter to the accumulated list and preserve each model's exact API `name`.

**Rationale:** The v1beta `models.list` endpoint returns at most 100 items per page. Without pagination, the function only sees the first page, which in practice contains Google's default set (often omitting preview/experimental aliases for the current project's enabled models). Full pagination ensures all available model versions are returned.

### D8: Gemini — `generateContent` capability gate

**Decision:** The existing check `m.supportedGenerationMethods?.includes('generateContent')` (line 195) is correct and must be preserved. Only models advertising `generateContent` in their `supportedGenerationMethods` array are chat-capable. Models that only support `embedContent`, `batchEmbedContents`, `generateAnswer` (AQA), `generateImages`, `listTunedModels`, etc. are excluded.

**Rationale:** The `generateContent` method is the canonical signal for text/chat interaction. Models that do not include it (embedding-only, TTS, AQA, Imagen) would fail at request time with a 400 error.

### D9: Gemini — filtering uses only the generateContent capability gate

**Decision:** Remove all name-based exclusion patterns and the version-gating regex. The single filter is `m.supportedGenerationMethods?.includes('generateContent')`. No model is excluded by name prefix, stability label, or family pattern — every model that passes the `generateContent` gate is included, including preview, experimental, latest, and stable aliases.

**Rationale:** The `generateContent` method is the canonical signal for text/chat interaction. Name, version, and family exclusion lists are redundant — the `generateContent` gate already excludes embedding, TTS, AQA, and image-generation-only models. Hardcoded exclusion lists also artificially restrict discovery, dropping valid preview, experimental, and future model aliases that don't match the curated patterns.

### D10: Gemini — remove the post-fetch three-ID allowlist

**Decision:** Delete the hardcoded allowlist in `STANDARD_CLOUD_MODELS.gemini.ids` (`['gemini-3.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview']`) and replace it with the dynamically discovered models. The `AIProvidersSettings.defaultModelOptions` builder (line 164) currently iterates `STANDARD_CLOUD_MODELS[provider].ids` — modify it to merge in dynamically fetched models via `geminiPreferredModel` or a new `fetchedModels` cache. The `ProviderCard` already stores fetched models in local state; expose them upward or re-fetch on mount.

**Alternative considered:** Keep the allowlist as an additional filter on top of discovery. Rejected because it defeats the purpose of dynamic discovery — users with different enabled models (e.g., private preview access) would still see only the three hardcoded IDs.

### D11: Gemini — curated fallback only on fetch failure/throw

**Decision:** If the paginated request sequence throws (network error, auth failure, non-JSON response), return the three hardcoded IDs as `ProviderModel[]` fallback. If the sequence completes successfully but zero models pass the `generateContent` filter, yield an empty list — do not fall back. Place the fallback array directly in `fetchGeminiModels()` as a `const FALLBACK_GEMINI_MODELS`.

### D12: Gemini — stale selected-model handling

**Decision:** In `ProviderCard.handleFetchModels()` (line 86) and the `AIProvidersSettings` model list builder, after populating the discovered model list: if `geminiPreferredModel` is not in the list, auto-select the first model and call `setProviderPreferredModel`. The existing code at line 104-114 already does this — confirmed no change needed beyond ensuring the model list is complete.

### D13: Gemini — deterministic deduplication and sort by canonical name

**Decision:** After collecting all pages and applying the `generateContent` filter, deduplicate by model `name` (the API's canonical identifier, e.g., `"models/gemini-2.0-flash"`), keeping the first occurrence. Then sort by `name` (locale-aware). The `name` field includes the `models/` prefix and is the stable identity across pages.

**Rationale:** Pages can overlap — the same model may appear on different pages depending on API state. The `name` field is the authoritative deduplication key. Sorting by `name` yields deterministic ordering consistent with the API's identity scheme. Using `id` (stripped prefix) or `label` (display name) risks duplicate entries or non-deterministic ordering when two model display names differ only by case or locale.

### D14: Gemini — no name-based exclusion beyond generateContent

**Decision:** Apply no name-based exclusion filters. The `supportedGenerationMethods?.includes('generateContent')` gate is the sole filter. Models whose `name` matches any prefix, family, or tier are included as long as they pass the capability gate. The API is the authoritative source of capability; if a model advertises `generateContent`, the system trusts that advertisement and does not second-guess it with hardcoded name patterns.

## Risks / Trade-offs

- **[Risk]** Google STT gRPC credentials broken after macOS sleep/credential expiry → The existing `isFatalError` guard on gRPC codes 3/7/16 stops the infinite reconnect loop; the user sees an STT failure banner and must re-select the service account in Settings. Mitigation: none needed — this matches the current behavior for all other providers.
- **[Risk]** User selects Google STT, picks a service account, then deletes/moves the JSON file → Interview-start gate (D3) performs a file-exists check, so the interview cannot start until a valid path is re-selected. If the file disappears mid-interview, the gRPC stream will fail with code 7 (PERMISSION_DENIED) or 16 (UNAUTHENTICATED), triggering `isFatalError` and a failure banner.
- **[Risk]** Gemini discovery pagination loops forever on a misbehaving API → Cap at 10 pages (safety stop). The API docs guarantee `nextPageToken` eventually disappears; a cap prevents runaway requests on a hypothetical bug.
- **[Risk]** Discovered Gemini model list grows very long (50+ models) → The scrollable dropdown in `ProviderCard` handles overflow with `max-h-60 overflow-y-auto`. The `AIProvidersSettings` default model selector also scrolls. No UI regression.
- **[Risk]** User's `geminiPreferredModel` is a model that was available yesterday but removed today → D12 auto-selects the first available model. The user sees a different model selected without warning. Mitigation: log a `console.warn` when this fallback fires so support can diagnose.
- **[Risk]** Service-account JSON parse failure → `@google-cloud/speech`'s `keyFilename` constructor handles JSON parse errors internally and throws. The try/catch in `createSTTProvider` catches this, sets the STT instance to null, and the Launcher shows a failure state. The user must re-select a valid file.

## Migration Plan

1. **CredentialsManager normalization** — Add one-time migration in `init()` that rewrites unsupported `sttProvider` values to `local-whisper`. Then update `getSttProvider()` to accept `'google'` and `'local-whisper'` only (remove the unconditional force). Update `setSttProvider()` the same way.
2. **IPC `get-stored-credentials`** — Remove the hardcoded `sttProvider: 'local-whisper'` and return the actual normalized value from `CredentialsManager`.
3. **SettingsOverlay** — Remove `false &&` guard; filter `ProviderSelect` options to `[local-whisper, google]`; preserve existing Google service-account picker UI; remove other provider's key inputs from render.
4. **`createSTTProvider`** — Add switch on provider to instantiate `GoogleSTT` when selected. Wire event listeners identically for both paths.
5. **Launcher `hasConfiguredStt`** — Add `googleServiceAccountPath` file-exists check for the `'google'` case. Wire `sttReady`/`sttHint` for the gating UI.
6. **Moonshine preload** — Already conditionally skipped — verify after D1 that `getSttProvider()` returns `'google'` when set, so the pre-skip works.
7. **`fetchGeminiModels`** — Add pagination loop, remove all name-based exclude patterns and the version regex, add dedup by `name`, keep `generateContent` as the sole filter, add fallback hardcoded array used only when the fetch throws.
8. **`STANDARD_CLOUD_MODELS.gemini`** — Remove `ids` array and replace with dynamic source. Update `AIProvidersSettings.defaultModelOptions` and `isAllowedStandardCloudModel` to accept dynamically fetched IDs.
9. **`ProviderCard`** — Verify `handleFetchModels` already handles stale-model fallback (confirmed at line 104-114).
10. **E2E verification** — Select Google STT, pick a service account, verify interview starts with gRPC streaming. Select Moonshine, verify local model works. Verify Gemini fetch returns all models (not just 3). Verify unsupported legacy STT values normalize to `local-whisper` on upgrade.

**Rollback:** Revert all changes in a single commit. The `{false && …}` guard can be restored to hide the STT section. The hardcoded Gemini allowlist is a one-line restore in `STANDARD_CLOUD_MODELS.gemini.ids`.

## Open Questions

1. Should the Google STT connection be tested with a lightweight gRPC `Recognize` (non-streaming) call at credential-save time, similar to the `testSttConnection` IPC for cloud STT providers? Currently `handleTestSttConnection` (line 1125) bails on `google` with an early return. The proposal does not require this, but it may improve UX. Defer to a follow-up.
2. `fileExists` IPC — should it be a generic `pathExists` utility, or should the renderer trust the saved path and let the gRPC constructor fail? The proposal implies fail-closed (gate at start), so a lightweight `accessSync` IPC is recommended. Lightweight.
