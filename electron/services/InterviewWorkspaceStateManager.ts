import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export type InterviewWorkspacePhase = 'before' | 'during' | 'after';
export type InterviewWorkspaceStatus = 'draft' | 'active' | 'complete';

export interface InterviewWorkspaceAttachment {
  id: string;
  name: string;
  fileType: 'md' | 'txt' | 'pdf' | 'docx';
  contextKind?: 'resume' | 'project' | 'other';
  sizeBytes: number;
}

export interface InterviewWorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  phase?: InterviewWorkspacePhase;
  attachments?: InterviewWorkspaceAttachment[];
}

/**
 * V2 workspace state.
 *
 * - `meetingIds` — all meetings ever completed in this workspace
 * - `activeMeetingId` — the meeting currently in-progress (set during a run)
 * - `meetingId` — compat alias for the last finished run; mirrors the last
 *   element of `meetingIds` when non-empty
 * - `status` — `draft` (ready), `active` (run in progress), `complete` (legacy v1)
 */
export interface InterviewWorkspaceState {
  id: string;
  meetingIds: string[];
  activeMeetingId?: string;
  meetingId?: string; // compat alias: last finished run
  status: InterviewWorkspaceStatus;
  messages: InterviewWorkspaceMessage[];
  selectedDocumentIds: string[];
  contextMarkdown?: string;
  createdAt: string;
  updatedAt: string;
}

const MAX_WORKSPACES = 300;
const MAX_CONTEXT_MARKDOWN_CHARS = 250_000;
const VALID_PHASES = new Set<InterviewWorkspacePhase>(['before', 'during', 'after']);
const VALID_STATUSES = new Set<InterviewWorkspaceStatus>(['draft', 'active', 'complete']);

// ─── Store schema ────────────────────────────────────────────────────────────

interface WorkspaceStoreV2 {
  version: 2;
  workspaces: InterviewWorkspaceState[];
}

type WorkspaceStore = WorkspaceStoreV2;

// ─── Normalization helpers ──────────────────────────────────────────────────

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())));
}

function normalizeAttachment(raw: any): InterviewWorkspaceAttachment | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;

  const fileType = ['md', 'txt', 'pdf', 'docx'].includes(raw.fileType) ? raw.fileType : 'txt';
  const contextKind = ['resume', 'project', 'other'].includes(raw.contextKind) ? raw.contextKind : undefined;

  return {
    id: raw.id,
    name: raw.name,
    fileType,
    contextKind,
    sizeBytes: Number.isFinite(raw.sizeBytes) ? raw.sizeBytes : 0,
  };
}

function normalizeMessage(raw: any): InterviewWorkspaceMessage | null {
  if (!raw || typeof raw.id !== 'string') return null;
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;

  const phase = VALID_PHASES.has(raw.phase) ? raw.phase : undefined;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map(normalizeAttachment).filter(Boolean) as InterviewWorkspaceAttachment[]
    : [];

  return {
    id: raw.id,
    role: raw.role,
    content: normalizeString(raw.content),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    phase,
    attachments: attachments.length ? attachments : undefined,
  };
}

/**
 * Normalize a raw blob into a v2 `InterviewWorkspaceState`.
 *
 * The function handles migration from v1 (single `meetingId`) to v2
 * (`meetingIds` array) automatically: if `meetingIds` is missing/empty but
 * a legacy `meetingId` is present, it wraps it in an array and keeps the
 * compat alias.
 */
