import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const rateLimiterSrc = readFileSync(path.join(repoRoot, 'electron/services/RateLimiter.ts'), 'utf8');
const llmHelperSrc = readFileSync(path.join(repoRoot, 'electron/LLMHelper.ts'), 'utf8');
const intelligenceEngineSrc = readFileSync(path.join(repoRoot, 'electron/IntelligenceEngine.ts'), 'utf8');
const sessionTrackerSrc = readFileSync(path.join(repoRoot, 'electron/SessionTracker.ts'), 'utf8');
const interfaceSrc = readFileSync(path.join(repoRoot, 'src/components/AnswerCueInterface.tsx'), 'utf8');

test('RateLimiter: acquire accepts AbortSignal and removes waiter on abort', () => {
  assert.match(rateLimiterSrc, /public\s+async\s+acquire\s*\(\s*abortSignal\?\s*:\s*AbortSignal\s*\)/);
  assert.match(rateLimiterSrc, /if\s*\(\s*abortSignal\?\.aborted\s*\)/);
  assert.match(rateLimiterSrc, /abortSignal\.addEventListener\s*\(\s*['"]abort['"]/);
  assert.match(rateLimiterSrc, /this\.waitQueue\.splice\s*\(\s*idx,\s*1\s*\)/);
});

test('LLMHelper: all streaming provider methods pass abortSignal to RateLimiter', () => {
  assert.match(llmHelperSrc, /this\.rateLimiters\.gemini\.acquire\s*\(\s*abortSignal\s*\)/);
  assert.match(llmHelperSrc, /this\.rateLimiters\.groq\.acquire\s*\(\s*abortSignal\s*\)/);
  assert.match(llmHelperSrc, /this\.rateLimiters\.openai\.acquire\s*\(\s*params\.abortSignal\s*\)/);
  assert.match(llmHelperSrc, /this\.rateLimiters\.claude\.acquire\s*\(\s*abortSignal\s*\)/);
  assert.match(llmHelperSrc, /this\.rateLimiters\.deepseek\.acquire\s*\(\s*abortSignal\s*\)/);
});

test('IntelligenceEngine: speculative inference debounce is tuned to 800ms and togglable', () => {
  assert.match(intelligenceEngineSrc, /SPECULATIVE_DEBOUNCE_MS\s*=\s*800/);
  assert.match(intelligenceEngineSrc, /speculativeInferenceEnabled\s*:\s*boolean/);
  assert.match(intelligenceEngineSrc, /setSpeculativeInferenceEnabled\s*\(\s*enabled\s*:\s*boolean\s*\)/);
  assert.match(intelligenceEngineSrc, /isSpeculativeInferenceEnabled\s*\(\s*\)/);
  assert.match(intelligenceEngineSrc, /if\s*\(\s*!this\.speculativeInferenceEnabled\s*\)\s*return;/);
  assert.match(intelligenceEngineSrc, /this\.session\?\.setBusy\s*\(\s*mode\s*!==\s*['"]idle['"]\s*\)/);
});

test('SessionTracker: compactTranscriptIfNeeded defers background LLM compaction during active queries', () => {
  assert.match(sessionTrackerSrc, /private\s+isBusy\s*:\s*boolean\s*=\s*false/);
  assert.match(sessionTrackerSrc, /setBusy\s*\(\s*busy\s*:\s*boolean\s*\)/);
  assert.match(sessionTrackerSrc, /if\s*\(\s*this\.isBusy\s*\)\s*\{/);
  assert.match(sessionTrackerSrc, /deferred compaction during active query/);
});

test('AnswerCueInterface: message list is windowed to 20 messages in active DOM', () => {
  assert.match(interfaceSrc, /MAX_DOM_MESSAGES\s*=\s*20/);
  assert.match(interfaceSrc, /const\s+\[showAllMessages,\s*setShowAllMessages\]\s*=\s*useState\(false\)/);
  assert.match(interfaceSrc, /hiddenMessageCount/);
  assert.match(interfaceSrc, /Show\s*\{hiddenMessageCount\}\s*earlier/);
});

test('RateLimiter runtime: aborting while queued removes waiter and rejects immediately', async () => {
  const { RateLimiter } = await import('../RateLimiter.ts');
  const limiter = new RateLimiter(0, 0); // 0 burst, 0 refill
  const ac = new AbortController();

  let rejectedError = null;
  const acquirePromise = limiter.acquire(ac.signal).catch(err => {
    rejectedError = err;
  });

  // Wait one tick to ensure acquire is in waitQueue
  await new Promise(r => setImmediate(r));

  // Abort while waiting
  ac.abort();

  await acquirePromise;

  assert.ok(rejectedError, 'acquire should have rejected on abort');
  assert.match(rejectedError.message, /aborted/i);

  limiter.destroy();
});

test('RateLimiter runtime: already-aborted signal rejects immediately without queuing', async () => {
  const { RateLimiter } = await import('../RateLimiter.ts');
  const limiter = new RateLimiter(0, 0);
  const ac = new AbortController();
  ac.abort();

  await assert.rejects(
    () => limiter.acquire(ac.signal),
    /Request aborted before rate limiter token acquired/
  );

  limiter.destroy();
});
