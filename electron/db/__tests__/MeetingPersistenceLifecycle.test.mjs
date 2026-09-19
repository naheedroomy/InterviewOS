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
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meeting-lifecycle-'));

const electronStubModule = new Module('electron');
electronStubModule.exports = {
  app: {
    getPath: name => (name === 'userData' ? userDataDir : os.tmpdir()),
  },
};
electronStubModule.loaded = true;
cjsRequire.cache.electron = electronStubModule;
try { cjsRequire.cache[cjsRequire.resolve('electron')] = electronStubModule; } catch { /* Electron is optional in Node tests. */ }

const { DatabaseManager } = cjsRequire(path.resolve(repoRoot, 'dist-electron/electron/db/DatabaseManager.js'));

function meeting(overrides = {}) {
  return {
    id: 'meeting-1',
    title: 'Processing...',
    date: '2026-09-19T12:00:00.000Z',
    duration: '1:00',
    summary: 'Generating summary...',
    detailedSummary: { actionItems: [], keyPoints: [] },
    transcript: [{ speaker: 'interviewer', text: 'placeholder transcript', timestamp: 1 }],
    usage: [{ type: 'assist', timestamp: 1, question: 'placeholder question', answer: 'placeholder answer' }],
    isProcessed: false,
    titleSource: 'placeholder',
    ...overrides,
  };
}

test('finalizing a meeting atomically replaces placeholder children and cascades deletion', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db, 'test database should initialize');

  try {
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1, 'foreign keys must be enabled per connection');

    const placeholderMeeting = meeting();
    manager.saveMeeting(placeholderMeeting, 1, 60_000);
    const finalizedMeeting = meeting({
      title: 'System Design Interview',
      summary: 'Final summary',
      detailedSummary: { actionItems: ['Follow up'], keyPoints: ['Caching'] },
      transcript: [{ speaker: 'user', text: 'final transcript', timestamp: 2 }],
      usage: [{ type: 'chat', timestamp: 2, question: 'final question', answer: 'final answer' }],
      isProcessed: true,
      titleSource: 'auto',
    });
    db.exec("CREATE TRIGGER fail_final_transcript BEFORE INSERT ON transcripts BEGIN SELECT RAISE(ABORT, 'forced child failure'); END;");
    assert.throws(() => manager.saveMeeting(finalizedMeeting, 1, 60_000), /forced child failure/);
    db.exec('DROP TRIGGER fail_final_transcript;');

    assert.deepEqual(
      db.prepare('SELECT title, is_processed FROM meetings WHERE id = ?').get('meeting-1'),
      { title: 'Processing...', is_processed: 0 },
    );
    assert.deepEqual(
      db.prepare('SELECT speaker, content FROM transcripts WHERE meeting_id = ?').all('meeting-1'),
      [{ speaker: 'interviewer', content: 'placeholder transcript' }],
    );
    assert.deepEqual(
      db.prepare('SELECT type, user_query, ai_response FROM ai_interactions WHERE meeting_id = ?').all('meeting-1'),
      [{ type: 'assist', user_query: 'placeholder question', ai_response: 'placeholder answer' }],
    );

    manager.saveMeeting(finalizedMeeting, 1, 60_000);
    manager.saveMeeting(finalizedMeeting, 1, 60_000);

    assert.deepEqual(
      db.prepare('SELECT title, is_processed FROM meetings WHERE id = ?').get('meeting-1'),
      { title: 'System Design Interview', is_processed: 1 },
    );
    assert.deepEqual(
      db.prepare('SELECT speaker, content FROM transcripts WHERE meeting_id = ?').all('meeting-1'),
      [{ speaker: 'user', content: 'final transcript' }],
    );
    assert.deepEqual(
      db.prepare('SELECT type, user_query, ai_response FROM ai_interactions WHERE meeting_id = ?').all('meeting-1'),
      [{ type: 'chat', user_query: 'final question', ai_response: 'final answer' }],
    );

    assert.equal(manager.deleteMeeting('meeting-1'), true);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM transcripts WHERE meeting_id = ?').get('meeting-1').count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM ai_interactions WHERE meeting_id = ?').get('meeting-1').count, 0);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
