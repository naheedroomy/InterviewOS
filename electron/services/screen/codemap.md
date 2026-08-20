# electron/services/screen/

## Responsibility

This folder owns AnswerCue's **screen-understanding / image-processing** pipeline: turning a screenshot (or provided image) into structured context the answer engine can use during a live interview.

The pipeline is **vision-first**. A screenshot is captured or supplied, optimized for a vision-capable LLM provider, sent through an ordered fallback chain of configured providers, and the model's output is classified into a `ScreenUnderstandingResult` (screen type, visible summary, extracted text, code blocks, tables, errors, detected task).

Key responsibilities:
- **Capture / resolve** image paths (with optional on-demand screenshot capture).
- **Validate** image paths (defense-in-depth; IPC layer also validates).
- **Hash** images for change detection / caching / dedupe.
- **Optimize** images (resize, re-encode, strip metadata, enforce byte caps) for provider payloads.
- **Route** through a vision-provider fallback chain with per-provider timeouts, scope/privacy enforcement, and redacted telemetry.
- **Prompt** the model with anti-injection, vision-first templates.
- **Classify** raw model output into a typed, structured result.

**Legacy OCR is runtime-disabled** (2026-05-17). The old OCR modules (`OcrProvider`, `OcrProviderManager`, `ScreenContextService`) are retained only for tests and a possible future opt-in OCR-only mode. They are NOT called from any runtime path.

## Design

- **Vision-first, no OCR in the default path.** `ScreenUnderstandingService` routes images through `VisionProviderFallbackChain`, never through the legacy OCR manager. Modes are `vision_first` / `vision_only` / `private_vision` (replacing the old `auto` / `ocr_only` / `private`).
- **Decoupled provider invocation.** The chain (`VisionProviderFallbackChain`) declares a thin `VisionProviderConfig` contract with an `invoke` function. Production wiring (`VisionProviderRegistry`) supplies LLMHelper-backed adapters; tests inject fake providers without booting the LLM stack. LLMHelper is lazy-imported / accessed via a global accessor (`__nativelyGetLLMHelper`) so the registry stays testable.
- **Single source of truth for image optimization.** `ImageOptimizer` centralizes provider-ready sizing/quality. Profiles (`fast`/`balanced`/`technical`/`best`) bound the long edge and quality; provider hints tweak format. A hard `maxBytes` cap (default 3.5 MB) with quality-dial-down retries prevents blowing provider body limits. In-memory cache keyed by `hash|profile|provider|...` avoids re-encoding the same screenshot in a session.
- **Perceptual hashing.** `ImageHashService` computes a 16×16 grayscale average hash for change detection/dedupe, plus a fast MD5-of-first-8KB `quickHash` fallback.
- **Safe fallback semantics.** First non-empty provider output wins. Providers are skipped (not failed) for `not_configured`, `no_vision`, `scope_blocked`, `privacy_blocked`. Errors are classified into redacted buckets (`timeout`, `rate_limited`, `auth_error`, `network`, `provider_error`, `no_vision`, `invalid_payload`, `unknown`) — no paths, base64, or prompt bodies are logged.
- **Anti-injection prompts.** `visionPrompts.ts` templates all instruct the model to treat screenshot text as untrusted content and never follow on-screen instructions. No OCR mention — the model sees the actual image.
- **PromptAssembler compatibility.** `ScreenUnderstandingResult` carries legacy keys (`ocrText`, `imagePath`, `hash`, `timestamp`) and a `source_kind: 'vision'` marker so existing callers keep working without a sweeping rename.

## Flow

```
ScreenUnderstandingRequest
  → ScreenUnderstandingService.understand()
      → scope gate (allowScreenshots === false → unavailable 'scope_blocked')
      → resolve image paths (capture via ScreenshotHelper if captureIfMissing)
      → validateImagePath() per path (curlUtils)
      → ImageHashService.computeHash() (fallback quickHash)
      → cache lookup (same hash within 5 min → reuse lastResult)
      → buildVisionProviders() (VisionProviderRegistry) — order depends on mode
      → pickOptimizationProfile() (fast/balanced/technical/best)
      → buildVisionPrompts() (visionPrompts.ts) → systemPrompt + userPrompt
      → runVisionFallback() (VisionProviderFallbackChain)
          → for each provider in order:
              skip if not_configured / no_vision / scope_blocked / privacy_blocked
              ImageOptimizer.optimize() (per provider hint, cached)
              provider.invoke() with AbortController timeout (default 12s)
              first non-empty string output wins → return
          → else failureReason: all_vision_failed / privacy_blocked / scope_blocked / no_vision_provider
      → assembleResult(): extractStructured() (JSON or regex) → classifyScreenType()
          → detectTask() → ScreenUnderstandingResult
```

Provider order (`vision_first` / `vision_only`): AnswerCue API → OpenAI → Gemini Flash → Claude → Gemini Pro → Groq Llama-4-Scout → Ollama (local) → Codex CLI → Custom. `private_vision` allows only local providers (Ollama, Codex, local-only Custom).

## Integration

- **`ScreenshotHelper`** (`../../ScreenshotHelper`): captures screenshots (`takeScreenshot`, `takeSelectiveScreenshot`) when `captureIfMissing` is set.
- **`curlUtils.validateImagePath`**: path validation used as defense-in-depth.
- **`CredentialsManager`** (`../CredentialsManager`): supplies API keys / runtime config (Ollama base URL + model, Codex CLI path, custom providers) to `VisionProviderRegistry`.
- **`LLMHelper`** (owned by `main.ts`, exposed via global `__nativelyGetLLMHelper`): executes cloud vision requests through `runVisionRequest` (auth, retries, payload shape centralized). Ollama is called directly via its OpenAI-compatible `/v1/chat/completions` endpoint with an image data URL.
- **`main.ts`**: owns the LLMHelper instance and sets the active custom provider (`switchToCustom`); wires the global accessor the registry reads.
- **`SettingsManager`**: defines the screen-understanding modes (`vision_first` / `vision_only` / `private_vision`) and provider data-scope policy.
- **`PromptAssembler`** (consumer): reads `ScreenUnderstandingResult` (including legacy `ocrText`/`imagePath` keys) to fold screen context into answers.
- **IPC layer**: validates image paths before they reach this service.
- **Tests**: inject fake providers via `request.providerPolicy.__providersOverride` and custom `ImageOptimizer` instances; legacy OCR tests still exercise `OcrProvider` / `OcrProviderManager` / `ScreenContextService` contracts.
