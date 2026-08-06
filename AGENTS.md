# Potraces — Agent Notes

## Active plans

- `docs/plans/backup-restore-foundation-plan.md` — **APPROVED** 2026-08-04, **ALL
  PHASES COMPLETE** same day. Engine: `src/services/storageBackup.ts` +
  `storageBackupCore.ts` (`npm run test:backup`). Sync: incremental Stages 2–5 done
  (`personalSyncDirty.ts`, `personalSyncCursor.ts`; `npm run test:syncdirty`,
  `test:synccursor`). Ops doc + launch checklist: `docs/backup-restore.md`.
  Migrations APPLIED to prod 2026-08-05 (trigger `20260805020000`, telemetry
  `20260804120000`). Remaining = ops only: device drills, THEN flip
  `EXPO_PUBLIC_CLOUD_BACKUP` / `EXPO_PUBLIC_SYNC_INCREMENTAL` (gradual, watch
  `backup_telemetry`).
- `docs/plans/cloud-backup-sync-plan.md` — separate approved track (Google Drive/Sheets/iCloud receipt backup).
- `docs/INCREMENTAL_SYNC_PLAN.md` — sync efficiency; Stages 0a+1 built, Stages 2–5 land in Phase 3 of the backup plan.
- `docs/multi-device.md` — known multi-device LWW gaps + two-device verification checklist.

## Verification commands

- `npx tsc --noEmit` — typecheck
- `npm run lint:i18n` — en/ms string parity (both locales must carry every new key)
- `npx tsx scripts/test-<name>.ts` — unit tests (`test:sync`, `test:syncmerge`, `test:syncdirty` via npm scripts)
- `GEMINI_API_KEY=... npm run test:statementparser` — parse-statement golden test (opt-in: network + secret key, NOT in `npm test`). Re-run on every Gemini model/prompt change; fixtures + oracles live in `supabase/functions/parse-statement/fixtures/`, shared prompt/model/normalization in `parserConfig.ts`.

## Conventions worth knowing

- Cloud backup/sync is beta-locked by `EXPO_PUBLIC_CLOUD_BACKUP` (`src/constants/flags.ts`) — fail-closed, do not enable casually.
- i18n: every user-facing string lives in `src/i18n/en.ts` AND `src/i18n/ms.ts`.
- Receipt image paths are persisted RELATIVE (`receipts/x.jpg`); always resolve via `src/utils/receiptImage.ts`.
- Keyboard-docked UI (cards/composers that must sit above the keyboard): **ONE mover only.** Drive position from the keyboard's own animation — `useReanimatedKeyboardAnimation` (continuous transform) or `KeyboardStickyView` — and NEVER combine `KeyboardAvoidingView` padding with your own translateY/inset, and never flip layout on a boolean/DID event. Two movers or a mid-animation flip = the visible "spring"/snap. Reference impls: `MoneyChat.tsx` composer (~line 1037, the original postmortem), `SellScreen.tsx` discount modal (`discountDockStyle`: card stays centered until the keyboard reaches it, then rides up), `FormatToolbar.tsx` (`KeyboardStickyView`).
- Never run `git commit`/`push` unless the user explicitly asks.
