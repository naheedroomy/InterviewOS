## 1. STT Persistence, Migration, and Truthful IPC

- [x] 1.1 Add one-time migration in `CredentialsManager.init()` that rewrites any `sttProvider` value other than `'google'` or `'local-whisper'` to `'local-whisper'` and persists the corrected value.
- [x] 1.2 Update `CredentialsManager.getSttProvider()` to return the stored value (`'google'` or `'local-whisper'`) instead of unconditionally returning `'local-whisper'`.
- [x] 1.3 Update `CredentialsManager.setSttProvider()` to reject values outside `['google', 'local-whisper']` and persist the valid value.
- [x] 1.4 Replace the hardcoded `sttProvider: 'local-whisper'` in the `get-stored-credentials` IPC handler with the actual normalized value from `CredentialsManager.getSttProvider()`.

#### Verification

- [ ] 1.5 Verify that a legacy persisted value (e.g. `'natively'`, `'groq'`) normalizes to `'local-whisper'` after `init()` and that the IPC returns the corrected value.
- [ ] 1.6 Verify that a valid persisted `'google'` survives `init()` unchanged.

## 2. Pre-interview Settings UI and Readiness Gating

- [x] 2.1 In `SettingsOverlay`, replace the `{false && (` guard (line ~2314) with a visible two-option STT provider section using the existing `ProviderSelect` component filtered to exactly `[{id:'local-whisper', label:'Moonshine Base'}, {id:'google', label:'Google Cloud Speech-to-Text'}]`.
- [x] 2.2 Preserve the existing Google service-account file-picker widget (visible only when `sttProvider === 'google'`) and confirm it uses the Natively-style external path dialog without custom JSON validation.
- [x] 2.3 Remove from rendered DOM the Groq model selector, API key inputs, test-connection buttons, and custom URL fields for all other STT providers (they remain in source behind the original `{false && …}` guard).
- [x] 2.4 Add a `fileExists` IPC handler (main process) that uses `fs.accessSync` or `fs.promises.access` to check whether a given absolute path points to an existing file, and returns a boolean.
- [x] 2.5 Enhance `Launcher.tsx`'s `hasConfiguredStt()`: when `sttProvider === 'google'`, return `true` only if `googleServiceAccountPath` is non-empty AND the new `fileExists` IPC returns `true`. Otherwise set `sttReady: false` with hint `"Select a service-account JSON in Settings"`.
- [ ] 2.6 Verify that the Start Interview button is disabled when Google is selected with no saved path, and enabled once a valid path is saved.

#### Verification

- [x] 2.7 Verify the STT selector shows exactly two options (not three, not four).
- [x] 2.8 Verify the service-account picker appears only when Google is selected.
- [ ] 2.9 Verify the Start Interview button is gated as specified.

## 3. GoogleSTT Factory, Lifecycle, and Credential Wiring

- [x] 3.1 In `createSTTProvider` (or equivalent factory), add a switch on `CredentialsManager.getInstance().getSttProvider()`:
      - `'local-whisper'` → `new LocalWhisperSTT(DEFAULT_LOCAL_TRANSCRIPTION_MODEL_ID)` (existing path).
      - `'google'` → `new GoogleSTT(speaker)` and call `.setCredentials(keyPath)` when `googleServiceAccountPath` is available.
- [x] 3.2 Wire identical `'transcript'` and `'error'` event listeners for both provider instances.
- [x] 3.3 Verify that the existing Moonshine preload skip in `main.ts` (lines ~595-614) checks `CredentialsManager.getInstance().getSttProvider() === 'local-whisper'` and therefore naturally skips preload when Google is selected.
- [x] 3.4 Confirm that `GoogleSTT`'s existing gRPC permanent-failure handling (codes 3/7/16 → `isFatalError = true`, code 11 → swallowed idle timeout) requires no changes.

#### Verification

- [ ] 3.5 Start an interview with Google selected and valid credentials — confirm gRPC `StreamingRecognize` streams are opened for both interviewer and user channels.
- [ ] 3.6 End an interview with Google active — confirm trailing finals are flushed before stream closure.
- [ ] 3.7 Start an interview with Moonshine selected — confirm `LocalWhisperSTT` is used and Moonshine model is preloaded.

## 4. PCM Zero-Frame Guard Verification

- [x] 4.1 Trace the per-channel PCM peak-to-peak detector in `wireSystemCapture` and `wireMicCapture` to confirm it fires before `this.googleSTT?.write()` (no new code needed).
- [x] 4.2 Verify the zero-frame guard drops byte-exact all-zero chunks for both `local-whisper` and `google` providers (zero-frame → dropped; non-zero → forwarded).

## 5. Gemini Paginated Discovery and Filtering

