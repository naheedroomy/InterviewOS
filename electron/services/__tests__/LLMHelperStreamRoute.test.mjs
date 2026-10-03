import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === 'electron') return { app: { getPath: () => '/tmp' } };
  return originalLoad.call(this, id, parent, isMain);
};
let LLMHelper;
try {
  ({ LLMHelper } = require(path.resolve(process.cwd(), 'dist-electron/electron/LLMHelper.js')));
} finally {
  Module._load = originalLoad;
}

// Build only the route-capture portion; no network clients or OS resources.
const helper = Object.create(LLMHelper.prototype);
helper.streamRouteContext = new AsyncLocalStorage();
helper.lastRoutedProvider = null;

async function* response(provider, gate) {
  yield* helper.recordRoutedStream(provider, (async function* () {
    yield `${provider}:first`;
    await gate;
    yield `${provider}:last`;
  })());
}

test('concurrent streams retain their own committed provider at completion', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = helper.withStreamRoute(async () => {
    const tokens = [];
    for await (const token of response('openai', gate)) tokens.push(token);
    return tokens;
  });
  const second = helper.withStreamRoute(async () => {
    const tokens = [];
    for await (const token of response('ollama', gate)) tokens.push(token);
    return tokens;
  });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, { result: ['openai:first', 'openai:last'], provider: 'openai' });
  assert.deepEqual(b, { result: ['ollama:first', 'ollama:last'], provider: 'ollama' });
});

test('a stream with no committed provider never inherits another stream route', async () => {
  const noRoute = helper.withStreamRoute(async () => 'identity reply');
  const withRoute = helper.withStreamRoute(async () => {
    helper.commitStreamRoute('codex-cli');
    return 'answer';
  });
  assert.deepEqual(await noRoute, { result: 'identity reply', provider: null });
  assert.deepEqual(await withRoute, { result: 'answer', provider: 'codex-cli' });
});
