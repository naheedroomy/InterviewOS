## ADDED Requirements

### Requirement: Gemini model discovery fetches all pages from the v1beta models endpoint

The system SHALL discover available Gemini models by making paginated requests to the `https://generativelanguage.googleapis.com/v1beta/models` endpoint. It SHALL follow `nextPageToken` in responses to request subsequent pages until no `nextPageToken` is returned, thereby collecting all models available for the current API key and project.

#### Scenario: Single-page discovery returns all models
- **WHEN** the v1beta models endpoint returns a single page of results with no `nextPageToken`
- **THEN** the system SHALL use exactly those returned models as the discovery result

#### Scenario: Multi-page discovery concatenates all pages
- **WHEN** the v1beta models endpoint returns a `nextPageToken` in the first response
- **THEN** the system SHALL issue subsequent requests with the received token and continue until no `nextPageToken` is returned, concatenating all model entries from all pages

#### Scenario: Empty page without nextPageToken produces empty list
- **WHEN** the v1beta models endpoint returns a page with zero model entries and no `nextPageToken`
- **THEN** the system SHALL produce an empty discovery result

### Requirement: Discovered models preserve exact IDs, deduplicate, and sort deterministically

The system SHALL preserve the exact model `name` value returned by the API (e.g., `"models/gemini-2.0-flash-lite"`). Duplicate model entries (same `name` appearing across pages) SHALL be deduplicated, keeping only the first occurrence. The final list SHALL be sorted lexicographically by the model `name` for deterministic ordering.

#### Scenario: Model names are preserved verbatim
- **WHEN** a model is returned with name `"models/gemini-2.0-flash"` from the API
- **THEN** the system SHALL include it as `"models/gemini-2.0-flash"` without transformation or truncation

#### Scenario: Duplicate model names are deduplicated
- **WHEN** the same model `name` appears on two different pages
- **THEN** the system SHALL include that model only once in the final list

#### Scenario: Final list is sorted lexicographically
- **WHEN** discovery returns models with names `"models/gemini-2.0-flash"`, `"models/gemini-1.5-pro"`, `"models/gemini-2.0-flash-lite"`
- **THEN** the system SHALL order them as `"models/gemini-1.5-pro"`, `"models/gemini-2.0-flash"`, `"models/gemini-2.0-flash-lite"`

### Requirement: Only models supporting generateContent are retained

The system SHALL filter discovered models to retain only those whose `supportedGenerationMethods` array includes `"generateContent"`. All other models SHALL be excluded, regardless of what other methods they support.

#### Scenario: Model with generateContent is retained
- **WHEN** a discovered model has `supportedGenerationMethods` containing `"generateContent"`
- **THEN** the system SHALL include that model in the final selection list

#### Scenario: Model without generateContent is excluded
- **WHEN** a discovered model has `supportedGenerationMethods` that does not include `"generateContent"`
- **THEN** the system SHALL exclude that model from the final selection list

#### Scenario: Model with generateContent alongside other methods is retained
- **WHEN** a discovered model supports both `"generateContent"` and `"embedContent"`
- **THEN** the system SHALL include that model (generateContent presence is sufficient)

### Requirement: The sole filter for Gemini models is the generateContent capability

The system SHALL filter discovered models to retain only those whose `supportedGenerationMethods` array includes `"generateContent"`. No additional name-based, family-based, version-based, or stability-based exclusion lists SHALL be applied. Models that do not include `generateContent` (e.g., embedding-only, TTS-only, AQA-only, image-generation-only) are naturally excluded by this single filter. The API is the authoritative source of capability.

#### Scenario: Embedding-only model is excluded
- **WHEN** a model's `supportedGenerationMethods` contains only `"embedContent"` and `"embedText"`
- **THEN** the system SHALL exclude that model

#### Scenario: Image-generation model without generateContent is excluded
- **WHEN** a model's `supportedGenerationMethods` contains only `"generateImages"`
- **THEN** the system SHALL exclude that model

### Requirement: Discovery results include all aliases the API returns for the key/project

The system SHALL include every model that passes the `generateContent` filter, regardless of its stability label. Models identified by the API as `stable`, `preview`, `latest`, or `experimental` SHALL all be included. The system SHALL NOT post-filter based on stability, alias, or naming convention. Model availability is inherently key/project/tier-specific, and the system SHALL present whatever the API returns.

#### Scenario: Stable and preview models both appear
- **WHEN** both `"models/gemini-2.0-flash"` (stable) and `"models/gemini-2.0-flash-preview"` (preview) are returned and support `generateContent`
- **THEN** the system SHALL include both in the selection list

#### Scenario: Experimental models are not excluded
- **WHEN** a model with `experimental` in its name (e.g., `"models/gemini-2.5-pro-exp-0827"`) passes the `generateContent` filter
- **THEN** the system SHALL include it in the selection list

#### Scenario: Discovery results vary per key/project
- **WHEN** two different API keys or projects are used
- **THEN** the system SHALL return different model lists reflecting what each key/project can access

### Requirement: Dynamic discovery does not intersect with a hardcoded allowlist

The system SHALL NOT apply any hardcoded allowlist or post-discovery intersection against a fixed set of model IDs. Every model that passes pagination and the `generateContent` filter SHALL be presented to the user exactly as discovered.

#### Scenario: No hardcoded allowlist filtering
- **WHEN** a model unknown to any hardcoded list passes the `generateContent` filter
- **THEN** the system SHALL include it in the results without additional filtering

### Requirement: Curated fallback is used only when dynamic discovery fails entirely

The system SHALL retain a curated hardcoded list of model IDs to use exclusively when dynamic discovery from the v1beta endpoint fails entirely (network error, unreachable endpoint, authentication failure, or unexpected non-JSON response). The curated list SHALL NOT be merged with or intersected against dynamic results; it SHALL be a complete standalone fallback. When dynamic discovery succeeds (even with zero models passing the filter), the curated list SHALL NOT be used.

#### Scenario: Discovery succeeds but returns zero usable models — fallback not used
- **WHEN** the API returns pages successfully but zero models pass the `generateContent` filter
- **THEN** the system SHALL present an empty model list and SHALL NOT fall back to the curated list

#### Scenario: Network error triggers curated fallback
- **WHEN** the v1beta endpoint is unreachable (network error)
- **THEN** the system SHALL use the curated hardcoded model list as the selection options

#### Scenario: Discovery API auth failure triggers curated fallback
- **WHEN** the API returns a 401 or 403 response
- **THEN** the system SHALL use the curated hardcoded model list as the selection options

#### Scenario: Curated list is a complete standalone fallback
- **WHEN** the curated fallback is active
- **THEN** the system SHALL present exactly the models in the curated list and SHALL NOT merge them with any partial discovery results

### Requirement: Previously selected model no longer returned is handled safely

If the user has previously selected a Gemini model that is no longer present in the current discovery results (e.g., deprecated, removed, or no longer available for the current key/project), the system SHALL fall back to a sensible default without crashing. The system SHALL NOT silently use the unavailable model.

#### Scenario: Previously selected model is absent from new discovery
- **WHEN** the user's previously selected model ID is not in the current discovery result
- **THEN** the system SHALL automatically select the first available model from the discovery list (or the curated fallback list if discovery failed) and SHALL NOT crash or hang
