/**
 * modelFetcher.ts - Dynamic Model Discovery
 * Fetches available models from AI provider APIs
 */

import axios from 'axios';

/**
 * Low-level HTTP GET signature injectable for pagination tests.
 * Production uses axios.get; tests supply a mock.
 */
export type HttpGet = (url: string, options?: { timeout?: number }) => Promise<{ data: any }>;

export interface ProviderModel {
    id: string;
    label: string;
}

type Provider = 'gemini' | 'groq' | 'openai' | 'claude' | 'deepseek';

const ALLOWED_CLAUDE_MODELS = new Set([
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
]);

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
    const response = await axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    // Only include: ChatGPT latest alias, gpt-4o series, gpt-5.x+, o1, o3, o4 series
    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        // Include the API alias for GPT 5.5 Instant
        if (id === 'chat-latest') return true;
        // Include gpt-4o variants
        if (id.includes('gpt-4o')) return true;
        // Include gpt-5 and above
        if (/gpt-[5-9]/.test(id)) return true;
        // Include o1/o3/o4 reasoning models (but not audio/realtime variants)
        if (/^o[134]/.test(id) && !id.includes('audio') && !id.includes('realtime')) return true;
        return false;
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
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
    const response = await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    // Keep the user-facing Claude list intentionally tight.
    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        return ALLOWED_CLAUDE_MODELS.has(id);
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.display_name || m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── DeepSeek ────────────────────────────────────────────────────────────────

// Documented current DeepSeek text models; used as fallback if /models call fails
// or returns an unexpected shape. deepseek-chat / deepseek-reasoner are deprecated
// (2026-07-24) and intentionally excluded.
const DEEPSEEK_DEFAULT_MODELS: ProviderModel[] = [
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
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
            'embedding', 'embed', 'vision', 'image', 'audio',
            'tts', 'speech', 'whisper', 'stt',
        ];

        const filtered = models.filter((m: any) => {
            const id = (m.id || '').toLowerCase();
            if (!/^deepseek-v\d/.test(id)) return false;
            if (excludePatterns.some(p => id.includes(p))) return false;
            return true;
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
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
];

let cachedDiscoveredGeminiModels: ProviderModel[] | null = null;

/**
 * Pure filtering/transformation helper (no network I/O).
 *
 * 1. Keep only models whose supportedGenerationMethods includes 'generateContent'.
 * 2. Preserve the exact API m.name as id, including the "models/" prefix.
 * 3. label = m.displayName || m.name.
 * 4. Deduplicate by exact id (first occurrence wins).
 * 5. Stable sort: canonical id localeCompare, then label as a tie-breaker.
 */
export function processGeminiModels(rawModels: any[]): ProviderModel[] {
    const seen = new Set<string>();
    const result: ProviderModel[] = [];

    for (const m of rawModels) {
        // Gate: only chat-capable models
        if (!m.supportedGenerationMethods?.includes('generateContent')) continue;

        const id: string = m.name || '';
        if (!id || seen.has(id)) continue;
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
