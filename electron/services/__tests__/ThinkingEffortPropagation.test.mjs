import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

async function loadLLMHelper() {
  const helperPath = path.resolve(repoRoot, 'dist-electron/electron/LLMHelper.js');
  return import(pathToFileURL(helperPath).href);
}

async function loadRouter() {
  const routerPath = path.resolve(repoRoot, 'dist-electron/electron/llm/ProviderRouter.js');
  return import(pathToFileURL(routerPath).href);
}

describe('Thinking & Reasoning Effort Control (2026 Frontiers)', () => {
  test('ProviderRouter returns 2026 frontier defaults', async () => {
    const { ProviderRouter } = await loadRouter();
    const router = new ProviderRouter();
    
    // Test default models returned by router helper
    const geminiChoice = router.selectProvider({ preferLowLatency: true, providerHealth: { groq: 'down', gemini: 'healthy' } });
    assert.equal(geminiChoice.provider, 'gemini');
    assert.equal(geminiChoice.model, 'gemini-3.8-flash');

    const claudeChoice = router.selectProvider({ actionType: 'summary', providerHealth: { claude: 'healthy', openai: 'down', groq: 'down' } });
    assert.equal(claudeChoice.provider, 'claude');
    assert.equal(claudeChoice.model, 'claude-sonnet-5');
  });

  test('resolveThinkingEffort adapts to live vs prep context under auto policy', async () => {
    const { LLMHelper } = await loadLLMHelper();
    const helper = Object.create(LLMHelper.prototype);

    // Auto defaults: low for live interview latency, medium for prep/recap
    assert.equal(helper.resolveThinkingEffort('live'), 'low');
    assert.equal(helper.resolveThinkingEffort('prep'), 'medium');
  });

  test('Gemini thinking config injects thinkingLevel low in live mode and medium in prep', async () => {
    const { LLMHelper } = await loadLLMHelper();
    const helper = Object.create(LLMHelper.prototype);

    const liveCfg = helper.getGeminiThinkingConfig('gemini-3.8-flash', 'live');
    assert.deepEqual(liveCfg, {
      thinkingConfig: { thinkingLevel: 'low' },
    });

    const prepCfg = helper.getGeminiThinkingConfig('gemini-3.8-flash', 'prep');
    assert.deepEqual(prepCfg, {
      thinkingConfig: { thinkingLevel: 'medium' },
    });

    // Models with 'lite' or legacy versions omit thinkingConfig
    const liteCfg = helper.getGeminiThinkingConfig('gemini-2.5-flash-lite', 'live');
    assert.deepEqual(liteCfg, {});
  });

  test('OpenAI reasoning config attaches reasoning_effort for GPT-6 and reasoning models', async () => {
    const { LLMHelper } = await loadLLMHelper();
    const helper = Object.create(LLMHelper.prototype);

    const gpt6Live = helper.getOpenAiReasoningConfig('gpt-6-astra', 'live');
    assert.deepEqual(gpt6Live, { reasoning_effort: 'low' });

    const gpt6Prep = helper.getOpenAiReasoningConfig('gpt-6-astra', 'prep');
    assert.deepEqual(gpt6Prep, { reasoning_effort: 'medium' });

    const gpt4oMini = helper.getOpenAiReasoningConfig('gpt-4o-mini', 'live');
    assert.deepEqual(gpt4oMini, {});
  });

  test('Claude thinking config attaches budget_tokens for Claude 5 / Opus 5.5', async () => {
    const { LLMHelper } = await loadLLMHelper();
    const helper = Object.create(LLMHelper.prototype);

    const claudeLive = helper.getClaudeThinkingConfig('claude-sonnet-5', 'live');
    assert.deepEqual(claudeLive, {
      thinking: { type: 'enabled', budget_tokens: 1024 },
    });

    const claudePrep = helper.getClaudeThinkingConfig('claude-opus-5.5', 'prep');
    assert.deepEqual(claudePrep, {
      thinking: { type: 'enabled', budget_tokens: 4096 },
    });
  });
});
