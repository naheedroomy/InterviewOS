/**
 * InterviewWorkspaceStateManager unit tests.
 *
 * Tests use a temp file for state persistence so no real user data is touched.
 * The module is imported from the compiled dist-electron output.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const managerPath = path.resolve(
  __dirname,
  '../../../dist-electron/electron/services/InterviewWorkspaceStateManager.js'
);

/** Temp directory cleaned up after all tests. */
let tmpDir;

/** Helper: import the manager module fresh (ESM caches, so we only load once). */
async function getManager() {
  const mod = await import(pathToFileURL(managerPath).href);
  return mod.InterviewWorkspaceStateManager;
}

/** Helper: read the raw store from disk. */
function readStore(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  const mgrClass = await getManager();
  mgrClass.__setTestStatePath(path.join(tmpDir, 'workspaces.json'));
  // Force singleton rebuild
  mgrClass.getInstance();
});

after(() => {
  // Clean up temp dir
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

// ─── resolveDraft ───────────────────────────────────────────────────────────

describe('resolveDraft', () => {
  test('creates a new draft with no options', async () => {
    const mgrClass = await getManager();
    mgrClass.__setTestStatePath(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-resolve-')), 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws, created } = mgr.resolveDraft({});
    assert.ok(ws.id, 'draft has an id');
    assert.equal(ws.status, 'draft');
    assert.deepEqual(ws.meetingIds, []);
    assert.equal(ws.meetingId, undefined);
    assert.equal(ws.activeMeetingId, undefined);
    assert.equal(created, true, 'new workspace created flag');

    // Persisted on disk
    const store = readStore(mgrClass._testStatePath || mgr.statePath);
    assert.ok(store.workspaces.some((w) => w.id === ws.id));
  });

  test('reuses existing draft with preferredId', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-pref-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws1, created: c1 } = mgr.resolveDraft({ preferredId: 'my-draft-1' });
    assert.equal(ws1.id, 'my-draft-1');
    assert.equal(ws1.status, 'draft');
    assert.equal(c1, true, 'created on first resolve');

    // Second call reuses same draft (same id, not created)
    const { workspace: ws2, created: c2 } = mgr.resolveDraft({ preferredId: 'my-draft-1' });
    assert.equal(ws2.id, 'my-draft-1', 'same id reused');
    assert.equal(c2, false, 'reused, not created');
  });

  test('forceNew creates a new workspace even if drafts exist', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-force-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws1 } = mgr.resolveDraft({ preferredId: 'existing-draft' });
    const { workspace: ws2, created } = mgr.resolveDraft({ forceNew: true });
    assert.notEqual(ws2.id, ws1.id, 'forceNew creates a different workspace');
    assert.equal(ws2.status, 'draft');
    assert.equal(created, true, 'forceNew returns created=true');
  });

  test('preferredId that matches an active workspace creates new draft', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-active-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'active-ws' });
    mgr.beginRun('active-ws');

    // Resolve again with same preferredId — it's active, so creates new
    const { workspace: ws2, created } = mgr.resolveDraft({ preferredId: 'active-ws' });
    assert.notEqual(ws2.id, ws.id, 'active workspace not reused');
    assert.equal(ws2.status, 'draft');
    assert.equal(created, true, 'created new since active not reusable');
  });

  test('reuses a completed-run workspace (status draft, meetingIds present)', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-completed-run-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'reuse-after-run' });
    mgr.beginRun(ws.id);
    mgr.finishRun(ws.id, 'prev-meeting-1');

    // Now resolve again — completed-runs are reusable under v2
    const { workspace: ws2, created } = mgr.resolveDraft({ preferredId: 'reuse-after-run' });
    assert.equal(ws2.id, 'reuse-after-run', 'same workspace reused after run');
    assert.equal(ws2.status, 'draft');
    assert.deepEqual(ws2.meetingIds, ['prev-meeting-1'], 'meeting history preserved');
    assert.equal(created, false, 'reused, not created');
  });

  test('reuses a v1 migrated workspace (status complete, meetingId migrated)', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-v1-reuse-'));
    const statePath = path.join(tdir, 'workspaces.json');

    // Write a v1-style store manually — status 'complete' with single meetingId
    const v1Store = {
      version: 1,
      workspaces: [
        {
          id: 'v1-completed',
          meetingId: 'old-meeting',
          status: 'complete',
          messages: [],
          selectedDocumentIds: [],
          contextMarkdown: undefined,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
      ],
    };
    fs.mkdirSync(tdir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(v1Store, null, 2));

    mgrClass.__setTestStatePath(statePath);
    const mgr = mgrClass.getInstance();

    // resolveDraft should reuse the v1-migrated workspace (status complete -> reusable)
    const { workspace: ws, created } = mgr.resolveDraft({ preferredId: 'v1-completed' });
    assert.equal(ws.id, 'v1-completed', 'v1-migrated workspace reused');
    assert.equal(ws.status, 'complete', 'status preserved as-is (migrated from v1)');
    assert.deepEqual(ws.meetingIds, ['old-meeting'], 'meeting history migrated');
    assert.equal(created, false, 'reused existing');
  });
});

