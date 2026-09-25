import { DatabaseManager } from '../db/DatabaseManager';

export type MeetingRetention = 'forever' | '7d' | '30d' | 'never';

export interface RetentionSweepResult {
    expired: number;
    deleted: number;
    pending: string[];
}

const RETENTION_DURATION_MS: Partial<Record<MeetingRetention, number>> = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Delete expired meetings using the same complete-deletion path as the UI.
 * A failed external/vector cleanup stays journaled and is retried on the next sweep/startup.
 * 'never' applies only to future meetings; it does not silently delete older history.
 */
export function runMeetingRetentionSweep(
    retention: MeetingRetention,
    nowMs: number = Date.now(),
    db: DatabaseManager = DatabaseManager.getInstance(),
): RetentionSweepResult {
    if (!Number.isFinite(nowMs)) return { expired: 0, deleted: 0, pending: [] };
    // Continue interrupted deletions regardless of the current policy: changing
    // to 'forever' or 'never' cannot cancel a previously committed deletion.
    db.retryEphemeralVectorCleanup();
    db.retryPendingMeetingDeletionCleanups();

    const durationMs = RETENTION_DURATION_MS[retention];
    if (!durationMs) return { expired: 0, deleted: 0, pending: db.getPendingMeetingDeletionIds() };
    const ids = db.getExpiredMeetingIds(nowMs - durationMs);
    let deleted = 0;
    for (const id of ids) {
        if (db.deleteMeetingCompletely(id)) deleted++;
    }
    const pending = db.getPendingMeetingDeletionIds();
    return { expired: ids.length, deleted, pending };
}
