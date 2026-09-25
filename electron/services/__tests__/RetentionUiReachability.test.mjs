import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

test('meeting retention IPC exposes get/set and broadcasts updates', () => {
  const ipc = read('electron/ipcHandlers.ts');

  assert.match(ipc, /safeHandle\(['"]get-meeting-retention['"]/);
  assert.match(ipc, /SettingsManager\.getInstance\(\)\.get\('meetingRetention'\) \?\? 'forever'/);
  assert.match(ipc, /safeHandle\(['"]set-meeting-retention['"]/);
  assert.match(ipc, /SettingsManager\.getInstance\(\)\.set\('meetingRetention', retention\)/);
  assert.match(ipc, /webContents\.send\('meeting-retention-changed', retention\)/);
  assert.match(ipc, /runMeetingRetentionSweep\(retention\)/, 'setting change must immediately enforce timed expiry');
  assert.match(ipc, /result\.deleted < result\.expired \|\| result\.pending\.length/, 'setting cannot report success if an expired row fails SQL deletion before journaling');
});

test('preload and renderer types expose meeting retention controls', () => {
  const preload = read('electron/preload.ts');
  const types = read('src/types/electron.d.ts');

  assert.match(preload, /getMeetingRetention: \(\) => ipcRenderer\.invoke\('get-meeting-retention'\)/);
  assert.match(preload, /setMeetingRetention:[\s\S]{0,120}ipcRenderer\.invoke\('set-meeting-retention', retention\)/);
  assert.match(preload, /ipcRenderer\.on\('meeting-retention-changed', subscription\)/);
  assert.match(types, /getMeetingRetention: \(\) => Promise<'forever' \| '7d' \| '30d' \| 'never'>/);
  assert.match(types, /setMeetingRetention: \(retention: 'forever' \| '7d' \| '30d' \| 'never'\) => Promise<\{ success: boolean; error\?: string \}>/);
});

test('SettingsOverlay offers all retention policies and explains past versus future data', () => {
  const source = read('src/components/SettingsOverlay.tsx');

  assert.match(source, /const \[meetingRetention, setMeetingRetention\]/);
  assert.match(source, /getMeetingRetention\?\.\(\)\.then\(setMeetingRetention\)/);
  assert.match(source, /window\.electronAPI\.setMeetingRetention\(nextRetention\)/);
  assert.match(source, /<select[\s\S]*id="meeting-retention"[\s\S]*<option value="forever">[\s\S]*<option value="30d">[\s\S]*<option value="7d">[\s\S]*<option value="never">/);
  assert.match(source, /Time limits remove meeting history, transcripts, summaries, and owned screenshots/);
  assert.match(source, /keeps existing history/);
  assert.match(source, /retention_cleanup_pending/);
});

test('main starts a retention sweep on launch and schedules periodic retries', () => {
  const source = read('electron/main.ts');
  assert.match(source, /const sweepMeetingRetention = \(\) =>/);
  assert.match(source, /sweepMeetingRetention\(\);\s*const retentionInterval = setInterval\(sweepMeetingRetention, 60 \* 60 \* 1000\)/);
});

test('launcher startMeeting metadata carries doNotPersist when retention is never', () => {
  const source = read('src/App.tsx');

  assert.match(source, /getMeetingRetention\?\.\(\)/);
  assert.match(source, /doNotPersist: meetingRetention === 'never'/);
  assert.match(source, /startMeeting\(\{[\s\S]*audio: \{ inputDeviceId, outputDeviceId \},[\s\S]*doNotPersist/s);
});
