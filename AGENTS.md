# Potraces — Agent Notes

## Active plans

- `docs/plans/backup-restore-foundation-plan.md` — **APPROVED** 2026-08-04.
  Backup & restore roadmap, 5 phases. **Phases 0+1+2+4 and most of 3 done 2026-08-04**
  (engine `storageBackup.ts`/`storageBackupCore.ts` + `npm run test:backup`; preview +
  undo + export/import in `BackupRestore.tsx`; mismatch alert + restore prompt in
  `PersonalSyncManager.tsx`; `backup_telemetry`; dirty push in `personalSyncDirty.ts`).
  Ops doc: `docs/backup-restore.md`. Remaining: incremental-sync Stages 3–5
  (`docs/INCREMENTAL_SYNC_PLAN.md`), Account-screen sync-status rows, flag unlock.
  Execute only when the user asks. Do not start unprompted.
- `docs/plans/cloud-backup-sync-plan.md` — separate approved track (Google Drive/Sheets/iCloud receipt backup).
- `docs/INCREMENTAL_SYNC_PLAN.md` — sync efficiency; Stages 0a+1 built, Stages 2–5 land in Phase 3 of the backup plan.
- `docs/multi-device.md` — known multi-device LWW gaps + two-device verification checklist.

## Verification commands

- `npx tsc --noEmit` — typecheck
- `npm run lint:i18n` — en/ms string parity (both locales must carry every new key)
- `npx tsx scripts/test-<name>.ts` — unit tests (`test:sync`, `test:syncmerge`, `test:syncdirty` via npm scripts)

## Conventions worth knowing

- Cloud backup/sync is beta-locked by `EXPO_PUBLIC_CLOUD_BACKUP` (`src/constants/flags.ts`) — fail-closed, do not enable casually.
- i18n: every user-facing string lives in `src/i18n/en.ts` AND `src/i18n/ms.ts`.
- Receipt image paths are persisted RELATIVE (`receipts/x.jpg`); always resolve via `src/utils/receiptImage.ts`.
- Never run `git commit`/`push` unless the user explicitly asks.