// ─── beginRun / finishRun / cancelRun ───────────────────────────────────────

describe('run lifecycle', () => {
  test('beginRun sets status to active', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-begin-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'run-test' });
    const active = mgr.beginRun(ws.id);
    assert.ok(active, 'beginRun returns workspace');
    assert.equal(active.status, 'active');
  });

  test('beginRun prevents duplicate run', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-dup-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'dup-test' });
    mgr.beginRun(ws.id);
    const second = mgr.beginRun(ws.id);
    assert.equal(second, null, 'duplicate beginRun returns null');
  });

  test('finishRun appends meeting and reverts to draft', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-finish-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'finish-test' });
    mgr.beginRun(ws.id);

    const finished = mgr.finishRun(ws.id, 'meeting-123');
    assert.equal(finished.status, 'draft', 'reverted to draft');
    assert.deepEqual(finished.meetingIds, ['meeting-123']);
    assert.equal(finished.meetingId, 'meeting-123', 'compat alias set');
    assert.equal(finished.activeMeetingId, undefined, 'activeMeetingId cleared');
  });

  test('finishRun without prior beginRun creates workspace', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-finish-nb-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    // No beginRun — finishRun still works (backwards compat)
    const ws = mgr.finishRun('fresh-id', 'meeting-456');
    assert.ok(ws, 'workspace created');
    assert.equal(ws.status, 'draft');
    assert.deepEqual(ws.meetingIds, ['meeting-456']);
    assert.equal(ws.id, 'fresh-id');
  });

  test('finishRun prevents duplicate meeting ID', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-dedup-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'dedup-test' });
    mgr.finishRun(ws.id, 'meeting-dup');
    const ws2 = mgr.finishRun(ws.id, 'meeting-dup');

    assert.deepEqual(ws2.meetingIds, ['meeting-dup'], 'no duplicate');
    assert.equal(ws2.meetingIds.length, 1);
  });

  test('cancelRun reverts active to draft', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-cancel-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'cancel-test' });
    mgr.beginRun(ws.id);
    mgr.cancelRun(ws.id);

    const check = mgr.getWorkspace(ws.id);
    assert.equal(check.status, 'draft');
    assert.equal(check.activeMeetingId, undefined);
  });

  test('cancelRun on draft is a no-op', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-cancel-draft-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'cancel-draft' });
    const after = mgr.cancelRun(ws.id);
    assert.equal(after.status, 'draft');
  });
});

// ─── updatePrepContext ──────────────────────────────────────────────────────

