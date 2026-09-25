/**
 * modelFetcher.ts - Dynamic Model Discovery
 * Fetches available models from AI provider APIs
 */

import axios from 'axios';

/**
 * Low-level HTTP GET signature injectable for pagination tests.
 * Production uses axios.get; tests supply a mock.
 */
export type HttpGet = (url: string, options?: { timeout?: number; headers?: Record<string, string> }) => Promise<{ data: any }>;

export interface ProviderModel {
    id: string;
    label: string;
}

type Provider = 'gemini' | 'groq' | 'openai' | 'claude' | 'deepseek';

export const ALLOWED_CLAUDE_MODELS = new Set([
    'claude-opus-5.5',
    'claude-opus-5',
    'claude-sonnet-5',
    'claude-haiku-4.5',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
]);

export const FALLBACK_CLAUDE_MODELS: ProviderModel[] = [
    { id: 'claude-opus-5.5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
];

export const FALLBACK_OPENAI_MODELS: ProviderModel[] = [
    { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: 'chat-latest', label: 'ChatGPT Latest' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

/**
 * Fetch available models from a provider's API.
 * Returns a filtered, sorted array of { id, label } objects.
 */
export async function fetchProviderModels(
    provider: Provider,
    apiKey: string
): Promise<ProviderModel[]> {
    switch (provider) {
        case 'openai':
            return fetchOpenAIModels(apiKey);
        case 'groq':
            return fetchGroqModels(apiKey);
        case 'claude':
            return fetchAnthropicModels(apiKey);
        case 'gemini':
            return fetchGeminiModels(apiKey);
        case 'deepseek':
            return fetchDeepSeekModels(apiKey);
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function fetchOpenAIModels(apiKey: string): Promise<ProviderModel[]> {
    try {
        const response = await axios.get('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
        });

        const models: any[] = response.data?.data || [];

        // Only include: ChatGPT latest alias, gpt-4o series, gpt-5.x+, gpt-6.x+, o1, o3, o4 series
        const filtered = models.filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            // Include the API alias for dynamic production snapshot
            if (id === 'chat-latest') return true;
            // Include gpt-4o variants
            if (id.includes('gpt-4o')) return true;
            // Include gpt-5 and above (gpt-5.x, gpt-6.x)
            if (/gpt-[5-9]/.test(id)) return true;
            // Include o1/o3/o4 reasoning models (but not audio/realtime variants)
            if (/^o[134]/.test(id) && !id.includes('audio') && !id.includes('realtime')) return true;
            return false;
        });

        if (filtered.length === 0) return FALLBACK_OPENAI_MODELS;

        return filtered
            .map((m: any) => ({ id: m.id, label: m.id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            throw new Error('Invalid or unauthorized OpenAI API key');
        }
        return FALLBACK_OPENAI_MODELS;
    }
}


// ─── Groq ────────────────────────────────────────────────────────────────────

async function fetchGroqModels(apiKey: string): Promise<ProviderModel[]> {
    const response = await axios.get('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    // Only include text/chat models — exclude everything non-chat
    const excludePatterns = [
        'whisper', 'distil', 'guard', 'tool-use',
        'vision-preview', 'tts', 'playai', 'speech',
    ];

    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        return !excludePatterns.some(p => id.includes(p));
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function fetchAnthropicModels(apiKey: string): Promise<ProviderModel[]> {
    try {
        const response = await axios.get('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            timeout: 15000,
        });

        const models: any[] = response.data?.data || [];

        // Keep the user-facing Claude list focused on verified 2026 and stable 4.x tiers.
        const filtered = models.filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            return ALLOWED_CLAUDE_MODELS.has(id) || ALLOWED_CLAUDE_MODELS.has(id.replace(/-\d{8}$/, ''));
        });

        if (filtered.length === 0) return FALLBACK_CLAUDE_MODELS;

        return filtered
            .map((m: any) => ({ id: m.id, label: m.display_name || m.id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            throw new Error('Invalid or unauthorized Anthropic API key');
        }
        return FALLBACK_CLAUDE_MODELS;
    }
}

// ─── DeepSeek ────────────────────────────────────────────────────────────────

export const DEEPSEEK_DEFAULT_MODELS: ProviderModel[] = [
    { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash (Multimodal)' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (1M Context)' },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
];

async function fetchDeepSeekModels(apiKey: string): Promise<ProviderModel[]> {
    try {
        const response = await axios.get('https://api.deepseek.com/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 15000,
        });

        const models: any[] = response.data?.data || [];
        if (!Array.isArray(models) || models.length === 0) {
            return DEEPSEEK_DEFAULT_MODELS;
        }

        const excludePatterns = [
            'embedding', 'embed', 'image', 'audio',
            'tts', 'speech', 'whisper', 'stt',
        ];

        const filtered = models.filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            if (/^deepseek-v\d/.test(id) || id === 'deepseek-chat' || id === 'deepseek-reasoner') {
                return !excludePatterns.some(p => id.includes(p));
            }
            return false;
        });

        if (filtered.length === 0) return DEEPSEEK_DEFAULT_MODELS;

        return filtered
            .map((m: any) => ({ id: m.id, label: m.id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            throw new Error('Invalid or unauthorized DeepSeek API key');
        }
        return DEEPSEEK_DEFAULT_MODELS;
    }
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

/**
 * Curated Gemini model IDs used exclusively when the paginated API request
 * sequence throws/fails.  Not merged with partial results — a successful but
 * empty fetch returns [].
 */
export const FALLBACK_GEMINI_MODELS: ProviderModel[] = [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
];

let cachedDiscoveredGeminiModels: ProviderModel[] | null = null;

/**
 * Predicate to check if a Gemini model is a supported Flash, Flash-Lite, Pro, or Live tier (v2.0+).
 * Excludes antigravity, deep research, preview, experimental, legacy 1.x, and non-chat models.
 */
export function isAllowedGeminiModel(id: string): boolean {
    const clean = (id || '').replace(/^models\//, '').toLowerCase();
    if (!clean.startsWith('gemini-')) return false;

    // Hide older 1.x legacy models (Gemini 2.0+ only)
    const versionMatch = clean.match(/^gemini-(\d+)(?:\.(\d+))?/);
    if (!versionMatch) return false;
    const major = parseInt(versionMatch[1], 10);
    if (major < 2) return false;

    // Must be a Flash (including Flash-Lite, Flash-8B), Pro, or Live tier
    const isFlashOrProOrLive = clean.includes('flash') || clean.includes('pro') || clean.includes('live');
    if (!isFlashOrProOrLive) return false;

    // Exclude antigravity, deep research, preview, experimental, and specialized variants
    const excludePatterns = [
        'antigravity',
        'deep-research',
        'research',
        'preview',
        'exp',
        'experimental',
        'vision',
        'custom',
        'tuned',
        'robotics',
        'learnlm',
        'banana',
        'nano',
    ];

    return !excludePatterns.some(p => clean.includes(p));
}

/**
 * Pure filtering/transformation helper (no network I/O).
 *
 * 1. Keep only models whose supportedGenerationMethods includes 'generateContent'.
 * 2. Filter to Gemini Flash, Flash-Lite, and Pro models only.
 * 3. Preserve the exact API m.name as id, including the "models/" prefix.
 * 4. label = m.displayName || m.name.
 * 5. Deduplicate by exact id (first occurrence wins).
 * 6. Stable sort: canonical id localeCompare, then label as a tie-breaker.
 */
export function processGeminiModels(rawModels: any[]): ProviderModel[] {
    const seen = new Set<string>();
    const result: ProviderModel[] = [];

    for (const m of rawModels) {
        // Gate: only chat-capable models
        if (!m.supportedGenerationMethods?.includes('generateContent')) continue;

        const id: string = m.name || '';
        if (!id || seen.has(id)) continue;
        const lowerId = id.toLowerCase();
        const lowerDisplay = (m.displayName || '').toLowerCase();
        if (lowerId.includes('banana') || lowerDisplay.includes('banana')) continue;
        if (lowerId.includes('nano') || lowerDisplay.includes('nano')) continue;
        if (!isAllowedGeminiModel(id)) continue;
        seen.add(id);

        result.push({ id, label: m.displayName || id });
    }

    // Deterministic sort: id first (unique after dedup), label tie-break
    result.sort((a, b) => {
        const cmp = a.id.localeCompare(b.id);
        if (cmp !== 0) return cmp;
        return a.label.localeCompare(b.label);
    });

    return result;
}

/**
 * Paginated Gemini model fetcher — injectable HTTP GET.
 *
 * Pagination contract:
 * - pageSize=100 (max allowed by the API)
 * - encoded nextPageToken appended as &pageToken=...
 * - Capped at 10 pages (safety stop)
 *
 * Successful HTTP + zero results after filtering returns an empty list.
 * Request failures reject so the fallback wrapper can discard partial pages.
 */
export async function fetchGeminiModelsPaginated(
    apiKey: string,
    httpGet: HttpGet
): Promise<ProviderModel[]> {
    const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
    const MAX_PAGES = 10;
    const PAGE_SIZE = 100;

    const allModels: any[] = [];
    let nextPageToken: string | undefined;
    let pageCount = 0;

    do {
        const params = new URLSearchParams({ key: apiKey, pageSize: String(PAGE_SIZE) });
        if (nextPageToken) {
            params.set('pageToken', nextPageToken);
        }
        const url = `${BASE_URL}?${params.toString()}`;
        // eslint-disable-next-line no-await-in-loop
        const response = await httpGet(url, { timeout: 15000 });
        const data = response?.data;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Gemini models endpoint returned a non-JSON response');
        }
        if (data.models !== undefined && !Array.isArray(data.models)) {
            throw new Error('Gemini models endpoint returned an invalid models payload');
        }
        if (data.nextPageToken !== undefined && typeof data.nextPageToken !== 'string') {
            throw new Error('Gemini models endpoint returned an invalid nextPageToken');
        }

        const pageModels: any[] = data.models || [];
        allModels.push(...pageModels);

        nextPageToken = data.nextPageToken || undefined;
        pageCount++;
    } while (nextPageToken && pageCount < MAX_PAGES);

    return processGeminiModels(allModels);
}

/**
 * Apply the standalone curated fallback to a failed paginated request sequence.
 * Kept injectable so failure and partial-page behavior can be tested directly.
 */
export async function fetchGeminiModelsWithFallback(
    apiKey: string,
    httpGet: HttpGet
): Promise<ProviderModel[]> {
    try {
        const models = await fetchGeminiModelsPaginated(apiKey, httpGet);
        if (models && models.length > 0) {
            cachedDiscoveredGeminiModels = models;
        }
        return models;
    } catch (_error: any) {
        if (cachedDiscoveredGeminiModels && cachedDiscoveredGeminiModels.length > 0) {
            return cachedDiscoveredGeminiModels;
        }
        return FALLBACK_GEMINI_MODELS;
    }
}

/** Production entry-point for Gemini model discovery. */
async function fetchGeminiModels(apiKey: string): Promise<ProviderModel[]> {
    return fetchGeminiModelsWithFallback(apiKey, (url, opts) => axios.get(url, opts));
}

// ─── Generic OpenAI-Compatible Endpoints ─────────────────────────────────────

/**
 * Fetch available models from any OpenAI-compatible API endpoint (OpenRouter,
 * Together AI, local vLLM, LMStudio, Ollama /v1, etc.).
 */
export async function fetchOpenAICompatibleModels(
    baseUrl: string,
    apiKey?: string,
    customHeaders?: Record<string, string>,
    httpGet?: HttpGet
): Promise<ProviderModel[]> {
    const getFn = httpGet || ((url, opts) => axios.get(url, opts));
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const url = cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`;

    const headers: Record<string, string> = { ...customHeaders };
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
        const response = await getFn(url, {
            headers,
            timeout: 15000,
        });

        const rawList: any[] = response?.data?.data || (Array.isArray(response?.data) ? response.data : []);
        const filtered: ProviderModel[] = rawList
            .filter((m: any) => m && (m.id || m.name))
            .map((m: any) => {
                const id = m.id || m.name;
                return {
                    id,
                    label: m.display_name || m.name || id,
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        return filtered;
    } catch (error: any) {
        console.warn(`[modelFetcher] Failed to fetch models from OpenAI-compatible endpoint ${baseUrl}:`, error.message);
        throw error;
    }
}
