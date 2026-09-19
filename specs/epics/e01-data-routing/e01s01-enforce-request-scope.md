# Story e01s01 — Enforce Every Outbound Request Scope

## 1. Story ID
`e01s01`

## 2. Title
Enforce every outbound request scope.

## 3. Status
Planned — implementation and verification pending.

## 4. Type
Security/privacy bug fix.

## 5. Risk
P0 — a provider policy can be bypassed when sensitive context is supplied under a caller-owned scope that a legacy dispatch path drops before routing.

## 6. Context
`electron/LLMHelper.ts` owns construction and routing of text, image, and context payloads sent to configured AI providers. The configured `ProviderDataScopePolicy` must be evaluated against the union of every data category in the actual outbound payload before any cloud provider is selected. The modern `streamChat` path already accepts `extraDataScopes`; the legacy Gemini-shaped entry points reconstruct scope data and cannot retain caller-owned scopes.

## 7. Objective
Make scope classification complete and stable across modern and legacy text/image dispatch paths, then prove denied auxiliary data cannot reach cloud routing and sensitive content is not emitted by the affected diagnostic log.

## 8. In Scope
- `electron/LLMHelper.ts` scope-union derivation and legacy `chatWithGemini` / `streamChatWithGemini` dispatch contracts.
- Provider-policy routing and omission decisions that consume those derived scopes.
- The `WhatToAnswerLLM` raw-input diagnostic that currently records prompt content.
- Focused regression coverage in `electron/services/__tests__/LLMHelperScopePropagation.test.mjs`, with existing router tests retained.

## 9. Module Purpose
- `electron/LLMHelper.ts`: builds provider payloads, determines permitted routing, performs cloud/local dispatch, and applies provider scope policy.
- `electron/llm/ProviderRouter.ts`: defines scope policy types and turns a denied scope set into route availability; it is not redesigned by this story.

## 10. Callers
- `electron/ipcHandlers.ts` calls `LLMHelper.chatWithGemini` for non-streaming renderer requests.
- `electron/rag/RAGManager.ts` calls `LLMHelper.streamChatWithGemini` with its existing positional arguments.
- `electron/llm/WhatToAnswerLLM.ts` calls `LLMHelper.streamChat(..., packetScopes, abortSignal)` for profile-history-bearing assistance requests.
- `electron/MeetingPersistence.ts` calls `LLMHelper.streamChat` with `post_call_summary` scope.

## 11. Contracts
1. A non-empty outbound text payload has `transcript` scope, independent of supplemental scopes.
2. A text payload with images has the union of `transcript`, `screenshots`, and any caller/inferred context scopes.
3. Caller-supplied scopes augment inferred scopes; they never suppress or replace payload-derived scopes.
4. Existing positional callers of legacy entry points remain valid; any new scope parameter is optional and trailing.
5. If any cloud scope is denied, Ollama receives the complete payload when available; otherwise the corresponding cloud context/image is omitted before provider execution.
6. Scope-policy routing remains in `ProviderRouter`; this story does not change provider selection order or the policy storage schema.
7. Diagnostic logs in the affected flow retain only operational metadata, never raw prompt or user-message content.

## 12. Requirement Delta

#### MODIFIED: Outbound request data-scope enforcement
**Before:** `scopesForPayload()` adds `transcript` only when `extraScopes.length === 0`, and legacy Gemini-shaped entry points reconstruct scope sets without an optional caller-owned scope argument. A mixed payload can consequently lose an auxiliary scope before cloud routing.

**After:** scope derivation always unions text, image, inferred context, and explicit caller scopes. Legacy entry points accept and merge optional trailing scopes before policy routing, so denied scopes route to Ollama or omit cloud-bound content.

#### MODIFIED: Prompt diagnostics
**Before:** `electron/llm/WhatToAnswerLLM.ts` logs raw `systemPrompt` and `userMessage` in `[WhatToAnswerRaw] input`.

**After:** the diagnostic retains only non-sensitive metadata (for example, configured lengths/flags) and does not log prompt content.

## 13. Implementation Approach
Use the existing `LLMHelper` boundary rather than creating a new router abstraction. Update `scopesForPayload()` to build a `Set` union. Add optional trailing `extraDataScopes` parameters to `chatWithGemini` and `streamChatWithGemini`; merge these with the existing context classification before calling `getDeniedOutboundScopes()` and the existing fallback behavior. This keeps the established provider-router contract and avoids a premature new abstraction.

