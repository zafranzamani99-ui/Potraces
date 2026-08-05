import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabasePersonal } from './supabase';

// Backup telemetry — one fire-and-forget row per DEFINITIVE personal
// backup/sync failure (table: supabase/migrations/20260804120000_backup_telemetry.sql).
// Silent backup failure is the worst outcome in this feature class; this is the
// minimum signal that it happened. Rows carry the failure kind + app version +
// platform only — never financial data or row contents.

export type BackupTelemetryKind =
  | 'schema-disabled'   // remote schema incomplete — sync auto-disabled
  | 'account-mismatch'; // sync blocked: different account + local data present

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
