// @ts-check
// Regression tests for the lazy-init MicrophoneCapture fix.
//
// Structural/static tests against Rust source — do not exercise CoreAudio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const nativeLibPath = path.join(repoRoot, 'native-module', 'src', 'lib.rs');
const micCaptureTsPath = path.join(repoRoot, 'electron', 'audio', 'MicrophoneCapture.ts');

const nativeLib = readFileSync(nativeLibPath, 'utf8');
const micCaptureTs = readFileSync(micCaptureTsPath, 'utf8');

// ── Structure: split the file at known landmark positions ────────────────────

// The file has two key structures we care about:
//   #[napi]
//   impl MicrophoneCapture { ... }
//   #[napi] (the last method in the impl block — stop())
//   ...
//   }
//   impl Drop for MicrophoneCapture { ... }

const implMicStart = nativeLib.indexOf('impl MicrophoneCapture');
assert.ok(implMicStart >= 0, 'precondition: impl MicrophoneCapture block found');

const implDropStart = nativeLib.indexOf('impl Drop for MicrophoneCapture');
assert.ok(implDropStart >= 0, 'precondition: impl Drop for MicrophoneCapture found');

// Within the impl block, find each method by its #[napi] marker.
// This includes #[napi(constructor)] for new().
const methodNapiPositions = [];
let pos = 0;
while ((pos = nativeLib.indexOf('#[napi]', pos)) >= 0) {
  methodNapiPositions.push(pos);
  pos += 7;
}

// The last #[napi] in the impl MicrophoneCapture block is for stop().
// The second-to-last is for start().
// The first is for new().

// ── Constructor guard: new() must NOT contain MicrophoneStream::new ──────────

test('Rust MicrophoneCapture::new() does NOT call MicrophoneStream::new()', () => {
  // Find new()'s #[napi(constructor)] — uses separate marker
  const newCtorNapi = nativeLib.indexOf('#[napi(constructor)]', implMicStart);
  assert.ok(newCtorNapi >= 0, 'new() #[napi(constructor)] found');

  // The next #[napi] after new() is get_sample_rate
  const nextNapi = methodNapiPositions.find(p => p > newCtorNapi);
  assert.ok(nextNapi !== undefined, 'next #[napi] after new() found');

  const newNapi = newCtorNapi;

  const newBody = nativeLib.slice(newNapi, nextNapi);

  // Must NOT call MicrophoneStream::new
  const hasStreamNew = /MicrophoneStream::new/.test(newBody);
  assert.ok(
    !hasStreamNew,
    'BUG: MicrophoneCapture::new() MUST NOT call MicrophoneStream::new()',
  );

  // Must log "Created (lazy)"
  assert.ok(
    /println!\(.*Created \(lazy\)/.test(newBody),
    'new() should log "Created (lazy)"',
  );

  // Must not contain any CPAL function calls (comments about CoreAudio are OK)
  assert.ok(
    !/cpal::|default_host\(\)|build_input_stream\(|default_input_config\(|supported_input_configs\(/.test(newBody),
    'new() must not contain CPAL function calls',
  );
});

// ── Stop guard: stop() must NOT call join() ─────────────────────────────────

test('Rust MicrophoneCapture::stop() does NOT call join()', () => {
  // Find stop() — its #[napi] is the methodNapiPositions entry whose
  // next #[napi] is the one at or after implDropStart (or which is the
  // last one before implDropStart).
  const stopNapi = [...methodNapiPositions].reverse()
    .find(p => p > implMicStart && p < implDropStart);
  assert.ok(stopNapi !== undefined, 'stop() #[napi] found');

  const stopBody = nativeLib.slice(stopNapi, implDropStart);

  // Must NOT contain .join()
  const hasJoin = /\.join\(/.test(stopBody);
  assert.ok(
    !hasJoin,
    'BUG: MicrophoneCapture::stop() MUST NOT call .join()',
  );

  // Must bump generation
  assert.ok(
    /fetch_add\(1, Ordering::Release\)/.test(stopBody),
    'stop() must bump generation counter',
  );

  // Must signal stop BEFORE bumping generation
  const signalIdx = stopBody.indexOf('.store(true, Ordering::SeqCst)');
  const bumpIdx = stopBody.indexOf('fetch_add(1, Ordering::Release)');
  assert.ok(signalIdx >= 0, 'stop() must signal stop');
  assert.ok(bumpIdx > signalIdx, 'stop() must signal stop BEFORE bumping generation');
});

// ── Start guard: start() must call MicrophoneStream::new on worker thread ───

test('Rust MicrophoneCapture::start() has MicrophoneStream::new in thread spawn', () => {
  // start() is the second-to-last #[napi] in the impl block
  const s = methodNapiPositions.filter(p => p > implMicStart && p < implDropStart);
  const startNapi = s[s.length - 2]; // second from last (start before stop)
  assert.ok(startNapi !== undefined, 'start() #[napi] found');

  // Find thread::spawn inside start()
  const spawnStart = nativeLib.indexOf('thread::spawn(move ||', startNapi);
  assert.ok(spawnStart >= 0 && spawnStart < implDropStart,
    'start() must contain thread::spawn(move ||');

  const spawnBody = nativeLib.slice(spawnStart, spawnStart + 1500);

  // MicrophoneStream::new must be inside the spawn closure
  assert.ok(
    /MicrophoneStream::new/.test(spawnBody),
    'MicrophoneStream::new() must be called inside spawned thread',
  );

  // Generation checks must be present after each blocking boundary
  assert.ok(
    /is_current\(\)/.test(spawnBody),
    'worker must check is_current() after blocking boundaries',
  );
});

// ── JS wrapper: no "Eager Init" log ─────────────────────────────────────────

test('JS MicrophoneCapture constructor does not log "Eager Init"', () => {
  assert.ok(
    !/Eager Init/.test(micCaptureTs),
    'JS wrapper should not log "Eager Init"',
  );
});

// ── JS wrapper: stop comment reflects no-join ────────────────────────────────

test('JS MicrophoneCapture stop() comment describes non-blocking teardown', () => {
  assert.ok(
    /NEVER joins/.test(micCaptureTs),
    'stop() jsdoc should mention NEVER joins',
  );
});
