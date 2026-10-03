# First-Class Interview Chats & Multi-Round Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AnswerCue into a first-class Interview Workspace (Chat) app where each interview session is instantly persistent, renamable, visible in the sidebar before starting, supports multiple interview rounds with dedicated prep/runs, and provides dedicated per-interview document management.

**Architecture:** 
- Backend `InterviewWorkspaceStateManager` manages `InterviewWorkspace` entities with nested `InterviewRound` objects stored atomically in `workspaces.json`.
- IPC layer exposes workspace CRUD, round lifecycle, and document binding.
- React frontend replaces raw SQLite meeting sidebar with persistent Interview Chats, adds a round switcher in the header with a clean "Start Next Round" flow, and adds a dedicated "Context Documents" panel in the right drawer.

**Tech Stack:** Electron, Node.js (`better-sqlite3`, `fs`), React 18, TypeScript, Tailwind CSS, Framer Motion, React Doctor.

**Spec:** [`docs/superpowers/specs/2026-09-08-interview-chats-and-rounds-design.md`](file:///Users/naheedroomy/Documents/interview-ai/AnswerCue/docs/superpowers/specs/2026-09-08-interview-chats-and-rounds-design.md)

## Global Constraints
- React Doctor must remain at 0 errors (`npm run doctor`).
- Always branch first before modifying files.
- Use `gh` CLI for all PRs and GitHub operations.
- All file writes to `workspaces.json` must be atomic (write `.tmp` then rename).
- Documents belong to the `InterviewWorkspace` and automatically provide context to all rounds.
- Each round has its own independent `prepMessages` and live transcript.

---

### Task 1: Backend Domain Models & Persistence (`InterviewWorkspaceStateManager.ts`)

**Files:**
- Modify: `electron/services/InterviewWorkspaceStateManager.ts`
- Test: `electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`

**Interfaces:**
- Consumes: Node `fs`, `path`, `crypto`
- Produces:
  ```typescript
  export interface InterviewRound {
    id: string;
    name: string;
    roundNumber: number;
    status: 'draft' | 'active' | 'completed';
    prepMessages: any[];
    meetingId?: string;
    createdAt: string;
    completedAt?: string;
  }
  export interface InterviewWorkspace {
    id: string;
    title: string;
    documentIds: string[];
    rounds: InterviewRound[];
    activeRoundId: string;
    createdAt: string;
    updatedAt: string;
  }
  ```
  Methods on `InterviewWorkspaceStateManager`:
  - `listWorkspaces(): InterviewWorkspace[]`
  - `createWorkspace(opts?: { title?: string; initialDocIds?: string[] }): InterviewWorkspace`
  - `getWorkspace(id: string): InterviewWorkspace | null`
  - `renameWorkspace(id: string, title: string): InterviewWorkspace | null`
  - `deleteWorkspace(id: string): boolean`
  - `addRound(workspaceId: string, name?: string): InterviewWorkspace | null`
  - `renameRound(workspaceId: string, roundId: string, name: string): InterviewWorkspace | null`
  - `setActiveRound(workspaceId: string, roundId: string): InterviewWorkspace | null`
  - `updateRoundPrep(workspaceId: string, roundId: string, messages: any[]): InterviewWorkspace | null`
  - `updateDocuments(workspaceId: string, documentIds: string[]): InterviewWorkspace | null`
  - `startRoundMeeting(workspaceId: string, roundId: string): InterviewWorkspace | null`
  - `finishRoundMeeting(workspaceId: string, roundId: string, meetingId: string): InterviewWorkspace | null`

- [ ] **Step 1: Write unit test for `InterviewWorkspaceStateManager`**

```javascript
// electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InterviewWorkspaceStateManager } from '../InterviewWorkspaceStateManager.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`  
Expected: FAIL (methods not yet implemented)

- [ ] **Step 3: Implement domain models & methods in `InterviewWorkspaceStateManager.ts`**

Update `InterviewWorkspaceStateManager.ts` with atomic storage, the new schema, and all methods.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add electron/services/InterviewWorkspaceStateManager.ts electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs
git commit -m "feat: implement InterviewWorkspace and InterviewRound persistence in InterviewWorkspaceStateManager"
```

---

### Task 2: IPC Handlers & Preload Bridge

**Files:**
- Modify: `electron/ipcHandlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`

**Interfaces:**
- Consumes: `InterviewWorkspaceStateManager.getInstance()`
- Produces: Type-safe IPC channels available in renderer via `window.electronAPI.interviewWorkspace*`

- [ ] **Step 1: Register IPC handlers in `electron/ipcHandlers.ts`**

Add handlers for:
- `interview-workspace:list`
- `interview-workspace:create`
- `interview-workspace:get-by-id`
- `interview-workspace:rename`
- `interview-workspace:delete`
- `interview-workspace:add-round`
- `interview-workspace:rename-round`
- `interview-workspace:set-active-round`
- `interview-workspace:update-round-prep`
- `interview-workspace:update-documents`
- `interview-workspace:start-meeting`
- `interview-workspace:finish-meeting`

- [ ] **Step 2: Expose methods in `electron/preload.ts`**

Map each channel in `contextBridge.exposeInMainWorld('electronAPI', { ... })`.

- [ ] **Step 3: Update `src/types/electron.d.ts`**

Declare TypeScript definitions on `ElectronAPI` matching all exposed workspace methods.

- [ ] **Step 4: Typecheck with TypeScript**

Run: `npm run build:electron:tsc`  
Expected: 0 errors

- [ ] **Step 5: Commit Task 2**

```bash
git add electron/ipcHandlers.ts electron/preload.ts src/types/electron.d.ts
git commit -m "feat: add IPC handlers and preload bindings for workspaces and rounds"
```

---

### Task 3: Dedicated Context Documents Panel (`ContextDocumentsPanel.tsx`)

**Files:**
- Create: `src/components/ContextDocumentsPanel.tsx`
- Modify: `src/components/Launcher.tsx`

**Interfaces:**
- Props for `ContextDocumentsPanel`:
  ```typescript
  interface ContextDocumentsPanelProps {
    isLight: boolean;
    workspaceId: string;
    documentIds: string[];
    availableDocs: InterviewContextDocument[];
    onUploadDoc: () => Promise<void>;
    onRemoveDoc: (docId: string) => void;
    onAttachExistingDoc: (docId: string) => void;
    isUploadingDoc: boolean;
    docError: string | null;
  }
  ```

- [ ] **Step 1: Create `src/components/ContextDocumentsPanel.tsx`**

Build the card with:
- Drag-and-drop dropzone or click to upload
- Attached documents list with icon, title, size, kind, and delete button
- "+ Reuse existing document" button opening a clean selection modal

- [ ] **Step 2: Mount `ContextDocumentsPanel` in `src/components/Launcher.tsx`**

Integrate into the right-hand panel of Launcher, replacing the small composer popover.

- [ ] **Step 3: Verify with React Doctor**

Run: `npm run doctor`  
Expected: 0 errors

- [ ] **Step 4: Commit Task 3**

```bash
git add src/components/ContextDocumentsPanel.tsx src/components/Launcher.tsx
git commit -m "feat: add dedicated ContextDocumentsPanel in right drawer"
```

---

### Task 4: Redesign Sidebar for Interview Chats

**Files:**
- Modify: `src/components/Launcher.tsx`

**Interfaces:**
- Consumes: `window.electronAPI.interviewWorkspaceList`, `interviewWorkspaceCreate`, `interviewWorkspaceRename`, `interviewWorkspaceDelete`
- Produces: Sidebar listing all `InterviewWorkspace` entities with instant creation, inline renaming, and deletion.

- [ ] **Step 1: Replace meeting sidebar state with `workspaces` state**

Fetch workspaces via `interviewWorkspaceList` on mount and after mutations.
Default to selecting the most recently updated workspace, or automatically create a clean *"New Interview"* if none exist.

- [ ] **Step 2: Implement instant `➕ New Interview` button**

Calls `interviewWorkspaceCreate({ title: 'New Interview' })`, prepends to list, sets as selected, and immediately focuses the title for renaming.

- [ ] **Step 3: Implement inline renaming and context menu**

Allow double-click or `••• -> Rename` to edit the title in-place with `Enter` to save and `Esc` to cancel. Add `••• -> Delete` to delete the workspace.

- [ ] **Step 4: Verify with React Doctor**

Run: `npm run doctor`  
Expected: 0 errors

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/Launcher.tsx
git commit -m "feat: redesign sidebar for first-class interview chats"
```

---

### Task 5: Main Header Round Switcher & "Start Next Round" Flow

**Files:**
- Modify: `src/components/Launcher.tsx`
- Modify: `src/components/Launcher.tsx` (or `src/components/InterviewPrepPanel.tsx` if extracted)

**Interfaces:**
- Consumes: `activeWorkspace.rounds`, `interviewWorkspaceAddRound`, `interviewWorkspaceSetActiveRound`, `interviewWorkspaceRenameRound`
- Produces: Pill bar for rounds, "Start Next Round" action, and round-scoped prep and live timeline.

- [ ] **Step 1: Build Round Pill Bar in header**

Render pills for each round in `activeWorkspace.rounds`:
- Completed rounds show checkmark `✓` and are clickable to view past transcript & AI responses.
- Active round has primary border/accent.
- `+ Next Round` pill appends a new round.

- [ ] **Step 2: Implement "Start Next Round" transition**

When an interview finishes, replace the old "Prepare next run" button with `Start Next Round`.
Clicking it:
- Calls `interviewWorkspaceAddRound(workspace.id)`
- Switches to the newly created round
- Keeps all company documents
- Presents a fresh prep chat

- [ ] **Step 3: Bind prep chat and live transcript to the active round**

Ensure typing in prep saves to `activeRound.prepMessages`.
When "Start Interview" is clicked, mark the active round as `active`, launch recording, and on finish link the meeting ID and mark `completed`.

- [ ] **Step 4: Verify with React Doctor**

Run: `npm run doctor`  
Expected: 0 errors

- [ ] **Step 5: Commit Task 5**

```bash
git add src/components/Launcher.tsx
git commit -m "feat: add round switcher, Start Next Round flow, and round-scoped timelines"
```

---

### Task 6: End-to-End Verification & Polish

**Files:**
- Verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 2: Run React Doctor**

Run: `npm run doctor`  
Expected: 0 errors

- [ ] **Step 3: Run Electron typecheck**

Run: `npm run typecheck:electron`  
Expected: 0 errors

- [ ] **Step 4: Commit Task 6 & push branch**

```bash
git push -u origin feat/interview-chats-and-rounds
```
