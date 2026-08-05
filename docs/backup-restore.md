# Backup & Restore — how Potraces protects your data

> The four layers, what each protects against, and the ops runbook.
> Implementation roadmap: `docs/plans/backup-restore-foundation-plan.md`.
> Related: `docs/INCREMENTAL_SYNC_PLAN.md`, `docs/multi-device.md`,
> `docs/plans/cloud-backup-sync-plan.md` (Drive/Sheets/iCloud receipts).

## The four layers

| # | Layer | Protects against | Where it lives | Code |
|---|---|---|---|---|
| 1 | Local rolling snapshots | Bad writes / corrupted stores | On-device, `<documents>/backups/*.json.gz` | `src/services/storageBackup.ts` (+ pure rules in `storageBackupCore.ts`) |
| 2 | Export / import file | App loss, device migration (free), GDPR Art. 20 portability | Wherever the user puts it (Drive, email, computer) | Same engine; UI in `src/screens/shared/BackupRestore.tsx` |
| 3 | Cloud backup (Supabase sync) | Lost/new phone, multi-device convergence | Supabase `personal_*` tables + `receipt-images` bucket | `src/services/personalSync.ts`, `receiptImageSync.ts` |
| 4 | OS device backup | Silent last resort | iCloud/iTunes (iOS), Google Auto Backup (Android) | OS-level; Android rules in `android/app/src/main/res/xml/backup_rules*.xml` |

They are complementary, not duplicates: layer 1 guards against a buggy layer 3
pushing bad data down; layer 3 covers the device loss layer 1 can't; layer 2 is
the user-held copy that outlives both.

## Layer 1 — local snapshots (always on, free)

- One gzipped JSON file per day: `backup-<YYYY-MM-DD>.json.gz` containing
  `{ backupVersion, kind, appVersion, userId, createdAt, recordCounts, stores }`.
- Captured once per app launch; the FIRST healthy capture of the day wins.
  Writes are atomic (tmp → gunzip self-check → move); a failed snapshot never
  deletes the previous one.
- **Retention (GFS-lite): 7 daily + 4 weekly + 3 monthly** recovery points
  (`planRotation` in `storageBackupCore.ts`, unit-tested in
  `scripts/test-storage-backup.ts`).
- **Files, not AsyncStorage.** Snapshots used to live in AsyncStorage `bak:`
  keys — they were the main driver of DB growth against Android's 6MB cap
  (with documented mid-transaction corruption risk). Migrated to files on first
  launch after the 2026-08 update; legacy keys are converted then removed.
- Restore is manual from Settings → Backup & Restore, shows a per-store preview
  (records in backup → on this phone), snapshots the current state first
  ("Undo last restore" card; newest 2 pre-restore copies kept), then reloads.

### Guards (all hard-blocked or warned in the preview pipeline)

- **Wrong account** (backup stamped with a different signed-in userId) → blocked.
- **Signed-out backup into signed-in account** → allowed WITH warning.
- **Newer-app backup** (`backupVersion`/appVersion ahead of this build) → blocked
  with "update the app first".
- **Partial day** (stores with live data but no snapshot in the file) → listed as
  "keeps current data"; core-money partials need "Restore anyway".

## Layer 2 — export / import

- **Export**: Backup & Restore → Export backup → one `potraces-backup-<date>.json.gz`
  via the share sheet. Same format as layer 1; doubles as the GDPR export.
- **Import**: document picker → identical validation/preview/apply pipeline as a
  day restore (`planRestorePayload` → `restorePayload` — one code path, no fork).

## Layer 3 — cloud backup (paid tiers, currently beta-locked)

- Full-state LWW sync with per-record merge, soft-delete tombstones everywhere
  (180-day local TTL, 90-day server purge), receipt images in the
  `receipt-images` bucket, schema preflight, account-mismatch guard.
- Runs on launch-after-hydration, foreground, and 1.5s-debounced mutations
  (`PersonalSyncManager`), with backoff; "Sync now" in the Account screen.
- **Beta lock**: `EXPO_PUBLIC_CLOUD_BACKUP=1` (`src/constants/flags.ts`) gates
  everything; tier gate is `hasCloudBackup()`. Unlock only after the checklist
  below passes.
- **Restore-on-new-device**: fresh install (no local data) + account with cloud
  rows → one prompt offers the restore (also gated on the flag).
- **Account mismatch** (device holds data from a different account): sync is
  blocked and the user gets an alert explaining the resolution (sign back into
  the original account, or erase local data and sync fresh) + a telemetry row.
- **Downgrade/cancel**: syncing stops, server data is KEPT for **90 days**
  (see `site/privacy.html` clause 4) — restore within that window works;
  "turn off & wipe" deletes rows AND bucket photos immediately.
- **Incremental sync** (efficiency): **all 5 stages built** (dirty push +
  cursor pull + reconcile net + coverage gaps) behind
  `EXPO_PUBLIC_SYNC_INCREMENTAL` — see `docs/INCREMENTAL_SYNC_PLAN.md`. Requires
  migration `20260805020000` (server-stamped `updated_at` on INSERT+UPDATE)
  applied before the flag flips.

## Layer 4 — OS backups

- Left ON deliberately: it's the device-loss net for the LIVE stores and receipt
  photos (the only image copy free users have).
- Android: `backups/` and `receipt-queue/` are EXCLUDED (redundant + 25MB quota).
- iOS: no per-app quota and no Expo API for `NSURLIsExcludedFromBackupKey`, so
  the (small, gzipped) backups dir stays included.

## Failure telemetry

One row per DEFINITIVE failure to `backup_telemetry`
(`supabase/migrations/20260804120000_backup_telemetry.sql`,
client `src/services/backupTelemetry.ts`): kind + app version + platform, never
financial data. Kinds: `schema-disabled`, `account-mismatch`. Once per kind per
app launch. Watch these after unlocking the flag.

## Ops runbook

**User says their data is wrong/gone (corruption):**
1. Settings → Backup & Restore → pick the day BEFORE the problem started.
2. Check the preview counts look right → Restore → Reload.
3. If the restore itself was wrong: "Undo last restore" puts the pre-restore state back.

**User got a new phone:**
- Paid: sign in → accept the restore prompt (or Account → Cloud Backup on).
- Free: on the OLD phone, Backup & Restore → Export backup → share to the new
  phone → Import backup there. OS device transfer (layer 4) also carries the app
  data if both phones use the same Apple ID / Google account.

**User says backup stopped (paid):**
- Account screen shows the sync error (schema/session/incomplete). Mismatch
  alert = sign back into the original account or wipe local data.
- Check `backup_telemetry` for their failure kind + app version.

## Launch checklist (before setting EXPO_PUBLIC_CLOUD_BACKUP=1)

- [x] All sync migrations applied to prod (incl. `20260801020000` indexes,
      `20260805020000` INSERT+UPDATE `updated_at` trigger — REQUIRED for cursor pull).
- [x] `backup_telemetry` migration applied to prod (`20260804120000`).
- [ ] Two-device checklist green (`docs/multi-device.md` B1–B3: delete propagates,
      photo reaches cloud, survives reinstall, cross-device edit keeps photo).
- [ ] Restore drill on physical iOS + Android: corrupt a store → day restore →
      data back; Undo works; export → delete app → import round-trip.
- [ ] Fresh-install restore prompt appears (flag on) and pulls data down.
- [ ] Downgrade path: stop sync, data kept, restore still possible.
- [ ] Account screen sync-status rows accurate (last sync, errors, pending).
- [ ] `npm test` green; `npm run lint:i18n` clean.