describe('updatePrepContext', () => {
  test('updates context and documents on draft', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-prep-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'prep-test' });
    mgr.updatePrepContext(ws.id, '## Prep Context', ['doc-1', 'doc-2']);

    const updated = mgr.getWorkspace(ws.id);
    assert.equal(updated.contextMarkdown, '## Prep Context');
    assert.deepEqual(updated.selectedDocumentIds, ['doc-1', 'doc-2']);
  });

  test('rejects update on active workspace', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-prep-active-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'prep-active' });
    mgr.beginRun(ws.id);
    const result = mgr.updatePrepContext(ws.id, 'new context');
    assert.equal(result, null, 'update returns null on active workspace');
  });

  test('persists messages round-trip alongside context and docIds', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-msg-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'msg-test' });

    const messages = [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: 1000 },
      { id: 'm2', role: 'assistant', content: 'Hi there!', createdAt: 1001 },
    ];

    mgr.updatePrepContext(ws.id, '## Context', ['doc-1'], messages);

    const updated = mgr.getWorkspace(ws.id);
    assert.equal(updated.contextMarkdown, '## Context', 'contextMarkdown preserved');
    assert.deepEqual(updated.selectedDocumentIds, ['doc-1'], 'selectedDocumentIds preserved');
    assert.equal(updated.messages.length, 2, 'messages round-tripped');
    assert.equal(updated.messages[0].id, 'm1');
    assert.equal(updated.messages[0].role, 'user');
    assert.equal(updated.messages[0].content, 'Hello');
    assert.equal(updated.messages[0].createdAt, 1000);
    assert.equal(updated.messages[1].id, 'm2');
    assert.equal(updated.messages[1].role, 'assistant');
    assert.equal(updated.messages[1].content, 'Hi there!');
    assert.equal(updated.messages[1].createdAt, 1001);
  });

  test('invalid messages are silently dropped', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-msg-drop-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'msg-drop-test' });

    // Pass a mix of valid and invalid messages
    const messages = [
      { id: 'valid-1', role: 'user', content: 'Keep me', createdAt: 2000 },
      { id: null, role: 'user', content: 'No id', createdAt: 2001 },
      { id: 'bad-role', role: 'system', content: 'Bad role', createdAt: 2002 },
      { id: 'valid-2', role: 'assistant', content: 'Keep me too', createdAt: 2003 },
    ];

    mgr.updatePrepContext(ws.id, undefined, undefined, messages);

    const updated = mgr.getWorkspace(ws.id);
    assert.equal(updated.messages.length, 2, 'invalid messages dropped');
    assert.equal(updated.messages[0].id, 'valid-1');
    assert.equal(updated.messages[1].id, 'valid-2');
  });

  test('messages can be cleared by passing empty array', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-msg-clear-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'msg-clear' });

    // First write some messages
    mgr.updatePrepContext(ws.id, undefined, undefined, [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: 3000 },
    ]);

    // Then clear them
    mgr.updatePrepContext(ws.id, undefined, undefined, []);

    const updated = mgr.getWorkspace(ws.id);
    assert.deepEqual(updated.messages, [], 'messages cleared by empty array');
  });

  test('messages preserved when passing only contextMarkdown', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-msg-ctx-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'msg-ctx' });

    // Write messages first
    mgr.updatePrepContext(ws.id, undefined, undefined, [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: 4000 },
    ]);

    // Then update only contextMarkdown
    mgr.updatePrepContext(ws.id, 'New context only');

    const updated = mgr.getWorkspace(ws.id);
    assert.equal(updated.contextMarkdown, 'New context only', 'context updated');
    assert.equal(updated.messages.length, 1, 'messages preserved across partial update');
    assert.equal(updated.messages[0].id, 'm1');
  });

  test('workspace meeting history preserved after prep update', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-meeting-history-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'history-preserve' });
    mgr.beginRun(ws.id);
    mgr.finishRun(ws.id, 'meeting-1');

    // Now update prep
    mgr.updatePrepContext(ws.id, 'New prep', ['doc-updated'], [
      { id: 'm1', role: 'user', content: 'msg', createdAt: 5000 },
    ]);

    const updated = mgr.getWorkspace(ws.id);
    assert.deepEqual(updated.meetingIds, ['meeting-1'], 'meeting history preserved');
    assert.equal(updated.contextMarkdown, 'New prep', 'context updated');
    assert.equal(updated.messages.length, 1, 'messages saved');
    assert.equal(updated.messages[0].content, 'msg');
  });
});

// ─── listWorkspaces / deleteWorkspace ───────────────────────────────────────

describe('listWorkspaces and deleteWorkspace', () => {
  test('listWorkspaces returns all workspaces newest first', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-list-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws1 } = mgr.resolveDraft({ preferredId: 'first' });
    const { workspace: ws2 } = mgr.resolveDraft({ forceNew: true });

    const all = mgr.listWorkspaces();
    assert.ok(all.length >= 2);
    // Most recent first
    assert.ok(new Date(all[0].updatedAt).getTime() >= new Date(all[1].updatedAt).getTime());
  });

  test('deleteWorkspace removes workspace', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-del-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const ws = mgr.resolveDraft({ preferredId: 'del-me' });
    assert.ok(mgr.deleteWorkspace('del-me'));
    assert.equal(mgr.getWorkspace('del-me'), null);
    assert.equal(mgr.deleteWorkspace('nonexistent'), false);
  });
});

