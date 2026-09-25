# Impact Assessment — e01s01 Enforce Every Outbound Request Scope

## Target

`electron/LLMHelper.ts` scope derivation at
`LLMHelper.scopesForPayload(text, imagePaths, extraScopes)` and the policy
boundary in `electron/llm/ProviderRouter.ts`.

## Purpose

`LLMHelper` assembles and sends interview-assistance requests to configured
LLM providers. Its outbound-scope boundary must identify every sensitive data
category in the actual request before provider policy permits routing.

## Dependents

- `electron/LLMHelper.ts`: `assertOutboundScopes()` delegates derived scopes to
  `assertProviderDataScopes()`.
- `electron/LLMHelper.ts`: `getDeniedOutboundScopes()` controls local fallback
  or context omission for streaming and generated-answer flows.
- `electron/LLMHelper.ts`: outbound routes include Gemini, Groq, OpenAI,
  Claude, DeepSeek, AnswerCue API, and custom providers.
- `electron/llm/ProviderRouter.ts`: `assertProviderDataScopes()` and
  `getDeniedDataScopes()` enforce the configured policy.
- `electron/llm/WhatToAnswerLLM.ts`: consumes `ProviderDataScope` in answer
  generation.
- `electron/rag/EmbeddingProviderResolver.ts`: independently uses the same
  policy type for cloud embedding routes.
- `electron/services/SettingsManager.ts`, `electron/ipcHandlers.ts`,
  `electron/preload.ts`, `src/types/electron.d.ts`, and
  `src/components/settings/AIProvidersSettings.tsx`: define and expose the
  user-configured provider data-scope policy.

## Contracts

1. A non-empty text payload is classified as `transcript`, even when it also
   includes reference-file, profile-history, or post-call-summary context.
2. Image paths add `screenshots` without removing any text-derived scope.
3. Explicit context scopes augment rather than replace payload-derived scopes.
4. A denied scope prevents cloud routing or causes the established local-fallback
   or context-omission behavior; no scope may be silently dropped.
5. The setting type remains `ProviderDataScopePolicy` and existing allowed or
   unset policies remain non-blocking.

## Affected Stories

- **e01s01 — Enforce every outbound request scope:** direct owner.
- **e02s01 — Finalize one authoritative meeting record:** preserves transcript
  lifecycle expectations but requires no code change for this story.
- **e05s01 — Delete the complete meeting footprint:** relies on accurate data
  classification but requires no code change for this story.
- **e07s01 — Run behavioral data-lifecycle tests by default:** will incorporate
  this story's regression suite into the default gate.

## Existing Test Coverage

- `electron/llm/__tests__/ProviderRouter.test.mjs`: runtime routing and policy
  behavior for the compiled provider router.
- `electron/services/__tests__/ProviderGatewayPolicy.test.mjs`: runtime router
  policy tests plus static checks that `LLMHelper` has outbound guards.
- `electron/services/__tests__/ScopeLocalFallback.test.mjs`: static checks for
  context-scope and local-fallback wiring.

### Gap

No runtime test proves that a mixed text-plus-context payload includes both
`transcript` and its explicit context scopes. The existing static checks could
pass while `scopesForPayload()` omits transcript whenever `extraScopes` exists.

## Risk: High

This is a shared security/privacy policy boundary with many outbound call sites,
and the defect can authorize sensitive transcript data for a provider the user
denied.

## Recommended Action

Keep the existing `LLMHelper` policy boundary: derive the union of text,
image, inferred context, and caller-owned scopes there, then preserve explicit
scopes through the legacy Gemini-shaped dispatch entry points before existing
denial/fallback routing. Cover the union with compiled `ProviderRouter` runtime
assertions and focused `LLMHelper` source-contract tests; retain allowed,
local-fallback, and screenshot behavior. No external package is proposed.
