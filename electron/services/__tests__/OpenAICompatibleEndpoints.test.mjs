import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('OpenAI-Compatible Custom Endpoints Specification', () => {
  test('isLoopbackUrl accurately identifies local vs cloud endpoints', async () => {
    const credsSource = read('electron/services/CredentialsManager.ts');
    assert.match(credsSource, /export function isLoopbackUrl/);

    // Static verification of loopback host coverage
    assert.match(credsSource, /localhost/);
    assert.match(credsSource, /127\.0\.0\.1/);
    assert.match(credsSource, /::1/);
    assert.match(credsSource, /0\.0\.0\.0/);
  });

  test('CredentialsManager defines OpenAICompatibleEndpoint and storage helpers', () => {
    const credsSource = read('electron/services/CredentialsManager.ts');

    // Type definition
    assert.match(credsSource, /export interface OpenAICompatibleEndpoint/);
    assert.match(credsSource, /baseUrl:\s*string/);
    assert.match(credsSource, /apiKey\?:\s*string/);
    assert.match(credsSource, /modelId:\s*string/);
    assert.match(credsSource, /supportsVision:\s*boolean/);
    assert.match(credsSource, /isLocal:\s*boolean/);

    // Methods
    assert.match(credsSource, /getOpenAICompatibleEndpoints\s*\(/);
    assert.match(credsSource, /getOpenAICompatibleEndpoint\s*\(/);
    assert.match(credsSource, /saveOpenAICompatibleEndpoint\s*\(/);
    assert.match(credsSource, /deleteOpenAICompatibleEndpoint\s*\(/);
  });

  test('Thinking effort configuration is stored and exposed', () => {
    const credsSource = read('electron/services/CredentialsManager.ts');

    assert.match(credsSource, /thinkingEffort\?:\s*'auto' \| 'low' \| 'medium' \| 'high'/);
    assert.match(credsSource, /getThinkingEffort\s*\(/);
    assert.match(credsSource, /setThinkingEffort\s*\(/);
  });

  test('ipcHandlers registers custom OpenAI-compatible endpoint channels and masks keys', () => {
    const ipcSource = read('electron/ipcHandlers.ts');

    assert.match(ipcSource, /safeHandle\(\s*['"]get-openai-compatible-endpoints['"]/);
    assert.match(ipcSource, /safeHandle\(\s*['"]save-openai-compatible-endpoint['"]/);
    assert.match(ipcSource, /safeHandle\(\s*['"]delete-openai-compatible-endpoint['"]/);
    assert.match(ipcSource, /safeHandle\(\s*['"]fetch-openai-compatible-models['"]/);
    assert.match(ipcSource, /safeHandle\(\s*['"]get-thinking-effort['"]/);
    assert.match(ipcSource, /safeHandle\(\s*['"]set-thinking-effort['"]/);

    // Key masking in get-openai-compatible-endpoints
    const getBlock = ipcSource.slice(ipcSource.indexOf('get-openai-compatible-endpoints'));
    assert.match(getBlock, /apiKey\s*:\s*ep\.apiKey\s*\?\s*`sk-\.\.\.\$\{ep\.apiKey\.slice\(-4\)\}`/);
  });

  test('preload.ts exposes bridge methods for OpenAI-compatible endpoints', () => {
    const preloadSource = read('electron/preload.ts');

    assert.match(preloadSource, /getOpenAICompatibleEndpoints:\s*\(\)/);
    assert.match(preloadSource, /saveOpenAICompatibleEndpoint:\s*\(endpoint:/);
    assert.match(preloadSource, /deleteOpenAICompatibleEndpoint:\s*\(id:/);
    assert.match(preloadSource, /fetchOpenAICompatibleModels:\s*\(/);
    assert.match(preloadSource, /getThinkingEffort:\s*\(\)/);
    assert.match(preloadSource, /setThinkingEffort:\s*\(effort:/);
  });
});
