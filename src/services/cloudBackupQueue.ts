import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from '../utils/id';
import {
  BackupJob, BackupJobKind,
  shouldAttemptJob, recordAttempt, upsertJob, partitionDrained,
} from './cloudBackupLogic';

/**
 * Durable queue for cloud-backup uploads (Google Drive file, Google Sheets
 * rows, iCloud file) that couldn't run immediately (offline, signed out,
 * provider rate-limited, etc.).
 *
 * Callers enqueue work items; a drain kicks in when a backup run is possible.
 * The upload logic itself lives in the caller's processor — this module owns
 * the durable bookkeeping: load-once cache with save-through persistence,
 * per-job retry caps with cooldown, and a failed list entries are moved to
 * (not deleted from) so a failed backup can be retried instead of lost
 * silently. The queue rules are pure functions in cloudBackupLogic.ts.
 */

const QUEUE_KEY = 'cloud-backup-queue-v1';
// Jobs that exhausted their retries are moved here (not deleted) so the
// backup can be retried later instead of dropped silently.
const FAILED_KEY = 'cloud-backup-failed-v1';

let cache: BackupJob[] | null = null;

async function load(): Promise<BackupJob[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    cache = raw ? (JSON.parse(raw) as BackupJob[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(list: BackupJob[]): Promise<void> {
  cache = list;
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}

async function loadFailed(): Promise<BackupJob[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILED_KEY);
    return raw ? (JSON.parse(raw) as BackupJob[]) : [];
  } catch {
    return [];
  }
}

async function saveFailed(list: BackupJob[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(list));
  } catch {
    // best-effort
  }
}

/**
 * Enqueue a backup work item for a later run. Dedupes on kind + dedupeKey:
 * re-enqueueing work that is already pending is a no-op.
 */
export async function enqueueBackupJob(
  kind: BackupJobKind,
  dedupeKey: string,
  payload: Record<string, any> = {},
): Promise<void> {
  const list = await load();
  const job: BackupJob = {
    id: newId(),
    kind,
    dedupeKey,
    payload,
    addedAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
  };
  await save(upsertJob(list, job));
}

export async function getPendingBackupJobs(): Promise<BackupJob[]> {
  return [...(await load())];
}

/** Jobs that exhausted their retries, kept so they can be retried. */
export async function getFailedBackupJobs(): Promise<BackupJob[]> {
  return await loadFailed();
}

export async function pendingBackupJobCount(): Promise<number> {
  return (await load()).length;
}

/**
 * Drain the queue: calls `processor` for each pending job whose retry cap and
 * cooldown allow an attempt.
 *  - Success: the job is removed (and any stale failed-list entry for the
 *    same work is cleared — the work just completed).
 *  - Failure: the attempt is recorded; once the job exhausts its attempts it
 *    moves to the failed list.
 *  - Jobs still cooling down are left alone and counted as `skipped`.
 *  - `onlyKinds` (optional) restricts the drain to those kinds — jobs of
 *    other kinds are left UNTOUCHED (not counted, no attempt recorded) so a
 *    drain that can't serve a provider (e.g. dead Google token) doesn't
 *    burn those jobs' retries.
 * Each job is processed in its own try/catch so one bad job can't poison the
 * drain.
 */
export async function processBackupJobs(
  processor: (job: BackupJob) => Promise<void>,
  onlyKinds?: BackupJobKind[],
): Promise<{ done: number; failed: number; skipped: number }> {
  const now = Date.now();
  const list = await load();
  const doneIds: string[] = [];
  const succeeded: BackupJob[] = [];
  let working = list;
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const job of list) {
    if (onlyKinds && !onlyKinds.includes(job.kind)) continue;
    if (!shouldAttemptJob(job, now)) {
      skipped++;
      continue;
    }
    try {
      await processor(job);
      doneIds.push(job.id);
      succeeded.push(job);
      done++;
    } catch (e: any) {
      const attempted = recordAttempt(job, now, e?.message ?? 'unknown');
      working = working.map((j) => (j.id === job.id ? attempted : j));
      failed++;
    }
  }
  const { remaining, failed: failedList } = partitionDrained(working, doneIds, await loadFailed());
  await save(remaining);
  // A succeeded job clears any older failed entry for the same work.
  await saveFailed(
    failedList.filter((f) => !succeeded.some((s) => s.kind === f.kind && s.dedupeKey === f.dedupeKey)),
  );
  return { done, failed, skipped };
}

/** Move every failed job back into the pending queue for another try (resets
 *  attempt bookkeeping). Re-inserts via upsertJob so a job that is somehow
 *  already pending isn't duplicated. */
export async function retryFailedBackupJobs(): Promise<void> {
  const failedList = await loadFailed();
  if (failedList.length === 0) return;
  await saveFailed([]);
  let list = await load();
  for (const job of failedList) {
    list = upsertJob(list, { ...job, attempts: 0, lastAttemptAt: null, lastError: undefined });
  }
  await save(list);
}

/** Wipe pending + failed. Used on disconnect — nothing should re-upload
 *  against an account that is no longer linked. */
export async function clearBackupQueue(): Promise<void> {
  await save([]);
  await saveFailed([]);
}
