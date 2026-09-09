import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let InterviewWorkspaceStateManager;
try {
  ({ InterviewWorkspaceStateManager } = await import('../InterviewWorkspaceStateManager.js'));
} catch {
  ({ InterviewWorkspaceStateManager } = await import('../../../dist-electron/electron/services/InterviewWorkspaceStateManager.js'));
}

test('InterviewWorkspaceStateManager CRUD and rounds', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-test-'));
  const statePath = path.join(tmpDir, 'workspaces.json');
  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const manager = InterviewWorkspaceStateManager.getInstance();

  // 1. Create workspace
  const ws = manager.createWorkspace({ title: 'Google - Staff Backend' });
  assert.equal(ws.title, 'Google - Staff Backend');
  assert.equal(ws.rounds.length, 1);
  assert.equal(ws.rounds[0].roundNumber, 1);
  assert.equal(ws.rounds[0].status, 'draft');
  assert.equal(ws.activeRoundId, ws.rounds[0].id);

  // 2. Rename workspace
  const renamed = manager.renameWorkspace(ws.id, 'Google - Staff Systems');
  assert.equal(renamed.title, 'Google - Staff Systems');

  // 3. Add round
  const withRound2 = manager.addRound(ws.id, 'System Design');
  assert.equal(withRound2.rounds.length, 2);
  assert.equal(withRound2.rounds[1].name, 'System Design');
  assert.equal(withRound2.rounds[1].roundNumber, 2);
  assert.equal(withRound2.activeRoundId, withRound2.rounds[1].id);

  // 4. Update documents
  const withDocs = manager.updateDocuments(ws.id, ['doc-1', 'doc-2']);
  assert.deepEqual(withDocs.documentIds, ['doc-1', 'doc-2']);

  // 5. Update round prep
  const withPrep = manager.updateRoundPrep(ws.id, withRound2.rounds[1].id, [{ role: 'user', content: 'hello' }]);
  assert.equal(withPrep.rounds[1].prepMessages.length, 1);

  // 6. Delete workspace
  assert.equal(manager.deleteWorkspace(ws.id), true);
  assert.equal(manager.getWorkspace(ws.id), null);
});

test('InterviewWorkspaceStateManager round lifecycle and switching', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-lifecycle-'));
  const statePath = path.join(tmpDir, 'workspaces.json');
  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const manager = InterviewWorkspaceStateManager.getInstance();

  const ws = manager.createWorkspace({ title: 'Meta - E6 Frontend' });
  const round1Id = ws.rounds[0].id;

  // Rename round 1
  const renamedRound = manager.renameRound(ws.id, round1Id, 'Screening Call');
  assert.equal(renamedRound.rounds[0].name, 'Screening Call');

  // Add round 2
  const withRound2 = manager.addRound(ws.id, 'Coding');
  const round2Id = withRound2.rounds[1].id;
  assert.equal(withRound2.activeRoundId, round2Id);

  // Switch active round back to round 1
  const switched = manager.setActiveRound(ws.id, round1Id);
  assert.equal(switched.activeRoundId, round1Id);

  // Start meeting on round 1
  const activeRound1 = manager.startRoundMeeting(ws.id, round1Id);
  assert.equal(activeRound1.rounds[0].status, 'active');
  assert.equal(activeRound1.activeRoundId, round1Id);

  // Finish meeting on round 1
  const finishedRound1 = manager.finishRoundMeeting(ws.id, round1Id, 'meeting-abc-123');
  assert.equal(finishedRound1.rounds[0].status, 'completed');
  assert.equal(finishedRound1.rounds[0].meetingId, 'meeting-abc-123');
  assert.ok(finishedRound1.rounds[0].completedAt);

  // List workspaces
  const list = manager.listWorkspaces();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, ws.id);
});

