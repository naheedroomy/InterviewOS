import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-retention-'));
const electronStub = new Module('electron');
electronStub.exports = { app: { getPath: name => name === 'userData' ? userData : os.tmpdir() } };
electronStub.loaded = true;
require.cache.electron = electronStub;
try { require.cache[require.resolve('electron')] = electronStub; } catch { /* Node test stub. */ }
const { DatabaseManager } = require(path.join(repoRoot, 'dist-electron/electron/db/DatabaseManager.js'));
const { InterviewWorkspaceStateManager } = require(path.join(repoRoot, 'dist-electron/electron/services/InterviewWorkspaceStateManager.js'));
const { runMeetingRetentionSweep } = require(path.join(repoRoot, 'dist-electron/electron/services/MeetingRetentionPolicy.js'));
const DAY = 24 * 60 * 60 * 1000;

function seed(db, id, createdAt, screenshotPath) {
  db.prepare("INSERT INTO meetings (id, title, start_time, created_at, duration_ms, summary_json) VALUES (?, ?, 0, ?, 1000, '{}')")
    .run(id, id, createdAt);
  db.prepare("INSERT INTO ai_interactions (meeting_id, type, timestamp, metadata_json) VALUES (?, 'screenshot', 0, ?)")
    .run(id, JSON.stringify({ screenshotPath }));
  const chunkId = Number(db.prepare("INSERT INTO chunks (meeting_id, chunk_index, cleaned_text, token_count) VALUES (?, 0, 'chunk', 1)")
    .run(id).lastInsertRowid);
  db.prepare('INSERT INTO embedding_queue (meeting_id, chunk_id) VALUES (?, ?)').run(id, chunkId);
  return chunkId;
}

test('retention sweeps delete only elapsed complete meeting footprints; never and forever preserve history', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  try {
    const now = Date.parse('2026-09-19T12:00:00.000Z');
    const screenshots = path.join(userData, 'screenshots');
    fs.mkdirSync(screenshots, { recursive: true });
    const expiredFile = path.join(screenshots, 'expired.png');
    const recentFile = path.join(screenshots, 'recent.png');
    fs.writeFileSync(expiredFile, 'expired');
    fs.writeFileSync(recentFile, 'recent');
    const expiredChunk = seed(db, 'expired', new Date(now - 31 * DAY).toISOString(), expiredFile);
    seed(db, 'recent', new Date(now - 6 * DAY).toISOString(), recentFile);
    db.exec(`INSERT INTO vec_chunks_768 (chunk_id, embedding) VALUES (${expiredChunk}, zeroblob(3072))`);
    assert.deepEqual(runMeetingRetentionSweep('never', now, manager), { expired: 0, deleted: 0, pending: [] });
    assert.deepEqual(runMeetingRetentionSweep('forever', now, manager), { expired: 0, deleted: 0, pending: [] });
    assert.equal(manager.getMeetingDetails('expired')?.id, 'expired');
    assert.deepEqual(runMeetingRetentionSweep('30d', now, manager), { expired: 1, deleted: 1, pending: [] });
    assert.equal(manager.getMeetingDetails('expired'), null);
    assert.equal(fs.existsSync(expiredFile), false);
    assert.equal(db.prepare('SELECT 1 FROM vec_chunks_768 WHERE chunk_id = ?').get(expiredChunk), undefined);
    assert.equal(db.prepare('SELECT 1 FROM embedding_queue WHERE meeting_id = ?').get('expired'), undefined);
    assert.equal(manager.getMeetingDetails('recent')?.id, 'recent');
    assert.equal(fs.existsSync(recentFile), true);
    assert.deepEqual(runMeetingRetentionSweep('7d', now, manager), { expired: 0, deleted: 0, pending: [] });
    assert.deepEqual(runMeetingRetentionSweep('7d', now + DAY, manager), { expired: 1, deleted: 1, pending: [] });
    assert.equal(manager.getMeetingDetails('recent'), null);
    assert.equal(fs.existsSync(recentFile), false);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    InterviewWorkspaceStateManager.instance = null;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('retention reports an expired meeting when SQL deletion aborts before a cleanup journal exists', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  try {
    const now = Date.parse('2026-09-19T12:00:00.000Z');
    const screenshots = path.join(userData, 'screenshots');
    fs.mkdirSync(screenshots, { recursive: true });
    const ownedPath = path.join(screenshots, 'sql-failure.png');
    fs.writeFileSync(ownedPath, 'fixture');
    seed(db, 'sql-failure', new Date(now - 8 * DAY).toISOString(), ownedPath);
    db.exec("CREATE TRIGGER reject_retention_meeting BEFORE DELETE ON meetings BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END");

    const failed = runMeetingRetentionSweep('7d', now, manager);
    assert.equal(failed.expired, 1);
    assert.equal(failed.deleted, 0, 'an aborted SQL transaction must not count as deleted');
    assert.deepEqual(failed.pending, [], 'failure happened before an external cleanup journal could be created');
    assert.equal(manager.getMeetingDetails('sql-failure')?.id, 'sql-failure');
    assert.equal(fs.existsSync(ownedPath), true);

    db.exec('DROP TRIGGER reject_retention_meeting');
    assert.deepEqual(runMeetingRetentionSweep('7d', now, manager), { expired: 1, deleted: 1, pending: [] });
    assert.equal(manager.getMeetingDetails('sql-failure'), null);
    assert.equal(fs.existsSync(ownedPath), false);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    InterviewWorkspaceStateManager.instance = null;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('retention reports pending vector cleanup and retries it even after switching to forever', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  try {
    const now = Date.parse('2026-09-19T12:00:00.000Z');
    const screenshots = path.join(userData, 'screenshots');
    fs.mkdirSync(screenshots, { recursive: true });
    const ownedPath = path.join(screenshots, 'retry-pending.png');
    fs.writeFileSync(ownedPath, 'fixture');
    const chunkId = seed(db, 'retry-pending', new Date(now - 8 * DAY).toISOString(), ownedPath);
    db.exec('CREATE TABLE vec_chunks_999 (chunk_id INTEGER PRIMARY KEY)');
    db.prepare('INSERT INTO vec_chunks_999 (chunk_id) VALUES (?)').run(chunkId);
    db.exec("CREATE TRIGGER reject_retention_vec BEFORE DELETE ON vec_chunks_999 BEGIN SELECT RAISE(ABORT, 'injected vector failure'); END");

    const failed = runMeetingRetentionSweep('7d', now, manager);
    assert.equal(failed.expired, 1);
    assert.equal(failed.deleted, 0);
    assert.deepEqual(failed.pending, ['retry-pending']);
    assert.equal(manager.getMeetingDetails('retry-pending'), null);
    assert.equal(fs.existsSync(ownedPath), true, 'pending vector cleanup prevents full deletion success');

    db.exec('DROP TRIGGER reject_retention_vec');
    assert.deepEqual(runMeetingRetentionSweep('forever', now, manager), { expired: 0, deleted: 0, pending: [] });
    assert.equal(fs.existsSync(ownedPath), false);
    assert.equal(db.prepare('SELECT 1 FROM vec_chunks_999 WHERE chunk_id = ?').get(chunkId), undefined);
    assert.deepEqual(manager.getPendingMeetingDeletionIds(), []);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    InterviewWorkspaceStateManager.instance = null;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
