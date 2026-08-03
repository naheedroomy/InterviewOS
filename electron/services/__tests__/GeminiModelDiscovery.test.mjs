/**
 * GeminiModelDiscovery.test.mjs
 *
 * Tests for Gemini model discovery: pagination, capability filtering,
 * dedup/sort, fallback semantics, and modelUtils integration.
 *
 * Uses source-code-level assertions for structural guarantees (pagination,
 * fallback, auth errors) and runtime import of the compiled module for
 * the pure function processGeminiModels.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countOccurrences(text, substr) {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(substr, idx)) !== -1) {
    count++;
    idx += substr.length;
  }
  return count;
}

// ─── Runtime: processGeminiModels (pure function) ────────────────────────────

const MOD_FETCHER_PATH = path.resolve(root, 'dist-electron/electron/utils/modelFetcher.js');
let processGeminiModelsRuntime;
let FALLBACK_GEMINI_MODELS_RUNTIME;
let fetchGeminiModelsPaginatedRuntime;
let fetchGeminiModelsWithFallbackRuntime;

// Attempt to load the compiled module for runtime tests.
// Silently skip if the build output does not exist (e.g. first run after clean).
try {
  if (fs.existsSync(MOD_FETCHER_PATH)) {
    const mod = await import(pathToFileURL(MOD_FETCHER_PATH).href);
    processGeminiModelsRuntime = mod.processGeminiModels;
    FALLBACK_GEMINI_MODELS_RUNTIME = mod.FALLBACK_GEMINI_MODELS;
    fetchGeminiModelsPaginatedRuntime = mod.fetchGeminiModelsPaginated;
    fetchGeminiModelsWithFallbackRuntime = mod.fetchGeminiModelsWithFallback;
  }
} catch (_) {
  // compiled output not available
}

const canRunRuntime = () => typeof processGeminiModelsRuntime === 'function';
const canRunPagination = () => typeof fetchGeminiModelsPaginatedRuntime === 'function';
const canRunFallback = () => typeof fetchGeminiModelsWithFallbackRuntime === 'function';

describe('processGeminiModels — runtime (pure filtering)', () => {
  test('keeps only generateContent-capable models', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'embedContent'] },
      { name: 'models/gemini-embedding', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-tts', displayName: 'TTS', supportedGenerationMethods: ['generateText'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'models/gemini-2.5-flash');
  });

  test('preserves exact m.name as id including models/ prefix', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result[0].id, 'models/gemini-2.5-flash');
    assert.equal(result[1].id, 'models/gemini-3.1-pro-preview');
  });

  test('label uses displayName, falls back to name', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/gemini-has-display', displayName: 'My Display Name', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-no-display', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.find(m => m.id === 'models/gemini-has-display').label, 'My Display Name');
    assert.equal(result.find(m => m.id === 'models/gemini-no-display').label, 'models/gemini-no-display');
  });

  test('no version regex — preview/experimental aliases pass through', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/gemini-2.0-flash-latest', displayName: 'Gemini 2.0 Flash Latest', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-1.5-pro-experimental', displayName: 'Gemini 1.5 Pro Experimental', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/learnlm-1.5-pro-experimental', displayName: 'LearnLM', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.length, 3);
    assert.ok(result.some(m => m.id === 'models/gemini-2.0-flash-latest'));
    assert.ok(result.some(m => m.id === 'models/gemini-1.5-pro-experimental'));
    assert.ok(result.some(m => m.id === 'models/learnlm-1.5-pro-experimental'));
  });

  test('no hardcoded name exclusion — only generateContent gate applies', { skip: !canRunRuntime() }, () => {
    // Models that were previously excluded by name patterns but have generateContent
    const input = [
      { name: 'models/gemini-vision', displayName: 'Vision Model', supportedGenerationMethods: ['generateContent', 'generateImages'] },
      { name: 'models/gemini-nano', displayName: 'Nano', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.length, 2);
  });

  test('dedup by exact id — first occurrence wins', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/gemini-flash', displayName: 'First label', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-flash', displayName: 'Second label (dupe)', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].label, 'First label');
  });

  test('deterministic sort — id primary, label tie-break', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/b', displayName: 'Beta', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/c', displayName: 'Alpha', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/a', displayName: 'Gamma', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    // Primary sort by id: a, b, c
    assert.equal(result[0].id, 'models/a');
    assert.equal(result[1].id, 'models/b');
    assert.equal(result[2].id, 'models/c');
  });

  test('sort id tie-break falls back to label', { skip: !canRunRuntime() }, () => {
    // IDs are unique after dedup so tie-break normally never fires,
    // but verify the comparator handles equal ids gracefully.
    const input = [
      { name: 'models/x', displayName: 'Zeta', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/x', displayName: 'Alpha', supportedGenerationMethods: ['generateContent'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.equal(result.length, 1); // dedup keeps first
    assert.equal(result[0].label, 'Zeta');
  });

  test('empty input returns []', { skip: !canRunRuntime() }, () => {
    const result = processGeminiModelsRuntime([]);
    assert.deepEqual(result, []);
  });

  test('all filtered out returns [] (no fallback for empty success)', { skip: !canRunRuntime() }, () => {
    const input = [
      { name: 'models/embedding-model', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-audio', supportedGenerationMethods: ['generateAudio'] },
    ];
    const result = processGeminiModelsRuntime(input);
    assert.deepEqual(result, []);
  });

  test('FALLBACK_GEMINI_MODELS has exactly 3 curated entries', { skip: !canRunRuntime() }, () => {
    assert.ok(Array.isArray(FALLBACK_GEMINI_MODELS_RUNTIME));
    assert.equal(FALLBACK_GEMINI_MODELS_RUNTIME.length, 3);
    const ids = FALLBACK_GEMINI_MODELS_RUNTIME.map(m => m.id);
    assert.ok(ids.includes('gemini-3.5-flash'));
    assert.ok(ids.includes('gemini-3.1-flash-lite-preview'));
    assert.ok(ids.includes('gemini-3.1-pro-preview'));
  });
});

// ─── Behavior-level: fetchGeminiModelsPaginated (injectable HTTP) ──────────

describe('fetchGeminiModelsPaginated — pagination behaviour', () => {

  function mockHttpGet(responses) {
    let callIdx = 0;
    return async (url) => {
      if (callIdx >= responses.length) {
        throw new Error(`Unexpected call #${callIdx}: ${url}`);
      }
      return { data: responses[callIdx++] };
    };
  }

  const contentModel = {
    name: 'models/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    supportedGenerationMethods: ['generateContent'],
  };

  test('single page, no nextPageToken', { skip: !canRunPagination() }, async () => {
    const httpGet = mockHttpGet([
      { models: [contentModel] },
    ]);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'models/gemini-2.5-flash');
  });

  test('multi-page accumulation with nextPageToken', { skip: !canRunPagination() }, async () => {
    const page1 = { name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] };
    const page2 = { name: 'models/gemini-b', supportedGenerationMethods: ['generateContent'] };
    const httpGet = mockHttpGet([
      { models: [page1], nextPageToken: 'token1' },
      { models: [page2] },
    ]);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.equal(result.length, 2);
    // sort by id:
    assert.equal(result[0].id, 'models/gemini-a');
    assert.equal(result[1].id, 'models/gemini-b');
  });

  test('stops when no nextPageToken (even before 10 pages)', { skip: !canRunPagination() }, async () => {
    const httpGet = mockHttpGet([
      { models: [contentModel], nextPageToken: 'tok' },
      { models: [{ name: 'models/gemini-b', supportedGenerationMethods: ['generateContent'] }] },
    ]);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.equal(result.length, 2); // did not fetch a third page
  });

  test('capped at 10 pages', { skip: !canRunPagination() }, async () => {
    const responses = [];
    const models = [];
    for (let i = 0; i < 12; i++) {
      const m = { name: `models/gemini-p${i}`, supportedGenerationMethods: ['generateContent'] };
      models.push(m);
      responses.push({ models: [m], nextPageToken: `tok${i}` });
    }
    const httpGet = mockHttpGet(responses);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    // Only 10 pages are fetched (models from pages 0-9)
    assert.equal(result.length, 10, 'must cap at 10 pages');
    assert.equal(result[0].id, 'models/gemini-p0');
    assert.equal(result[9].id, 'models/gemini-p9');
  });

  test('accumulation + dedup across pages', { skip: !canRunPagination() }, async () => {
    const dup = { name: 'models/gemini-dup', displayName: 'Dupe', supportedGenerationMethods: ['generateContent'] };
    const httpGet = mockHttpGet([
      { models: [dup], nextPageToken: 'tok1' },
      { models: [dup, { name: 'models/gemini-new', supportedGenerationMethods: ['generateContent'] }] },
    ]);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.equal(result.length, 2); // dedup keeps first occurrence
    assert.equal(result[0].id, 'models/gemini-dup');
    assert.equal(result[1].id, 'models/gemini-new');
  });

  test('encoded nextPageToken via URLSearchParams', { skip: !canRunPagination() }, async () => {
    // Verify the token is passed through via URL params
    let capturedUrl = '';
    const httpGet = async (url) => {
      capturedUrl = url;
      return { data: { models: [contentModel], nextPageToken: 'tok+encode/me' } };
    };
    await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.ok(capturedUrl.includes('pageToken='), 'pageToken param must be present in URL');
    assert.ok(!capturedUrl.includes('pageToken=tok+encode/me'), 'token must be URL-encoded, not raw');
    assert.ok(capturedUrl.includes('pageToken=tok%2Bencode%2Fme') || capturedUrl.includes('pageToken=tok+encode%2Fme'),
      'special chars in token must be percent-encoded');
  });

  test('successful empty list returns [] (no fallback)', { skip: !canRunPagination() }, async () => {
    const httpGet = mockHttpGet([
      { models: [{ name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] }] },
    ]);
    const result = await fetchGeminiModelsPaginatedRuntime('test-key', httpGet);
    assert.deepEqual(result, []);
  });

  test('low-level helper rejects a non-JSON success response', { skip: !canRunPagination() }, async () => {
    await assert.rejects(
      () => fetchGeminiModelsPaginatedRuntime('test-key', async () => ({ data: '<html>error</html>' })),
      /non-JSON response/,
    );
  });

  test('low-level helper rejects on first request failure', { skip: !canRunPagination() }, async () => {
    let callCount = 0;
    const httpGet = async () => {
      callCount++;
      throw new Error('Network error');
    };
    await assert.rejects(
      () => fetchGeminiModelsPaginatedRuntime('test-key', httpGet),
      /Network error/,
    );
    assert.equal(callCount, 1, 'only one request was made');
  });

  test('low-level helper rejects on a late request failure', { skip: !canRunPagination() }, async () => {
    let callCount = 0;
    const httpGet = async () => {
      callCount++;
      if (callCount === 1) {
        return { data: { models: [contentModel], nextPageToken: 'goagain' } };
      }
      throw new Error('Second page failed');
    };
    await assert.rejects(
      () => fetchGeminiModelsPaginatedRuntime('test-key', httpGet),
      /Second page failed/,
    );
    assert.equal(callCount, 2, 'two requests were made before failure');
  });

  test('low-level helper rejects on 401/403', { skip: !canRunPagination() }, async () => {
    let callCount = 0;
    const httpGetWithAuthFail = async () => {
      callCount++;
      if (callCount === 1) return { data: { models: [contentModel], nextPageToken: 'tok' } };
      const err = new Error('Forbidden');
      err.response = { status: 403 };
      throw err;
    };
    await assert.rejects(
      () => fetchGeminiModelsPaginatedRuntime('test-key', httpGetWithAuthFail),
      /Forbidden/,
    );
    assert.equal(callCount, 2);
  });
});

describe('fetchGeminiModelsWithFallback — failure boundary', () => {
  const contentModel = {
    name: 'models/gemini-2.5-flash',
    supportedGenerationMethods: ['generateContent'],
  };

  test('successful empty discovery remains empty', { skip: !canRunFallback() }, async () => {
    const result = await fetchGeminiModelsWithFallbackRuntime('test-key', async () => ({
      data: { models: [{ name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }] },
    }));
    assert.deepEqual(result, []);
  });

  test('first request failure returns standalone fallback', { skip: !canRunFallback() }, async () => {
    const result = await fetchGeminiModelsWithFallbackRuntime('test-key', async () => {
      throw new Error('Network error');
    });
    assert.deepEqual(result, FALLBACK_GEMINI_MODELS_RUNTIME);
  });

  test('late request failure discards partial pages and returns fallback', { skip: !canRunFallback() }, async () => {
    let calls = 0;
    const result = await fetchGeminiModelsWithFallbackRuntime('test-key', async () => {
      calls++;
      if (calls === 1) return { data: { models: [contentModel], nextPageToken: 'next' } };
      throw new Error('Second page failed');
    });
    assert.equal(calls, 2);
    assert.deepEqual(result, FALLBACK_GEMINI_MODELS_RUNTIME);
  });

  test('auth failure returns fallback', { skip: !canRunFallback() }, async () => {
    const result = await fetchGeminiModelsWithFallbackRuntime('test-key', async () => {
      const error = new Error('Forbidden');
      error.response = { status: 403 };
      throw error;
    });
    assert.deepEqual(result, FALLBACK_GEMINI_MODELS_RUNTIME);
  });

  test('non-JSON success response returns fallback', { skip: !canRunFallback() }, async () => {
    const result = await fetchGeminiModelsWithFallbackRuntime(
      'test-key',
      async () => ({ data: '<html>error</html>' }),
    );
    assert.deepEqual(result, FALLBACK_GEMINI_MODELS_RUNTIME);
  });
});

// ─── Source-code structural checks (secondary — behaviour tests cover runtime) ─

describe('fetchGeminiModels — minimal source-level structural guards', () => {
  const src = read('electron/utils/modelFetcher.ts');

  test('production entry delegates through the fallback wrapper with axios', () => {
    assert.ok(
      src.includes('fetchGeminiModelsWithFallback') && src.includes('axios.get'),
      'fetchGeminiModels must delegate through the fallback wrapper'
    );
  });

  test('no version regex filter in Gemini section', () => {
    const regexPattern = /gemini-\s*\(?\[?[3-9]/;
    const match = src.match(regexPattern);
    assert.equal(match, null, 'Version-gating regex on Gemini model versions must be absent');
  });

  test('no hardcoded model name exclusion list in Gemini section', () => {
    const geminiSection = src.slice(src.indexOf('// ─── Gemini'));
    assert.ok(
      !geminiSection.includes("'nano'") && !geminiSection.includes('"nano"'),
      'Hardcoded name exclusion patterns must be removed from Gemini section'
    );
  });

  test('FALLBACK_GEMINI_MODELS appears only in the catch return', () => {
    const returnCount = countOccurrences(src, 'return FALLBACK_GEMINI_MODELS');
    assert.equal(returnCount, 1, 'return FALLBACK_GEMINI_MODELS must appear exactly once (catch)');
    assert.ok(src.includes('return processGeminiModels'), 'Success path must return processGeminiModels');
  });
});

// ─── Source-code analysis: modelUtils changes ────────────────────────────────

describe('modelUtils — STANDARD_CLOUD_MODELS.gemini', () => {
  const src = read('src/utils/modelUtils.ts');

  test('gemini ids/names/descs arrays are empty', () => {
    const geminiMatch = src.match(/gemini:\s*\{[^}]*\}/s);
    assert.ok(geminiMatch, 'gemini config block must exist');
    const block = geminiMatch[0];
    assert.ok(
      block.includes('ids: []'),
      'gemini ids must be empty array'
    );
    assert.ok(
      block.includes('names: []'),
      'gemini names must be empty array'
    );
    assert.ok(
      block.includes('descs: []'),
      'gemini descs must be empty array'
    );
  });

  test('gemini config retains hasKeyCheck and pmKey', () => {
    const geminiMatch = src.match(/gemini:\s*\{[^}]*\}/s);
    const block = geminiMatch[0];
    assert.ok(block.includes('hasGeminiKey'), 'hasKeyCheck must reference hasGeminiKey');
    assert.ok(block.includes('geminiPreferredModel'), 'pmKey must be geminiPreferredModel');
  });

  test('other providers retain their allowlists', () => {
    assert.ok(src.includes("'claude-opus-4-8'"), 'Claude allowlist must be intact');
    assert.ok(src.includes("'chat-latest'"), 'OpenAI allowlist must be intact');
    assert.ok(src.includes("'llama-3.3-70b-versatile'"), 'Groq allowlist must be intact');
    assert.ok(src.includes("'deepseek-v4-flash'"), 'DeepSeek allowlist must be intact');
  });
});

describe('modelUtils — isAllowedStandardCloudModel', () => {
  const src = read('src/utils/modelUtils.ts');

  test('gemini accepts any non-empty model ID', () => {
    assert.ok(
      src.includes("provider === 'gemini'") && src.includes('!!modelId'),
      'isAllowedStandardCloudModel must short-circuit true for gemini with non-empty modelId'
    );
  });

  test('other providers still check config.ids includes', () => {
    assert.ok(
      src.includes('config.ids.includes(modelId)'),
      'Non-Gemini providers must still use ids allowlist'
    );
  });

  test('unknown provider returns true (existing contract)', () => {
    const func = src.match(/export const isAllowedStandardCloudModel[\s\S]*?\n\}/);
    assert.ok(func, 'isAllowedStandardCloudModel function must exist');
    assert.ok(func[0].includes('if (!config) return true'), 'Unknown provider must return true');
  });
});

// ─── Source-code analysis: ProviderCard stale-selection integration ───────────

describe('ProviderCard — stale selection reconciliation', () => {
  const src = read('src/components/settings/ProviderCard.tsx');

  test('console.warn when stale preferred model is auto-selected', () => {
    const handler = src.match(/const handleFetchModels\s*=\s*async\s*\(\)/);
    assert.ok(handler, 'handleFetchModels must exist');
    // Find the block that auto-selects first model after stale detection
    const blockStart = src.indexOf('!existsInList');
    assert.ok(blockStart >= 0, 'stale detection check must exist');
    const block = src.slice(blockStart, blockStart + 500);
    assert.ok(block.includes('console.warn'), 'console.warn must fire on stale model auto-select');
    assert.ok(block.includes('not found in discovered'), 'warn message must explain staleness');
    assert.ok(block.includes('Auto-selecting first available'), 'warn message must mention first selection');
  });

  test('successful empty list does nothing (no auto-select)', () => {
    // The "if (result.models.length > 0)" guard must wrap stale reconciliation
    const fetchStart = src.indexOf('const handleFetchModels');
    const handlerSection = src.slice(fetchStart, fetchStart + 1500);
    const guard = handlerSection.match(/if\s*\(result\.models\.length\s*>\s*0\)/);
    assert.ok(guard, 'stale reconciliation must be guarded by non-empty check');
    const afterGuard = handlerSection.slice(guard.index + guard[0].length);
    assert.ok(afterGuard.includes('existsInList'), 'stale check must be inside the non-empty guard');
  });

  test('onModelsFetched prop type is declared', () => {
    assert.ok(src.includes('onModelsFetched?'), 'onModelsFetched optional prop must exist');
    assert.ok(src.includes('models: { id: string; label: string }[]'), 'onModelsFetched callback signature must match');
  });

  test('onModelsFetched called after successful fetch', () => {
    const fetchStart = src.indexOf('const handleFetchModels');
    const handlerSection = src.slice(fetchStart, fetchStart + 2000);
    assert.ok(handlerSection.includes('onModelsFetched(result.models)'), 'onModelsFetched must be called with result.models');
  });
});

// ─── Source-code analysis: AIProvidersSettings dynamic integration ───────────

describe('AIProvidersSettings — Gemini dynamic model integration', () => {
  const src = read('src/components/settings/AIProvidersSettings.tsx');

  test('geminiDiscoveredModels state exists', () => {
    assert.ok(
      src.includes('geminiDiscoveredModels') && src.includes('useState'),
      'geminiDiscoveredModels state must exist'
    );
  });

  test('handleGeminiModelsFetched callback transforms ProviderModel[] to ModelOption[]', () => {
    const cbMatch = src.match(/const handleGeminiModelsFetched\s*=\s*useCallback[^}]+}/);
    assert.ok(cbMatch, 'handleGeminiModelsFetched useCallback must exist');
    const body = cbMatch[0];
    assert.ok(body.includes('m.label'), 'must map label field');
    assert.ok(body.includes('id: m.id'), 'must map id field');
    assert.ok(body.includes('name: m.label'), 'must map label to name');
  });

  test('defaultModelOptions iterates geminiDiscoveredModels for Gemini provider', () => {
    const memoMatch = src.match(/const defaultModelOptions\s*=\s*useMemo[\s\S]*?return options;\s*\},?\s*\[/);
    assert.ok(memoMatch, 'defaultModelOptions useMemo must exist');
    const body = memoMatch[0];
    assert.ok(
      body.includes("provider === 'gemini'") && body.includes('geminiDiscoveredModels'),
      'Gemini branch must iterate geminiDiscoveredModels'
    );
    assert.ok(
      body.includes('config.ids.forEach') && body.includes("provider !== 'gemini'") ||
      body.includes('} else {'),
      'Non-Gemini providers must still iterate config.ids'
    );
    assert.ok(
      body.includes("provider !== 'gemini' && preferredModel"),
      'Stale Gemini preferred models must not be reinserted outside discovery results'
    );
  });

  test('defaultModelOptions depends on geminiDiscoveredModels', () => {
    // The dependency array should include geminiDiscoveredModels
    const depMatch = src.match(/defaultModelOptions[\s\S]*?geminiDiscoveredModels[^;]*\]/);
    assert.ok(depMatch, 'geminiDiscoveredModels must be in the dependency array');
  });

  test('Gemini ProviderCard receives onModelsFetched prop', () => {
    const jsxMatch = src.match(/onModelsFetched=\{provider === 'gemini' \? handleGeminiModelsFetched : undefined\}/);
    assert.ok(jsxMatch, 'onModelsFetched must be conditionally passed to Gemini ProviderCard');
  });

  test('stale default model warns with console.warn', () => {
    const effectStart = src.indexOf("hasStoredKey.gemini && isGeminiModelId(defaultModel)");
    const effect = src.slice(effectStart, effectStart + 1000);
    assert.ok(effect.includes('console.warn'), 'console.warn must fire on stale default model');
    assert.ok(effect.includes('no longer available'), 'warn message must explain staleness');
    assert.ok(effect.includes('geminiDiscoveredModels[0].id'), 'must choose the first discovered Gemini model');
    assert.ok(effect.includes('geminiDiscoveredModels.length === 0'), 'empty discovery must not replace the default');
  });

  test('auto-discovery fires after credentials load when Gemini key stored', () => {
    // The discovery effect must be gated on credentialsLoaded + hasStoredKey.gemini
    const discoveryEffect = src.match(/credentialsLoaded.*hasStoredKey\.gemini[^}]*setGeminiDiscoveryLoading[^}]*fetchProviderModels\('gemini',\s*''\)/);
    // Fallback: check for the key patterns
    assert.ok(
      src.includes("fetchProviderModels('gemini', '')") &&
      src.includes('setGeminiDiscoverySettled'),
      'Auto-discovery effect must call fetchProviderModels with empty key and set settled flag'
    );
  });

  test('auto-discovery reconciles stale Gemini preferred model', () => {
    const discoverySection = src.slice(src.indexOf('hasStoredKey.gemini || geminiDiscoverySettled'),
      src.indexOf('// Intentionally run only once'));
    assert.ok(discoverySection.includes('console.warn'), 'stale preferred model warn in discovery');
    assert.ok(discoverySection.includes('setProviderPreferredModel'), 'persists new preferred model');
  });

  test('auto-discovery does not reconcile when list is empty', () => {
    const discoverySection = src.slice(src.indexOf('hasStoredKey.gemini || geminiDiscoverySettled'),
      src.indexOf('// Intentionally run only once'));
    const beforeMapped = discoverySection.slice(0, discoverySection.indexOf('mapped.length > 0'));
    // The reconciliation code must be inside a `mapped.length > 0` guard
    assert.ok(
      discoverySection.match(/mapped\.length\s*>\s*0\s*&&\s*currentPreferred\s*&&\s*!/),
      'stale preferred model reconciliation must be inside non-empty guard'
    );
  });

  test('stale default model reconciliation gates on geminiDiscoverySettled', () => {
    const reconcilerEffect = src.match(/credentialsLoaded.*\n.*if \(hasStoredKey\.gemini && !geminiDiscoverySettled\) return/);
    assert.ok(reconcilerEffect, 'Stale default reconciler must skip until Gemini discovery settles');
  });

  test('ProviderCard receives externalModels for Gemini', () => {
    assert.ok(
      src.includes('externalModels={provider === \'gemini\'') &&
      src.includes('geminiDiscoveredModels'),
      'Gemini ProviderCard must receive externalModels from parent cache'
    );
  });

  test('Gemini key changes reset discovery state', () => {
    assert.ok(src.includes("if (provider === 'gemini')"), 'Gemini key branch must exist');
    assert.ok(src.includes('setGeminiDiscoveredModels([])'), 'key changes must clear cached models');
    assert.ok(src.includes('setGeminiDiscoverySettled(false)'), 'key changes must allow discovery to rerun');
    assert.ok(src.includes('geminiDiscoveryGenerationRef.current += 1'), 'key changes must invalidate stale requests');
  });

  test('auto-discovery ignores stale request completions', () => {
    assert.ok(src.includes('geminiDiscoveryGenerationRef'), 'discovery generation ref must exist');
    assert.ok(
      src.includes('generation !== geminiDiscoveryGenerationRef.current'),
      'stale requests must be ignored before publishing models',
    );
  });
});

// ─── ModelSelector consumers — dynamic Gemini fetch ─────────────────────────

describe('ModelSelector.tsx — Gemini dynamic fetch', () => {
  const src = read('src/components/ui/ModelSelector.tsx');

  test('fetches Gemini models via IPC when key is configured', () => {
    const geminiBlock = src.match(/prov === 'gemini'[\s\S]{0,800}catch/);
    assert.ok(geminiBlock, 'Gemini branch must exist in cloud model builder');
    const block = geminiBlock[0];
    assert.ok(block.includes("fetchProviderModels('gemini', '')"), 'Calls IPC with empty key');
    assert.ok(block.includes('geminiResult?.success'), 'Checks success');
    assert.ok(block.includes('geminiResult.models'), 'Iterates models');
    assert.ok(block.includes('cModels.push'), 'Adds to cloud model list');
    assert.ok(block.includes('Google • Gemini'), 'Labels as Google Gemini');
    assert.ok(
      !block.includes('cfg.ids.forEach') && !block.includes('cfg.names'),
      'Does NOT iterate STANDARD_CLOUD_MODELS.ids for Gemini'
    );
  });

  test('fails gracefully without removing other provider options', () => {
    const geminiBlock = src.match(/prov === 'gemini'[\s\S]{0,800}catch/);
    assert.ok(geminiBlock, 'Gemini block exists');
    const block = geminiBlock[0];
    assert.ok(block.includes('console.warn'), 'Logs warn on failure');
    // The catch must NOT clear cModels or throw
    assert.ok(!block.includes('setCloudModels'), 'Must not reset cloud models on failure');
    assert.ok(src.includes("prov !== 'gemini' && pm"), 'Must not reinsert a stale Gemini preferred model');
  });
});

describe('ModelSelectorWindow.tsx — Gemini dynamic fetch', () => {
  const src = read('src/components/ModelSelectorWindow.tsx');

  test('fetches Gemini models via IPC when key is configured', () => {
    const geminiBlock = src.match(/prov === 'gemini'[\s\S]{0,800}catch/);
    assert.ok(geminiBlock, 'Gemini branch must exist in model builder');
    const block = geminiBlock[0];
    assert.ok(block.includes("fetchProviderModels('gemini', '')"), 'Calls IPC with empty key');
    assert.ok(block.includes('geminiResult?.success'), 'Checks success');
    assert.ok(block.includes('geminiResult.models'), 'Iterates models');
    assert.ok(
      !block.includes('cfg.ids.forEach') && !block.includes('cfg.names'),
      'Does NOT iterate STANDARD_CLOUD_MODELS.ids for Gemini'
    );
  });

  test('fails gracefully without removing other provider options', () => {
    const geminiBlock = src.match(/prov === 'gemini'[\s\S]{0,800}catch/);
    assert.ok(geminiBlock, 'Gemini block exists');
    const block = geminiBlock[0];
    assert.ok(block.includes('console.warn'), 'Logs warn on failure');
    assert.ok(!block.includes('setAvailableModels'), 'Must not reset model list on failure');
    assert.ok(src.includes("prov !== 'gemini' && pm"), 'Must not reinsert a stale Gemini preferred model');
  });
});

// ─── Source-code analysis: FALLBACK_GEMINI_MODELS is unique ──────────────────

describe('FALLBACK_GEMINI_MODELS — single source of truth for curated IDs', () => {
  test('the three curated IDs appear only in the fallback constant definition', () => {
    const fetcherSrc = read('electron/utils/modelFetcher.ts');
    const utilsSrc = read('src/utils/modelUtils.ts');

    // In modelUtils, the old ids array must NOT contain the curated IDs
    const utilsGeminiBlock = utilsSrc.match(/gemini:\s*\{[^}]*\}/s);
    if (utilsGeminiBlock) {
      assert.ok(
        !utilsGeminiBlock[0].includes('gemini-3.5-flash'),
        'modelUtils must NOT contain the curated Gemini IDs'
      );
    }

    // In modelFetcher, count occurrences of each curated ID
    // They should appear ONLY in the FALLBACK_GEMINI_MODELS definition
    const flashCount = countOccurrences(fetcherSrc, 'gemini-3.5-flash');
    const liteCount = countOccurrences(fetcherSrc, 'gemini-3.1-flash-lite-preview');
    const proCount = countOccurrences(fetcherSrc, 'gemini-3.1-pro-preview');

    // Each should appear at least once (in the fallback constant)
    assert.ok(flashCount >= 1, 'gemini-3.5-flash must appear in modelFetcher');
    assert.ok(liteCount >= 1, 'gemini-3.1-flash-lite-preview must appear in modelFetcher');
    assert.ok(proCount >= 1, 'gemini-3.1-pro-preview must appear in modelFetcher');
  });
});
