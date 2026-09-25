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
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-recovery-'));
const electronStub = new Module('electron');
electronStub.exports = { app: { getPath: name => name === 'userData' ? userData : os.tmpdir() } };
electronStub.loaded = true;
require.cache.electron = electronStub;
try { require.cache[require.resolve('electron')] = electronStub; } catch { /* Electron is optional in Node tests. */ }
const { DatabaseManager } = require(path.join(repoRoot, 'dist-electron/electron/db/DatabaseManager.js'));

function seedHistory(db) {
  db.prepare("INSERT INTO meetings (id, title, start_time, duration_ms, summary_json) VALUES ('history', 'History', 1, 2, '{}')").run();
  db.prepare("INSERT INTO transcripts (meeting_id, speaker, content, timestamp_ms) VALUES ('history', 'user', 'kept transcript', 3)").run();
  db.prepare("INSERT INTO embedding_queue (meeting_id, chunk_id) VALUES ('history', 17)").run();
}

function assertHistoryPreserved(db) {
  assert.equal(db.prepare("SELECT content FROM transcripts WHERE meeting_id = 'history'").get()?.content, 'kept transcript');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM embedding_queue WHERE meeting_id = 'history'").get().count, 1);
}

test('v10 and v11 migration failures preserve user_version and history, then retry cleanly', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  const originalExec = db.exec;
  const originalPrepare = db.prepare;
  try {
    seedHistory(db);

    // Fail after v10 has renamed and recreated the queue, during its data copy.
    db.pragma('user_version = 9');
    db.exec = function (sql) {
      if (sql.includes('INSERT OR IGNORE INTO embedding_queue')) throw new Error('injected v10 copy failure');
      return originalExec.call(this, sql);
    };
    assert.throws(() => manager.runMigrations(), /injected v10 copy failure/);
    db.exec = originalExec;
    assert.equal(db.pragma('user_version', { simple: true }), 9);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='embedding_queue'").get());
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='embedding_queue_old'").get(), undefined);
    assertHistoryPreserved(db);

    // A successful retry reaches v11; then exercise a partially completed v11 seed rollback.
    manager.runMigrations();
    assert.equal(db.pragma('user_version', { simple: true }), 20);
    db.pragma('user_version = 10');
    db.exec('DROP TABLE mode_note_sections; DROP TABLE mode_reference_files; DROP TABLE modes');
    db.exec = originalExec;
    db.prepare = function (sql) {
      if (sql.includes('INSERT OR IGNORE INTO modes')) throw new Error('injected v11 seed failure');
      return originalPrepare.call(this, sql);
    };
    assert.throws(() => manager.runMigrations(), /injected v11 seed failure/);
    db.prepare = originalPrepare;
    assert.equal(db.pragma('user_version', { simple: true }), 10);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modes'").get(), undefined, 'partial v11 DDL is rolled back');
    assertHistoryPreserved(db);

    manager.runMigrations();
    assert.equal(db.pragma('user_version', { simple: true }), 20);
    assertHistoryPreserved(db);
  } finally {
    db.exec = originalExec;
    db.prepare = originalPrepare;
    db.close();
    DatabaseManager.instance = undefined;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('an existing database can start in JS fallback mode when sqlite-vec fails to load', () => {
  DatabaseManager.instance = undefined;
  const first = DatabaseManager.getInstance();
  const db = first.getDb();
  assert.ok(db);
  seedHistory(db);
  db.close();
  DatabaseManager.instance = undefined;
  const BetterSqlite = require('better-sqlite3');
  const loadExtension = BetterSqlite.prototype.loadExtension;
  BetterSqlite.prototype.loadExtension = function () { throw new Error('injected sqlite-vec load failure'); };
  try {
    const fallback = DatabaseManager.getInstance();
    const reopened = fallback.getDb();
    assert.ok(reopened);
    assert.equal(reopened.pragma('user_version', { simple: true }), 20);
    assertHistoryPreserved(reopened);
    reopened.close();
  } finally {
    BetterSqlite.prototype.loadExtension = loadExtension;
    DatabaseManager.instance = undefined;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('rolled-back vector provisioning clears its cache and can be retried in the same process', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  try {
    db.exec('DROP TABLE vec_chunks_384');
    db.pragma('user_version = 7');
    manager.ensuredDims.clear();
    const originalExec = db.exec;
    db.exec = function (sql) {
      if (sql.includes('ALTER TABLE embedding_queue RENAME TO embedding_queue_old')) throw new Error('injected failure after v8 provisioned vec tables');
      return originalExec.call(this, sql);
    };
    try {
      assert.throws(() => manager.runMigrations(), /injected failure after v8 provisioned vec tables/);
    } finally {
      db.exec = originalExec;
    }
    assert.equal(db.pragma('user_version', { simple: true }), 7);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='vec_chunks_384'").get(), undefined, 'rolled-back v8 table is absent');
    manager.runMigrations();
    assert.equal(db.pragma('user_version', { simple: true }), 20);
    assert.ok(db.prepare('SELECT count(*) AS count FROM vec_chunks_384').get());
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('migration rejects falsely advanced schema and newer database versions clearly', () => {
  DatabaseManager.instance = undefined;
  const manager = DatabaseManager.getInstance();
  const db = manager.getDb();
  assert.ok(db);
  try {
    db.exec('DROP TABLE vec_chunks_768');
    assert.throws(() => manager.runMigrations(), /Required migration table is missing: vec_chunks_768/);
    db.exec('CREATE VIRTUAL TABLE vec_chunks_768 USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[768])');
    db.pragma('user_version = 21');
    assert.throws(() => manager.runMigrations(), /newer than supported version 20/);
  } finally {
    db.close();
    DatabaseManager.instance = undefined;
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
