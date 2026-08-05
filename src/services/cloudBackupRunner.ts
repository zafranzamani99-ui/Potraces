/**
 * Cloud-backup orchestrator — the single drain entry point for the durable
 * backup queue (cloudBackupQueue). Every trigger (mount, foreground,
 * offline→online, debounced store mutations, settings "Back up now") funnels
 * through runCloudBackupDrain(); CloudBackupManager owns the triggers, this
 * module owns the gates + queue bookkeeping:
 *
 *   1. Build flag + premium gate — CLOUD_BACKUP_ENABLED (beta lock) AND the
 *      paid-tier hasCloudBackup() capability must both hold.
 *   2. Feature gate — at least one of driveBackupEnabled /
 *      googleSheetsSyncEnabled must be on.
 *   3. Network gate — offline (or non-wifi while backupWifiOnly) → no-op.
 *   4. Token preflight — no Google session → stamp 'NEEDS_REAUTH' on each
 *      enabled feature's error field (the settings UI maps that code to a
 *      reconnect prompt) and no-op. Nothing is attempted against a dead token.
 *
 * Queue semantics stay in cloudBackupQueue: per-job try/catch isolation,
 * retry caps + cooldown, failed-list parking. The processor here MUST NOT
 * catch — a thrown job error is how the queue records the attempt.
 *
 * Concurrency: the inflight lock is claimed synchronously (same tick as the
 * guard check, no await between — the personalSync.ts pattern), so two
 * near-simultaneous triggers can never run overlapping drains; the late
 * caller just awaits the same run.
 */
import NetInfo from '@react-native-community/netinfo';
import { CLOUD_BACKUP_ENABLED } from '../constants/flags';
import { usePremiumStore } from '../store/premiumStore';
import { useSettingsStore } from '../store/settingsStore';
import { useReceiptStore } from '../store/receiptStore';
import { processBackupJobs } from './cloudBackupQueue';
import { enqueueReceiptDriveBackup, processDriveFileJob } from './driveBackup';
import { processSheetSyncJob } from './sheetsSync';
import { hasGoogleDriveAccess } from './googleAuth';

export type CloudBackupDrainResult = { done: number; failed: number };

const NOOP: CloudBackupDrainResult = { done: 0, failed: 0 };

let inflight: Promise<CloudBackupDrainResult> | null = null;

/**
 * Drain every pending backup job the gates allow. Safe to call from anywhere,
 * any time — all gating is re-checked per call and concurrent callers share
 * the in-flight run.
 */
export function runCloudBackupDrain(): Promise<CloudBackupDrainResult> {
  // Gate 1 — beta lock + paid capability (cheap synchronous checks, safe to
  // short-circuit before claiming the inflight lock).
  if (!CLOUD_BACKUP_ENABLED) return Promise.resolve(NOOP);
  if (!usePremiumStore.getState().hasCloudBackup()) return Promise.resolve(NOOP);

  const settings = useSettingsStore.getState();
  // Gate 2 — at least one backup feature opted in.
  const driveOn = settings.driveBackupEnabled;
  const sheetsOn = settings.googleSheetsSyncEnabled;
  if (!driveOn && !sheetsOn) return Promise.resolve(NOOP);

  // Claim the inflight lock synchronously — `inflight = settled` executes in
  // the same tick as this check with no await between them, so the guard is a
  // true single-threaded lock (see personalSync.syncPersonal).
  if (inflight) return inflight;

  const settled = (async (): Promise<CloudBackupDrainResult> => {
    // Gate 3 — network. Offline (or explicitly unreachable) → leave the queue
    // untouched; backupWifiOnly restricts drains to unmetered connections.
    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) return NOOP;
    if (settings.backupWifiOnly && net.type !== 'wifi') return NOOP;

    // Gate 4 — token preflight. No native Google session means every Drive /
    // Sheets call would 401 anyway — surface the reconnect state instead of
    // burning per-job attempts. Errors here are USER state, not transient
    // failure, so this returns clean (no throw → no backoff penalty).
    if (!(await hasGoogleDriveAccess())) {
      if (driveOn) settings.setLastDriveBackupError('NEEDS_REAUTH');
      if (sheetsOn) settings.setLastSheetsSyncError('NEEDS_REAUTH');
      return NOOP;
    }

    // Per-job errors are isolated and recorded inside processBackupJobs —
    // do NOT wrap these in try/catch (that would hide failures from the
    // queue's retry bookkeeping).
    const { done, failed } = await processBackupJobs((job) =>
      job.kind === 'drive-file'
        ? processDriveFileJob(job)
        : job.kind === 'sheet-rows'
          ? processSheetSyncJob()
          : // 'icloud-file' — no provider wired yet; resolve so the job drains.
            Promise.resolve(),
    );

    if (done > 0) {
      const now = Date.now();
      if (driveOn) {
        settings.setLastDriveBackupAt(now);
        settings.setLastDriveBackupError(null);
      }
      if (sheetsOn) {
        settings.setLastSheetsSyncAt(now);
        settings.setLastSheetsSyncError(null);
      }
    }
    // failed > 0: no timestamp, no error write — the queue already recorded
    // the per-job attempts, and the next preflight owns the user-facing error.
    return { done, failed };
  })().finally(() => {
    inflight = null;
  });
  inflight = settled;
  return settled;
}

/**
 * Enqueue a Drive backup for every receipt that has an artifact (image or
 * PDF). The queue dedupes on `drive:<id>`, so receipts already pending or
 * already backed up (processor-side skip) cost nothing. Used when the user
 * toggles Drive backup ON and the existing backlog needs to be caught up.
 * Returns how many receipts were enqueued.
 */
export async function enqueueAllReceiptsForDriveBackup(): Promise<number> {
  const receipts = useReceiptStore.getState().receipts;
  let enqueued = 0;
  for (const r of receipts) {
    if (!r.imageUri && !r.pdfUri) continue;
    await enqueueReceiptDriveBackup(r.id);
    enqueued++;
  }
  return enqueued;
}
