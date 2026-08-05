# Plan: Google Sheets sync + Drive / iCloud receipt backup

## Goal

Three features, one foundation:

1. **Google Sheets sync** — transactions auto-append to a spreadsheet in the user's Google account.
2. **Google Drive backup** — receipt images/PDFs auto-upload to a visible "Potraces" folder in the user's Drive.
3. **iCloud backup** — receipts auto-upload to the user's iCloud Drive (iOS only), with restore.

"Smooth and usable" = silent operation, visible status (toggle, last-backup time, pending count, Back Up Now), offline-tolerant, no data loss, no duplicates.

## Research conclusions (verified via agents against official docs)

- **`drive.file` scope alone covers everything Google-side.** Sheets `spreadsheets.create` and `values.append` explicitly accept `drive.file` for app-created spreadsheets. Do NOT add the `spreadsheets` scope — it's *sensitive* and triggers full OAuth verification (privacy policy on verified domain, demo video, weeks of review). Staying non-sensitive = no verification burden.
- **Hard ops blocker:** an OAuth consent screen in "Testing" status issues refresh tokens that expire in **7 days** and caps at 100 test users. Must publish to **Production** (+ optional brand verification for app name/logo) before launch.
- **`drive.file` limits:** app can create folders/files, find them later (`files.list?q=`), reopen across devices. Cannot see user-created files. Visible folder (not `appDataFolder`) is right for receipts — user data must survive uninstall and be browsable.
- **No idempotency key for Sheets append** → dedupe via unique transaction-ID column + read-back of that column before bulk appends; only mark synced on confirmed 200.
- **Rate limits** (60 writes/min/user Sheets; Drive quotas effectively unreachable) → batch appends (one call, many rows), truncated exponential backoff on 403/429 — we already have `src/services/syncBackoff.ts`.
- **iCloud:** no pure-JS/REST path exists (CloudKit Web Services ≠ iCloud Drive). The viable, maintained, Expo-compatible library is **`react-native-cloud-storage`** (Expo config plugin sets entitlements; fs-like API; New-Arch only — fine on SDK 54). Needs iCloud capability + container `iCloud.com.potraces.app` → **new EAS dev build**. Bonus: iCloud-only backup adds **nothing** to the App Store privacy label (data goes to the user's own Apple account).
- **Background sync reality (Immich/PowerSync pattern):** foreground-triggered sync is the reliable path; `expo-background-task` is best-effort only (iOS decides timing, often overnight; force-quit kills it). Design foreground-first; background = optional later phase.
- **Upload reliability:** persisted queue + NetInfo gating + per-item retry/backoff + failure isolation — exactly the pattern already proven in `src/services/receiptQueue.ts`.

## Current codebase facts (verified)

- `SavedReceipt` (`src/types/index.ts:1233`): `imageUri`/`pdfUri` are **local relative** paths — always read via `resolveReceiptImageUri()` (`src/utils/receiptImage.ts:17`). PDFs never leave the device today.
- `src/services/driveUpload.ts` exists but: whole file buffered as base64, no folders, no file-ID persistence, no retry.
- `src/services/googleAuth.ts`: native Google SDK holds/refreshes tokens (`offlineAccess: false`), `drive.file` scope only, `connectGoogleDrive()` gives Drive access to Apple/phone accounts, single native Google session per device.
- `src/services/receiptQueue.ts` = durable AsyncStorage queue template (5 attempts, 60s cooldown, failed-entry recovery, NetInfo gate).
- `src/components/common/PersonalSyncManager.tsx` = orchestrator template (mount-after-hydration, AppState foreground, 1.5s-debounced store subscriptions) + `withBackoff` (`src/services/syncBackoff.ts`).
- `settingsStore` convention: flat booleans + setters + on-rehydrate migrations (`src/store/settingsStore.ts:962-1000`).
- Cloud features are gated: `CLOUD_BACKUP_ENABLED` env flag (`src/constants/flags.ts:9`) + `hasCloudBackup()` premium tier (`src/store/premiumStore.ts:162`). New features follow the same gating.
- AccountScreen (`src/screens/shared/AccountScreen.tsx`) is the existing cloud-backup hub — new sections go there.
- No background-task infra, no iCloud entitlement (`app.json:70-75`).
- i18n: mirror keys in `src/i18n/en.ts` + `ms.ts`; check with `npm run lint:i18n`.

## Architecture (the foundation)

```
receipt/transaction store mutations
        │  (subscribe-diff, 1.5s debounce — PersonalSyncManager pattern)
        ▼
CloudBackupManager (new component, mounted in App.tsx next to PersonalSyncManager)
        │  enqueues jobs
        ▼
cloudBackupQueue (AsyncStorage, durable; 5 attempts, 60s cooldown, failed list)
        │  drains on: mount, AppState foreground, NetInfo reconnect, manual "Sync now"
        ├──────────────┬──────────────────┬────────────────┐
        ▼              ▼                  ▼                ▼
   sheetsSync.ts  driveBackup.ts    icloudBackup.ts   (future: background task)
   append rows    upload files      write files+manifest
   to app-created to Drive folder   to iCloud container
   spreadsheet
        │
        ▼
   backupStore (zustand persist): remote IDs (folderId, spreadsheetId,
   receiptId → driveFileId/icloudPath), synced transaction IDs,
   per-feature last-synced-at + last error
```

Key design decisions:

- **Remote-ID map lives in a new `backupStore`, NOT on `SavedReceipt`** — avoids touching the receipt data model and personalSync mappers.
- **Append-only Sheets semantics (v1):** new transactions append with ID dedupe; edits/deletions are not propagated (UI copy states this). A manual "Full re-sync" (clear tab, rewrite all) is the recovery path.
- **Pin the Google account:** record the connected Google email in settings; show it; warn if the native session's email changes. One native Google session per device is shared by business/personal modes.
- **Self-healing provisioning:** on every drain, verify folder/spreadsheet still exist (404 → recreate, update stored IDs, schedule full re-sync). Users delete things in Drive.
- **Schema versioning:** spreadsheet header written with a version marker; future migrations key off it.
- **Gating:** same as personal cloud backup — `CLOUD_BACKUP_ENABLED` flag + `hasCloudBackup()` paywall.

## Phase 0 — Ops (no code, must happen before launch)

1. Google Cloud Console: publish OAuth consent screen from Testing → **Production**; submit brand verification (app name/logo); ensure privacy-policy URL discloses Google user-data handling.
2. Apple Developer portal: enable iCloud capability + container `iCloud.com.potraces.app` (needed for Phase 3).

## Phase 1 — Foundation + Google Drive auto-backup (pure JS, ships in current dev build)

1. `src/services/cloudBackupQueue.ts` (new) — generic durable queue cloned from `receiptQueue.ts`: jobs `{id, kind: 'drive-file' | 'sheet-rows' | 'icloud-file', payload, addedAt, attempts, lastAttemptAt, lastError}`; MAX_ATTEMPTS 5, 60s cooldown, separate failed list (recoverable, never silently dropped).
2. `src/store/backupStore.ts` (new) — zustand persist `backup-storage`: `driveFolderId`, `receiptsFolderId`, `spreadsheetId`, `receiptRemote: Record<receiptId,{driveFileId?,icloudPath?,backedUpAt?}>`, `syncedSheetIds: string[]`, pending counts.
3. `src/services/googleDrive.ts` (new) — upgraded Drive client: token via `getGoogleAccessToken()`, on 401 `clearCachedAccessToken` + one retry (Android cached-token quirk), on 403/429 truncated exponential backoff; `ensureDriveFolders()` (find-or-create `Potraces` + `Potraces/Receipts`, IDs cached in backupStore); `uploadToDrive({fileUri,name,mimeType,folderId}) → fileId`; `findFileByName()` (heals crash-between-upload-and-map-save). Refactor `driveUpload.ts` to delegate so `ReceiptDetail.handleSaveToDrive` keeps working unchanged.
4. `src/services/driveBackup.ts` (new) — `enqueueReceiptBackup(receipt)` + `drainDriveBackup()`: resolve files via `resolveReceiptImageUri` / `resolveReceiptPdfUri` (relative-path discipline), deterministic names `receipt-<id>.pdf|jpg`, skip when backupStore already has a live fileId, write map entry on 200.
5. `src/components/common/CloudBackupManager.tsx` (new, mount in `App.tsx` near line 940) — triggers drain on mount-after-hydration, AppState foreground, NetInfo reconnect, and 1.5s-debounced `receiptStore`/`personalStore` subscription diffs (enqueue new receipts by ID diff); wrap in `withBackoff('cloudBackup', …)`.
6. `src/store/settingsStore.ts` — add `driveBackupEnabled`, `googleDriveEmail`, `lastDriveBackupAt`, `lastDriveBackupError`, `backupWifiOnly` (+ setters, defaults, rehydrate migration per `:962-1000` pattern).
7. `src/services/googleAuth.ts` — add `getConnectedGoogleEmail()` (`GoogleSignin.getCurrentUser`) and `disconnectGoogle()` (`revokeAccess` + `signOut`).
8. `src/screens/shared/AccountScreen.tsx` — new "Google Drive" section: connected email + Connect/Disconnect, Drive-backup toggle (paywall-gated like `:274-276`), last-backup time, pending count, "Back up now" button, error row. Reconnect state when token is gone (queue pauses, data safe).
9. i18n keys (en + ms); `npm run lint:i18n`.
10. Tests: `scripts/test-backup-queue.ts` (dedupe, retry, failed-list recovery) + `scripts/test-drive-dedupe.ts` (skip-when-mapped, name heal) — run with `npx tsx`. Typecheck.

## Phase 2 — Google Sheets sync (pure JS, same build)

1. `src/services/sheetsSync.ts` (new):
   - `ensureSpreadsheet()` — Drive `files.list` (q: name + sheets mimeType, app-created) → else `POST sheets.googleapis.com/v4/spreadsheets` with title "Potraces Transactions"; cache `spreadsheetId`; 404 → recreate.
   - `ensureHeader()` — tab `Transactions`, header row: `ID | Date | Type | Amount | Currency | Category | Wallet | Vendor | Notes` + schema-version marker (column shape mirrors `exportService.ts:60-74` CSV rows).
   - `syncTransactions()` — read back ID column (`values.get`), filter local transactions not present, batch `values.append` (`valueInputOption=USER_ENTERED`, `insertDataOption=INSERT_ROWS`, URL-encoded range, ≤500 rows/call), record IDs in `syncedSheetIds` only on 200.
   - `fullResync()` — `values.clear` tab + rewrite all (manual recovery).
2. Wire into CloudBackupManager drain (transactions diff → sheet job) and settings (`googleSheetsSyncEnabled`, `lastSheetsSyncAt`).
3. AccountScreen: Sheets toggle, link to open the spreadsheet, last-sync time, "Full re-sync" button, append-only-semantics copy.
4. i18n + `scripts/test-sheets-dedupe.ts` (ID read-back filtering, batch split). Typecheck + lint:i18n.

## Phase 3 — iCloud backup (native dep → new EAS dev build)

Status 2026-08-05: **code complete, pending EAS dev build + device testing.**
`react-native-cloud-storage` ^3 added (plugin container `iCloud.com.potraces.app`),
`src/services/icloudBackup.ts` + `icloudBackupLogic.ts` (`npm run test:icloud`),
`icloud-file` drain wired into `cloudBackupRunner` (per-provider preflights —
a dead Google session no longer blocks iCloud jobs and vice versa; queue drains
take an `onlyKinds` filter), settings keys (`icloudBackupEnabled`,
`lastIcloudBackupAt/Error`), AccountScreen iCloud section (iOS-only: toggle,
last-backup, Back Up Now, Restore), en+ms strings. Restore is deliberately
file-level: it re-materializes receipt FILES for receipt RECORDS already on
the device (records return via account data restore / personal sync); merge =
missing files only, replace = re-download all. Restore is flag-gated but NOT
paywall-gated (recovery must not be blocked by a lapsed subscription).
Remaining: steps 1 (rebuild) and 5 (device testing) below.

1. Add `react-native-cloud-storage` + app.json plugin (container `iCloud.com.potraces.app`); rebuild dev client (iOS entitlements change).
2. `src/services/icloudBackup.ts` (new) — availability check (`useIsCloudAvailable`; unsigned-into-iCloud → disabled row with plain-language reason), write files to visible `Potraces/Receipts` (Documents scope — browsable in Files app, App Store guideline 2.5.15-friendly), `manifest.json` (IDs, updatedAt, tombstones — written last), restore with two modes: **Replace this device** / **Merge** (dedupe by ID, LWW on updatedAt).
3. New queue kind `icloud-file` in cloudBackupQueue + drain path in CloudBackupManager.
4. AccountScreen: iCloud section (iOS only): toggle, last-backup, pending, Back Up Now, Restore button. Privacy copy: "files go to your iCloud — we never see them".
5. i18n + device testing (physical device; handle iOS placeholder/evicted files via library download).

## Phase 4 — Deferred (documented, not in this build)

- `expo-background-task` opportunistic drain (register on background, unregister on active; `expo/fetch` inside task) — advertise as "automatic when possible", never guaranteed.
- Resumable Drive uploads for files >5 MB (multipart is capped at 5 MB; receipts ~150 KB so not needed yet).
- Per-year sheet tabs / archival when approaching Sheets cell limits.
- Watch item: legacy Google Sign-In SDK on Android is deprecated — plan migration (Universal module or Credential Manager) before Google EOLs it.

## Phase 5 — Production readiness (launch gate)

Code is done at Phase 3. This phase is everything that turns working code into a shipped feature — **the feature is not finished until every box below is checked.**

### 5.1 Legal & consent copy

- Update privacy policy (`site/` legal pages) with Google user-data disclosure: what the app accesses (only Drive files/spreadsheets it creates), that data stays in the user's own Google account, how to revoke (Google account → third-party access), and that revoking stops backups without deleting app data. Required by Google before consent screen approval.
- iCloud clause: files go to the user's own iCloud via Apple frameworks; we never see or store them.
- In-app consent copy before first connect: what will happen, where files go, how to stop.

### 5.2 Store declarations

- App Store privacy label: Google Drive/Sheets backup = declare **User Content** transmitted off-device with user consent. iCloud-only path adds nothing (data goes to the user's own Apple account).
- Play data-safety form: same declarations.
- Review notes for both stores: features create files only inside the user's own Google/iCloud account; include a demo flow description.

### 5.3 Gating & flag decisions (must be decided explicitly, not left default)

- Free vs premium per feature — plan default: premium via `hasCloudBackup()`, same as personal cloud backup.
- Set `EXPO_PUBLIC_CLOUD_BACKUP=1` in the production build env (currently off/beta-locked).

### 5.4 Failure telemetry (minimum viable)

- Persist per-feature failure counters + last error in `backupStore`; surface in AccountScreen (already in Phase 1–2 UI).
- Add one telemetry row per *permanent* failure (job lands in failed list) to a Supabase table, reusing the `beta_feedback` pattern — without this, silent backup failures in the wild are invisible.

### 5.5 Release mechanics

- New EAS production build (Phase 3 entitlements force this anyway).
- Internal TestFlight + Play internal-track run covering §5.7, then staged rollout.

### 5.6 Support path

- FAQ/help entry: "backup not working?" recovery steps — Reconnect Google, retry failed, Full re-sync (Sheets), Restore (iCloud).

### 5.7 Pre-launch checklist (all must pass)

**Google account & ops:**
- [ ] OAuth consent screen status = **In production** (NOT Testing — Testing kills refresh tokens after 7 days, caps 100 users)
- [ ] Consent screen scopes = `drive.file` ONLY (no `spreadsheets`, no `drive` — sensitive/restricted scopes trigger verification)
- [ ] Brand verification approved (app name + logo on consent screen)
- [ ] Privacy policy URL live and discloses Google data handling

**Functional (physical devices, iOS + Android):**
- [ ] Fresh connect → backup works; token still valid after 7+ days (proves Production status)
- [ ] Airplane mode → jobs queue; back online → drain completes, zero duplicates
- [ ] Delete folder/spreadsheet in Drive → app re-provisions and full re-syncs automatically
- [ ] Revoke access in Google account settings → app shows Reconnect state, queue intact, reconnect resumes cleanly
- [ ] Apple/phone account → Drive-only connect → backup works, app account untouched
- [ ] Sheets: same transaction never appears twice; Full re-sync rebuilds the sheet correctly
- [ ] iCloud: backup visible in Files app; delete app → reinstall → Restore-merge produces no duplicates
- [ ] Paywall: free tier sees paywall; premium tier gets the features

**Quality:**
- [ ] `npm test` green including new queue/sheets tests
- [ ] `npm run lint:i18n` clean; all new strings render in en + ms
- [ ] Telemetry rows appear on forced permanent failure

**Post-launch watch items:**
- [ ] Reconnect-prompt rate (token revocation / 401 spikes → possible Google-side issue)
- [ ] Google 2026 quota-overage billing — batching keeps us far under; monitor anyway
- [ ] Legacy Android Google Sign-In SDK deprecation — migrate (Universal module / Credential Manager) before Google EOLs it
- [ ] Sheets cell-limit archival if heavy users approach limits (Phase 4)

### 5.8 Scope boundary (honest v1)

- Sheets sync is **append-only**: edits/deletions of already-synced transactions do not propagate (Full re-sync is the recovery). Two-way sheet sync is a separate future feature, not a gap to patch ad hoc.
- Background sync is foreground-triggered (app open/resume + debounced writes). True OS-background sync is Phase 4 and can only ever be best-effort on iOS.

## Expected problems & mitigations (baked in above)

| Problem | Mitigation |
|---|---|
| OAuth "Testing" status kills tokens after 7 days | Phase 0: publish to Production before launch |
| `spreadsheets` scope triggers sensitive verification | Use `drive.file` only |
| Token/session loss (revoke, reinstall) | Queue pauses with needs-reauth state; UI "Reconnect Google"; no data loss |
| User deletes sheet/folder in Drive | 404 → re-provision + full re-sync |
| Duplicate rows on retried append | ID column read-back + synced-on-200 flag |
| Base64 memory on Hermes | Receipts ~150 KB fine; >5 MB deferred to resumable uploads (Phase 4) |
| iOS iCloud sync timing is opaque | Visible status + manifest; restore tolerates placeholders |
| User hand-edits the sheet tab | Dedicated tab + header check; recreate as v2 tab if corrupted |
| Sheet deletions/edits divergence | Append-only documented; Full re-sync button |
| Multi-device same Google account | ID dedupe makes appends converge; iCloud restore = replace/merge |

## Verification

- `npx tsc --noEmit` clean; `npm run lint:i18n` clean.
- `npx tsx` unit tests for queue dedupe/retry and Sheets ID filtering.
- Manual on dev build: connect Google (Apple-signed account too), toggle Drive backup, scan receipt → file appears in Drive folder; toggle Sheets → rows append, no dupes on retry/airplane-mode toggle; delete folder in Drive → auto re-provision; iCloud (Phase 3, physical device): backup → visible in Files app → delete app → reinstall → restore-merge.
