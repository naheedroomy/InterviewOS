import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { findSafeHandle, sliceSafeHandleBlock } from './ipcTestUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('CredentialsManager.init() normalizes legacy sttProvider values to local-whisper', () => {
  const source = read('electron/services/CredentialsManager.ts');
  const initSource = source.slice(source.indexOf('public init(): void'), source.indexOf('console.log(\'[CredentialsManager] Initialized\')'));

  // Must detect and correct any non-canonical value
  assert.match(initSource, /stt !== 'local-whisper' && stt !== 'google'/);
  assert.match(initSource, /this\.credentials\.sttProvider = 'local-whisper'/);
  assert.match(initSource, /this\.saveCredentials\(\)/);
});

test('CredentialsManager.getSttProvider() returns canonical type without mutating', () => {
  const source = read('electron/services/CredentialsManager.ts');
  const getterMatch = source.match(/public getSttProvider\(\): 'local-whisper' \| 'google'/);
  assert.ok(getterMatch, 'getSttProvider must return narrowed type');

  // Must NOT call saveCredentials or mutate
  const getterFrom = source.indexOf('public getSttProvider():');
  const getterTo = source.indexOf('public getDeepgramApiKey():', getterFrom);
  const getterBlock = source.slice(getterFrom, getterTo);

  assert.doesNotMatch(getterBlock, /saveCredentials/);
  assert.doesNotMatch(getterBlock, /this\.credentials\.sttProvider =/);
  // Must return the stored value, not hardcoded
  assert.match(getterBlock, /this\.credentials\.sttProvider/);
});

test('CredentialsManager.setSttProvider() accepts only local-whisper and google', () => {
  const source = read('electron/services/CredentialsManager.ts');
  const setterMatch = source.match(/public setSttProvider\(provider: 'local-whisper' \| 'google'\)/);
  assert.ok(setterMatch, 'setSttProvider must accept narrowed type');

  const setterFrom = source.indexOf('public setSttProvider(');
  const setterTo = source.indexOf('public setDeepgramApiKey(', setterFrom);
  const setterBlock = source.slice(setterFrom, setterTo);

  // Must have a runtime guard that rejects invalid values
  assert.match(setterBlock, /provider !== 'local-whisper' && provider !== 'google'/);
  // Must NOT persist for invalid values (early return)
  assert.match(setterBlock, /return;/);
  // Must persist only canonical values
  assert.match(setterBlock, /this\.credentials\.sttProvider = provider/);
  assert.match(setterBlock, /this\.saveCredentials\(\)/);
});

test('StoredCredentials.sttProvider accepts untrusted legacy strings and getter narrows them', () => {
  const source = read('electron/services/CredentialsManager.ts');
  assert.match(source, /sttProvider\??:\s*string/);
  const getterFrom = source.indexOf('public getSttProvider():');
  const getterTo = source.indexOf('public getDeepgramApiKey():', getterFrom);
  const getterBlock = source.slice(getterFrom, getterTo);
  assert.match(getterBlock, /sttProvider === 'google' \? 'google' : 'local-whisper'/);
});

test('set-stt-provider IPC handler validates at runtime', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'set-stt-provider');

  // Must have a runtime guard before persisting
  assert.match(handler, /provider !== 'local-whisper' && provider !== 'google'/);

  // Must reject with error response for invalid values
  assert.match(handler, /success: false/);
  assert.match(handler, /error: 'Invalid STT provider/);

  // Parameter must be narrowed
  assert.match(handler, /provider: 'local-whisper' \| 'google'/);
});

test('get-stt-provider IPC handler fallback returns local-whisper', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'get-stt-provider');

  // Error catch must return 'local-whisper', not 'none'
  assert.match(handler, /return 'local-whisper'/);
  assert.doesNotMatch(handler, /return 'none'/);

  // Normal path delegates to CredentialsManager
  assert.match(handler, /\.getSttProvider\(\)/);
});

test('setAnswerCueApiKey does not force sttProvider to local-whisper (key set)', () => {
  const source = read('electron/services/CredentialsManager.ts');
  const fnStart = source.indexOf('public setAnswerCueApiKey(key: string): void');
  const fnEnd = source.indexOf('public getPreferredModel(provider:', fnStart);
  const fnSource = source.slice(fnStart, fnEnd);

  // Comments may still explain local-only, but the assignment sttProvider = 'local-whisper'
  // must NOT appear inside the if (trimmed) branch (key set path).
  const trimmedBranch = fnSource.slice(fnSource.indexOf('if (trimmed)'), fnSource.indexOf('} else {'));
  assert.doesNotMatch(trimmedBranch, /this\.credentials\.sttProvider\s*=\s*'local-whisper'/,
    'setAnswerCueApiKey must not force sttProvider to local-whisper when a key is set');
});

test('setAnswerCueApiKey does not force sttProvider to local-whisper (key cleared)', () => {
  const source = read('electron/services/CredentialsManager.ts');
  const fnStart = source.indexOf('public setAnswerCueApiKey(key: string): void');
  const fnEnd = source.indexOf('public getPreferredModel(provider:', fnStart);
  const fnSource = source.slice(fnStart, fnEnd);

  // In the else (key cleared) branch, the sttProvider must not be forced either.
  const elseStart = fnSource.indexOf('} else {');
  const elseEnd = fnSource.indexOf('this.saveCredentials();', elseStart);
  const elseBranch = fnSource.slice(elseStart, elseEnd);
  assert.doesNotMatch(elseBranch, /this\.credentials\.sttProvider\s*=\s*'local-whisper'/,
    'setAnswerCueApiKey must not force sttProvider to local-whisper when a key is cleared');
});

test('set-stt-provider IPC handler rejects when meeting is active', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'set-stt-provider');

  // Must check meeting activity before persisting
  assert.match(handler, /getIsMeetingActive\(\)/);
  // Must return error response when meeting is active
  assert.match(handler, /success: false/);
  assert.match(handler, /error: 'Cannot change STT provider while a meeting is active'/);
});

test('get-stored-credentials IPC returns truthful sttProvider from CredentialsManager', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'get-stored-credentials');

  // Must use CredentialsManager.getInstance().getSttProvider(), not hardcoded 'local-whisper'
  // The normal (try) path must call getSttProvider()
  const tryBlock = handler.slice(handler.indexOf('try {'), handler.indexOf('} catch (error: any) {'));
  assert.match(tryBlock, /getSttProvider\(\)/);
  // The error fallback is permitted to hardcode 'local-whisper' as a safe default
  // (the catch block), but the normal path must not.
  assert.doesNotMatch(tryBlock, /sttProvider:\s*'local-whisper'/);
});
