import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const importDist = rel => import(pathToFileURL(path.join(repoRoot, 'dist-electron/electron', rel)).href);

test('standard cloud model list retains OpenAI/Claude/Groq/DeepSeek allowlists; Gemini uses empty dynamic arrays', () => {
  const src = read('src/utils/modelUtils.ts');

  // Non-Gemini providers keep their allowlists
  assert.match(src, /ids:\s*\['chat-latest', 'gpt-5\.5', 'gpt-5\.5-thinking-low', 'gpt-5\.4'\]/);
  assert.match(src, /names:\s*\['GPT 5\.5 Instant', 'GPT 5\.5', 'GPT 5\.5 Thinking', 'GPT 5\.4'\]/);

  // Gemini ids/names/descs are empty — dynamic discovery has replaced the hardcoded list
  const geminiBlock = src.match(/gemini:\s*\{[^}]*\}/s);
  assert.ok(geminiBlock, 'Gemini config block must exist');
  assert.ok(geminiBlock[0].includes('ids: []'), 'Gemini ids must be empty');
  assert.ok(geminiBlock[0].includes('names: []'), 'Gemini names must be empty');
  assert.ok(geminiBlock[0].includes('descs: []'), 'Gemini descs must be empty');
  // The three old curated IDs must NOT appear in modelUtils
  assert.ok(!geminiBlock[0].includes('gemini-3.5-flash'), 'gemini-3.5-flash must NOT be in modelUtils');

  // isAllowedStandardCloudModel accepts arbitrary Gemini model IDs
  assert.ok(src.includes("provider === 'gemini'") && src.includes('!!modelId'),
    'isAllowedStandardCloudModel must short-circuit true for Gemini');
});

test('OpenAI and Gemini defaults stay aligned across runtime constants and connection tests', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const ipcHandlers = read('electron/ipcHandlers.ts');

  assert.match(llmHelper, /const OPENAI_MODEL = "chat-latest"/);
  assert.match(llmHelper, /const GEMINI_FLASH_MODEL = "gemini-3.5-flash"/);
  assert.match(ipcHandlers, /model:\s*'chat-latest'/);
  assert.match(ipcHandlers, /max_completion_tokens:\s*10/);
  assert.match(ipcHandlers, /models\/gemini-3.5-flash:generateContent/);
});

test('current LLM config reports chat-latest as OpenAI for the launcher readiness card', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const launcher = read('src/components/Launcher.tsx');

  assert.match(llmHelper, /type CurrentLlmProvider = [^\n]*"openai"/);
  assert.match(llmHelper, /if \(this\.isOpenAiModel\(this\.currentModelId\)\) return "openai";/);
  assert.match(launcher, /modelId === 'chat-latest' \|\| modelId\.includes\('gpt'\) \|\| modelId\.includes\('openai'\)/);
});

test('GPT 5.5 Thinking dropdown ID maps to GPT 5.5 with low reasoning', () => {
  const llmHelper = read('electron/LLMHelper.ts');

  assert.match(llmHelper, /const OPENAI_GPT_55_MODEL = "gpt-5\.5"/);
  assert.match(llmHelper, /const OPENAI_GPT_55_THINKING_LOW_MODEL = "gpt-5\.5-thinking-low"/);
  assert.match(llmHelper, /return OPENAI_GPT_55_MODEL;/);
  assert.match(llmHelper, /return \{ reasoning_effort: 'low' \};/);
  assert.match(llmHelper, /\.\.\.reasoningConfig/);
});

