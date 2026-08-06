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
 *      googleSheetsSyncEnabled / icloudBackupEnabled must be on.
 *   3. Network gate — offline (or non-wifi while backupWifiOnly) → no-op.
 *   4. Provider preflights — Google: no session → stamp 'NEEDS_REAUTH' on
 *      each enabled Google feature (the settings UI maps that code to a
 *      reconnect prompt); those jobs are excluded from the drain so they
 *      don't burn retries. iCloud: container unreachable → stamp
 *      'ICLOUD_UNAVAILABLE'. A provider going down never blocks the other
 *      provider's jobs — the drain runs with only the servable kinds.
 *   5. Failure telemetry — jobs this drain parked in the failed list
 *      (permanent failures) are reported per kind via backupTelemetry;
 *      silent backup death in the wild is otherwise invisible (plan §5.4).
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
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { CLOUD_BACKUP_ENABLED } from '../constants/flags';
import { usePremiumStore } from '../store/premiumStore';
import { useSettingsStore } from '../store/settingsStore';
import { useReceiptStore } from '../store/receiptStore';
import { processBackupJobs } from './cloudBackupQueue';
import { BackupJobKind } from './cloudBackupLogic';
import { enqueueReceiptDriveBackup, processDriveFileJob } from './driveBackup';
import { processSheetSyncJob } from './sheetsSync';
import {
  enqueueReceiptIcloudBackup,
  isIcloudAvailable,
  processIcloudFileJob,
  writeIcloudManifest,
} from './icloudBackup';
import { hasGoogleDriveAccess } from './googleAuth';
import { reportCloudBackupFailure } from './backupTelemetry';

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
  // Gate 2 — at least one backup feature opted in. iCloud is iOS-only; an
  // Android session can never serve icloud-file jobs.
  const driveOn = settings.driveBackupEnabled;
  const sheetsOn = settings.googleSheetsSyncEnabled;
  const icloudOn = settings.icloudBackupEnabled && Platform.OS === 'ios';
  if (!driveOn && !sheetsOn && !icloudOn) return Promise.resolve(NOOP);

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

    // Gate 4 — provider preflights. Errors here are USER state, not transient
    // failure, so they return clean (no throw → no backoff penalty). Each
    // provider is checked independently: a dead Google session stamps
    // NEEDS_REAUTH on the Google features and excludes their jobs, but the
    // iCloud drain still runs (and vice versa).
    const allowedKinds: BackupJobKind[] = [];
    let googleServable = driveOn || sheetsOn;
    if (googleServable && !(await hasGoogleDriveAccess())) {
      // No native Google session means every Drive / Sheets call would 401
      // anyway — surface the reconnect state instead of burning per-job
      // attempts.
      if (driveOn) settings.setLastDriveBackupError('NEEDS_REAUTH');
      if (sheetsOn) settings.setLastSheetsSyncError('NEEDS_REAUTH');
      googleServable = false;
    }
    if (googleServable) allowedKinds.push('drive-file', 'sheet-rows');
    let icloudServable = false;
    if (icloudOn) {
      icloudServable = await isIcloudAvailable();
      if (!icloudServable) settings.setLastIcloudBackupError('ICLOUD_UNAVAILABLE');
      else allowedKinds.push('icloud-file');
    }
    if (allowedKinds.length === 0) return NOOP;

    // Per-job errors are isolated and recorded inside processBackupJobs —
    // do NOT wrap these in try/catch (that would hide failures from the
    // queue's retry bookkeeping).
    let icloudDone = 0;
    const { done, failed, newlyFailed } = await processBackupJobs((job) => {
      if (job.kind === 'icloud-file') {
        return processIcloudFileJob(job).then(() => {
          icloudDone++;
        });
      }
      return job.kind === 'drive-file' ? processDriveFileJob(job) : processSheetSyncJob();
    }, allowedKinds);

    // Permanent failures (parked in the failed list by THIS drain) → one
    // telemetry row per kind. Aggregated: a broken provider parks every
    // pending receipt in one run — a row per job would flood the table.
    if (newlyFailed.length > 0) {
      const byKind = new Map<BackupJobKind, { n: number; lastError?: string }>();
      for (const job of newlyFailed) {
        const agg = byKind.get(job.kind) ?? { n: 0 };
        agg.n++;
        agg.lastError = job.lastError;
        byKind.set(job.kind, agg);
      }
      for (const [kind, agg] of byKind) reportCloudBackupFailure(kind, agg.n, agg.lastError);
    }

    if (done > 0) {
      const now = Date.now();
      if (googleServable && driveOn) {
        settings.setLastDriveBackupAt(now);
        settings.setLastDriveBackupError(null);
      }
      if (googleServable && sheetsOn) {
        settings.setLastSheetsSyncAt(now);
        settings.setLastSheetsSyncError(null);
      }
      if (icloudDone > 0) {
        settings.setLastIcloudBackupAt(now);
        settings.setLastIcloudBackupError(null);
        // Manifest goes up LAST, once the run's uploads are confirmed —
        // best-effort: a manifest failure must not fail the drain.
        writeIcloudManifest().catch(() => {});
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

/**
 * iCloud twin of enqueueAllReceiptsForDriveBackup — queue dedupes on
 * `icloud:<id>`. Used when the user toggles iCloud backup ON and the
 * existing backlog needs to be caught up.
 */
export async function enqueueAllReceiptsForIcloudBackup(): Promise<number> {
  const receipts = useReceiptStore.getState().receipts;
  let enqueued = 0;
  for (const r of receipts) {
    if (!r.imageUri && !r.pdfUri) continue;
    await enqueueReceiptIcloudBackup(r.id);
    enqueued++;
  }
  return enqueued;
}
