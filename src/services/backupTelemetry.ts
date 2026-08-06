import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabasePersonal } from './supabase';
import { BackupJobKind } from './cloudBackupLogic';

// Backup telemetry — one fire-and-forget row per DEFINITIVE backup failure
// (table: supabase/migrations/20260804120000_backup_telemetry.sql).
// Silent backup failure is the worst outcome in this feature class; this is the
// minimum signal that it happened. Rows carry the failure kind + app version +
// platform only — never financial data or row contents.
//
// Two sources report here:
//   - personal cloud backup/sync (schema-disabled, account-mismatch)
//   - Google/iCloud receipt backup — a queue job that exhausted its retries
//     and landed in the failed list (cloud-backup plan §5.4)

export type BackupTelemetryKind =
  | 'schema-disabled'      // remote schema incomplete — sync auto-disabled
  | 'account-mismatch'     // sync blocked: different account + local data present
  | 'drive-backup-failed'  // Drive receipt job exhausted retries (permanent)
  | 'sheets-sync-failed'   // Sheets rows job exhausted retries (permanent)
  | 'icloud-backup-failed'; // iCloud receipt job exhausted retries (permanent)

// Once per kind per app launch — a stuck state must not spam a row per retry.
const reportedThisLaunch = new Set<BackupTelemetryKind>();

/**
 * Report a definitive backup failure. Never throws, never blocks the caller,
 * silently no-ops without a session (a signed-out user has no cloud backup to
 * fail) — telemetry must never break the feature it watches.
 */
export function reportBackupIssue(kind: BackupTelemetryKind, message: string): void {
  if (reportedThisLaunch.has(kind)) return;
  reportedThisLaunch.add(kind);
  void (async () => {
    try {
      const { data: { session } } = await supabasePersonal.auth.getSession();
      if (!session) return;
      await supabasePersonal.from('backup_telemetry').insert({
        kind,
        message: message.slice(0, 500),
        app_version: Application.nativeApplicationVersion ?? 'unknown',
        platform: `${Platform.OS} ${Platform.Version}`.slice(0, 100),
      });
    } catch {
      /* telemetry must never break the feature */
    }
  })();
}

const CLOUD_FAILURE_KIND: Record<BackupJobKind, BackupTelemetryKind> = {
  'drive-file': 'drive-backup-failed',
  'sheet-rows': 'sheets-sync-failed',
  'icloud-file': 'icloud-backup-failed',
};

/**
 * Report cloud-backup queue jobs that became permanent failures in a drain.
 * Aggregated per kind (one row per kind per launch, not per job — a broken
 * provider parks every pending receipt in one run and must not spam rows).
 * The message carries only a count + the last error string; without a
 * personal session this is a silent no-op (Drive backup works signed-out,
 * so those failures stay invisible — accepted, see plan §5.4).
 */
export function reportCloudBackupFailure(kind: BackupJobKind, failedCount: number, lastError?: string): void {
  reportBackupIssue(
    CLOUD_FAILURE_KIND[kind],
    `${failedCount} job(s) exhausted retries and parked in the failed list${lastError ? `; last error: ${lastError}` : ''}`,
  );
}
