# Design Spec: First-Class Interview Chats, Multi-Round Runs & Dedicated Documents

**Date:** 2026-09-08  
**Status:** Approved  
**Author:** Antigravity (Pair Programming with Naheed Roomy)

---

## 1. Executive Summary

AnswerCue currently organizes sessions around completed or active SQLite `meetings`. When a user creates a new interview session and chats with the prep assistant or attaches documents, that state remains an ephemeral draft until a live recording is completed. If the user doesn't start an interview, the draft is not listed in the sidebar. Furthermore, clicking "Prepare next run" is abrupt and deselects the meeting back into a bare draft without clear round continuity.

This specification redesigns the core interaction into **First-Class Interview Workspaces (Chats)** with **Nested Rounds**:
1. **Persistent Interview Chats in Sidebar**: Every interview session (e.g. *"Google — Staff Backend"*, *"Stripe — Systems"*) is immediately persisted upon creation, visible in the sidebar, renamable, and deletable without ever needing to click "Start Interview".
2. **Multi-Round Interview Hierarchy**: Each Interview Chat contains one or more **Rounds** (`Round 1: Recruiter Screen`, `Round 2: System Design`, `Round 3: Behavioral`). All company documents (resumes, job descriptions) are shared at the interview level, while each round has its own independent prep conversation and live meeting transcript/AI Q&A.
3. **Dedicated Context Documents Panel**: Replaces the floating composer popup with a clean, permanent card in the right-hand panel for drag-and-drop file uploads, one-click removal, and quick reuse of existing documents.
4. **Intuitive "Start Next Round" UX**: When a round concludes, users can immediately review it or click a prominent `+ Start Next Round` button to generate a clean slate for the next interview stage while retaining all company docs.

---

## 2. Architecture & Data Model

### 2.1 Domain Entities

```typescript
export interface InterviewRound {
  id: string;                      // UUID or slug, e.g. "round-1"
  name: string;                    // e.g. "Round 1", "Technical Screen"
  roundNumber: number;             // 1, 2, 3...
  status: 'draft' | 'active' | 'completed';
  prepMessages: PrepMessage[];     // Dedicated prep conversation for this round
  meetingId?: string;              // Linked SQLite meeting ID once started/finished
  createdAt: string;               // ISO 8601
  completedAt?: string;            // ISO 8601
}

export interface InterviewWorkspace {
  id: string;                      // Unique workspace ID
  title: string;                   // e.g. "Google — Staff Backend"
  documentIds: string[];           // Document IDs shared across all rounds
  rounds: InterviewRound[];        // Ordered list of interview rounds
  activeRoundId: string;           // Currently selected round ID
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
}
```

### 2.2 Storage & State Management (`InterviewWorkspaceStateManager`)

The backend persistence layer in `electron/services/InterviewWorkspaceStateManager.ts` manages `workspaces.json` stored in `userData/interview-context/workspaces.json`.

- **Atomic disk persistence**: Any workspace creation, rename, round addition, or prep update writes to a temporary file (`.tmp`) and renames synchronously to guarantee crash safety.
- **Immediate Draft Creation**: When `workspace:create` is invoked, a new `InterviewWorkspace` is saved to disk with `Round 1` in `'draft'` state and returned immediately.
- **No Legacy Migration Burden**: Per requirements, legacy v1/v2 schema backward compatibility is discarded in favor of this clean, robust schema.

---

## 3. IPC API Contracts

The following IPC handlers will be implemented in `electron/ipcHandlers.ts` and exposed via `electron/preload.ts`:

| Channel | Parameters | Return Type | Description |
|---|---|---|---|
| `interview-workspace:list` | `none` | `{ success: boolean; workspaces: InterviewWorkspace[] }` | Returns all workspaces sorted by `updatedAt` desc |
| `interview-workspace:create` | `{ title?: string; initialDocIds?: string[] }` | `{ success: boolean; workspace: InterviewWorkspace }` | Creates & persists a new workspace with Round 1 |
| `interview-workspace:get-by-id` | `id: string` | `{ success: boolean; workspace?: InterviewWorkspace }` | Retrieves a workspace by its ID |
| `interview-workspace:rename` | `{ id: string; title: string }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Renames an interview workspace |
| `interview-workspace:delete` | `id: string` | `{ success: boolean }` | Deletes workspace and cleans up references |
| `interview-workspace:add-round` | `{ workspaceId: string; name?: string }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Appends a new round inheriting company docs |
| `interview-workspace:rename-round` | `{ workspaceId: string; roundId: string; name: string }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Renames a specific round |
| `interview-workspace:set-active-round`| `{ workspaceId: string; roundId: string }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Updates the active round selection |
| `interview-workspace:update-round-prep`| `{ workspaceId: string; roundId: string; messages: PrepMessage[] }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Saves prep messages for a round |
| `interview-workspace:update-documents`| `{ workspaceId: string; documentIds: string[] }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Updates attached documents |
| `interview-workspace:start-meeting` | `{ workspaceId: string; roundId: string }` | `{ success: boolean; meetingId: string }` | Marks round 'active' and links to running meeting |
| `interview-workspace:finish-meeting`| `{ workspaceId: string; roundId: string; meetingId: string }` | `{ success: boolean; workspace?: InterviewWorkspace }` | Marks round 'completed' and binds meetingId |

---

## 4. UI / UX Design Specifications

### 4.1 Left Sidebar: Interview Chats List

