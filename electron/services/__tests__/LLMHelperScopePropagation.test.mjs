import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const cjsRequire = createRequire(import.meta.url);

async function loadRouter() {
  const routerPath = path.resolve(__dirname, '../../../dist-electron/electron/llm/ProviderRouter.js');
  return import(pathToFileURL(routerPath).href);
}

// LLMHelper constructs ModelVersionManager, which reads Electron's app paths.
// The focused test runs in Node, so load the compiled production module with a
// minimal Electron shim rather than launching an Electron process.
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-propagation-test-'));
const electronStubModule = new Module('electron');
electronStubModule.exports = {
  app: {
    isReady: () => true,
    getPath: name => (name === 'userData' ? tmpUserData : os.tmpdir()),
    getName: () => 'answercue-test',
    getVersion: () => '0.0.0-test',
  },
  shell: { openPath: async () => '' },
  ipcMain: { on: () => {}, handle: () => {}, removeAllListeners: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
};
electronStubModule.loaded = true;
cjsRequire.cache.electron = electronStubModule;
try { cjsRequire.cache[cjsRequire.resolve('electron')] = electronStubModule; } catch { /* Electron is optional in Node tests. */ }

const { LLMHelper } = cjsRequire(path.resolve(repoRoot, 'dist-electron/electron/LLMHelper.js'));

function buildDeniedHelper({ local = false } = {}) {
  const helper = new LLMHelper(undefined, local);
  helper.getProviderScopePolicy = () => ({ profile_history: false });
  helper.checkOllamaAvailable = async () => local;
  return helper;
}

async function drain(generator) {
  const chunks = [];
  for await (const chunk of generator) chunks.push(chunk);
  return chunks.join('');
}

test('profile and post-call scope denials disable cloud providers while retaining Ollama', async () => {
  const { routeWithScopeFallback } = await loadRouter();

  for (const deniedScope of ['profile_history', 'post_call_summary']) {
    const attempts = routeWithScopeFallback({
      capability: 'chat',
      availability: { hasOpenAI: true, hasGemini: true, hasOllama: true },
      models: { ollama: 'llama3.2' },
      dataScopes: ['transcript', deniedScope, 'screenshots'],
      scopePolicy: { [deniedScope]: false },
    });

    assert.equal(attempts.find(attempt => attempt.provider === 'openai')?.status, 'unavailable');
    assert.equal(attempts.find(attempt => attempt.provider === 'gemini_flash')?.status, 'unavailable');
    assert.equal(attempts.find(attempt => attempt.provider === 'ollama')?.status, 'available');
  }
});

test('screenshot scope denial independently disables cloud providers', async () => {
  const { routeWithScopeFallback } = await loadRouter();
  const attempts = routeWithScopeFallback({
    capability: 'chat',
    availability: { hasOpenAI: true, hasGemini: true, hasOllama: true },
    models: { ollama: 'llama3.2' },
    dataScopes: ['screenshots'],
    scopePolicy: { screenshots: false },
  });

  assert.equal(attempts.find(attempt => attempt.provider === 'openai')?.status, 'unavailable');
  assert.equal(attempts.find(attempt => attempt.provider === 'ollama')?.status, 'available');
});

test('denied message-owned scopes never reach cloud dispatch in each LLMHelper seam', async () => {
  const secret = 'PROFILE_SECRET_DO_NOT_SEND';

  const cases = [
    {
      name: 'chatWithGemini',
      invoke: helper => helper.chatWithGemini(secret, undefined, undefined, true, undefined, ['profile_history']),
      patchCloud: helper => {
        helper.openaiClient = {};
        helper.isOpenAiModel = () => true;
        helper.generateWithOpenai = async payload => `CLOUD:${payload}`;
      },
    },
    {
      name: 'streamChatWithGemini',
      invoke: helper => drain(helper.streamChatWithGemini(secret, undefined, undefined, true, undefined, ['profile_history'])),
      patchCloud: helper => {
        helper.openaiClient = {};
        helper.streamWithOpenai = async function* (payload) { yield `CLOUD:${payload}`; };
      },
    },
    {
      name: 'streamChat',
      invoke: helper => drain(helper.streamChat(secret, undefined, undefined, undefined, true, true, ['profile_history'])),
      patchCloud: helper => {
        helper.openaiClient = {};
        helper.isOpenAiModel = () => true;
        helper.streamWithOpenai = async function* (payload) { yield `CLOUD:${payload}`; };
      },
    },
  ];

  for (const scenario of cases) {
    const helper = buildDeniedHelper();
    scenario.patchCloud(helper);
    const response = await scenario.invoke(helper);

    assert.match(response, /disabled for cloud providers/i, scenario.name);
    assert.doesNotMatch(response, new RegExp(secret), scenario.name);
  }
});

test('Ollama receives the complete denied message-owned payload in each seam', async () => {
  const secret = 'PROFILE_SECRET_FOR_LOCAL_ONLY';
  const cases = [
    {
      name: 'chatWithGemini',
      invoke: helper => helper.chatWithGemini(secret, undefined, undefined, true, undefined, ['profile_history']),
      patchLocal: helper => { helper.callOllama = async payload => `LOCAL:${payload}`; },
    },
    {
      name: 'streamChatWithGemini',
      invoke: helper => drain(helper.streamChatWithGemini(secret, undefined, undefined, true, undefined, ['profile_history'])),
      patchLocal: helper => { helper.callOllama = async payload => `LOCAL:${payload}`; },
    },
    {
      name: 'streamChat',
      invoke: helper => drain(helper.streamChat(secret, undefined, undefined, undefined, true, true, ['profile_history'])),
      patchLocal: helper => {
        helper.streamWithOllama = async function* (message) { yield `LOCAL:${message}`; };
      },
    },
  ];

  for (const scenario of cases) {
    const helper = buildDeniedHelper({ local: true });
    scenario.patchLocal(helper);
    const response = await scenario.invoke(helper);
    assert.match(response, new RegExp(secret), scenario.name);
  }
});

test('LLMHelper always unions transcript with explicit and image scopes', () => {
  const src = read('electron/LLMHelper.ts');

  assert.match(src, /if \(text\.trim\(\)\.length > 0\) scopes\.add\('transcript'\);/);
  assert.doesNotMatch(src, /text\.trim\(\)\.length > 0 && extraScopes\.length === 0/);
  assert.match(src, /if \(imagePaths\?\.length\) scopes\.add\('screenshots'\);/);
});

test('legacy Gemini dispatch keeps optional caller scopes before denial routing', () => {
  const src = read('electron/LLMHelper.ts');

  assert.match(src, /chatWithGemini\([\s\S]*?alternateGroqMessage\?: string,\s*extraDataScopes: ProviderDataScope\[\] = \[\]/);
  assert.match(src, /streamChatWithGemini\([\s\S]*?abortSignal\?: AbortSignal,\s*extraDataScopes: ProviderDataScope\[\] = \[\]/);
  assert.match(src, /const contextScopes = context \? \['transcript' as ProviderDataScope, \.\.\.extraDataScopes, \.\.\.this\.inferContextScopes\(context\)\] : extraDataScopes;/);
  assert.match(src, /return this\.scopeBlockedResponse\(deniedOutboundScopes\);/);
  assert.match(src, /yield this\.scopeBlockedResponse\(deniedOutboundScopes\);/);
});

test('What To Answer diagnostics do not serialize raw prompts', () => {
  const src = read('electron/llm/WhatToAnswerLLM.ts');

  const diagnostic = src.slice(
    src.indexOf("console.log('[WhatToAnswer] input metadata'"),
    src.indexOf('if (MEASURE) tPrompt')
  );

  assert.doesNotMatch(src, /\[WhatToAnswerRaw\]/);
  assert.doesNotMatch(diagnostic, /userMessage:\s*packet\.userMessage/);
  assert.doesNotMatch(diagnostic, /systemPrompt:\s*finalPromptOverride/);
});