**New abstraction:** none. **Reason for Depth:** not applicable; this plan deliberately keeps scope policy at the existing `LLMHelper` boundary.

**External packages:** none.

## 14. Implementation Steps
1. Add focused regression cases that model transcript-only, screenshot-only, mixed transcript-plus-auxiliary scopes, profile-history denial, post-call-summary denial, and local-fallback/omission behavior → verify: `npm run build:electron && node --test electron/services/__tests__/LLMHelperScopePropagation.test.mjs`
2. Make `LLMHelper.scopesForPayload()` return the canonical union of non-empty text, image paths, inferred context, and explicit scopes; add optional trailing scope parameters to both legacy dispatch entry points and merge them before policy evaluation → verify: `npm run build:electron && node --test electron/services/__tests__/LLMHelperScopePropagation.test.mjs`
3. Remove raw prompt content from the affected WhatToAnswer diagnostic, confirm no denied mixed payload can be selected for a cloud route, and run the focused policy regression suite with the existing router/fallback tests → verify: `npm run build:electron && node --test electron/services/__tests__/LLMHelperScopePropagation.test.mjs electron/llm/__tests__/ProviderRouter.test.mjs electron/services/__tests__/ScopeLocalFallback.test.mjs`

## 15. Test Plan
- Use the compiled `ProviderRouter` in runtime assertions to prove a canonical mixed scope set disables cloud attempts and retains Ollama.
- Use source-contract assertions for the private `LLMHelper` boundary: mandatory transcript union, optional trailing legacy parameters, merged scopes reaching denial/fallback checks, and no raw WhatToAnswer prompt logging.
- Cover both an unmarked `profile_history` context and `post_call_summary` scope to prove caller-owned scope does not rely on text-marker inference.
- Preserve existing `ProviderRouter.test.mjs` and `ScopeLocalFallback.test.mjs` coverage as regression guards.

## 16. Observable Outcomes
- A mixed request is classified with every data category it contains.
- Cloud candidates are disabled when a mixed request contains a denied scope.
- Ollama remains selectable for denied scopes when available; no-cloud fallback removes denied context/images when it is not.
- No affected diagnostic line serializes the user message or system prompt.

## 17. Acceptance Criteria
- [ ] A non-empty text payload gets `transcript` even with `profile_history`, `reference_files`, or `post_call_summary` extras.
- [ ] Image paths independently add `screenshots` to a mixed scope union.
- [ ] Both legacy Gemini-shaped entry points accept optional trailing explicit scopes without breaking current callers.
- [ ] Explicit scopes are merged before denial and fallback selection.
- [ ] `profile_history` and `post_call_summary` denial prevent cloud routing for payloads whose text has no recognizable scope marker.
- [ ] Screenshot denial prevents cloud image routing independently of text/context handling.
- [ ] `[WhatToAnswerRaw] input` no longer logs raw prompt content.
- [ ] The focused suite, router suite, and local-fallback suite pass after `npm run build:electron`.

## 18. Verification Script
1. Run `npm run build:electron`.
2. Run `node --test electron/services/__tests__/LLMHelperScopePropagation.test.mjs`.
3. Run `node --test electron/llm/__tests__/ProviderRouter.test.mjs electron/services/__tests__/ScopeLocalFallback.test.mjs`.
4. In Settings, deny Profile history for a cloud provider while Ollama is configured; invoke What To Answer with custom notes and confirm it takes the local fallback path rather than sending the context to cloud.
5. Repeat with Ollama unavailable; confirm the cloud response is generated without the denied context and devtools/log output contains no raw prompt body.

## 19. Out of Scope
- Redesigning `ProviderRouter`, changing policy storage/UI, or changing provider priority.
- General logging cleanup outside the affected WhatToAnswer raw-prompt diagnostic.
- Embedding-scope routing, meeting persistence deletion, consent, or renderer isolation work planned in later stories.

## 20. Risks and Mitigations
- **Positional API compatibility:** append parameters only; retain existing defaults and validate current callers by compiling.
- **False confidence from source tests:** pair source-contract checks with compiled `ProviderRouter` runtime policy assertions.
- **Over-redaction:** remove only raw diagnostic content, preserving lengths/flags needed for operational debugging.
- **Cloud-context omission:** retain the established Ollama-first fallback and existing omission behavior rather than changing routing semantics.