function normalizeState(raw: any, existing?: InterviewWorkspaceState): InterviewWorkspaceState {
  const now = new Date().toISOString();
  const status: InterviewWorkspaceStatus = VALID_STATUSES.has(raw?.status)
    ? raw.status
    : existing?.status || 'draft';

  const messages = Array.isArray(raw?.messages)
    ? raw.messages.map(normalizeMessage).filter(Boolean) as InterviewWorkspaceMessage[]
    : existing?.messages || [];

  const contextMarkdown = normalizeString(raw?.contextMarkdown).slice(0, MAX_CONTEXT_MARKDOWN_CHARS);

  // ── v1 → v2 migration ───────────────────────────────────────────────────
  // v1 stored a single `meetingId`. v2 uses `meetingIds: string[]` and keeps
  // the single `meetingId` as a compat alias for the last finished run.
  const v2MeetingIds: string[] = Array.isArray(raw?.meetingIds)
    ? raw.meetingIds.filter((id: any) => typeof id === 'string' && id.trim())
    : [];

  // If no v2 array but a legacy meetingId exists, migrate it.
  const legacyMeetingId = normalizeString(raw?.meetingId || existing?.meetingId) || undefined;
  if (v2MeetingIds.length === 0 && legacyMeetingId) {
    v2MeetingIds.push(legacyMeetingId);
  }

  // Compat alias: prefer v2 meetingId field, fall back to legacy, default to last
  // element of meetingIds if non-empty.
  const compatMeetingId = normalizeString(raw?.meetingId || existing?.meetingId) || undefined
    || (v2MeetingIds.length > 0 ? v2MeetingIds[v2MeetingIds.length - 1] : undefined);

  const activeMeetingId = normalizeString(raw?.activeMeetingId ?? existing?.activeMeetingId) || undefined;

  return {
    id: normalizeString(raw?.id || existing?.id),
    meetingIds: v2MeetingIds,
    activeMeetingId,
    meetingId: compatMeetingId,
    status,
    messages,
    selectedDocumentIds: normalizeDocumentIds(raw?.selectedDocumentIds ?? existing?.selectedDocumentIds),
    contextMarkdown: contextMarkdown || undefined,
    createdAt: existing?.createdAt || normalizeString(raw?.createdAt) || now,
    updatedAt: now,
  };
}

// ─── Manager ────────────────────────────────────────────────────────────────

export class InterviewWorkspaceStateManager {
  private static instance: InterviewWorkspaceStateManager;
  private readonly statePath: string;

  /** Override for unit tests. `getInstance()` picks this up if set. */
  private static _testStatePath: string | null = null;

  /**
   * Set a custom state path for testing. Call before the first `getInstance()`.
   * Resets the singleton so the next `getInstance()` uses the new path.
   */
  public static __setTestStatePath(tmpPath: string): void {
    InterviewWorkspaceStateManager._testStatePath = tmpPath;
    InterviewWorkspaceStateManager.instance = null as any;
  }

  private constructor() {
    if (InterviewWorkspaceStateManager._testStatePath) {
      this.statePath = InterviewWorkspaceStateManager._testStatePath;
    } else {
      const dir = path.join(app.getPath('userData'), 'interview-context');
      fs.mkdirSync(dir, { recursive: true });
      this.statePath = path.join(dir, 'workspaces.json');
    }
  }

  public static getInstance(): InterviewWorkspaceStateManager {
    if (!InterviewWorkspaceStateManager.instance) {
      InterviewWorkspaceStateManager.instance = new InterviewWorkspaceStateManager();
    }
    return InterviewWorkspaceStateManager.instance;
  }

  // ─── Read / Write ────────────────────────────────────────────────────────