// ─── v1 → v2 migration ─────────────────────────────────────────────────────

describe('v1 → v2 migration', () => {
  test('state with single meetingId is migrated on read', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-migrate-'));
    const statePath = path.join(tdir, 'workspaces.json');

    // Write a v1-style store manually
    const v1Store = {
      version: 1,
      workspaces: [
        {
          id: 'v1-ws',
          meetingId: 'meeting-v1',
          status: 'complete',
          messages: [],
          selectedDocumentIds: [],
          contextMarkdown: undefined,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
      ],
    };
    fs.mkdirSync(tdir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(v1Store, null, 2));

    mgrClass.__setTestStatePath(statePath);
    const mgr = mgrClass.getInstance();

    const ws = mgr.getWorkspace('v1-ws');
    assert.ok(ws, 'workspace migrated');
    assert.deepEqual(ws.meetingIds, ['meeting-v1'], 'v1 meetingId migrated to meetingIds array');
    assert.equal(ws.meetingId, 'meeting-v1', 'compat alias preserved');
    assert.equal(ws.createdAt, '2025-01-01T00:00:00.000Z', 'timestamp preserved');
  });

  test('v1 migrated workspace is reusable as draft via resolveDraft', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-v1-reusable-'));
    const statePath = path.join(tdir, 'workspaces.json');

    // Write a v1-style store with a completed workspace
    const v1Store = {
      version: 1,
      workspaces: [
        {
          id: 'v1-legacy',
          meetingId: 'legacy-meeting',
          status: 'complete',
          messages: [],
          selectedDocumentIds: [],
          contextMarkdown: undefined,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-06-01T00:00:00.000Z',
        },
      ],
    };
    fs.mkdirSync(tdir, { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(v1Store, null, 2));

    mgrClass.__setTestStatePath(statePath);
    const mgr = mgrClass.getInstance();

    // resolveDraft should return the migrated completed workspace as reusable
    const { workspace: ws, created } = mgr.resolveDraft({ preferredId: 'v1-legacy' });
    assert.equal(ws.id, 'v1-legacy', 'v1 migrated workspace reused');
    assert.deepEqual(ws.meetingIds, ['legacy-meeting'], 'meeting history from v1 preserved');
    assert.equal(created, false, 'reused existing, not created');
  });
});

// ─── Compatibility adapters ─────────────────────────────────────────────────

describe('compatibility adapters', () => {
  test('getWorkspaceForMeeting searches meetingIds array', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-compat-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'compat-ws' });
    mgr.finishRun(ws.id, 'meeting-compat');

    const found = mgr.getWorkspaceForMeeting('meeting-compat');
    assert.ok(found);
    assert.equal(found.id, 'compat-ws');
  });

  test('saveWorkspace still functions as compat adapter', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-save-compat-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const ws = mgr.saveWorkspace({
      id: 'compat-save',
      contextMarkdown: '# legacy',
      status: 'draft',
    });

    assert.equal(ws.id, 'compat-save');
    assert.deepEqual(ws.meetingIds, []);
    assert.equal(ws.contextMarkdown, '# legacy');
  });

  test('attachMeeting delegates to finishRun (append, not complete)', async () => {
    const mgrClass = await getManager();
    const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-attach-'));
    mgrClass.__setTestStatePath(path.join(tdir, 'ws.json'));
    const mgr = mgrClass.getInstance();

    const { workspace: ws } = mgr.resolveDraft({ preferredId: 'attach-test' });
    // attachMeeting in v2 appends the meeting and reverts to draft
    const result = mgr.attachMeeting('attach-test', 'meeting-attach');
    assert.ok(result);
    assert.equal(result.status, 'draft', 'attachMeeting reverts to draft, not complete');
    assert.ok(result.meetingIds.includes('meeting-attach'), 'meeting appended');
  });
});
