/**
 * Pure logic for the cloud-backup durable queue (Google Drive / Google
 * Sheets / iCloud uploads that couldn't run immediately).
 *
 * This module is intentionally free of react-native / expo imports so it can
 * be unit-tested in plain Node. The AsyncStorage wrapper around it lives in
 * cloudBackupQueue.ts — this file owns only the bookkeeping rules:
 *   • when a job may be attempted (retry cap + cooldown between attempts)
 *   • how an attempt is recorded
 *   • how enqueue dedupes (one pending job per kind + dedupeKey)
 *   • how a drain partitions into still-pending vs permanently-failed
 */

export type BackupJobKind = 'drive-file' | 'sheet-rows' | 'icloud-file';

export interface BackupJob {
  id: string;
  kind: BackupJobKind;
  /** Caller-chosen key identifying the logical work item (e.g. the backup
   *  file name). Combined with `kind` it dedupes re-enqueues of the same
   *  work while a previous entry is still pending. */
  dedupeKey: string;
  payload: Record<string, any>;
  addedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  lastError?: string;
}

/** A job is given up on (moved to the failed list) after this many attempts. */
export const BACKUP_QUEUE_MAX_ATTEMPTS = 5;
/** Don't hammer a failing destination every drain — cool off between attempts. */
export const BACKUP_QUEUE_COOLDOWN_MS = 60_000;

/** Two jobs are the same logical work item when kind + dedupeKey match. */
function sameWork(a: BackupJob, b: BackupJob): boolean {
  return a.kind === b.kind && a.dedupeKey === b.dedupeKey;
}

/** May this job be attempted now? True until it exhausts its attempts, with a
 *  cooldown window after each failed attempt. */
export function shouldAttemptJob(job: BackupJob, now: number): boolean {
  if (job.attempts >= BACKUP_QUEUE_MAX_ATTEMPTS) return false;
  if (job.lastAttemptAt === null) return true;
  return now - job.lastAttemptAt >= BACKUP_QUEUE_COOLDOWN_MS;
}

/** Record one attempt (success-tracking is the caller's job — this marks the
 *  failure bookkeeping). Passing no error clears any previous lastError. */
export function recordAttempt(job: BackupJob, now: number, error?: string): BackupJob {
  return {
    ...job,
    attempts: job.attempts + 1,
    lastAttemptAt: now,
    lastError: error,
  };
}

/** Has this job used up all of its attempts? */
export function isJobExhausted(job: BackupJob): boolean {
  return job.attempts >= BACKUP_QUEUE_MAX_ATTEMPTS;
}

/** Append a job unless the same logical work (kind + dedupeKey) is already in
 *  the list — re-enqueuing pending work is a no-op so a flapping caller can't
 *  fill the queue with duplicates. */
export function upsertJob(list: BackupJob[], job: BackupJob): BackupJob[] {
  if (list.some((j) => sameWork(j, job))) return list;
  return [...list, job];
}

/** Partition the queue after a drain:
 *  - `doneIds` are removed outright (their work completed).
 *  - Jobs that exhausted their attempts move to the failed list, replacing any
 *    older failed entry for the same work (the newest failure state wins).
 *  - Errored-but-retryable jobs stay pending for a later drain.
 */
export function partitionDrained(
  jobs: BackupJob[],
  doneIds: string[],
  failedJobs: BackupJob[],
): { remaining: BackupJob[]; failed: BackupJob[] } {
  const remaining: BackupJob[] = [];
  let failed = failedJobs;
  for (const job of jobs) {
    if (doneIds.includes(job.id)) continue;
    if (isJobExhausted(job)) {
      failed = [...failed.filter((f) => !sameWork(f, job)), job];
    } else {
      remaining.push(job);
    }
  }
  return { remaining, failed };
}
