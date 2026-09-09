# InterviewOS UI Overhaul, Knowledge Bank & Persona Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the application to InterviewOS, overhaul the visual system to Executive Charcoal & Warm Amber adhering to Impeccable craft standards, build a full-page Knowledge Bank hub with cross-interview usage tracking, replace the right drawer with an inline Active Context strip in chat, and enable per-interview Candidate Background & AI Persona overrides.

**Architecture:**
1. CSS variables and design tokens establishing Executive Charcoal (`#121214`) and Warm Amber (`#f59e0b`) with zero decorative text gradients and smooth physics-grounded deceleration curves.
2. Domain persistence extensions in `InterviewWorkspaceStateManager.ts` for per-interview overrides and document cross-referencing.
3. Dedicated `KnowledgeBankView.tsx` component mounted via top navigation rail (`[ 💬 Interviews ]` vs `[ 📚 Knowledge Bank ]`).
4. Inline `ActiveContextStrip` under the round pill bar in `Launcher.tsx` with instant 1-click detach, Knowledge Bank picker dialog, and drag-and-drop auto-indexing.
5. Role & Persona override popover in the chat header with runtime sync to `LLMHelper`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide React, Electron IPC, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-09-09-interviewos-ui-overhaul-knowledge-bank-design.md`

## Global Constraints

- Rebrand all user-visible strings, headers, and window titles to **InterviewOS**.
- React Doctor must report **0 errors** at all times (`npm run doctor`).
- TypeScript must compile with **0 errors** (`npx tsc --noEmit -p tsconfig.json` and `npm run build:electron:tsc`).
- Adhere strictly to the Impeccable craft floor: no gradient text (`background-clip: text`), no bouncy spring easing curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`), no nested cards, no fake eyebrows/kickers, no zero-blur halos.
- Tabular figures (`tnum`) for timers, metrics, and byte sizes.

---

### Task 1: Rebrand, Design Tokens, Anti-Slop Cleanup & CSS Base

**Files:**
- Modify: `package.json`
- Modify: `index.html`
- Modify: `electron/main.ts`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: Existing Tailwind CSS setup and root stylesheet.
- Produces: Global CSS variables (`--bg-canvas`, `--bg-surface`, `--bg-card`, `--amber-primary`, `--border-hairline`, etc.), custom scrollbars, selection tokens, and clean deceleration easing.

- [ ] **Step 1: Check existing slop patterns in `src/index.css`**

Run: `/Users/naheedroomy/.gemini/config/skills/impeccable/scripts/impeccable detect --json src`
Verify output flags `gradient-text`, `bounce-easing`, and `codex-grid-background`.

- [ ] **Step 2: Update rebrand strings in `package.json`, `index.html`, and `electron/main.ts`**

In `package.json`:
- Ensure `"productName": "InterviewOS"`, `"name": "interviewos"`.

In `index.html`:
- Update `<title>InterviewOS</title>`.

In `electron/main.ts`:
- Set window title to `'InterviewOS'`.
- Ensure about panel and menu references use `'InterviewOS'`.

- [ ] **Step 3: Update `src/index.css` with Executive Charcoal & Amber design system and purge slop**

In `src/index.css`:
- Add Executive Charcoal & Warm Amber design system tokens:
  ```css
  :root {
    --bg-canvas: #121214;
    --bg-surface: #16161a;
    --bg-card: #1c1c21;
    --bg-overlay: #202026;
    --border-hairline: rgba(255, 255, 255, 0.07);
    --border-elevated: rgba(255, 255, 255, 0.12);
    --border-active: rgba(245, 158, 11, 0.4);
    --amber-primary: #f59e0b;
    --amber-hover: #fbbf24;
    --amber-tint: rgba(245, 158, 11, 0.12);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #71717a;
    --status-success: #10b981;
    --status-live: #ef4444;
  }
  ```
- Remove all `background-clip: text` gradient definitions and replace with solid colors (`#fafafa` / `#f59e0b`).
- Replace all instances of `cubic-bezier(0.34, 1.56, 0.64, 1)` with exponential ease-out `cubic-bezier(0.16, 1, 0.3, 1)`.
- Replace grid line gradient backgrounds with solid canvas `--bg-canvas`.
- Define custom scrollbar rules:
  ```css
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }
  ::selection {
    background-color: rgba(245, 158, 11, 0.25);
    color: #fef3c7;
  }
  ```

