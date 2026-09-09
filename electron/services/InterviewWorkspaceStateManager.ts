import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

let electronApp: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  electronApp = electron.app;
} catch {
  // Not in Electron runtime (e.g. Node test environment)
}

export type InterviewWorkspacePhase = 'before' | 'during' | 'after';
import { InterviewContextDocumentKind } from './InterviewContextDocsManager';

export type InterviewWorkspaceStatus = 'draft' | 'active' | 'complete';

export interface InterviewWorkspaceAttachment {
  id: string;
  name: string;
  fileType: 'md' | 'txt' | 'pdf' | 'docx';
  contextKind?: InterviewContextDocumentKind;
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
  hasCustomOverrides?: boolean;
  candidateBackgroundOverride?: string;
  aiPersonaOverride?: string;
  modelOverride?: string;
  createdAt: string;
  updatedAt: string;
}

/** Compatibility alias for earlier callers */
export type InterviewWorkspaceState = InterviewWorkspace;

const MAX_WORKSPACES = 300;

// ─── Store schema ────────────────────────────────────────────────────────────

interface WorkspaceStoreV3 {
  version: 3;
  workspaces: InterviewWorkspace[];
}

type WorkspaceStore = WorkspaceStoreV3;

// ─── Normalization helpers ──────────────────────────────────────────────────

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())));
}

function normalizeRound(raw: any, index: number): InterviewRound | null {
  if (!raw || typeof raw !== 'object') return null;
  const now = new Date().toISOString();
  const id = normalizeString(raw.id).trim() || crypto.randomUUID();
  const roundNumber = Number.isInteger(raw.roundNumber) && raw.roundNumber > 0 ? raw.roundNumber : index + 1;
  const name = normalizeString(raw.name).trim() || `Round ${roundNumber}`;
  const status = ['draft', 'active', 'completed'].includes(raw.status) ? raw.status : 'draft';
  const prepMessages = Array.isArray(raw.prepMessages) ? raw.prepMessages : (Array.isArray(raw.messages) ? raw.messages : []);
  const meetingId = normalizeString(raw.meetingId).trim() || undefined;
  const createdAt = normalizeString(raw.createdAt) || now;
  const completedAt = normalizeString(raw.completedAt) || undefined;

  return {
    id,
    name,
    roundNumber,
    status,
    prepMessages,
    meetingId,
    createdAt,
    completedAt,
  };
}

function normalizeWorkspace(raw: any, existing?: InterviewWorkspace): InterviewWorkspace {
  const now = new Date().toISOString();
  const id = normalizeString(raw?.id || existing?.id).trim() || crypto.randomUUID();
  const title = normalizeString(raw?.title || existing?.title).trim() || 'New Interview';
  const documentIds = normalizeDocumentIds(raw?.documentIds ?? raw?.selectedDocumentIds ?? existing?.documentIds);

  let rounds: InterviewRound[] = [];
  if (Array.isArray(raw?.rounds) && raw.rounds.length > 0) {
    rounds = raw.rounds.map((r: any, idx: number) => normalizeRound(r, idx)).filter(Boolean) as InterviewRound[];
  } else if (existing?.rounds && existing.rounds.length > 0) {
    rounds = existing.rounds;
  } else {
    // Migration from v1/v2 schema or initial round creation
    const v2MeetingIds: string[] = Array.isArray(raw?.meetingIds)
      ? raw.meetingIds.filter((m: any) => typeof m === 'string' && m.trim())
      : [];
    const legacyMeetingId = normalizeString(raw?.meetingId).trim();
    const primaryMeetingId = legacyMeetingId || (v2MeetingIds.length > 0 ? v2MeetingIds[v2MeetingIds.length - 1] : undefined);

    const initialRoundId = crypto.randomUUID();
    const initialRound: InterviewRound = {
      id: initialRoundId,
      name: 'Round 1',
      roundNumber: 1,
      status: raw?.status === 'active' ? 'active' : (primaryMeetingId ? 'completed' : 'draft'),
      prepMessages: Array.isArray(raw?.messages) ? raw.messages : [],
      meetingId: primaryMeetingId,
      createdAt: existing?.createdAt || normalizeString(raw?.createdAt) || now,
      completedAt: primaryMeetingId ? (normalizeString(raw?.updatedAt) || now) : undefined,
    };
    rounds = [initialRound];
  }

  if (rounds.length === 0) {
    const fallbackRoundId = crypto.randomUUID();
    rounds = [{
      id: fallbackRoundId,
      name: 'Round 1',
      roundNumber: 1,
      status: 'draft',
      prepMessages: [],
      createdAt: now,
    }];
  }

  const activeRoundCandidate = normalizeString(raw?.activeRoundId || existing?.activeRoundId).trim();
  const activeRoundId = rounds.some(r => r.id === activeRoundCandidate)
    ? activeRoundCandidate
    : rounds[0].id;

  return {
    id,
    title,
    documentIds,
    rounds,
    activeRoundId,
    hasCustomOverrides: Boolean(raw?.hasCustomOverrides ?? existing?.hasCustomOverrides),
    candidateBackgroundOverride: typeof (raw?.candidateBackgroundOverride ?? existing?.candidateBackgroundOverride) === 'string'
      ? (raw?.candidateBackgroundOverride ?? existing?.candidateBackgroundOverride)
      : '',
    aiPersonaOverride: typeof (raw?.aiPersonaOverride ?? existing?.aiPersonaOverride) === 'string'
      ? (raw?.aiPersonaOverride ?? existing?.aiPersonaOverride)
      : '',
    modelOverride: typeof (raw?.modelOverride ?? existing?.modelOverride) === 'string' && (raw?.modelOverride ?? existing?.modelOverride).trim()
      ? (raw?.modelOverride ?? existing?.modelOverride).trim()
      : undefined,
    createdAt: existing?.createdAt || normalizeString(raw?.createdAt) || now,
    updatedAt: normalizeString(raw?.updatedAt || existing?.updatedAt).trim() || now,
  };
}

