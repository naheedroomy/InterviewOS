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
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-delete-'));
const electronStub = new Module('electron');
electronStub.exports = { app: { getPath: name => name === 'userData' ? userData : os.tmpdir() } };
electronStub.loaded = true;
require.cache.electron = electronStub;
try { require.cache[require.resolve('electron')] = electronStub; } catch { /* Electron is optional in Node tests. */ }
const { DatabaseManager } = require(path.join(repoRoot, 'dist-electron/electron/db/DatabaseManager.js'));
const { InterviewWorkspaceStateManager } = require(path.join(repoRoot, 'dist-electron/electron/services/InterviewWorkspaceStateManager.js'));
const workspaceFile = path.join(userData, 'interview-context', 'workspaces.json');

function seedMeeting(db, id, screenshotPath) {
  db.prepare("INSERT INTO meetings (id, title, start_time, duration_ms, summary_json) VALUES (?, ?, 0, 1000, '{}')").run(id, id);
  db.prepare("INSERT INTO transcripts (meeting_id, speaker, content, timestamp_ms) VALUES (?, 'user', 'transcript', 1)").run(id);
  db.prepare("INSERT INTO ai_interactions (meeting_id, type, timestamp, user_query, ai_response, metadata_json) VALUES (?, 'screenshot', 1, '', '', ?)").run(id, JSON.stringify({ screenshotPath }));
  const chunkId = Number(db.prepare("INSERT INTO chunks (meeting_id, chunk_index, cleaned_text, token_count) VALUES (?, 0, 'chunk', 1)").run(id).lastInsertRowid);
  const summaryId = Number(db.prepare("INSERT INTO chunk_summaries (meeting_id, summary_text) VALUES (?, 'summary')").run(id).lastInsertRowid);
  db.prepare('INSERT INTO embedding_queue (meeting_id, chunk_id) VALUES (?, ?)').run(id, chunkId);
  return { chunkId, summaryId };
}