1. **Header**:
   - `➕ New Interview` button styled as a prominent primary action.
   - Section header: `Interviews ({count})` with a quick refresh button.
2. **Interview Item**:
   - **Title**: e.g., *"Google — Staff Backend"*, bold and truncated cleanly.
   - **Subtitle**: Status & count, e.g. `"2 rounds · 1h ago"` or `"Draft · 1 round"`.
   - **Live Indicator**: If a round is actively recording, shows a glowing red dot or badge (`LIVE`).
   - **Inline Renaming**: Double-clicking the title or selecting `Rename` from the `•••` menu renders an inline `<input>` (press `Enter` to save, `Esc` to cancel).
   - **Context Menu (`•••`)**:
     - ✏️ `Rename`
     - 🗑️ `Delete Interview` (shows confirmation modal).
3. **Selection**: Clicking any interview immediately sets it as `activeWorkspace` and loads its active round and documents.

### 4.2 Main Header: Round Navigation & Primary Actions

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Google — Staff Backend ✏️                                 [ Start Interview ]│
│                                                                               │
│  [ ✓ Round 1: Screen ]  [ 🟢 Round 2: System Design (Current) ]  [ + Next Round ]│
└───────────────────────────────────────────────────────────────────────────────┘
```

1. **Title Bar**:
   - Displays the current interview title.
   - Clicking the title or an adjacent pencil icon enables inline editing.
2. **Round Pill Bar**:
   - Horizontally scrollable row of pills representing all rounds in the interview.
   - Completed rounds have a checkmark icon `✓`. Clicking them displays that round's past transcript, Q&A notes, and summary.
   - The current/active round has an active pill style (`bg-accent-primary` or border highlight).
   - `+ Next Round` button immediately appends a new round, switches to it, and readies the screen.
3. **Primary Action Button**:
   - In draft round: **`Start Interview`** (with green accent on hover).
   - In active live round: **`Return to Overlay`** / **`End Interview`**.
   - In completed round: **`Start Next Round`**.

### 4.3 Right Panel: Dedicated Context Documents Card

1. **Dropzone / Upload Zone**:
   - Permanent dashed drop target: *"Drop Resume, Job Description, or Notes here, or click to browse"*.
   - Accepts `.pdf`, `.docx`, `.txt`, `.md`.
2. **Attached Documents List**:
   - Scoped strictly to the selected `InterviewWorkspace`.
   - Each item shows:
     - File icon (PDF, DOCX, TXT, MD).
     - File name and formatted size (e.g. `48 KB`).
     - Kind badge (`Resume`, `Job Description`, `Notes`).
     - Trash icon to detach/remove the document from this workspace.
3. **"Reuse from another interview"**:
   - Link button below the document list.
   - Opens a dialog displaying all documents across all workspaces so users can reuse their primary resume without re-uploading.

### 4.4 Central Panel (`InterviewPrepPanel`): Prep & Round Timeline

1. **Before Meeting (Draft Round)**:
   - Clean, focused chat view with the AI prep assistant.
   - Composer at the bottom: users type requirements, questions to expect, or notes.
   - All messages saved immediately to `round.prepMessages`.
2. **During Meeting (Active Round)**:
   - Rolling live transcript with speaker tags (Interviewer vs Candidate).
   - Live AI suggestions streaming in real-time.
3. **After Meeting (Completed Round)**:
   - Complete review timeline: prep notes, full meeting transcript, and AI answers given.
   - Banner at top: *"Round completed"*.
   - Prominent button: **`Start Next Round`**.

---

## 5. Implementation Plan (Phased)

1. **Phase 1: Backend & IPC (`InterviewWorkspaceStateManager.ts` + `ipcHandlers.ts` + `preload.ts`)**
   - Implement `InterviewWorkspace` and `InterviewRound` types.
   - Implement synchronous atomic file operations (`listWorkspaces`, `createWorkspace`, `renameWorkspace`, `deleteWorkspace`, `addRound`, `renameRound`, `updateRoundPrep`, `updateDocuments`).
   - Register all IPC handlers in `ipcHandlers.ts` and expose them in `preload.ts`.
2. **Phase 2: Right Panel Document Component (`ContextDocumentsPanel.tsx`)**
   - Build dedicated right-panel card with drag & drop upload, document list, delete, and reuse modal.
   - Wire directly to the active workspace's `documentIds`.
3. **Phase 3: Sidebar Redesign (`Launcher.tsx`)**
   - Replace raw `meetings` list in sidebar with `InterviewWorkspace` list.
   - Add instant `New Interview` creation, inline renaming, and deletion.
4. **Phase 4: Header & Round Switcher (`Launcher.tsx` + `InterviewPrepPanel.tsx`)**
   - Add Round pill bar in header.
   - Implement `addRound` ("Start Next Round") interaction.
   - Bind prep chat and meeting transcript to the active round.
5. **Phase 5: Verification & Quality Gate**
   - Run `npm run doctor` to ensure 0 React Doctor errors.
   - Test workspace creation, renaming, document upload, round addition, and interview lifecycle.

---

## 6. Self-Review & Acceptance Criteria

- [x] **No Placeholders**: All contracts, types, and interactions are fully specified.
- [x] **Internal Consistency**: Data models align with IPC methods and UI component specs.
- [x] **Scope**: Self-contained within the Launcher, WorkspaceStateManager, and IPC layers.
- [x] **Unambiguity**: Option B (Clean Sidebar + Header Round Switcher) and Option A (Dedicated Right Panel Documents) are explicitly adhered to.
