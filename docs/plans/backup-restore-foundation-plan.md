# Backup & Restore — Firm the Foundation (roadmap plan)

> Status: approved 2026-08-04. **Phases 0–2 (+ 3.2/3.3/3.4/3.5/3.6/3.8) + Phase 4 + Stage-2 dirty push IMPLEMENTED 2026-08-04.**
> Done: file-based snapshot engine (`storageBackup.ts` + `storageBackupCore.ts`),
> GFS-lite rotation, local→account fix, tooNew guard, legacy migration, Android backup
> rules, restore preview + undo, export/import (one `planRestorePayload`→`restorePayload`
> pipeline), shared `PERSONAL_SYNC_TABLES`, orphaned-image sweep on wipe, mismatch
> alert + restore prompt (`PersonalSyncManager`), 90-day retention (privacy.html),
> `backup_telemetry` + reporter, `docs/backup-restore.md` runbook, dirty push behind
> `EXPO_PUBLIC_SYNC_INCREMENTAL` (`personalSyncDirty.ts`, 25 dirty checks green).
> **Remaining: Stage 3 (cursor pull — HIGH risk, needs Stage-0 trigger migration on
> staging first), Stages 4–5, Account-screen sync-status rows (blocked by parallel
> Drive-plan WIP in `AccountScreen.tsx`), flag unlock after launch checklist.**
> Related: `docs/plans/cloud-backup-sync-plan.md` (Drive/Sheets/iCloud receipts — separate track),
> `docs/INCREMENTAL_SYNC_PLAN.md` (sync efficiency, Stages 2–5 land in Phase 3 here),
> `docs/multi-device.md` (known LWW gaps + two-device checklist).

## Goal

Make Potraces's data-protection story complete, smooth, and trustworthy. Four layers, each with a distinct job:

| Layer | Protects against | Status today |
|---|---|---|
| 1. Local rolling snapshots | Bad writes / corrupted stores | Half-built, structurally risky |
| 2. Export / import (user-held file) | App loss, portability (GDPR Art. 20), free-tier off-device copy | Missing (only CSV/PDF exports) |
| 3. Cloud backup (Supabase sync) | Lost/new phone, multi-device | Half-built, beta-locked |
| 4. OS device backup (iCloud/Google Auto Backup) | Silent last resort | On by default, unmanaged |

Research basis: 3 agents — full codebase audit + two web-research passes (official AsyncStorage/Expo/Android/iOS docs, Supabase docs, local-first literature, app precedents: Bear, Money Manager, Immich, Apple/Google platform models).

## Current state (verified by audit)