- [ ] **Step 4: Verify with Impeccable detect, TypeScript, and React Doctor**

Run: `/Users/naheedroomy/.gemini/config/skills/impeccable/scripts/impeccable detect --json src`
Expected: 0 warnings for `gradient-text`, `bounce-easing`, or `codex-grid-background`.
Run: `npm run doctor`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json index.html electron/main.ts src/index.css
git commit -m "feat: rebrand to InterviewOS, apply Executive Charcoal & Amber theme, and purge slop patterns"
```

---

### Task 2: Domain Model & IPC for Per-Interview Candidate Background & AI Persona Overrides

**Files:**
- Modify: `electron/services/InterviewWorkspaceStateManager.ts`
- Modify: `electron/ipcHandlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Test: `electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`

**Interfaces:**
- Consumes: `InterviewWorkspace` interface.
- Produces: `hasCustomOverrides`, `candidateBackgroundOverride`, `aiPersonaOverride` fields and `updatePersonaOverrides` state method + IPC channel `interview-workspace:update-persona-overrides`.

- [ ] **Step 1: Write failing unit test in `InterviewWorkspaceStateManager.test.mjs`**

Add test case in `electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`:
```javascript
test('persists and updates persona and candidate background overrides', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`
Expected: FAIL (`manager.updatePersonaOverrides is not a function`).

- [ ] **Step 3: Update `InterviewWorkspaceStateManager.ts`**

In `electron/services/InterviewWorkspaceStateManager.ts`:
- Update `InterviewWorkspace` interface:
  ```typescript
  export interface InterviewWorkspace {
    id: string;
    title: string;
    rounds: InterviewRound[];
    activeRoundId?: string;
    documentIds: string[];
    hasCustomOverrides?: boolean;
    candidateBackgroundOverride?: string;
    aiPersonaOverride?: string;
    createdAt: number;
    updatedAt: number;
  }
  ```
- In `normalizeWorkspace`, normalize the override fields:
  ```typescript
  hasCustomOverrides: Boolean(raw?.hasCustomOverrides),
  candidateBackgroundOverride: typeof raw?.candidateBackgroundOverride === 'string' ? raw.candidateBackgroundOverride : '',
  aiPersonaOverride: typeof raw?.aiPersonaOverride === 'string' ? raw.aiPersonaOverride : '',
  ```
- Implement `updatePersonaOverrides`:
  ```typescript
  public async updatePersonaOverrides(
    workspaceId: string,
    overrides: {
      hasCustomOverrides?: boolean;
      candidateBackgroundOverride?: string;
      aiPersonaOverride?: string;
    }
  ): Promise<InterviewWorkspace> {
    const list = await this.readWorkspaces();
    const ws = list.find((w) => w.id === workspaceId);
    if (!ws) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    if (overrides.hasCustomOverrides !== undefined) {
      ws.hasCustomOverrides = Boolean(overrides.hasCustomOverrides);
    }
    if (overrides.candidateBackgroundOverride !== undefined) {
      ws.candidateBackgroundOverride = String(overrides.candidateBackgroundOverride);
    }
    if (overrides.aiPersonaOverride !== undefined) {
      ws.aiPersonaOverride = String(overrides.aiPersonaOverride);
    }
    ws.updatedAt = Date.now();
    await this.writeWorkspaces(list);
    return ws;
  }
  ```

- [ ] **Step 4: Register IPC Handler, Preload Bridge, and Types**

In `electron/ipcHandlers.ts`:
- Register `interview-workspace:update-persona-overrides`:
  ```typescript
  safeHandle(
    'interview-workspace:update-persona-overrides',
    async (_, payload: {
      workspaceId: string;
      hasCustomOverrides?: boolean;
      candidateBackgroundOverride?: string;
      aiPersonaOverride?: string;
    }) => {
      try {
        if (!payload?.workspaceId) {
          return { success: false, error: 'Missing workspaceId' };
        }
        const manager = InterviewWorkspaceStateManager.getInstance();
        const ws = await manager.updatePersonaOverrides(payload.workspaceId, payload);
        return { success: true, workspace: ws };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to update persona overrides' };
      }
    }
  );
  ```