- [x] 5.1 Replace the single `GET /v1beta/models?key=...` call in `fetchGeminiModels()` with a paginated loop:
      - Use `pageSize=100` (max).
      - Collect all `models[]` entries across pages.
      - Follow `nextPageToken` until absent or 10-page cap is reached.
- [x] 5.2 Preserve the existing `m.supportedGenerationMethods?.includes('generateContent')` filter as the primary capability gate.
- [x] 5.3 Remove the `gemini-([3-9]|2\.5)` version-gating regex from the exclude list.
- [x] 5.4 Remove all hardcoded name-based exclusion patterns and the version-gating regex. The sole model filter is `m.supportedGenerationMethods?.includes('generateContent')`.
- [x] 5.5 Deduplicate the accumulated model list by model `name` (the API's canonical identifier, e.g. `"models/gemini-2.0-flash"`), keeping the first occurrence.
- [x] 5.6 Sort the deduplicated list by `name` using `localeCompare`.
- [x] 5.7 If the paginated request sequence throws (network error, auth failure, non-JSON response), return a `FALLBACK_GEMINI_MODELS` array with the three hardcoded IDs (`gemini-3.5-flash`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-pro-preview`). If the sequence completes successfully (even with zero models passing the filter), do NOT use the fallback — yield the filtered list as-is.

#### Verification

- [ ] 5.8 Unit-test the pagination loop with mocked multi-page responses (including empty pages and missing `nextPageToken`).
- [ ] 5.9 Unit-test that the `generateContent` gate excludes embedding/TTS/AQA-only models.
- [ ] 5.10 Unit-test that the version regex removal admits preview and experimental aliases.
- [ ] 5.11 Unit-test deduplication and sort.
- [ ] 5.12 Unit-test that fallback is returned only on total failure (not on zero filtered results).

## 6. Remove Hardcoded Allowlist Intersection While Retaining Fallback Defaults

- [x] 6.1 Remove the hardcoded `STANDARD_CLOUD_MODELS.gemini.ids` array (`['gemini-3.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview']`).
- [x] 6.2 Modify `AIProvidersSettings.defaultModelOptions` to use the dynamically discovered models (via `fetchGeminiModels()` or a `fetchedModels` cache) instead of iterating `STANDARD_CLOUD_MODELS[provider].ids`.
- [x] 6.3 Update `isAllowedStandardCloudModel` to accept any dynamically discovered model ID instead of checking against the hardcoded allowlist.
- [x] 6.4 Confirm that the fallback array in `fetchGeminiModels()` is the only picker/discovery fallback list containing the three curated IDs, and is used exclusively when dynamic discovery fails.

#### Verification

- [ ] 6.5 Unit-test that a model discovered via API but not in the old allowlist appears in the picker.
- [ ] 6.6 Unit-test that the old allowlist removal does not cause regressions when discovery succeeds.

## 7. Selection Reconciliation

- [x] 7.1 In `ProviderCard.handleFetchModels()` and the `AIProvidersSettings` model list builder, after populating the discovered model list: if `geminiPreferredModel` is not in the list, auto-select the first available discovered model and call `setProviderPreferredModel` to persist.
- [x] 7.2 Add a `console.warn` when the stale-model fallback fires (to aid support diagnostics).
- [x] 7.3 Verify the existing stale-model fallback code (design D12, lines ~104-114 in `ProviderCard`) already handles this — confirm no extra code needed beyond ensuring the model list is complete.

#### Verification

- [ ] 7.4 Unit-test stale-selected-model fallback: if user's `geminiPreferredModel` is absent from the current list, the first discovered model is selected and persisted.
- [ ] 7.5 Unit-test that when stale fallback fires, a `console.warn` is emitted.

## 8. Focused Tests

- [ ] 8.1 Unit-tests for STT persistence/migration: normalize legacy values, reject invalid `setSttProvider` calls, verify IPC returns truthful value.
- [ ] 8.2 Unit-tests for Google STT factory: correct instantiation of `GoogleSTT` vs `LocalWhisperSTT` based on provider, credential path passed correctly.
- [ ] 8.3 Unit-tests for Gemini discovery pagination and filtering (overlaps with section 5 verification tasks — ensure coverage is in the test suite, not just manual).
- [ ] 8.4 Unit-tests for allowlist removal: dynamic discovery results used, fallback only on total failure.
- [ ] 8.5 Integration/manual test: Select Google STT, pick service account, verify interview starts with gRPC streaming. Select Moonshine, verify local model works.
- [ ] 8.6 Integration/manual test: Verify Gemini fetch returns all models (not just three). Verify unsupported legacy STT values normalize to `local-whisper` on upgrade.