- `src/services/storageBackup.ts`: daily whole-store snapshots into **AsyncStorage** `bak:<store>:<date>` keys, KEEP_DAYS=5, first-healthy-capture-of-day, `prerestore-*` safety copies, `bakmeta:` identity manifests. Called once at launch (`App.tsx:174`).
- `src/screens/shared/BackupRestore.tsx`: day-list UI, plan-then-confirm restore, `Updates.reloadAsync()` after.
- `src/services/personalSync.ts`: full-state LWW sync to Supabase — pull-then-push, per-record merge with skew-tolerant LWW, soft-delete tombstones everywhere, receipt images to Storage bucket, schema preflight, account-mismatch guard. Beta-locked via `CLOUD_BACKUP_ENABLED` (`src/constants/flags.ts:9`). Tier-gated via `hasCloudBackup()`.
- Incremental sync (efficiency upgrade) is separately planned and Stage 0a+1 built: `docs/INCREMENTAL_SYNC_PLAN.md`. This plan does not redo it.
- Google Drive/Sheets/iCloud receipt backup is a separate approved plan: `docs/plans/cloud-backup-sync-plan.md`. Out of scope here.
- Known multi-device LWW gaps documented in `docs/multi-device.md`. Accepted: LWW is sufficient for ~95% of single-user apps (PowerSync founder; Supabase's own RN offline tutorial uses LWW).

## Problems found (audit + research) — what this plan fixes

**Structural (must fix, Phase 0):**
1. **Snapshots live inside the same 6MB-capped AsyncStorage SQLite DB as live data.** 5 days × 18 stores multiplies footprint 5–6×. Android: exceeding the cap throws mid-transaction and "can leave the db malformed" (official AsyncStorage docs); single values >~2MB crash on read (CursorWindow). Our corruption-safety-net is stored in the most corruption-prone place we have. → move snapshots to files.
2. **`prerestore-*` copies are never pruned** (`storageBackup.ts:202` excludes them; only account deletion purges) — unbounded growth for anyone who restores.
3. **`'local'` identity trap**: signed-out snapshots are stamped `userId:'local'`; after sign-in, `restoreDay` hard-blocks them as wrong-account (`storageBackup.ts:337-339`) — users' own pre-sign-in backups become permanently unrestorable.
4. **No schema guard**: 17/18 protected stores have no persist `version`/`migrate`; nothing stops restoring a backup made by a *newer* app version into an older app (Signal precedent: must hard-stop with a clear message).
5. **OS backup duplication**: `android/app/src/main/AndroidManifest.xml:24` `allowBackup="true"` with no extraction rules — the redundant snapshot set (and receipt images) counts against Android's 25MB Auto Backup quota; exceeding it can get the whole backup rejected.

**Cloud layer (Phase 3):**
6. `clearPersonalDataRemote` (`src/services/supabase.ts:214-228`) misses `personal_categories` + `personal_learning` — diverged from the complete list in `disablePersonalSync` (`personalSync.ts:868-888`).
7. Wipe-without-account-deletion deletes table rows but **orphans receipt images** in the `receipt-images` bucket.
8. `isPersonalAccountMismatch` flag is set but has **no UI consumer** — sync silently stops for that user.
9. No restore-onto-new-device prompt (existing `App.tsx:153` TODO); no documented post-cancellation retention policy; dead/stale comments (`tombstoneStore.ts:22` "30 days" vs actual 180; `personalSync.ts:750` "forced false on rehydrate" — not true).

**Gaps (Phase 1–2):**
10. Restore preview shows only "N data sets" — no record counts, no dates, no app-version info.
11. No way to get a full backup off the device (export) or back in (import).

---

## Phase 0 — Rebuild the local snapshot engine on files (the foundation)

No UI changes. Everything else builds on this.

1. **New storage layout** — `src/services/storageBackup.ts` rewrite (keep public API: `snapshotAll`, `listBackupDays`, `planRestoreDay`, `restoreDay`, `purgeBackups`, `PROTECTED_KEYS`, `PERSONAL_BACKUP_KEYS`):
   - One file per day: `Paths.document/backups/backup-<YYYY-MM-DD>.json.gz` containing `{ backupVersion: 1, appVersion, userId, createdAt, recordCounts: {store: n}, stores: {storeKey: rawBlob} }`.
   - Use the **new** expo-file-system API (`File`, `Directory`, `Paths` — SDK 54 default import; existing code uses `/legacy`, both fine) and **fflate** (already in `package.json`) for gzip. JSON finance data compresses ~5–10×.
   - **Atomic writes**: write `*.tmp` → `JSON.parse` self-check → checksum → `move()` over destination. Never let a failed new snapshot delete the previous one.
   - Keep today's semantics: snapshot once per launch, first-healthy-capture-of-day wins, `looksHealthy` gate (plus record-count sanity into the manifest).
2. **Retention: GFS-lite** — 7 daily + 4 weekly + 3 monthly (research: grandfather-father-son maximizes recovery points per byte). Keep the pure rotation planner as an exported pure function for testing.
3. **Bound prerestore copies**: keep only the **latest** pre-restore snapshot file (`backup-prerestore-<date>.json.gz`, max 1–2); prune on every snapshot run.
4. **Fix the `'local'` trap**: `planRestoreDay`/`restoreDay` — mismatch where backup is non-local and ≠ current identity stays a hard block; backup stamped `'local'` restoring into a signed-in session becomes **confirm-with-warning** (it is the same person's data).
5. **Version guard**: manifest `appVersion`/`backupVersion` newer than current app → plan returns `tooNew: true` → UI hard-stops with "backup made by a newer version — update the app".
6. **Migration from `bak:` keys**: one-time upgrade step at launch (before `snapshotAll`): group existing `bak:`/`bakmeta:` keys by day → write day-files → `multiRemove` old keys. Idempotent, best-effort; legacy days without meta keep current "can't verify owner" caution.
7. **OS-backup hygiene**: Android — add `android:dataExtractionRules` + `android:fullBackupContent` XML excluding `backups/` and `receipt-queue/` from cloud backup (keep live stores + receipt images included; the OS layer stays the device-loss net). iOS — set `NSURLIsExcludedFromBackupKey` on the `backups/` dir after each write (must re-set per write; Apple treats it as guidance).
8. **Tests**: `scripts/test-storage-backup.ts` (run with `npx tsx`, matching existing `scripts/test-*.ts` style) — rotation planner, prerestore pruning, identity matrix (local→local, local→account, accountA→accountB block, legacy), version guard, migration from `bak:` keys, corrupt-file handling.
9. Bump `AsyncStorage_db_size_in_MB`? — **Not needed after the file move** (snapshots were the growth driver); note in the file header why we deliberately don't.

## Phase 1 — Restore UX (smooth + trustworthy)

1. **Preview before confirm** (`src/screens/shared/BackupRestore.tsx`): render from the manifest — date, app version, per-store record counts then-vs-now ("Transactions: 1,240 → 1,180"), which stores keep current data (port existing `missing`/`missingCore` logic), owner status, prerestore-undo note.
2. **Atomic restore**: read + validate + checksum the whole file first → write the single pre-restore snapshot → `multiRemove`/`multiSet` live keys in one batch → block interaction (modal) → `Updates.reloadAsync()`. No partial state reachable by backgrounding mid-restore.
3. **Too-new backup** → dedicated alert (not generic failure).
4. i18n: new keys in `src/i18n/en.ts` + `ms.ts` (23-key parity convention holds); `npm run lint:i18n`.

## Phase 2 — Export / import (the off-device copy for everyone)

1. `src/services/backupExport.ts`: "Export backup" → build the same day-file format from current live state → `expo-sharing` share sheet (pattern already in `src/services/exportService.ts:40-52`; `expo-sharing` + `expo-document-picker` already installed). File: `potraces-backup-<date>.json.gz`. This doubles as the GDPR Art. 20 machine-readable export.
2. "Import backup" → `expo-document-picker` → same validation + preview + atomic-restore pipeline as Phase 1 (shared code path, not a fork). Owner guard: non-local mismatch → block; `'local'` → confirm.
3. Entry points: buttons on the BackupRestore screen (both tiers — export is already free for all tiers per `tiers.ts:73`).
4. Deferred nicety (note only): `.potracesbackup` file-association tap-to-restore (Money Manager flow) — needs native intent-filter/UTType config; do it with the next EAS build that already changes native config.

## Phase 3 — Finish the cloud layer (mostly wiring existing work)

1. **Land incremental sync**: commit/finish Stages 2–5 of `docs/INCREMENTAL_SYNC_PLAN.md` (dirty-only push → cursor pull on server `updated_at` — server timestamps as LWW arbiter, never client clocks). Behind its existing flag.
2. **Fix delete-list divergence**: add `personal_categories` + `personal_learning` to `clearPersonalDataRemote` (`supabase.ts:214-228`); single source of truth constant shared with `personalSync.ts:868-888`.
3. **Orphaned images**: on `disablePersonalSync(true)` / `clearPersonalDataRemote`, also remove `storage.objects` under `<userId>/personal/` in `receipt-images` (client storage API or small edge function).
4. **Sync status honesty** (`AccountScreen.tsx`): consume `isPersonalAccountMismatch()` (banner + resolution path), pending-changes count, plain-language error + retry. Kill the silent-stall class of bug.
5. **Restore-onto-new-device**: first run with session + empty local stores + cloud rows present → "Restore from cloud?" vs "Start fresh" (destructive-warning copy; pre-restore local snapshot first). Closes `App.tsx:153` TODO.
6. **Downgrade policy (decide + document)**: current `disablePersonalSync(false)` (stop sync, keep server data) matches the Apple iCloud model — keep it. Publish a **90-day retention** window after cancellation (UI copy + privacy policy), allow restore within that window; never silently stop syncing.
7. **Unlock**: set `EXPO_PUBLIC_CLOUD_BACKUP=1` in production EAS env only after the Phase 3 checklist passes (two-device checklist already written in `docs/multi-device.md`).
8. Fix stale comments: `tombstoneStore.ts:22` (180 days), `personalSync.ts:750` (rehydrate behavior).

## Phase 4 — Telemetry, docs, launch gate

1. Failure telemetry: permanent snapshot-write failure / sync permanent failure → one row to Supabase (reuse `beta_feedback` pattern) — silent backup failure is the worst outcome in this feature class.
2. `docs/backup-restore.md`: the four layers, what each protects against, retention/rotation rules, downgrade policy, runbook (how to help a user restore).
3. Launch checklist: restore drill on physical iOS + Android (corrupt a store → restore), two-device sync checklist (`docs/multi-device.md` B1–B3), export→delete-app→import round-trip, Auto Backup quota check with realistic receipt volume.

## Explicitly NOT doing (with reasons)

- **PowerSync/ElectricSQL/CRDTs/WatermelonDB**: LWW + tombstones already built is the right call for single-user finance data (Supabase's own tutorial and PowerSync's founder concur). Revisit only if business ledgers become multi-user.
- **E2E encryption**: breaks server-side features and makes password-reset = data-loss (Apple ADP needs recovery contacts/keys even at Apple scale). v1 = TLS + at-rest + strict RLS, honestly marketed.
- **MMKV / expo-sqlite as primary store**: data-layer migration, not a backup-layer fix. Unjustified scope.
- **Restoring via store actions instead of raw persist blobs**: the "correct" purist approach, but raw-blob + `backupVersion` guard + app reload is the working mechanism across 18 stores; per-store persist versions get added incrementally when those stores next change (cheap then, expensive now).
- **Google Drive/Sheets/iCloud receipt backup**: covered by `docs/plans/cloud-backup-sync-plan.md`.

## Execution order & effort

Phases are independently shippable. **0 → 1 → 2 → 3 → 4**, though 3.2/3.3/3.8 (small bug fixes) can ride with Phase 0. Estimated: P0 ~1–2 days, P1 ~1 day, P2 ~0.5–1 day, P3 2–4 days (mostly incremental-sync landing), P4 ~1 day.

## Verification

- `npx tsc --noEmit` clean; `npm run lint:i18n` clean; `npx tsx scripts/test-storage-backup.ts` green (+ existing `test:sync`, `test:syncmerge`, `test:syncdirty` still green).
- Physical devices: snapshot→corrupt→restore drill; export→uninstall→import round-trip; Android backup-rules inspection; two-device cloud checklist before flag unlock.