let lastMonotonicTime = 0;
function getMonotonicIsoTimestamp(): string {
  let now = Date.now();
  if (now <= lastMonotonicTime) {
    now = lastMonotonicTime + 1;
  }
  lastMonotonicTime = now;
  return new Date(now).toISOString();
}

// ─── Manager ────────────────────────────────────────────────────────────────

export class InterviewWorkspaceStateManager {
  private static instance: InterviewWorkspaceStateManager | null = null;
  private readonly statePath: string;

  /** Override for unit tests. `getInstance()` picks this up if set. */
  private static _testStatePath: string | null = null;

  /**
   * Set a custom state path for testing. Call before the first `getInstance()`.
   * Resets the singleton so the next `getInstance()` uses the new path.
   */
  public static __setTestStatePath(tmpPath: string): void {
    InterviewWorkspaceStateManager._testStatePath = tmpPath;
    InterviewWorkspaceStateManager.instance = null;
  }

  private constructor() {
    if (InterviewWorkspaceStateManager._testStatePath) {
      this.statePath = InterviewWorkspaceStateManager._testStatePath;
    } else {
      const userDataDir = electronApp?.getPath ? electronApp.getPath('userData') : path.join(process.cwd(), '.user-data');
      const dir = path.join(userDataDir, 'interview-context');
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

  // ─── Core Domain Methods ──────────────────────────────────────────────────

  /**
   * Returns all workspaces, newest first.
   */
  public listWorkspaces(): InterviewWorkspace[] {
    const store = this.readStore();
    return [...store.workspaces].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Returns all workspaces, satisfying asynchronous SDD interface.
   */
  public async readWorkspaces(): Promise<InterviewWorkspace[]> {
    return this.listWorkspaces();
  }

  /**
   * Computes cross-interview document usage across all workspaces.
   * Maps document ID to all workspaces referencing it in their documentIds.
   */
  public async getDocumentUsage(): Promise<Record<string, Array<{ workspaceId: string; workspaceTitle: string }>>> {
    const workspaces = [...this.readStore().workspaces].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title)
    );
    const usage: Record<string, Array<{ workspaceId: string; workspaceTitle: string }>> = {};
    for (const ws of workspaces) {
      if (Array.isArray(ws.documentIds)) {
        for (const docId of ws.documentIds) {
          if (!usage[docId]) {
            usage[docId] = [];
          }
          usage[docId].push({
            workspaceId: ws.id,
            workspaceTitle: ws.title,
          });
        }
      }
    }
    return usage;
  }

  /**
   * Creates a new persistent InterviewWorkspace with Round 1 in 'draft' state.
   */
  public createWorkspace(opts?: { title?: string; initialDocIds?: string[]; id?: string }): InterviewWorkspace {
    const now = getMonotonicIsoTimestamp();
    const id = opts?.id?.trim() || crypto.randomUUID();
    const roundId = crypto.randomUUID();
    const title = (opts?.title && opts.title.trim()) ? opts.title.trim() : 'New Interview';
    const documentIds = normalizeDocumentIds(opts?.initialDocIds);

    const initialRound: InterviewRound = {
      id: roundId,
      name: 'Round 1',
      roundNumber: 1,
      status: 'draft',
      prepMessages: [],
      createdAt: now,
    };

    const ws: InterviewWorkspace = {
      id,
      title,
      documentIds,
      rounds: [initialRound],
      activeRoundId: roundId,
      hasCustomOverrides: false,
      candidateBackgroundOverride: '',
      aiPersonaOverride: '',
      createdAt: now,
      updatedAt: now,
    };

    const store = this.readStore();
    return this.tryReplaceInStore(store, ws);
  }

  /**
   * Retrieves a workspace by ID.
   */
  public getWorkspace(id: string): InterviewWorkspace | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;
    return this.readStore().workspaces.find(workspace => workspace.id === workspaceId) || null;
  }