In `electron/preload.ts`:
- Expose `interviewWorkspaceUpdatePersonaOverrides`:
  ```typescript
  interviewWorkspaceUpdatePersonaOverrides: (payload: {
    workspaceId: string;
    hasCustomOverrides?: boolean;
    candidateBackgroundOverride?: string;
    aiPersonaOverride?: string;
  }) => ipcRenderer.invoke('interview-workspace:update-persona-overrides', payload),
  ```

In `src/types/electron.d.ts`:
- Update `InterviewWorkspace` interface with the override fields.
- Update `ElectronAPI` with `interviewWorkspaceUpdatePersonaOverrides`.

- [ ] **Step 5: Run tests and typecheck**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`
Expected: PASS (all tests pass).
Run: `npm run build:electron:tsc`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add electron/services/InterviewWorkspaceStateManager.ts electron/ipcHandlers.ts electron/preload.ts src/types/electron.d.ts electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs
git commit -m "feat: add domain model and IPC for per-interview persona and candidate background overrides"
```

---

### Task 3: Knowledge Bank Hub Subsystem (`KnowledgeBankView.tsx` & Usage Tracking IPC)

**Files:**
- Create: `src/components/KnowledgeBankView.tsx`
- Modify: `electron/services/InterviewWorkspaceStateManager.ts`
- Modify: `electron/ipcHandlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Test: `electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`

**Interfaces:**
- Consumes: `InterviewWorkspaceStateManager.readWorkspaces()`, `contextDocumentList()`, `contextDocumentUpload()`, `contextDocumentDelete()`.
- Produces: `getDocumentUsage(): Record<string, Array<{ workspaceId: string; workspaceTitle: string }>>` and IPC channel `knowledge-bank:get-document-usage`.
- Produces: `<KnowledgeBankView onAttachToWorkspace={...} />` component.

- [ ] **Step 1: Write unit test for `getDocumentUsage` in `InterviewWorkspaceStateManager.test.mjs`**

Add test in `electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`:
```javascript
test('computes document usage across multiple workspaces', async () => {
  const ws1 = await manager.createWorkspace({ title: 'Google' });
  const ws2 = await manager.createWorkspace({ title: 'Stripe' });

  await manager.updateDocuments(ws1.id, ['doc-resume', 'doc-cheatsheet']);
  await manager.updateDocuments(ws2.id, ['doc-resume']);

  const usage = await manager.getDocumentUsage();
  assert.strictEqual(usage['doc-resume'].length, 2);
  assert.strictEqual(usage['doc-resume'][0].workspaceTitle, 'Google');
  assert.strictEqual(usage['doc-resume'][1].workspaceTitle, 'Stripe');
  assert.strictEqual(usage['doc-cheatsheet'].length, 1);
  assert.strictEqual(usage['doc-cheatsheet'][0].workspaceTitle, 'Google');
});
```

- [ ] **Step 2: Implement `getDocumentUsage` in `InterviewWorkspaceStateManager.ts`**

In `electron/services/InterviewWorkspaceStateManager.ts`:
```typescript
public async getDocumentUsage(): Promise<Record<string, Array<{ workspaceId: string; workspaceTitle: string }>>> {
  const workspaces = await this.readWorkspaces();
  const usage: Record<string, Array<{ workspaceId: string; workspaceTitle: string }>> = {};
  for (const ws of workspaces) {
    if (Array.isArray(ws.documentIds)) {
      for (const docId of ws.documentIds) {
        if (!usage[docId]) {
          usage[docId] = [];
        }
        usage[docId].push({
          workspaceId: ws.id,
          workspaceTitle: ws.title
        });
      }
    }
  }
  return usage;
}
```

- [ ] **Step 3: Register IPC Handler and Preload Bridge**

In `electron/ipcHandlers.ts`:
```typescript
safeHandle('knowledge-bank:get-document-usage', async () => {
  try {
    const manager = InterviewWorkspaceStateManager.getInstance();
    const usage = await manager.getDocumentUsage();
    return { success: true, usage };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to get document usage', usage: {} };
  }
});
```

In `electron/preload.ts`:
```typescript
knowledgeBankGetDocumentUsage: () => ipcRenderer.invoke('knowledge-bank:get-document-usage'),
```

In `src/types/electron.d.ts`:
```typescript
knowledgeBankGetDocumentUsage: () => Promise<{
  success: boolean;
  usage: Record<string, Array<{ workspaceId: string; workspaceTitle: string }>>;
  error?: string;
}>;
```

- [ ] **Step 4: Create `src/components/KnowledgeBankView.tsx` adhering to Impeccable standards**

Features in `src/components/KnowledgeBankView.tsx`:
- Header with search input (`Search documents...`), total document count, total storage consumption formatted, and `＋ Upload to Knowledge Bank` primary button.
- Drag-and-drop dropzone supporting `.pdf`, `.docx`, `.txt`, `.md` with visual drag-over feedback (warm amber border).
- Flat document cards grid (1px border `rgba(255, 255, 255, 0.07)`, `#1c1c21` background, no nested cards).
- Card metadata: File icon, title, formatted size, date, word count with tabular numerals (`tnum`).
- Usage badges: e.g. `Used in: Google, Stripe` with subtle amber/zinc badge styling.
- Actions menu: Preview document text modal, Attach to Interview workspace, and Delete with warning confirmation dialog.
- Empty State: When 0 documents exist, render an informative empty state explaining how master assets ground the AI copilot.
- Keyboard accessible (`Tab`, `Enter`, `Esc` for modals).

