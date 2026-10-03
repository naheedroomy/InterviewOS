# Specification: Modern AI Provider Registry, Model Discovery, and Multi-Endpoint Configuration

**Epic ID**: `e09`  
**Story ID**: `e09s01`  
**Initiative**: Phase 1 — Interview Performance & Intelligence  
**Status**: Proposed / Approved for Planning  
**Branch**: `feat/provider-model-configuration`  

---

## 1. Executive Summary

This specification establishes a robust, extensible provider architecture for InterviewOS. It aligns the desktop application with the active **2026 frontier model ecosystem** across four primary API providers (**Google Gemini, Anthropic Claude, OpenAI, DeepSeek**) and introduces first-class support for **multiple generic OpenAI-compatible endpoints** (such as OpenRouter, Together AI, local vLLM, LMStudio, and Ollama).

The default recommended model for real-time interview assistance is configured as **`gemini-3.8-flash`**, with full user-configurability in Settings.

---

## 2. 2026 Model Catalog & Roles

### 2.1 Google Gemini
Google's Gemini 3.x series delivers low-latency multimodal reasoning and native speech/vision grounding.
- **`gemini-3.8-flash`** (Default Recommended): Primary low-latency model for real-time live interview assistance. High throughput, low TTFT (<300ms), 1M token context.
- **`gemini-3.8-live`**: Native conversational audio/visual grounding for real-time interaction.
- **`gemini-3.5-flash`**: High-efficiency workhorse model for prep chat, recap, and summary.
- **`gemini-2.5-pro`**: Deep complex reasoning and multi-document synthesis fallback.

### 2.2 Anthropic Claude
Anthropic's Claude 5.x and 4.x models provide best-in-class code generation, system design analysis, and nuanced interview instruction following.
- **`claude-opus-5.5`**: Flagship frontier reasoning model for complex architectural tradeoffs and advanced system design questions.
- **`claude-sonnet-5`**: Balanced daily workhorse model for interview responses, code hints, and resume alignment.
- **`claude-haiku-4.5`**: Low-latency, cost-effective model for instant partial transcript analysis.
- *Compatible Fallbacks*: `claude-opus-4-8`, `claude-sonnet-4-6`.

### 2.3 OpenAI
OpenAI's GPT-6 and production alias infrastructure support multimodal vision and agentic coding workflows.
- **`gpt-6-astra`**: Flagship frontier multimodal intelligence for screen understanding and multi-modal interview questions.
- **`gpt-6-sol`**: Specialized coding and software engineering reasoning model.
- **`gpt-6-luna`**: High-speed, cost-sensitive efficiency model.
- **`chat-latest`**: OpenAI's official production alias pointing to the latest recommended chat snapshot.
- *Compatible Fallbacks*: `gpt-5.6-sol`, `gpt-4o`, `gpt-4o-mini`.

### 2.4 DeepSeek
DeepSeek's V4 series provides open-architecture efficiency, low inference cost, and native multimodal vision.
- **`deepseek-v4.1-flash`**: Native multimodal visual understanding with 552B total parameters and optimized KV cache.
- **`deepseek-v4-pro`**: 1.6T parameter (49B active) model with 1M context for comprehensive interview debriefs and deep reasoning.
- **`deepseek-v4-flash`**: High-throughput fast inference model.
- *Compatible Fallbacks*: `deepseek-chat`, `deepseek-reasoner`.

---

## 3. Generic OpenAI-Compatible Multi-Endpoint Architecture

Many developers and enterprise users use model aggregators (OpenRouter) or self-hosted local runtimes (vLLM, Ollama, LMStudio) that adhere to the OpenAI `/v1/chat/completions` and `/v1/models` specifications.

### 3.1 Endpoint Schema
The system must support **multiple user-defined OpenAI-compatible endpoints**, each containing:
```typescript
export interface OpenAICompatibleEndpoint {
    id: string;                      // Unique slug (e.g. 'openrouter', 'vllm-local-qwen')
    name: string;                    // User-facing label (e.g. 'OpenRouter DeepSeek', 'Local vLLM')
    baseUrl: string;                 // Base URL (e.g. 'https://openrouter.ai/api/v1', 'http://127.0.0.1:8000/v1')
    apiKey?: string;                 // Optional API key (required for cloud, optional for local)
    modelId: string;                 // Selected model identifier (e.g. 'anthropic/claude-3.5-sonnet')
    customHeaders?: Record<string, string>; // Optional headers (e.g. { 'HTTP-Referer': 'https://interviewos.dev' })
    supportsVision: boolean;         // Multimodal screenshot analysis flag
    isLocal: boolean;                // Auto-detected loopback (localhost / 127.0.0.1 / ::1) or user-flagged
    timeoutMs?: number;              // Request timeout (defaults to 30000ms)
    enabled: boolean;                // Active state toggle
}
```

### 3.2 Dynamic Discovery for Custom Endpoints
When a user provides a `baseUrl` and optional `apiKey`, InterviewOS can query `${baseUrl}/models` to fetch available models in real time, populating a dropdown for instant selection.

---

## 4. Subsystem Integration & Contracts