  /**
   * Retrieves a workspace by ID (alias for getWorkspace).
   */
  public getWorkspaceById(id: string): InterviewWorkspace | null {
    return this.getWorkspace(id);
  }

  /**
   * Renames a workspace.
   */
  public renameWorkspace(id: string, title: string): InterviewWorkspace | null {
    const workspaceId = normalizeString(id).trim();
    if (!workspaceId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === workspaceId);
    if (!existing) return null;

    const updated: InterviewWorkspace = {
      ...existing,
      title: (title && title.trim()) ? title.trim() : existing.title,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Deletes a workspace by ID.
   */
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

  /**
   * Appends a new round inheriting company documents and sets it as active.
   */
  public addRound(workspaceId: string, name?: string): InterviewWorkspace | null {
    const id = normalizeString(workspaceId).trim();
    if (!id) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === id);
    if (!existing) return null;

    const roundNumber = existing.rounds.length + 1;
    const roundName = (name && name.trim()) ? name.trim() : `Round ${roundNumber}`;
    const now = new Date().toISOString();
    const newRound: InterviewRound = {
      id: crypto.randomUUID(),
      name: roundName,
      roundNumber,
      status: 'draft',
      prepMessages: [],
      createdAt: now,
    };

    const updated: InterviewWorkspace = {
      ...existing,
      rounds: [...existing.rounds, newRound],
      activeRoundId: newRound.id,
      updatedAt: now,
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Renames a specific round in a workspace.
   */
  public renameRound(workspaceId: string, roundId: string, name: string): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    const rId = normalizeString(roundId).trim();
    if (!wsId || !rId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    const roundIdx = existing.rounds.findIndex(r => r.id === rId);
    if (roundIdx === -1) return null;

    const updatedRounds = [...existing.rounds];
    updatedRounds[roundIdx] = {
      ...updatedRounds[roundIdx],
      name: (name && name.trim()) ? name.trim() : updatedRounds[roundIdx].name,
    };

    const updated: InterviewWorkspace = {
      ...existing,
      rounds: updatedRounds,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Switches the active round in a workspace.
   */
  public setActiveRound(workspaceId: string, roundId: string): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    const rId = normalizeString(roundId).trim();
    if (!wsId || !rId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    if (!existing.rounds.some(r => r.id === rId)) return null;

    const updated: InterviewWorkspace = {
      ...existing,
      activeRoundId: rId,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Updates prep conversation messages for a specific round.
   */
  public updateRoundPrep(workspaceId: string, roundId: string, messages: any[]): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    const rId = normalizeString(roundId).trim();
    if (!wsId || !rId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    const roundIdx = existing.rounds.findIndex(r => r.id === rId);
    if (roundIdx === -1) return null;

    const updatedRounds = [...existing.rounds];
    updatedRounds[roundIdx] = {
      ...updatedRounds[roundIdx],
      prepMessages: Array.isArray(messages) ? messages : [],
    };

    const updated: InterviewWorkspace = {
      ...existing,
      rounds: updatedRounds,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Updates document IDs attached to a workspace (shared across all rounds).
   */
  public updateDocuments(workspaceId: string, documentIds: string[]): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    if (!wsId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    const updated: InterviewWorkspace = {
      ...existing,
      documentIds: normalizeDocumentIds(documentIds),
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Marks a round as 'active' (in-progress meeting).
   */
  public startRoundMeeting(workspaceId: string, roundId: string): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    const rId = normalizeString(roundId).trim();
    if (!wsId || !rId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    const roundIdx = existing.rounds.findIndex(r => r.id === rId);
    if (roundIdx === -1) return null;

    const updatedRounds = [...existing.rounds];
    updatedRounds[roundIdx] = {
      ...updatedRounds[roundIdx],
      status: 'active',
    };

    const updated: InterviewWorkspace = {
      ...existing,
      rounds: updatedRounds,
      activeRoundId: rId,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Marks a round as 'completed' and binds the finished meetingId.
   */
  public finishRoundMeeting(workspaceId: string, roundId: string, meetingId: string): InterviewWorkspace | null {
    const wsId = normalizeString(workspaceId).trim();
    const rId = normalizeString(roundId).trim();
    const mId = normalizeString(meetingId).trim();
    if (!wsId || !rId || !mId) return null;

    const store = this.readStore();
    const existing = store.workspaces.find(ws => ws.id === wsId);
    if (!existing) return null;

    const roundIdx = existing.rounds.findIndex(r => r.id === rId);
    if (roundIdx === -1) return null;

    const now = new Date().toISOString();
    const updatedRounds = [...existing.rounds];
    updatedRounds[roundIdx] = {
      ...updatedRounds[roundIdx],
      status: 'completed',
      meetingId: mId,
      completedAt: now,
    };

    const updated: InterviewWorkspace = {
      ...existing,
      rounds: updatedRounds,
      updatedAt: now,
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Updates persona and candidate background overrides for a workspace.
   */
  public async updatePersonaOverrides(
    workspaceId: string,
    overrides: {
      hasCustomOverrides?: boolean;
      candidateBackgroundOverride?: string;
      aiPersonaOverride?: string;
    }
  ): Promise<InterviewWorkspace> {
    const wsId = normalizeString(workspaceId).trim();
    if (!wsId) {
      throw new Error('Missing workspaceId');
    }
    const store = this.readStore();
    const existing = store.workspaces.find((w) => w.id === wsId);
    if (!existing) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    if (overrides.hasCustomOverrides !== undefined) {
      existing.hasCustomOverrides = Boolean(overrides.hasCustomOverrides);
    }
    if (overrides.candidateBackgroundOverride !== undefined) {
      existing.candidateBackgroundOverride = String(overrides.candidateBackgroundOverride ?? '');
    }
    if (overrides.aiPersonaOverride !== undefined) {
      existing.aiPersonaOverride = String(overrides.aiPersonaOverride ?? '');
    }
    existing.updatedAt = new Date().toISOString();
    return this.tryReplaceInStore(store, existing);
  }

  /**
   * Updates preferred AI model override for a workspace.
   */
  public async updateModelOverride(
    workspaceId: string,
    modelOverride?: string
  ): Promise<InterviewWorkspace> {
    const wsId = normalizeString(workspaceId).trim();
    if (!wsId) {
      throw new Error('Missing workspaceId');
    }
    const store = this.readStore();
    const existing = store.workspaces.find((w) => w.id === wsId);
    if (!existing) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    existing.modelOverride = typeof modelOverride === 'string' && modelOverride.trim()
      ? modelOverride.trim()
      : undefined;
    existing.updatedAt = new Date().toISOString();
    return this.tryReplaceInStore(store, existing);
  }

  // ─── Backward Compatibility Adapters ──────────────────────────────────────

  /**
   * Finds a workspace associated with a meeting ID by searching all rounds.
   */
  public getWorkspaceForMeeting(meetingId: string): InterviewWorkspace | null {
    const id = normalizeString(meetingId).trim();
    if (!id) return null;

    const matches = this.readStore().workspaces.filter(ws =>
      ws.rounds.some(r => r.meetingId === id),
    );
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null;
  }

  /**
   * Compatibility adapter for legacy resolveDraft callers.
   */
  public resolveDraft(options: { preferredId?: string; forceNew?: boolean } = {}): { workspace: InterviewWorkspace; created: boolean } {
    const { preferredId, forceNew } = options;

    if (forceNew) {
      return { workspace: this.createWorkspace({ id: preferredId }), created: true };
    }

    if (preferredId) {
      const trimmedId = preferredId.trim();
      if (trimmedId) {
        const existing = this.getWorkspace(trimmedId);
        if (existing) {
          return { workspace: existing, created: false };
        }
        return { workspace: this.createWorkspace({ id: trimmedId }), created: true };
      }
    }

    const workspaces = this.listWorkspaces();
    if (workspaces.length > 0) {
      return { workspace: workspaces[0], created: false };
    }

    return { workspace: this.createWorkspace(), created: true };
  }

  /**
   * Compatibility adapter for legacy updatePrepContext callers.
   */
  public updatePrepContext(
    id: string,
    _contextMarkdown?: string,
    selectedDocumentIds?: string[],
    messages?: any[],
  ): InterviewWorkspace | null {
    const wsId = normalizeString(id).trim();
    if (!wsId) return null;

    const ws = this.getWorkspace(wsId);
    if (!ws) return null;

    let current: InterviewWorkspace | null = ws;
    if (selectedDocumentIds !== undefined) {
      current = this.updateDocuments(wsId, selectedDocumentIds);
      if (!current) return null;
    }
    if (messages !== undefined) {
      current = this.updateRoundPrep(wsId, current.activeRoundId, messages);
    }
    return current;
  }

  /**
   * Compatibility adapter for legacy beginRun callers.
   */
  public beginRun(id: string): InterviewWorkspace | null {
    const ws = this.getWorkspace(id);
    if (!ws) return null;
    return this.startRoundMeeting(ws.id, ws.activeRoundId);
  }

  /**
   * Compatibility adapter for legacy finishRun callers.
   */
  public finishRun(id: string, meetingId: string): InterviewWorkspace {
    let ws = this.getWorkspace(id);
    if (!ws) {
      ws = this.createWorkspace({ id });
    }
    const updated = this.finishRoundMeeting(ws.id, ws.activeRoundId, meetingId);
    return updated || ws;
  }

  /**
   * Compatibility adapter for legacy cancelRun callers.
   */
  public cancelRun(id: string): InterviewWorkspace | null {
    const ws = this.getWorkspace(id);
    if (!ws) return null;

    const activeRound = ws.rounds.find(r => r.id === ws.activeRoundId);
    if (!activeRound || activeRound.status !== 'active') {
      return ws;
    }

    const store = this.readStore();
    const roundIdx = ws.rounds.findIndex(r => r.id === activeRound.id);
    const updatedRounds = [...ws.rounds];
    updatedRounds[roundIdx] = {
      ...updatedRounds[roundIdx],
      status: 'draft',
    };

    const updated: InterviewWorkspace = {
      ...ws,
      rounds: updatedRounds,
      updatedAt: new Date().toISOString(),
    };

    return this.tryReplaceInStore(store, updated);
  }

  /**
   * Compatibility adapter for legacy saveWorkspace callers.
   */
  public saveWorkspace(input: any): InterviewWorkspace {
    const store = this.readStore();
    const existing = store.workspaces.find(w => w.id === input.id);
    const normalized = normalizeWorkspace(input, existing);
    return this.tryReplaceInStore(store, normalized);
  }

  /**
   * Compatibility adapter for legacy attachMeeting callers.
   */
  public attachMeeting(workspaceId: string, meetingId: string): InterviewWorkspace | null {
    try {
      return this.finishRun(workspaceId, meetingId);
    } catch {
      return null;
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private tryReplaceInStore(store: WorkspaceStore, workspace: InterviewWorkspace): InterviewWorkspace {
    const nextWorkspaces = store.workspaces.filter(ws => ws.id !== workspace.id);
    nextWorkspaces.unshift(workspace);
    this.writeStore({ version: 3, workspaces: nextWorkspaces.slice(0, MAX_WORKSPACES) });
    return workspace;
  }

  private readStore(): WorkspaceStore {
    try {
      if (!fs.existsSync(this.statePath)) return { version: 3, workspaces: [] };

      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      const rawWorkspaces = Array.isArray(parsed?.workspaces)
        ? parsed.workspaces
        : Array.isArray(parsed)
          ? parsed
          : [];

      const workspaces = rawWorkspaces
        .map((workspace: any) => {
          try {
            return normalizeWorkspace(workspace);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as InterviewWorkspace[];

      return { version: 3, workspaces };
    } catch (error) {
      console.error('[InterviewWorkspaceStateManager] failed to read workspace state:', error);
      return { version: 3, workspaces: [] };
    }
  }

  private writeStore(store: WorkspaceStore): void {
    const tmpPath = `${this.statePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
    fs.renameSync(tmpPath, this.statePath);
  }
}