test('meeting deletion clears persisted footprint, owned files and matching workspace links; failed cleanup is retryable', async () => {
  DatabaseManager.instance = undefined;
  let manager = DatabaseManager.getInstance();
  let db = manager.getDb();
  assert.ok(db);
  try {
    const screenshots = path.join(userData, 'screenshots');
    const extra = path.join(userData, 'extra_screenshots');
    fs.mkdirSync(screenshots, { recursive: true });
    fs.mkdirSync(extra, { recursive: true });
    const ownedPath = path.join(screenshots, 'owned.png');
    const sharedPath = path.join(extra, 'shared.png');
    const externalPath = path.join(userData, 'external.png');
    const symlinkPath = path.join(screenshots, 'symlink.png');
    for (const file of [ownedPath, sharedPath, externalPath]) fs.writeFileSync(file, 'fixture');
    fs.symlinkSync(externalPath, symlinkPath);

    const target = seedMeeting(db, 'target-meeting', ownedPath);
    const other = seedMeeting(db, 'other-meeting', sharedPath);
    db.prepare("UPDATE ai_interactions SET metadata_json = ? WHERE meeting_id = 'other-meeting'").run(JSON.stringify({ screenshotPath: sharedPath }));
    // The target's own shared path must remain while another meeting references it.
    db.prepare("INSERT INTO ai_interactions (meeting_id, type, timestamp, metadata_json) VALUES ('target-meeting', 'screenshot', 2, ?)").run(JSON.stringify({ screenshotPath: sharedPath }));
    db.prepare("INSERT INTO ai_interactions (meeting_id, type, timestamp, metadata_json) VALUES ('target-meeting', 'screenshot', 3, ?)").run(JSON.stringify({ screenshotPath: externalPath }));
    db.prepare("INSERT INTO ai_interactions (meeting_id, type, timestamp, metadata_json) VALUES ('target-meeting', 'screenshot', 4, ?)").run(JSON.stringify({ screenshotPath: symlinkPath }));

    const workspaces = InterviewWorkspaceStateManager.getInstance();
    const ws = workspaces.createWorkspace({ id: 'workspace-1', title: 'Keep preparation' });
    workspaces.finishRun(ws.id, 'target-meeting');
    const withNextRound = workspaces.addRound(ws.id, 'Unrelated round');
    workspaces.finishRoundMeeting(ws.id, withNextRound.activeRoundId, 'other-meeting');
    const before = workspaces.getWorkspace(ws.id);
    assert.ok(before);
    fs.writeFileSync(workspaceFile, '{invalid json');

    db.exec(`INSERT INTO vec_chunks_768 (chunk_id, embedding) VALUES (${target.chunkId}, zeroblob(3072))`);
    db.exec(`INSERT INTO vec_summaries_768 (summary_id, embedding) VALUES (${target.summaryId}, zeroblob(3072))`);
    db.exec(`INSERT INTO vec_chunks_768 (chunk_id, embedding) VALUES (${other.chunkId}, zeroblob(3072))`);
    db.exec('CREATE TABLE vec_chunks_999 (chunk_id INTEGER PRIMARY KEY)');
    db.prepare('INSERT INTO vec_chunks_999 (chunk_id) VALUES (?)').run(target.chunkId);
    db.exec("CREATE TRIGGER fail_vec_delete BEFORE DELETE ON vec_chunks_999 BEGIN SELECT RAISE(ABORT, 'injected vector failure'); END");

    assert.equal(manager.deleteMeetingCompletely('target-meeting'), false, 'workspace cleanup failure must not report complete success');
    assert.equal(manager.getMeetingDetails('target-meeting'), null);
    for (const table of ['transcripts', 'ai_interactions', 'chunks', 'chunk_summaries', 'embedding_queue']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE meeting_id = ?`).get('target-meeting').count, 0, `${table} should be removed`);
    }
    assert.equal(fs.existsSync(ownedPath), true, 'file remains after failed earlier workspace cleanup');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('target-meeting').count, 1);
    assert.ok(db.prepare('SELECT meeting_id FROM meeting_deletion_cleanup WHERE meeting_id = ?').get('target-meeting'));

    // Startup retries each journal independently; malformed workspace JSON must not abort DB initialization.
    db.close();
    DatabaseManager.instance = undefined;
    manager = DatabaseManager.getInstance();
    db = manager.getDb();
    assert.ok(db, 'database initializes despite one malformed pending cleanup');
    assert.ok(db.prepare('SELECT meeting_id FROM meeting_deletion_cleanup WHERE meeting_id = ?').get('target-meeting'));

    fs.writeFileSync(workspaceFile, JSON.stringify({ version: 3, workspaces: [before] }));
    db.exec('DROP TRIGGER fail_vec_delete');
    assert.deepEqual(manager.retryEphemeralVectorCleanup(), ['target-meeting']);
    assert.equal(manager.deleteMeetingCompletely('target-meeting'), true);
    assert.equal(fs.existsSync(ownedPath), false, 'owned screenshot is removed on retry');
    assert.equal(fs.existsSync(sharedPath), true, 'shared meeting screenshot is preserved');
    assert.equal(fs.existsSync(externalPath), true, 'external screenshot is never removed');
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true, 'screenshot symlinks are never removed');
    const after = workspaces.getWorkspace(ws.id);
    assert.ok(after, 'workspace is retained');
    assert.equal(after.rounds.length, 2);
    assert.equal(after.rounds[0].meetingId, undefined);
    assert.equal(after.rounds[0].prepMessages.length, before.rounds[0].prepMessages.length);
    assert.equal(after.rounds[1].meetingId, 'other-meeting');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_768 WHERE chunk_id = ?').get(target.chunkId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_summaries_768 WHERE summary_id = ?').get(target.summaryId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(target.chunkId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_768 WHERE chunk_id = ?').get(other.chunkId).count, 1);

    // Retry must re-check sharing added after its durable journal was created.
    const retryPath = path.join(screenshots, 'shared-on-retry.png');
    fs.writeFileSync(retryPath, 'fixture');
    seedMeeting(db, 'retry-shared-target', retryPath);
    fs.writeFileSync(workspaceFile, '{invalid json');
    assert.equal(manager.deleteMeetingCompletely('retry-shared-target'), false);
    seedMeeting(db, 'retry-shared-other', retryPath);
    fs.writeFileSync(workspaceFile, JSON.stringify({ version: 3, workspaces: [before] }));
    manager.retryPendingMeetingDeletionCleanups();
    assert.equal(fs.existsSync(retryPath), true, 'a newly shared screenshot is preserved on retry');
    manager.deleteMeetingCompletely('retry-shared-other');

    // Legacy v1/v2 links normalize to rounds, and deletion removes the target link.
    fs.writeFileSync(workspaceFile, JSON.stringify({ version: 1, workspaces: [{ id: 'legacy', title: 'Legacy', meetingId: 'legacy-target', messages: [] }] }));
    seedMeeting(db, 'legacy-target');
    assert.equal(manager.deleteMeetingCompletely('legacy-target'), true);
    const unlinkedLegacy = JSON.parse(fs.readFileSync(workspaceFile, 'utf8')).workspaces[0];
    assert.equal(unlinkedLegacy.rounds[0].meetingId, undefined);

    // Screenshot ownership is stored independently of capped usage and survives final saves.
    const evictedPath = path.join(extra, 'evicted.png');
    fs.writeFileSync(evictedPath, 'fixture');
    const { SessionTracker } = require(path.join(repoRoot, 'dist-electron/electron/SessionTracker.js'));
    const screenshotSession = new SessionTracker();
    screenshotSession.logScreenshot(evictedPath, 'preview');
    for (let index = 0; index < 501; index++) screenshotSession.pushUsage({ type: 'chat', timestamp: index, question: 'q', answer: 'a' });
    assert.equal(screenshotSession.getFullUsage().some(item => item.metadata?.screenshotPath === evictedPath), false);
    manager.saveMeeting({ id: 'evicted-screenshot', title: 'Evicted', date: new Date().toISOString(), duration: '1:00', summary: '', transcript: [], usage: screenshotSession.getFullUsage(), screenshotPaths: screenshotSession.getFullScreenshotPaths(), isProcessed: false }, 0, 60000);
    assert.equal(manager.getMeetingDetails('evicted-screenshot').usage.some(item => item.metadata?.screenshotPath === evictedPath), false);
    assert.equal(manager.deleteMeetingCompletely('evicted-screenshot'), true);
    assert.equal(fs.existsSync(evictedPath), false, 'independent screenshot ownership finds path omitted from usage');

    // Unsafe paths are ignored, but a genuine unlink error keeps the journal retryable.
    const directoryPath = path.join(screenshots, 'not-a-file');
    fs.mkdirSync(directoryPath);
    seedMeeting(db, 'unlink-failure', directoryPath);
    assert.equal(manager.deleteMeetingCompletely('unlink-failure'), false, 'actual unlink error is reported');
    assert.ok(db.prepare('SELECT 1 FROM meeting_deletion_cleanup WHERE meeting_id = ?').get('unlink-failure'));
    fs.rmdirSync(directoryPath);
    assert.deepEqual(manager.retryPendingMeetingDeletionCleanups(), ['unlink-failure']);

    // Real post-call finalization blocked after its asynchronous title request resolves.
    seedMeeting(db, 'late-finalization');
    let releaseTitle;
    const { MeetingPersistence } = require(path.join(repoRoot, 'dist-electron/electron/MeetingPersistence.js'));
    const persistence = new MeetingPersistence(new SessionTracker(), { generateMeetingSummary: () => new Promise(resolve => { releaseTitle = resolve; }) });
    const finalization = persistence.processAndSaveMeeting({ transcript: [{ speaker: 'user', text: 'private transcript', timestamp: 1 }], usage: [], screenshotPaths: [], startTime: 0, durationMs: 60000, context: 'private transcript' }, 'late-finalization');
    while (!releaseTitle) await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.deleteMeetingCompletely('late-finalization'), true);
    releaseTitle('Late title');
    await finalization;
    assert.equal(manager.getMeetingDetails('late-finalization'), null, 'in-flight finalization cannot restore transcript or interactions');

    // Vector-only cleanup failure reports incomplete until the vector tombstone retries successfully.
    const vectorOnly = seedMeeting(db, 'vector-only');
    db.prepare('INSERT INTO vec_chunks_999 (chunk_id) VALUES (?)').run(vectorOnly.chunkId);
    db.exec("CREATE TRIGGER fail_vector_only BEFORE DELETE ON vec_chunks_999 BEGIN SELECT RAISE(ABORT, 'injected vector-only failure'); END");
    assert.equal(manager.deleteMeetingCompletely('vector-only'), false);
    assert.ok(db.prepare('SELECT 1 FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('vector-only'));
    assert.equal(manager.deleteMeetingCompletely('vector-only'), false, 'repeated delete must not report success while vectors remain');
    assert.equal(manager.retryPendingMeetingDeletionCleanups().includes('vector-only'), false, 'startup external retry must retain the vector journal');
    assert.ok(db.prepare('SELECT 1 FROM meeting_deletion_cleanup WHERE meeting_id = ?').get('vector-only'));
    db.exec('DROP TRIGGER fail_vector_only');
    assert.equal(manager.deleteMeetingCompletely('vector-only'), true, 'repeated deletion retries vector cleanup');
    assert.equal(db.prepare('SELECT 1 FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('vector-only'), undefined);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    InterviewWorkspaceStateManager.instance = null;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