- [ ] **Step 5: Verify with React Doctor, TypeScript, and node tests**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`
Expected: PASS.
Run: `npm run doctor`
Expected: 0 errors.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add electron/services/InterviewWorkspaceStateManager.ts electron/ipcHandlers.ts electron/preload.ts src/types/electron.d.ts electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs src/components/KnowledgeBankView.tsx
git commit -m "feat: add KnowledgeBankView hub and cross-interview document usage tracking"
```

---

### Task 4: Launcher Navigation Rail & Active Context Strip in Interview Chat

**Files:**
- Modify: `src/components/Launcher.tsx`

**Interfaces:**
- Consumes: `<KnowledgeBankView />`, `selectedWorkspace`, `workspaces`, `contextDocumentList()`, `interviewWorkspaceUpdateDocuments()`.
- Produces: Top navigation rail switcher (`activeTab === 'interviews' | 'knowledge-bank'`), removal of right drawer from chat, and inline `ActiveContextStrip`.

- [ ] **Step 1: Remove right drawer (`ContextDocumentsPanel`) from `Launcher.tsx`**

In `src/components/Launcher.tsx`:
- Remove the right drawer container and imports of `ContextDocumentsPanel`.
- Expand the main interview area to reclaim full horizontal space.

- [ ] **Step 2: Add Top Rail Segmented Switcher in `Launcher.tsx`**

In the top header bar:
- Introduce `activeMainView: 'interviews' | 'knowledge-bank'` state.
- Render branded `InterviewOS` logo with lightning badge.
- Render segmented button group:
  - `[ 💬 Interviews ]` (shows company workspace sidebar + active interview chat)
  - `[ 📚 Knowledge Bank ]` (switches main view to `<KnowledgeBankView />`)
- Keep right-hand utility status (mic ready, audio permissions) and Settings trigger (`⚙️`).

- [ ] **Step 3: Implement inline Active Context Strip under the Round Switcher**

In `src/components/Launcher.tsx`:
- Directly beneath the round pill bar in the interview view, render the `Active Context Strip`:
  - `📎 Active Context:` label.
  - Attached document pills (`[📄 Resume.pdf ✕]`, `[📋 Job_Spec.pdf ✕]`) with 1-click detach (`✕`).
  - Detach calls `interviewWorkspaceUpdateDocuments(workspace.id, remainingIds)` immediately.
  - `+ Attach from Knowledge Bank` button that opens a clean modal with search and checkboxes for all documents from `availableDocs` not yet attached.
  - Direct drag-and-drop zone over the chat area that automatically calls `contextDocumentUpload`, then appends the new document ID to `selectedWorkspace.documentIds`.

- [ ] **Step 4: Verify with React Doctor and TypeScript**

