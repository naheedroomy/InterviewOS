import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const launcher = readFileSync(join(repoRoot, 'src/components/Launcher.tsx'), 'utf8');
const settings = readFileSync(join(repoRoot, 'src/components/SettingsOverlay.tsx'), 'utf8');

// ---- Launcher.tsx readiness tests ----

test('hasConfiguredStt returns true for local-whisper unconditionally', () => {
  const fn = /case\s+'local-whisper':\s*return\s+true/;
  assert.match(launcher, fn, 'local-whisper case must return true');
});

test('hasConfiguredStt returns based on path for google', () => {
  const fn = /case\s+'google':\s*return\s+!!creds\?\.googleServiceAccountPath/;
  assert.match(launcher, fn, 'google case must check googleServiceAccountPath');
});

test('hasConfiguredStt default returns false for dormant providers', () => {
  const defaultCase = /default:\s*return\s+false/;
  assert.match(launcher, defaultCase, 'default case must return false');
});

test('hasConfiguredStt no longer has dormant provider cases', () => {
  assert.doesNotMatch(launcher, /case\s+'groq':/, 'groq case must not appear');
  assert.doesNotMatch(launcher, /case\s+'openai':/, 'openai case must not appear');
  assert.doesNotMatch(launcher, /case\s+'deepgram':/, 'deepgram case must not appear');
  assert.doesNotMatch(launcher, /case\s+'elevenlabs':/, 'elevenlabs case must not appear');
  assert.doesNotMatch(launcher, /case\s+'azure':/, 'azure case must not appear');
  assert.doesNotMatch(launcher, /case\s+'ibmwatson':/, 'ibmwatson case must not appear');
  assert.doesNotMatch(launcher, /case\s+'soniox':/, 'soniox case must not appear');
  assert.doesNotMatch(launcher, /case\s+'natively':/, 'natively case must not appear');
});

test('google readiness uses fileExists for path', () => {
  assert.match(launcher, /window\.electronAPI\?\.fileExists\?\.\(path\)/, 'fileExists must be called for google path');
});

test('google sttHint is correct when path missing', () => {
  assert.match(
    launcher,
    /sttHint\s*=\s*'Select a service-account JSON in Settings'\s*;/,
    'sttHint must be the exact text when path is missing',
  );
});

test('google sttHint is correct when fileExists check fails', () => {
  // The hint in the catch / false-exists block must use the exact text
  const hintMatches = launcher.match(/Select a service-account JSON in Settings/g);
  assert.ok(hintMatches && hintMatches.length >= 2, 'sttHint text must appear multiple times (path missing + file not found/catch)');
});

test('refreshReadiness has async sttReady determination for google', () => {
  assert.match(launcher, /await window\.electronAPI\?\.fileExists/, 'refreshReadiness must await fileExists for google');
});

test('sttProviderLabels only contains google and local-whisper', () => {
  const labelMap = launcher.match(/const sttProviderLabels[\s\S]*?\{[\s\S]*?\};/);
  const block = labelMap?.[0] || '';
  assert.match(block, /google/, 'google label must be present');
  assert.match(block, /local-whisper/, 'local-whisper label must be present');
  assert.doesNotMatch(block, /'none'/, 'none must not appear in labels');
  assert.doesNotMatch(block, /groq/, 'groq must not appear in labels');
  assert.doesNotMatch(block, /openai/, 'openai must not appear in labels');
  assert.doesNotMatch(block, /deepgram/, 'deepgram must not appear in labels');
});

// ---- SettingsOverlay.tsx settings tests ----

test('STT ProviderSelect shows exactly two options: Distil Large v3 and Google Cloud', () => {
  assert.match(settings, /id:\s*'local-whisper'.*label:\s*'(Distil Large v3|Moonshine Base)'/, 'Distil Large v3 option must exist');
  assert.match(settings, /id:\s*'google'.*label:\s*'Google Cloud Speech-to-Text'/, 'Google Cloud Speech-to-Text option must exist');
  assert.doesNotMatch(settings, /id:\s*'groq'.*label:\s*'Groq/, 'Groq must not appear in provider options');
  assert.doesNotMatch(settings, /id:\s*'openai'.*label:\s*'OpenAI/, 'OpenAI must not appear in provider options');
  assert.doesNotMatch(settings, /id:\s*'deepgram'/, 'Deepgram must not appear in provider options');
});

test('Google service account file picker shown only when google is selected', () => {
  assert.match(settings, /sttProvider === 'google'.*Service Account JSON/s, 'Service account picker must be gated on google');
});

test('ProviderSelect has a disabled prop wired to isMeetingActive', () => {
  assert.match(settings, /disabled=\{\s*isMeetingActive\s*\}/, 'ProviderSelect must be disabled when meeting is active');
});

test('SettingsOverlay listens for meeting state changes', () => {
  assert.match(settings, /onMeetingStateChanged/, 'Settings must listen to onMeetingStateChanged');
  assert.match(settings, /getMeetingActive/, 'Settings must call getMeetingActive on open');
});

test('ProviderSelect component supports disabled prop', () => {
  assert.match(settings, /disabled\??:\s*boolean/, 'ProviderSelectProps must have optional disabled boolean');
});

// ---- Rollback, path-refresh, generation guard, and start-time revalidation ----

test('handleSttProviderChange rolls back on IPC failure', () => {
  assert.match(settings, /result && !result\.success/, 'must check result.success for IPC failure');
  assert.match(settings, /reloadCanonicalSttProvider/, 'must reload canonical provider on failure');
});

test('handleSttProviderChange saves previous provider for rollback', () => {
  assert.match(settings, /const previous = sttProvider/, 'must capture previous sttProvider before optimistic set');
});

test('credentials-changed listener uses isOpenRef not stale isOpen', () => {
  assert.match(settings, /isOpenRef\.current/, 'must use isOpenRef.current instead of isOpen');
});

test('credentials-changed listener refreshes googleServiceAccountPath', () => {
  assert.match(settings, /setGoogleServiceAccountPath\(creds\.googleServiceAccountPath/, 'must refresh googleServiceAccountPath in credentials-changed listener');
});

test('refreshReadiness uses generation guard before final write', () => {
  assert.match(launcher, /readinessGenRef\.current !== gen/, 'refreshReadiness must guard final write with generation check');
});

test('refreshReadiness bumps generation number at start', () => {
  assert.match(launcher, /readinessGenRef\.current \+= 1/, 'generation must increment on each refreshReadiness');
});

test('startPreparedInterview re-reads credentials before starting', () => {
  assert.match(launcher, /startPreparedInterview[\s\S]*getStoredCredentials/, 'startPreparedInterview must re-read stored credentials');
});

test('startPreparedInterview blocks google start when path missing', () => {
  assert.match(launcher, /startPreparedInterview[\s\S]*sttHint:\s*'Select a service-account JSON in Settings'/, 'must set exact sttHint when blocking google start');
});

test('startPreparedInterview returns to model preflight on google failure', () => {
  assert.match(launcher, /setPreflightStep\('model'\)/, 'must return to model step in preflight on google revalidation failure');
});
