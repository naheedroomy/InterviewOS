/**
 * SettingsAndModelSelectors.test.mjs
 *
 * Verifies UI integration for modern 2026 AI providers (OpenAI, Claude, Gemini, DeepSeek),
 * Thinking Effort Controls, and OpenAI-Compatible Custom Endpoints.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('AIProvidersSettings — 2026 Providers & Custom Endpoints UI', () => {
  const src = read('src/components/settings/AIProvidersSettings.tsx');

  test('includes deepseek in ProviderId and PROVIDER_ORDER', () => {
    assert.ok(src.includes("'deepseek'"), 'deepseek must be in provider types');
    assert.ok(src.includes("deepseek: 'DeepSeek'"), 'PROVIDER_LABELS must label DeepSeek');
    assert.ok(src.includes("deepseek: 'https://platform.deepseek.com/api_keys'"), 'DeepSeek key URL must exist');
  });

  test('manages Thinking / Reasoning Effort state and IPC', () => {
    assert.ok(src.includes('thinkingEffort'), 'thinkingEffort state must exist');
    assert.ok(src.includes('getThinkingEffort'), 'getThinkingEffort IPC must be invoked');
    assert.ok(src.includes('setThinkingEffort'), 'setThinkingEffort IPC must be invoked');
    assert.ok(src.includes('Auto (Adaptive)'), 'Auto adaptive option must be rendered');
  });

  test('manages OpenAI-Compatible Custom Endpoints', () => {
    assert.ok(src.includes('OpenAICompatibleEndpoint'), 'OpenAICompatibleEndpoint interface must exist');
    assert.ok(src.includes('getOpenAICompatibleEndpoints'), 'getOpenAICompatibleEndpoints IPC must be called');
    assert.ok(src.includes('saveOpenAICompatibleEndpoint'), 'saveOpenAICompatibleEndpoint IPC must be called');
    assert.ok(src.includes('deleteOpenAICompatibleEndpoint'), 'deleteOpenAICompatibleEndpoint IPC must be called');
    assert.ok(src.includes('fetchOpenAICompatibleModels'), 'fetchOpenAICompatibleModels IPC must be called');
    assert.ok(src.includes('testOpenAICompatibleEndpoint'), 'testOpenAICompatibleEndpoint IPC must be called');
  });

  test('includes enabled custom endpoints in defaultModelOptions', () => {
    assert.ok(src.includes('endpoints') && src.includes('options.push({ id: ep.id'), 'endpoints must be mapped to defaultModelOptions');
  });
});

describe('Model Selectors — 2026 Models & Custom Endpoints', () => {
  const windowSrc = read('src/components/ModelSelectorWindow.tsx');
  const selectorSrc = read('src/components/ui/ModelSelector.tsx');

  test('ModelSelectorWindow loads and includes openAICompatibleEndpoints', () => {
    assert.ok(windowSrc.includes('getOpenAICompatibleEndpoints'), 'Must load openAICompatibleEndpoints');
    assert.ok(windowSrc.includes("provider: 'openai-compatible'"), 'Must tag custom endpoint with openai-compatible provider');
  });

  test('ModelSelector displays 2026 frontier models', () => {
    assert.ok(selectorSrc.includes('gemini-3.8-flash'), 'gemini-3.8-flash must be present in display mapping');
    assert.ok(selectorSrc.includes('gemini-3.8-live'), 'gemini-3.8-live must be present in display mapping');
    assert.ok(selectorSrc.includes('claude-opus-5.5'), 'claude-opus-5.5 must be present in display mapping');
    assert.ok(selectorSrc.includes('claude-sonnet-5'), 'claude-sonnet-5 must be present in display mapping');
    assert.ok(selectorSrc.includes('gpt-6-astra'), 'gpt-6-astra must be present in display mapping');
    assert.ok(selectorSrc.includes('deepseek-v4.1-flash'), 'deepseek-v4.1-flash must be present in display mapping');
  });

  test('ModelSelector renders openAIEndpoints in custom tab', () => {
    assert.ok(selectorSrc.includes('getOpenAICompatibleEndpoints'), 'Must load openAIEndpoints');
    assert.ok(selectorSrc.includes('openAIEndpoints.filter'), 'Must render active openAIEndpoints in custom tab');
  });
});

describe('Preload & Typings Alignment', () => {
  const dts = read('src/types/electron.d.ts');
  const preload = read('electron/preload.ts');

  test('electron.d.ts defines all endpoint and thinking methods', () => {
    assert.ok(dts.includes('getOpenAICompatibleEndpoints:'), 'getOpenAICompatibleEndpoints must be typed');
    assert.ok(dts.includes('saveOpenAICompatibleEndpoint:'), 'saveOpenAICompatibleEndpoint must be typed');
    assert.ok(dts.includes('deleteOpenAICompatibleEndpoint:'), 'deleteOpenAICompatibleEndpoint must be typed');
    assert.ok(dts.includes('fetchOpenAICompatibleModels:'), 'fetchOpenAICompatibleModels must be typed');
    assert.ok(dts.includes('testOpenAICompatibleEndpoint:'), 'testOpenAICompatibleEndpoint must be typed');
    assert.ok(dts.includes('getThinkingEffort:'), 'getThinkingEffort must be typed');
    assert.ok(dts.includes('setThinkingEffort:'), 'setThinkingEffort must be typed');
  });

  test('preload.ts implements all endpoint and thinking methods', () => {
    assert.ok(preload.includes("ipcRenderer.invoke('get-openai-compatible-endpoints')"));
    assert.ok(preload.includes("ipcRenderer.invoke('save-openai-compatible-endpoint'"));
    assert.ok(preload.includes("ipcRenderer.invoke('delete-openai-compatible-endpoint'"));
    assert.ok(preload.includes("ipcRenderer.invoke('fetch-openai-compatible-models'"));
    assert.ok(preload.includes("ipcRenderer.invoke('test-openai-compatible-endpoint'"));
    assert.ok(preload.includes("ipcRenderer.invoke('get-thinking-effort')"));
    assert.ok(preload.includes("ipcRenderer.invoke('set-thinking-effort'"));
  });
});