  public getWorkspace(id: string): InterviewWorkspaceState | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;
    return this.readStore().workspaces.find(workspace => workspace.id === workspaceId) || null;
  }

  /**
   * Returns all workspaces, newest first.
   */
  public listWorkspaces(): InterviewWorkspaceState[] {
    const store = this.readStore();
    return [...store.workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Find a workspace associated with the given meeting ID (v2: searches
   * `meetingIds` array).
   */
  public getWorkspaceForMeeting(meetingId: string): InterviewWorkspaceState | null {
    const id = normalizeString(meetingId).trim();
    if (!id) return null;
    const matches = this.readStore().workspaces.filter(
      ws => ws.meetingIds.includes(id) || ws.meetingId === id || ws.activeMeetingId === id,
    );
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  }

  // ─── Resolve Draft ──────────────────────────────────────────────────────

  /**
   * Resolve a usable draft workspace, persisting one before returning.
   *
   * The return object includes a `created` flag so the caller can distinguish
   * a freshly created workspace from an existing one being reused.
   *
   * - `forceNew`: always create and persist a brand new draft.
   * - `preferredId`: a hint from the renderer (e.g. localStorage). If a
   *   workspace with this ID exists AND is reusable (status 'draft' or
   *   migrated 'complete' with meeting history), it is returned as-is.
   *   If it does not exist, a new draft is created with *that* ID. If
   *   it exists but is active, a new draft with a fresh ID is created.
   * - Neither flag: the most recently updated reusable workspace is returned,
   *   or a new one is created if none exist.
   *
   * "Reusable" means `status !== 'active'`. Under v2, completed runs return
   * the workspace to 'draft' with `meetingIds` populated. v1-migrated
   * workspaces with `status === 'complete'` are also treated as reusable.
   */
  public resolveDraft(options: { preferredId?: string; forceNew?: boolean } = {}): { workspace: InterviewWorkspaceState; created: boolean } {
    const { preferredId, forceNew } = options;

    // forceNew always creates a fresh workspace
    if (forceNew) {
      return { workspace: this.createAndPersistDraft(preferredId), created: true };
    }

    // preferredId hint: try to reuse an existing non-active workspace
    if (preferredId) {
      const trimmedId = preferredId.trim();
      if (trimmedId) {
        const existing = this.getWorkspace(trimmedId);
        if (existing && existing.status !== 'active') {
          // Reuse — preserves timestamps
          return { workspace: existing, created: false };
        }
        if (!existing) {
          // Hint ID doesn't exist; create a draft with it
          return { workspace: this.createAndPersistDraft(trimmedId), created: true };
        }
        // existing is active — fall through to find another or create new
      }
    }

    // No hint or hint didn't yield a reusable workspace: pick most recent
    // non-active workspace (draft or migrated complete).
    const reusable = this.listWorkspaces().filter(ws => ws.status !== 'active');
    if (reusable.length > 0) {
      return { workspace: reusable[0], created: false };
    }

    // No reusable workspaces at all: create one
    return { workspace: this.createAndPersistDraft(), created: true };
  }

  // ─── Narrow mutation APIs ────────────────────────────────────────────────

  /**
   * Update prep context, chat messages, and/or selected documents for a
   * workspace. Only allowed when workspace is not 'active' (prevents mid-run
   * edits).
   *
   * The renderer calls with the shape:
   *   { workspaceId, messages?, selectedDocumentIds?, contextMarkdown? }
   *
   * Messages are validated via `normalizeMessage` and invalid entries silently
   * dropped to match the existing v1 normalization contract.
   */
  public updatePrepContext(
    id: string,
    contextMarkdown?: string,
    selectedDocumentIds?: string[],
    messages?: InterviewWorkspaceMessage[],
  ): InterviewWorkspaceState | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === workspaceId);
    if (!existing) return null;
    if (existing.status === 'active') return null; // cannot edit prep during a run

    const updated: InterviewWorkspaceState = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };

    if (contextMarkdown !== undefined) {
      updated.contextMarkdown = contextMarkdown.slice(0, MAX_CONTEXT_MARKDOWN_CHARS) || undefined;
    }
    if (selectedDocumentIds !== undefined) {
      updated.selectedDocumentIds = normalizeDocumentIds(selectedDocumentIds);
    }
    if (messages !== undefined) {
      const validated = Array.isArray(messages)
        ? messages.map(normalizeMessage).filter(Boolean) as InterviewWorkspaceMessage[]
        : [];
      updated.messages = validated;
    }

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Begin a run on a workspace. Marks the workspace as 'active'.
   *
   * Prevents duplicate run ownership: if the workspace is already active,
   * returns null.
   */
  public beginRun(id: string): InterviewWorkspaceState | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === workspaceId);
    if (!existing) return null;
    if (existing.status === 'active') return null; // duplicate run guard

    const updated: InterviewWorkspaceState = {
      ...existing,
      status: 'active',
      activeMeetingId: undefined, // will be set during finishRun
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Finish a run. Appends the meeting ID to the workspace's meeting list and
   * returns the workspace to 'draft'.
   *
   * - If the workspace does not exist or is already in draft, creates it as a
   *   new workspace (backwards-compatible with MeetingPersistence flows that
   *   call finishRun without a prior beginRun).
   * - Prevents duplicate meeting IDs in the workspace.
   */
  public finishRun(id: string, meetingId: string): InterviewWorkspaceState {
    const workspaceId = normalizeString(id).trim();
    const cleanMeetingId = normalizeString(meetingId).trim();
    if (!workspaceId) throw new Error('Workspace id is required for finishRun');
    if (!cleanMeetingId) throw new Error('Meeting id is required for finishRun');

    const store = this.readStore();
    let existing = store.workspaces.find(ws => ws.id === workspaceId);

    if (!existing) {
      // Create workspace on-the-fly (backwards compat with MeetingPersistence
      // that may call finishRun without a prior beginRun)
      const newWs: InterviewWorkspaceState = {
        id: workspaceId,
        meetingIds: [cleanMeetingId],
        activeMeetingId: undefined,
        meetingId: cleanMeetingId,
        status: 'draft',
        messages: [],
        selectedDocumentIds: [],
        contextMarkdown: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return this.tryReplaceInStore(store, newWs);
    }

    // Prevent duplicate meeting ownership
    const meetingIds = existing.meetingIds.includes(cleanMeetingId)
      ? existing.meetingIds
      : [...existing.meetingIds, cleanMeetingId];

    const updated: InterviewWorkspaceState = {
      ...existing,
      meetingIds,
      activeMeetingId: undefined,
      meetingId: cleanMeetingId, // compat alias = last finished run
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Cancel an active run, returning the workspace to 'draft'.
   * Safe to call on a draft workspace (no-op in terms of status change).
   */
  public cancelRun(id: string): InterviewWorkspaceState | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === workspaceId);
    if (!existing) return null;

    const updated: InterviewWorkspaceState = {
      ...existing,
      status: 'draft',
      activeMeetingId: undefined,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  // ─── Compatibility adapters ─────────────────────────────────────────────

  /**
   * Legacy: save a workspace (with v2 normalization).
   */
  public saveWorkspace(input: Partial<InterviewWorkspaceState> & { id: string }): InterviewWorkspaceState {
    const store = this.readStore();
    const existing = store.workspaces.find(workspace => workspace.id === input.id);
    const normalized = normalizeState(input, existing);

    if (!normalized.id) {
      throw new Error('Workspace id is required.');
    }

    return this.tryReplaceInStore(store, normalized);
  }

  /**
   * Legacy: attach a meeting to a workspace.
   *
   * In v1 this set status='complete'. In v2 it delegates to `finishRun`,
   * which appends the meeting and reverts to 'draft'.
   */
  public attachMeeting(
    workspaceId: string,
    meetingId: string,
    patch: Partial<Pick<InterviewWorkspaceState, 'contextMarkdown' | 'selectedDocumentIds'>> = {},
  ): InterviewWorkspaceState | null {
    try {
      const result = this.finishRun(workspaceId, meetingId);
      // Apply optional patch (if fields were provided and it's a meaningful change)
      if (patch.contextMarkdown !== undefined || patch.selectedDocumentIds !== undefined) {
        return this.updatePrepContext(
          workspaceId,
          patch.contextMarkdown ?? result.contextMarkdown,
          patch.selectedDocumentIds ?? result.selectedDocumentIds,
        ) ?? result;
      }
      return result;
    } catch {
      return null;
    }
  }

  // ─── Deletion ────────────────────────────────────────────────────────────

  public deleteWorkspace(id: string): boolean {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return false;

    const store = this.readStore();
    const idx = store.workspaces.findIndex(ws => ws.id === workspaceId);
    if (idx === -1) return false;

    store.workspaces.splice(idx, 1);
    this.writeStore(store);
    return true;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private createAndPersistDraft(preferredId?: string): InterviewWorkspaceState {
    const id = preferredId?.trim() || crypto.randomUUID();
    const now = new Date().toISOString();

    const draft: InterviewWorkspaceState = {
      id,
      meetingIds: [],
      activeMeetingId: undefined,
      meetingId: undefined,
      status: 'draft',
      messages: [],
      selectedDocumentIds: [],
      contextMarkdown: undefined,
      createdAt: now,
      updatedAt: now,
    };

    const store = this.readStore();
    return this.tryReplaceInStore(store, draft);
  }

  /**
   * Replace or insert a workspace in the store and persist atomically.
   */
  private tryReplaceInStore(store: WorkspaceStore, workspace: InterviewWorkspaceState): InterviewWorkspaceState {
    const nextWorkspaces = store.workspaces.filter(ws => ws.id !== workspace.id);
    nextWorkspaces.unshift(workspace);
    this.writeStore({ version: 2, workspaces: nextWorkspaces.slice(0, MAX_WORKSPACES) });
    return workspace;
  }

  private readStore(): WorkspaceStore {
    try {
      if (!fs.existsSync(this.statePath)) return { version: 2, workspaces: [] };

      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const rawWorkspaces = Array.isArray(parsed?.workspaces)
        ? parsed.workspaces
        : Array.isArray(parsed)
          ? parsed
          : [];

      const workspaces = rawWorkspaces
        .map((workspace: any) => {
          try {
            return normalizeState(workspace);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as InterviewWorkspaceState[];

      return { version: 2, workspaces };
    } catch (error) {
      console.error('[InterviewWorkspaceStateManager] failed to read workspace state:', error);
      return { version: 2, workspaces: [] };
    }
  }

  private writeStore(store: WorkspaceStore): void {
    const tmpPath = `${this.statePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpPath, this.statePath);
  }
}