### 4.1 Dynamic Model Discovery (`electron/utils/modelFetcher.ts`)
- Update regexes and whitelist filters for each provider:
  - Gemini: Include `gemini-3.8-flash`, `gemini-3.8-live`, `gemini-3.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash`.
  - Claude: Include `claude-opus-5.5`, `claude-sonnet-5`, `claude-haiku-4.5`, `claude-opus-4-8`, `claude-sonnet-4-6`.
  - OpenAI: Include `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `chat-latest`, `gpt-4o`, `gpt-4o-mini`.
  - DeepSeek: Include `deepseek-v4.1-flash`, `deepseek-v4-pro`, `deepseek-v4-flash`, `deepseek-chat`, `deepseek-reasoner`.
  - Custom: Implement `fetchOpenAICompatibleModels(baseUrl, apiKey, customHeaders)`.
- Fallback matrix: If a network error or rate-limit prevents `/models` discovery, return the curated 2026 defaults instead of an empty list or breaking.

### 4.2 Credentials & Storage (`electron/services/CredentialsManager.ts`)
- Store API keys encrypted at rest via Electron's `safeStorage`.
- Maintain `customOpenAIEndpoints: OpenAICompatibleEndpoint[]`.
- Provide helper methods: `getOpenAICompatibleEndpoints()`, `saveOpenAICompatibleEndpoint()`, `deleteOpenAICompatibleEndpoint()`.
- Default model resolution: If no default model is set, default to `gemini-3.8-flash` if Gemini key exists, or the first configured provider's primary model.

### 4.3 Execution Routing (`electron/llm/ProviderRouter.ts` & `LLMHelper.ts`)
- Update `getDefaultModel(provider)`:
  - `gemini`: `gemini-3.8-flash`
  - `claude`: `claude-sonnet-5`
  - `openai`: `chat-latest` (or `gpt-6-luna`)
  - `deepseek`: `deepseek-v4.1-flash`
- Custom Provider Execution: Dispatch calls to generic endpoints via standard OpenAI Axios streaming client with streaming chunk parser.

### 4.4 Vision Gating (`electron/llm/visionStreamFallback.ts`)
- Update vision registry to mark `gemini-3.8-flash`, `gemini-3.8-live`, `gpt-6-astra`, `claude-opus-5.5`, `claude-sonnet-5`, and `deepseek-v4.1-flash` as vision-capable.
- Check custom endpoints' `supportsVision` boolean before allowing screenshot analysis requests.

---

## 5. Thinking & Reasoning Effort Control (2026 Standards)

In the 2026 frontier model ecosystem, static token budgets have been replaced by dynamic **thinking / reasoning effort controls**. Because InterviewOS is used in both **ultra-low-latency live interviews** and **deep post-interview preparation**, thinking effort must be explicitly managed rather than left to arbitrary provider defaults.

### 5.1 Provider API Parameters & Default Behaviors

| Provider | Parameter | Supported Values | Provider Default | InterviewOS Live Mode | InterviewOS Prep/Recap |
|---|---|---|---|---|---|
| **OpenAI** (GPT-6, GPT-5.6) | `reasoning_effort` | `'minimal'`, `'low'`, `'medium'`, `'high'`, `'xhigh'` | `'standard'` / `'medium'` | `'low'` | `'medium'` |
| **Anthropic** (Claude 5, Opus 5.5) | `effort` | `'low'`, `'medium'`, `'high'`, `'max'` | `'medium'` | `'low'` | `'medium'` |
| **Google Gemini** (Gemini 3.8) | `thinking_level` | `'low'`, `'medium'`, `'high'` | `'medium'` | `'low'` | `'medium'` |
| **DeepSeek** (V4.1, V4-Pro) | `reasoning_effort` + `thinking` | `'low'`, `'high'`, `'max'` | `'high'` | `'low'` | `'high'` |

### 5.2 InterviewOS Thinking Effort Policy
1. **Setting in `AppSettings`**:
   `thinkingEffort?: 'auto' | 'low' | 'medium' | 'high';` (Default: `'auto'`).
2. **Context-Aware Adaptive Behavior (`auto`)**:
   - **Live Interview Mode** (active audio transcription / live overlay): Resolves to `'low'`. Prevents 5–15 second reasoning delays, prioritizing instantaneous Time-to-First-Token (<500ms) for real-time interview cues.
   - **Prep / System Design / Post-Call Debrief**: Resolves to `'medium'` (or `'high'`), allowing deep architectural tradeoff analysis and thorough problem synthesis.
3. **User Override**:
   - Users can lock thinking effort to `'low'`, `'medium'`, or `'high'` globally in Settings if they prefer uniform behavior.

---

## 6. Security & Privacy Guardrails (Phase 0 Compliance)

1. **Token Masking Over IPC**: API keys returned to the settings renderer for custom endpoints must be masked (e.g. `sk-...abcd`) unless explicitly requested during an unlock operation.
2. **Loopback & Private Mode Detection**:
   - Endpoints pointing to `127.0.0.1`, `localhost`, `0.0.0.0`, or `::1` are marked `isLocal: true`.
   - In `local-only` privacy mode, cloud endpoints are blocked and only `isLocal: true` endpoints (Ollama / local vLLM) are reachable.
3. **SSRF Guard**: Custom endpoint URLs are validated to require valid HTTP/HTTPS protocols and valid hostnames.

---

## 6. Acceptance Criteria

- **AC-01 (Model Discovery)**: `fetchProviderModels` correctly discovers 2026 models for Gemini, Claude, OpenAI, and DeepSeek, and falls back to curated 2026 catalogs on network failure.
- **AC-02 (OpenAI-Compatible Custom Endpoints)**: Users can add, edit, test connection, list models, and delete multiple custom endpoints (e.g. OpenRouter, vLLM).
- **AC-03 (Configurable Default Model)**: The active model is user-configurable, defaulting to `gemini-3.8-flash` when Gemini is configured.
- **AC-04 (Multimodal & Streaming Dispatch)**: `LLMHelper` successfully streams text and vision requests to DeepSeek v4.1, Gemini 3.8, Claude 5/5.5, OpenAI GPT-6, and custom endpoints.
- **AC-05 (Quality Gates)**: All unit, integration, and packaged Electron smoke tests pass without regressions.
