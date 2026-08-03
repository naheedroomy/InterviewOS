import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('createSTTProvider switches on provider for google branch', () => {
  const source = read('electron/main.ts');
  const createFn = source.slice(
    source.indexOf('private createSTTProvider(speaker:'),
    source.indexOf('private wireSystemCapture(capture:')
  );

  // Must switch on sttProvider from CredentialsManager
  assert.match(createFn, /if \(sttProvider === 'google'\)/);

  // Google branch must instantiate GoogleSTT
  assert.match(createFn, /const \{ GoogleSTT \} = require\('\.\/audio\/GoogleSTT'\)/);
  assert.match(createFn, /new GoogleSTT\(speaker\)/);

  // Google branch must apply service account credentials when non-empty
  assert.match(createFn, /getGoogleServiceAccountPath/);
  assert.match(createFn, /stt\.setCredentials/);

  // Google branch must never fall back to local-whisper
  const googleBranchFrom = createFn.indexOf("if (sttProvider === 'google'");
  const elseBranch = createFn.indexOf('} else {', googleBranchFrom);
  const googleBranch = createFn.slice(googleBranchFrom, elseBranch + 6);
  assert.doesNotMatch(googleBranch, /LocalWhisperSTT/);
  assert.doesNotMatch(googleBranch, /local-whisper/);
  assert.doesNotMatch(googleBranch, /Moonshine/);

  // else branch (local-whisper default) must create LocalWhisperSTT
  assert.match(createFn, /const \{ LocalWhisperSTT \} = require\('\.\/audio\/LocalWhisperSTT'\)/);
  assert.match(createFn, /new LocalWhisperSTT\(DEFAULT_LOCAL_TRANSCRIPTION_MODEL_ID\)/);
  assert.match(createFn, /lws\.setChannel/);

  // Common listeners must be present after both branches
  // (recognition language, transcript, error, warning, awaiting-audio)
  const afterBranch = createFn.slice(elseBranch || createFn.indexOf('} else {') + 10);
  assert.match(afterBranch, /stt\.setRecognitionLanguage/);
  assert.match(afterBranch, /stt\.on\('transcript'/);
  assert.match(afterBranch, /stt\.on\('error'/);
  assert.match(afterBranch, /stt\.on\('warning'/);
  assert.match(afterBranch, /sendSttStatus/);
});

test('createSTTProvider preserves GoogleSTT permanent error handling', () => {
  const source = read('electron/main.ts');
  const createFn = source.slice(
    source.indexOf('private createSTTProvider(speaker:'),
    source.indexOf('private wireSystemCapture(capture:')
  );

  // Must preserve the PERMANENT_GRPC_CODES pattern
  // (check that the error handler still references auth errors)
  assert.match(createFn, /401/);
  assert.match(createFn, /auth_timeout/);
  assert.match(createFn, /invalid_key/);
  assert.match(createFn, /invalid api.*authentication/);

  // Consecutive error counter must still be present
  assert.match(createFn, /_consecutiveErrors/);
  assert.match(createFn, /\[3, 7, 16\]\.includes\(grpcCode\)/);
});

test('Google STT validates credentials before meeting activation and drains trailing finals', () => {
  const mainSource = read('electron/main.ts');
  const googleSource = read('electron/audio/GoogleSTT.ts');

  assert.match(mainSource, /await GoogleSTT\.validateCredentials\(keyPath\)/);
  assert.match(googleSource, /await client\.initialize\(\)/);
  assert.match(googleSource, /await client\.getProjectId\(\)/);
  assert.match(googleSource, /public finalize\(timeoutMs: number = 2000\): Promise<void>/);
  assert.match(googleSource, /stream\.once\('end', onEnd\)/);
  assert.match(googleSource, /stream\.end\(\)/);
  assert.match(mainSource, /await Promise\.allSettled\(sttDrainPromises\)/);
});

test('createSTTProvider preserves Moonshine preload conditional', () => {
  const source = read('electron/main.ts');
  // Find the preload block in AppState constructor
  const preloadBlock = source.slice(
    source.indexOf("Warm the local Moonshine worker"),
    source.indexOf("// Initialize KeybindManager")
  );

  // Must check for local-whisper before preloading
  assert.match(preloadBlock, /getSttProvider\(\) === 'local-whisper'/);
  assert.match(preloadBlock, /preload\(modelId\)/);
});

test('byte-exact all-zero PCM guard present in wireSystemCapture', () => {
  const source = read('electron/main.ts');
  const wireFn = source.slice(
    source.indexOf('private wireSystemCapture(capture:'),
    source.indexOf('private wireMicCapture(capture:')
  );

  // Must have the zero-guard before writing to STT
  // The guard drops chunks where every byte is 0
  assert.match(wireFn, /chunk\.every\(b => b === 0\)/);
  assert.match(wireFn, /return;/);
  // Must have the write after the guard
  assert.match(wireFn, /this\.googleSTT\?\.write\(chunk\);/);

  // Must NOT substitute the separate 12s peak-to-peak detector
  // Both the peak-to-peak and the byte-exact guard must coexist
  assert.match(wireFn, /peakToPeak/);
  assert.match(wireFn, /every\(b => b === 0\)/);
});

test('byte-exact all-zero PCM guard present in wireMicCapture', () => {
  const source = read('electron/main.ts');
  const wireFn = source.slice(
    source.indexOf('private wireMicCapture(capture:'),
    source.indexOf('private setupSystemAudioPipeline')
  );

  // Must have the zero-guard before writing to STT
  assert.match(wireFn, /chunk\.every\(b => b === 0\)/);
  assert.match(wireFn, /return;/);
  // Must have the write after the guard
  assert.match(wireFn, /this\.googleSTT_User\?\.write\(chunk\);/);

  // Both detectors must coexist
  assert.match(wireFn, /peakToPeak/);
  assert.match(wireFn, /every\(b => b === 0\)/);
});
