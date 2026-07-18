# Multi-device — future work

Status: **not handled yet.** This doc captures the known concerns so a future pass
can do it deliberately. Notes now sync to Supabase (`personal_notes`), so the data
*reaches* every device — but true concurrent multi-device editing is not solved.

## What works today
- Notes back up to the cloud and **restore on a fresh install / new device** (pull on sign-in).
- Sync is **last-write-wins (LWW) by `updatedAt`**, same as the other personal
  entities (transactions, wallets, debts…). Good enough for "one device at a time".

## What is NOT handled (the multi-device gaps)

1. **Concurrent edits collide (LWW loses data).**
   Two devices edit the same note offline → on sync, the later `updatedAt` wins and
   the other device's edits are silently dropped. There is no field-level merge and
   no conflict surface. Rich-text formatting is a single `formatting` blob, so a
   losing side loses *all* its formatting too, not just the changed part.

2. **Formatting ↔ content can desync across devices.**
   `content` (plain text) and `formatting` (offset-based marks/blocks) are separate
   columns. If a merge ever takes `content` from device A and `formatting` from
   device B, the offsets point at the wrong characters. Today they're written
   together per row, so this only bites if we add field-level merge later — keep
   them atomic.

3. **Pending (un-confirmed) extractions across devices.**
   A note can carry `pending` extractions that haven't been turned into
   transactions. If the same note is opened on two devices and both confirm the
   same pending item, we can double-create the transaction/debt. Confirmed items
   dedupe via their own stores' LWW, but the *note-side* pending list has no
   cross-device idempotency key beyond `extraction.id`.

4. **Auto-strike re-derivation is per-device.**
   Strikes are recomputed from confirmed extractions against the current text on
   open (`reconcileConfirmedStrikes`). Two devices with slightly different text
   (mid-sync) can strike different lines. Cosmetic, but can flicker.

5. **No real-time / presence.**
   No live updates; a device only sees another device's changes on its next pull.
   No "editing on another device" indicator.

## Receipts (audited 2026-07-18 — multi-device issues found, mostly fixed)

A production audit of the receipt feature surfaced three multi-device data-loss bugs. All are code-fixed but **gated** — personal sync is off by default and the fixes only take effect once sync is enabled AND the `20260718000000_receipt_soft_delete_and_image.sql` migration is applied. Verify on a real DB + two devices before flipping `personalSyncEnabled` on.

1. **Deleted receipts (and their expense) came back to life on other devices — and even reverted on the deleting device after ~30 days.** Root cause: deletes were only local; there was **no cloud tombstone** so any other device that still held the row re-uploaded it, and the local 30-day tombstone TTL eventually let it back in too. **Fixed:** added a synced `deleted_at` soft-delete column on `personal_receipts` + `personal_transactions`; deleting now marks the row deleted in the cloud, and every device removes its local copy on pull. *This is the first real fix for the general "deletes don't propagate" LWW gap — the same `deleted_at` pattern can/should be extended to the other personal tables (notes included).*

2. **A receipt's photo reference got clobbered across devices.** Receipts were whole-row LWW with no field-level merge (like the notes gap #1 above), so a newer remote row overwrote the local `imageUri` with the *other* device's local file path → the image broke even on the device that took the photo. **Fixed:** `mergeReceipt` now preserves each device's local `imageUri`/`remoteImagePath` while LWW-ing the other fields.

3. **The photo itself never reached the cloud at all.** Only the receipt's *text* synced; `image_url` carried a device-local `file://` path, so on a new device the photo was just missing. **Fixed:** personal receipt images now upload to the `receipt-images` Storage bucket (`receiptImageSync.ts`), the bucket path syncs, and other devices download+cache the image on pull.

Purge of old soft-deleted rows is handled by `public.purge_personal_tombstones(90)` (in the `20260718000000` migration; scheduled via pg_cron if available, else run from a server cron). Still open: concurrent edits to a receipt's `items[]` are whole-row LWW (low risk — items are set once at scan). Pointers: mappers `receiptToRemote`/`receiptFromRemote`, `src/services/receiptImageSync.ts`, `src/store/receiptStore.ts`.

### How to verify receipts on two devices (turnkey checklist)

Prereqs: migration `20260718000000_receipt_soft_delete_and_image.sql` applied; sign in to the **same account** on Phone A + Phone B; enable personal sync on both (Settings → the `personalSyncEnabled` toggle).

- [ ] **B3 — delete propagates (the big one).** A: scan a receipt → wait for sync. B: pull (reopen / wait) → receipt appears. A: delete it → wait for sync. B: pull → **receipt is gone on B**, and its expense is gone from B's totals/wallet balance. (Before the fix it stayed on B and came back on A ~30 days later.)
- [ ] **B3b — no zombie after a month (fast check).** In Supabase, confirm the deleted row has `deleted_at` set (not hard-deleted). Optional: temporarily lower the local tombstone TTL or `select public.purge_personal_tombstones(0);` then pull on both — the receipt must **not** reappear.
- [ ] **B1 — photo reaches the cloud.** A: scan a receipt. In Supabase Storage → `receipt-images` bucket, confirm an object at `<A-user-id>/personal/<localId>.jpg`. B: pull → open the receipt → **the photo shows** (downloaded from the bucket, not A's local path).
- [ ] **B1b — survives reinstall.** Delete + reinstall the app on A, sign in → the receipt photo still opens (re-downloaded from the bucket). (Before: photo was gone.)
- [ ] **B2 — editing on B doesn't break A's photo.** A: scan (photo shows on A). B: pull, then edit the receipt (e.g. change category) → sync. A: pull → **A's photo still opens** (not blanked by B's file path).
- [ ] **Round-trip sanity.** Edit vendor/amount/category on one device → appears on the other after pull; delete a *pending* (unsynced) receipt while offline, come online → it doesn't resurrect.

Watch for: a broken image icon (B1/B2 regression), a receipt reappearing after delete (B3 regression), or the wallet balance not correcting after a cross-device delete (transaction soft-delete + `autoReconcileWallets`).

## When we handle it — sketch
- Move to **per-note version vectors or `updated_at` + a change log** so we can do
  a 3-way merge (base / mine / theirs) on `content`, then re-anchor `formatting`
  offsets via the same diff/remap the editor already uses (`src/utils/richText.ts`
  `diffRange` + `remapFormatting` are reusable server-side-of-thought).
- Give extractions a **stable content-hash key** (type+amount+person+source line)
  so cross-device confirms dedupe.
- Consider **Supabase Realtime** on `personal_notes` for live pull.
- Keep `content` + `formatting` **atomic** in any merge.

## Pointers
- Sync engine: `src/services/personalSync.ts` (`pullAll` / `pushAll`, LWW helpers).
- Mappers: `src/services/personalSyncMappers.ts` (`noteToRemote` / `noteFromRemote`).
- Table: `supabase/migrations/*_personal_notes.sql`.
- Store: `src/store/notesStore.ts`.
- Rich-text model (reusable for merge/re-anchor): `src/utils/richText.ts`.
