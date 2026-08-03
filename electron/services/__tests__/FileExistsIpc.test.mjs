import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { sliceSafeHandleBlock } from './ipcTestUtils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('fileExists IPC handler validates non-empty absolute path', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'file-exists');

  assert.ok(handler.length > 0, 'file-exists IPC handler must exist');

  // Must reject non-string or empty path
  assert.match(handler, /typeof filePath !== 'string' \|\| !filePath\.trim\(\)/);

  // Must reject relative paths
  assert.match(handler, /path\.isAbsolute/);

  // Must fail-closed (catch block returns false)
  assert.match(handler, /return false/);

  // Must use statSync and check isFile
  assert.match(handler, /statSync/);
  assert.match(handler, /isFile\(\)/);

  // Must never re-throw to renderer
  assert.doesNotMatch(handler, /throw/);
});

test('fileExists IPC handler does not throw into renderer', () => {
  const source = read('electron/ipcHandlers.ts');
  const handler = sliceSafeHandleBlock(source, 'file-exists');

  // The handler must not have unprotected throws
  const throwCount = (handler.match(/throw/g) || []).length;
  assert.ok(throwCount === 0, 'file-exists handler should never throw');
});

test('fileExists bridge exists in preload', () => {
  const preloadSource = read('electron/preload.ts');
  assert.match(preloadSource, /fileExists: \(filePath: string\) => Promise<boolean>/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('file-exists', filePath\)/);
});

test('fileExists declared in ElectronAPI type', () => {
  const dtsSource = read('src/types/electron.d.ts');
  assert.match(dtsSource, /fileExists: \(filePath: string\) => Promise<boolean>/);
});
