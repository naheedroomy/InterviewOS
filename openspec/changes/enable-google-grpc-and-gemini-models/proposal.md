## Why

AnswerCue's existing gRPC integration for Google Cloud Speech-to-Text is dormant and inaccessible, offering users no cloud STT alternative to the local Moonshine Base engine. Separately, Gemini model discovery is artificially restricted to three hardcoded IDs, hiding most available models from users. Both gaps reduce utility for users who bring their own Google Cloud credentials.

## What Changes

- Restore Google Cloud Speech-to-Text gRPC as an optional pre-interview STT provider alongside the fixed default Moonshine Base.
- UI shows only two choices: **Moonshine Base** (internal ID `local-whisper`) and **Google Cloud** (internal ID `google`).
- Add a file-picker widget to select/persist an external Google service-account JSON path using the existing Natively-style picker.
- Block interview start when Google is selected with no saved service-account path. Never silently fall back to another cloud provider.
- Provider selection is pre-interview only; no mid-interview switching allowed.
- Unknown or legacy provider values normalize to Moonshine Base.
- Skip Moonshine preload when Google is selected.
- Forward-port Natively's byte-exact all-zero PCM frame drop to avoid Google STT hallucinations.
- Exclude other dormant STT providers, credential storage redesign, and diagnostic PCM dumping.
- Fix Gemini model discovery: fetch all pages from the v1beta models endpoint via `nextPageToken`, filter to models that support `generateContent`, and present the full list (stable, preview, latest aliases, experimental) to the user.
- Remove the current post-filter that restricts to three hardcoded IDs.
- Filter solely by `supportedGenerationMethods.includes('generateContent')` — no name-based or family-based exclusion lists are applied.
- Retain the curated hardcoded IDs only as fallback defaults when the dynamic discovery request sequence throws (network error, auth failure). Successful discovery with zero `generateContent` models yields an empty list — no fallback.
- Availability remains key/project/tier-specific. Connection-test success does not reduce the list.

## Capabilities

### New Capabilities

- `google-stt-provider`: Optional Google Cloud Speech-to-Text gRPC integration for pre-interview STT selection, service-account credential picker, and interview-start gating.
- `gemini-model-discovery`: Dynamic Gemini model enumeration from the v1beta endpoint, full-page token traversal, `generateContent` filtering, and fallback to curated defaults.

### Modified Capabilities

(None — no existing specs to modify; these are new capabilities.)

## Impact

- **Code**: `src/utils/modelUtils.ts` — replace hardcoded model filter with paginated dynamic discovery and `generateContent`-based filtering.
- **Code**: gRPC STT integration files — restore and adapt dormant Google Cloud Speech-to-Text code paths; add provider selection, credential picker, interview gating, and Moonshine preload skip.
- **UI**: Settings/pre-interview STT selector; service-account file picker (Natively-style); interview-start validation for Google path presence.
- **Dependencies**: `@google-cloud/speech` gRPC client, protobuf definitions, service-account auth.
- **Data**: Persisted provider selection (`local-whisper` or `google`) and optional service-account JSON path.