test('InterviewWorkspaceStateManager edge cases and atomic persistence', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-edges-'));
  const statePath = path.join(tmpDir, 'workspaces.json');
  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const manager = InterviewWorkspaceStateManager.getInstance();

  // Non-existent workspace lookups & mutations return null/false
  assert.equal(manager.getWorkspace('non-existent'), null);
  assert.equal(manager.renameWorkspace('non-existent', 'Title'), null);
  assert.equal(manager.deleteWorkspace('non-existent'), false);
  assert.equal(manager.addRound('non-existent'), null);
  assert.equal(manager.renameRound('non-existent', 'r1', 'Name'), null);
  assert.equal(manager.setActiveRound('non-existent', 'r1'), null);
  assert.equal(manager.updateRoundPrep('non-existent', 'r1', []), null);
  assert.equal(manager.updateDocuments('non-existent', ['doc1']), null);
  assert.equal(manager.startRoundMeeting('non-existent', 'r1'), null);
  assert.equal(manager.finishRoundMeeting('non-existent', 'r1', 'm1'), null);

  // Create default workspace (no options)
  const defaultWs = manager.createWorkspace();
  assert.equal(defaultWs.title, 'New Interview');
  assert.equal(defaultWs.rounds.length, 1);
  assert.equal(defaultWs.rounds[0].name, 'Round 1');
  assert.equal(defaultWs.rounds[0].roundNumber, 1);
  assert.deepEqual(defaultWs.documentIds, []);

  // Unknown round mutations return null
  assert.equal(manager.renameRound(defaultWs.id, 'fake-round', 'Name'), null);
  assert.equal(manager.setActiveRound(defaultWs.id, 'fake-round'), null);
  assert.equal(manager.updateRoundPrep(defaultWs.id, 'fake-round', []), null);
  assert.equal(manager.startRoundMeeting(defaultWs.id, 'fake-round'), null);
  assert.equal(manager.finishRoundMeeting(defaultWs.id, 'fake-round', 'm1'), null);

  // Document deduplication & trimming
  const updatedDocs = manager.updateDocuments(defaultWs.id, [' doc-1 ', 'doc-2', 'doc-1']);
  assert.deepEqual(updatedDocs.documentIds, ['doc-1', 'doc-2']);

  // Verify atomic persistence by re-reading state with a fresh manager instance
  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const freshManager = InterviewWorkspaceStateManager.getInstance();
  const reloaded = freshManager.getWorkspace(defaultWs.id);
  assert.ok(reloaded);
  assert.equal(reloaded.title, 'New Interview');
  assert.deepEqual(reloaded.documentIds, ['doc-1', 'doc-2']);
});

test('InterviewWorkspaceStateManager preserves updatedAt on store reads and rejects empty meetingId', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-updated-at-'));
  const statePath = path.join(tmpDir, 'workspaces.json');

  // Pre-seed workspaces.json with a specific historical updatedAt timestamp
  const historicalTime = '2025-01-15T12:00:00.000Z';
  const rawStore = {
    version: 3,
    workspaces: [
      {
        id: 'seeded-ws',
        title: 'Historical Workspace',
        documentIds: ['doc-x'],
        rounds: [
          {
            id: 'seeded-round-1',
            name: 'Round 1',
            roundNumber: 1,
            status: 'draft',
            prepMessages: [],
            createdAt: historicalTime,
          },
        ],
        activeRoundId: 'seeded-round-1',
        createdAt: historicalTime,
        updatedAt: historicalTime,
      },
    ],
  };
  fs.writeFileSync(statePath, JSON.stringify(rawStore, null, 2));

  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const manager = InterviewWorkspaceStateManager.getInstance();

  // Reading the workspace must NOT change updatedAt to "now"
  const read1 = manager.getWorkspace('seeded-ws');
  assert.equal(read1.updatedAt, historicalTime, 'updatedAt preserved on getWorkspace');

  const list = manager.listWorkspaces();
  assert.equal(list[0].updatedAt, historicalTime, 'updatedAt preserved on listWorkspaces');

  // finishRoundMeeting rejects empty / whitespace meetingId
  assert.equal(manager.finishRoundMeeting('seeded-ws', 'seeded-round-1', ''), null, 'empty meetingId rejected');
  assert.equal(manager.finishRoundMeeting('seeded-ws', 'seeded-round-1', '   '), null, 'whitespace meetingId rejected');

  // Genuine mutation updates updatedAt
  const afterFinish = manager.finishRoundMeeting('seeded-ws', 'seeded-round-1', 'mtg-valid-1');
  assert.ok(afterFinish);
  assert.notEqual(afterFinish.updatedAt, historicalTime, 'mutation updates updatedAt');
  assert.equal(afterFinish.rounds[0].status, 'completed');
  assert.equal(afterFinish.rounds[0].meetingId, 'mtg-valid-1');
});

test('persists and updates persona and candidate background overrides', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-overrides-'));
  const statePath = path.join(tmpDir, 'workspaces.json');
  InterviewWorkspaceStateManager.__setTestStatePath(statePath);
  const manager = InterviewWorkspaceStateManager.getInstance();

  const ws = await manager.createWorkspace({ title: 'Stripe — Staff Infra' });
  assert.strictEqual(ws.hasCustomOverrides, false);

  const updated = await manager.updatePersonaOverrides(ws.id, {
    hasCustomOverrides: true,
    candidateBackgroundOverride: '10 years distributed systems, Go and Raft.',
    aiPersonaOverride: 'Staff Engineer: focus on system bottlenecks first.'
  });

  assert.strictEqual(updated.hasCustomOverrides, true);
  assert.strictEqual(updated.candidateBackgroundOverride, '10 years distributed systems, Go and Raft.');
  assert.strictEqual(updated.aiPersonaOverride, 'Staff Engineer: focus on system bottlenecks first.');

  // Verify reload from disk
  const reloaded = await manager.getWorkspaceById(ws.id);
  assert.strictEqual(reloaded.hasCustomOverrides, true);
  assert.strictEqual(reloaded.candidateBackgroundOverride, '10 years distributed systems, Go and Raft.');
  assert.strictEqual(reloaded.aiPersonaOverride, 'Staff Engineer: focus on system bottlenecks first.');
});