Run: `npm run doctor`
Expected: 0 errors.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Launcher.tsx
git commit -m "feat: add top rail navigation, remove right drawer, and add inline Active Context strip"
```

---

### Task 5: Header Role & Persona Override Popover + Dynamic LLM Context Injection

**Files:**
- Create: `src/components/RolePersonaOverrideModal.tsx`
- Modify: `src/components/Launcher.tsx`
- Modify: `electron/main.ts` / `electron/ipcHandlers.ts` / `electron/LLMHelper.ts`

**Interfaces:**
- Consumes: `selectedWorkspace.hasCustomOverrides`, `candidateBackgroundOverride`, `aiPersonaOverride`.
- Produces: `<RolePersonaOverrideModal />` and dynamic LLM context switching when workspaces are selected.

- [ ] **Step 1: Create `src/components/RolePersonaOverrideModal.tsx`**

Features:
- Header: `⚡ Role & Persona Tuning — {workspaceTitle}`.
- Switch: `[✓] Override Global Candidate Background & AI Persona for this Interview`.
- When disabled: Shows grayed preview of active global settings with tag: `Inheriting from Global Settings`.
- When enabled:
  - Textarea: `Candidate Background for this Role` (e.g. key projects, metrics, tech stack to emphasize).
  - Textarea: `AI Persona & Style for this Role` (e.g. Staff Engineer: state architecture trade-offs first, concise bullet points).
- Action buttons: `Cancel` (`Esc`) and `Save Overrides` (`Enter`).
- Calls `window.electronAPI.interviewWorkspaceUpdatePersonaOverrides`.

- [ ] **Step 2: Mount `[ ⚡ Role & Persona ]` trigger in `Launcher.tsx` header**

In `src/components/Launcher.tsx`:
- Add a pill button next to the interview workspace title in the main header:
  - If `selectedWorkspace.hasCustomOverrides`: amber tinted badge `[ ⚡ Custom Persona Active ]`.
  - If default: zinc pill `[ ⚡ Role & Persona ]`.
- Clicking opens `RolePersonaOverrideModal`.

- [ ] **Step 3: Dynamic LLM context synchronization on workspace switch**

In `Launcher.tsx` (when `selectWorkspace` is called):
- Register an IPC call or invoke `interview-workspace:sync-llm-context`:
  - When `ws.hasCustomOverrides` is true: sends `candidateBackgroundOverride` to `llmHelper.setCustomNotes()` and `aiPersonaOverride` to `llmHelper.setPersonaPrompt()`.
  - When false or unselected: restores global notes from `DatabaseManager.getInstance().getCustomNotes()` and global persona from `DatabaseManager.getInstance().getPersona()`.
- Verify in `electron/ipcHandlers.ts` that `interview-workspace:sync-llm-context` safely applies notes to `llmHelper`.

- [ ] **Step 4: Verify with React Doctor, TypeScript, and Electron build**

Run: `npm run doctor`
Expected: 0 errors.
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.
Run: `npm run build:electron:tsc`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/RolePersonaOverrideModal.tsx src/components/Launcher.tsx electron/ipcHandlers.ts
git commit -m "feat: add per-interview role and persona overrides with dynamic LLM context synchronization"
```

---

### Task 6: Craft Floor Audit, Impeccable Slop Detection & E2E Verification

**Files:**
- Review all modified files across the repo.

**Interfaces:**
- Consumes: Complete InterviewOS codebase.
- Produces: 0 React Doctor errors, 0 Impeccable slop warnings, 0 TypeScript errors, passing test suite.

- [ ] **Step 1: Run Impeccable design detector**

Run: `/Users/naheedroomy/.gemini/config/skills/impeccable/scripts/impeccable detect --json src`
Verify output has 0 warnings for `gradient-text`, `bounce-easing`, or `codex-grid-background`.

- [ ] **Step 2: Run React Doctor**

Run: `npm run doctor`
Verify: Exits with 0 errors and 0 warnings.

- [ ] **Step 3: Run Node and Frontend test suites**

Run: `node --test electron/services/__tests__/InterviewWorkspaceStateManager.test.mjs`
Verify: All tests pass.
Run: `npm test -- --run` (or corresponding test runner if configured)
Verify: Passes.

- [ ] **Step 4: Full TypeScript and build verification**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npm run build:electron`
Run: `npm run build`
Verify: All builds succeed with 0 errors.

- [ ] **Step 5: Commit final polish**

```bash
git add -A
git commit -m "chore: complete Impeccable craft floor verification and build checks for InterviewOS"
```