test('OpenAI streaming has first-token timeout, retry, fallback, and cancellation wiring', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const whatToAnswer = read('electron/llm/WhatToAnswerLLM.ts');
  const intelligenceEngine = read('electron/IntelligenceEngine.ts');

  assert.match(llmHelper, /const OPENAI_STREAM_FIRST_TOKEN_TIMEOUT_MS = 8_000/);
  assert.match(llmHelper, /const OPENAI_STREAM_MAX_ATTEMPTS_PER_MODEL = 2/);
  assert.match(llmHelper, /const OPENAI_STREAM_FALLBACK_MODEL = "gpt-5\.4"/);
  assert.match(llmHelper, /createOpenAiFirstTokenTimeoutError/);
  assert.match(llmHelper, /OPENAI_FIRST_TOKEN_TIMEOUT/);
  assert.match(llmHelper, /OPENAI_EMPTY_STREAM/);
  assert.match(llmHelper, /streamOpenAiCompletionAttempt/);
  assert.match(llmHelper, /streamOpenAiWithRetry/);
  assert.match(llmHelper, /falling back to Gemini streaming/);
  assert.match(whatToAnswer, /abortSignal\?: AbortSignal/);
  assert.match(whatToAnswer, /packetScopes,\s*abortSignal/);
  assert.match(intelligenceEngine, /streamAbortController = new AbortController\(\)/);
  assert.match(intelligenceEngine, /streamAbortController\.signal/);
});

test('Gemini 3 Flash calls opt into low thinking for live latency', () => {
  const llmHelper = read('electron/LLMHelper.ts');
  const ipcHandlers = read('electron/ipcHandlers.ts');

  assert.match(llmHelper, /thinkingConfig:\s*\{\s*thinkingLevel:\s*'low'/);
  assert.match(llmHelper, /normalized\.startsWith\('gemini-3'\)[\s\S]*!normalized\.includes\('lite'\)/);
  assert.match(llmHelper, /this\.getGeminiThinkingConfig\(model\)/);
  assert.match(llmHelper, /this\.buildGeminiGenerationConfig\(GEMINI_FLASH_MODEL/);
  assert.match(ipcHandlers, /generationConfig:\s*\{[\s\S]*thinkingConfig:\s*\{[\s\S]*thinkingLevel:\s*'low'/);
});

test('OpenAI chat-latest alias is classified as cloud, OpenAI, and vision-capable', async () => {
  const { getModelCapabilities } = await importDist('llm/modelCapabilities.js');
  const { parseModelVersion, classifyModel, classifyTextModel, ModelFamily, TextModelFamily } =
    await importDist('services/ModelVersionManager.js');

  assert.deepEqual(parseModelVersion('chat-latest'), { major: 5, minor: 5, patch: 0, raw: 'chat-latest' });
  assert.deepEqual(parseModelVersion('gpt-5.5'), { major: 5, minor: 5, patch: 0, raw: 'gpt-5.5' });
  assert.deepEqual(parseModelVersion('gpt-5.5-thinking-low'), { major: 5, minor: 5, patch: 0, raw: 'gpt-5.5-thinking-low' });
  assert.deepEqual(parseModelVersion('gemini-3.5-flash'), { major: 3, minor: 5, patch: 0, raw: 'gemini-3.5-flash' });
  assert.equal(classifyModel('chat-latest'), ModelFamily.OPENAI);
  assert.equal(classifyTextModel('chat-latest'), TextModelFamily.OPENAI);

  const caps = getModelCapabilities('chat-latest', false);
  assert.equal(caps.tier, 'cloud');
  assert.equal(caps.supportsImages, true);
});

test('ProviderRouter defaults route OpenAI and Gemini to the updated model IDs', async () => {
  const { ProviderRouter } = await importDist('llm/ProviderRouter.js');
  const router = new ProviderRouter();

  const openai = router.selectProvider({
    actionType: 'summary',
    providerHealth: { claude: 'down', openai: 'healthy', gemini: 'down' },
  });
  assert.equal(openai.provider, 'openai');
  assert.equal(openai.model, 'chat-latest');

  const gemini = router.selectProvider({
    preferLowLatency: true,
    providerHealth: { groq: 'down', gemini: 'healthy' },
  });
  assert.equal(gemini.provider, 'gemini');
  assert.equal(gemini.model, 'gemini-3.5-flash');
});
