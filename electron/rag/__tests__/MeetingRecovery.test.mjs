import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const cjsRequire = createRequire(import.meta.url);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-recovery-'));

const electronStubModule = new Module('electron');
electronStubModule.exports = { app: { getPath: () => userDataDir } };
electronStubModule.loaded = true;
cjsRequire.cache.electron = electronStubModule;
try { cjsRequire.cache[cjsRequire.resolve('electron')] = electronStubModule; } catch { /* Electron is optional in Node tests. */ }

const { DatabaseManager } = cjsRequire(path.resolve(repoRoot, 'dist-electron/electron/db/DatabaseManager.js'));
const { RAGManager } = cjsRequire(path.resolve(repoRoot, 'dist-electron/electron/rag/RAGManager.js'));
const { MeetingPersistence } = cjsRequire(path.resolve(repoRoot, 'dist-electron/electron/MeetingPersistence.js'));

function record(id, isEphemeral) {
  return {
    id,
    title: isEphemeral ? 'Live Meeting' : 'Interrupted interview',
    date: '2026-09-19T12:00:00.000Z', duration: '0:01', summary: '{}',
    detailedSummary: {}, transcript: [], usage: [], isProcessed: false, isEphemeral,
  };
}

test('public live indexing and recovery exclude ephemeral state, including legacy rows and vector failures', async () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);

  try {
    // Exercise the v16→v17 backfill against an existing legacy support row.
    db.prepare(`
      INSERT INTO meetings (id, title, start_time, duration_ms, summary_json, created_at, source, is_processed, is_ephemeral, title_source)
      VALUES (?, 'Live Meeting', ?, 0, '{}', ?, 'manual', 0, 0, 'placeholder')
    `).run('live-meeting-current', Date.now(), new Date().toISOString());
    db.pragma('user_version = 16');
    manager.runMigrations();
    assert.equal(db.prepare('SELECT is_ephemeral FROM meetings WHERE id = ?').get('live-meeting-current').is_ephemeral, 1);

    // Deliberately reset the migrated row to emulate a stale conflict row;
    // INSERT OR IGNORE would leave this value at 0.
    db.prepare('UPDATE meetings SET is_ephemeral = 0 WHERE id = ?').run('live-meeting-current');
    assert.equal(db.prepare('SELECT is_ephemeral FROM meetings WHERE id = ?').get('live-meeting-current').is_ephemeral, 0);

    // Exercise the public live-indexing seam; conflict handling must restore the marker.
    const ragManager = Object.create(RAGManager.prototype);
    ragManager.db = db;
    ragManager.embeddingPipeline = { isReady: () => true };
    ragManager.liveIndexer = { start: () => {} };
    ragManager.startLiveIndexing('live-meeting-current');
    assert.equal(db.prepare('SELECT is_ephemeral FROM meetings WHERE id = ?').get('live-meeting-current').is_ephemeral, 1);

    manager.saveMeeting(record('meeting-to-recover', false), 1, 1_000);
    const chunk = db.prepare('INSERT INTO chunks (meeting_id, chunk_index, cleaned_text, token_count) VALUES (?, 0, ?, 1)').run('live-meeting-current', 'partial live text');
    const summary = db.prepare('INSERT INTO chunk_summaries (meeting_id, summary_text) VALUES (?, ?)').run('live-meeting-current', 'partial summary');
    db.prepare('INSERT INTO embedding_queue (meeting_id, status) VALUES (?, ?)').run('live-meeting-current', 'pending');
    db.exec('CREATE TABLE vec_chunks_999 (chunk_id INTEGER PRIMARY KEY);');
    db.exec("CREATE TRIGGER vec_cleanup_failure BEFORE DELETE ON vec_chunks_999 BEGIN SELECT RAISE(ABORT, 'vector unavailable'); END;");
    db.prepare('INSERT INTO vec_chunks_999 (chunk_id) VALUES (?)').run(chunk.lastInsertRowid);
    db.prepare('INSERT INTO vec_chunks_384 (chunk_id, embedding) VALUES (?, ?)').run(BigInt(chunk.lastInsertRowid), Buffer.alloc(384 * 4));
    db.prepare('INSERT INTO vec_summaries_384 (summary_id, embedding) VALUES (?, ?)').run(BigInt(summary.lastInsertRowid), Buffer.alloc(384 * 4));

    assert.deepEqual(manager.getUnprocessedMeetings().map(meeting => meeting.id), ['meeting-to-recover']);
    assert.deepEqual(manager.getRecentMeetings().map(meeting => meeting.id), ['meeting-to-recover']);

    const recoveredIds = [];
    const persistence = Object.create(MeetingPersistence.prototype);
    persistence.processAndSaveMeeting = async (_snapshot, meetingId) => recoveredIds.push(meetingId);
    await persistence.recoverUnprocessedMeetings();
    assert.deepEqual(recoveredIds, ['meeting-to-recover']);

    for (const table of ['chunks', 'chunk_summaries', 'embedding_queue']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE meeting_id = ?`).get('live-meeting-current').count, 0, `${table} should not retain interrupted live-index artifacts`);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(chunk.lastInsertRowid).count, 1, 'failed vector cleanup remains until retry');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('live-meeting-current').count, 1, 'failed vector cleanup must retain a durable tombstone');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_384 WHERE chunk_id = ?').get(chunk.lastInsertRowid).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_summaries_384 WHERE summary_id = ?').get(summary.lastInsertRowid).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM meetings WHERE id = ?').get('live-meeting-current').count, 0);

    // A second live session reuses the stable ID while the first tombstone is
    // still blocked. Its distinct vector ID must be unioned, not overwrite ID 1.
    ragManager.startLiveIndexing('live-meeting-current');
    const chunk2 = db.prepare('INSERT INTO chunks (meeting_id, chunk_index, cleaned_text, token_count) VALUES (?, 0, ?, 1)').run('live-meeting-current', 'second partial live text');
    db.prepare('INSERT INTO vec_chunks_999 (chunk_id) VALUES (?)').run(chunk2.lastInsertRowid);
    await persistence.recoverUnprocessedMeetings();
    const tombstone = db.prepare('SELECT chunk_ids_json FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('live-meeting-current');
    assert.deepEqual(new Set(JSON.parse(tombstone.chunk_ids_json)), new Set([Number(chunk.lastInsertRowid), Number(chunk2.lastInsertRowid)]));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(chunk.lastInsertRowid).count, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(chunk2.lastInsertRowid).count, 1);

    db.exec('DROP TRIGGER vec_cleanup_failure;');
    assert.deepEqual(manager.retryEphemeralVectorCleanup(), ['live-meeting-current']);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(chunk.lastInsertRowid).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM vec_chunks_999 WHERE chunk_id = ?').get(chunk2.lastInsertRowid).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ephemeral_vector_cleanup WHERE meeting_id = ?').get('live-meeting-current').count, 0);
    // The stubbed finalizer proves the genuine candidate was handed to public
    // recovery; it intentionally does not mark the row processed.
    assert.deepEqual(recoveredIds, ['meeting-to-recover', 'meeting-to-recover']);
    assert.deepEqual(manager.getUnprocessedMeetings().map(meeting => meeting.id), ['meeting-to-recover']);

  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
