# Incremental Sync — safe migration plan

> Status (2026-08-01): **Stage 0a + Stage 1 BUILT & tested** (uncommitted on branch
> `fix/import-freeze-collectz-indexes`); Stages 2–5 still planned. Sync is **beta-dormant**
> (`CLOUD_BACKUP_ENABLED` off) so everything built so far is inert until a flag flips it on — zero
> live-data risk. See memory `prod-readiness-scale-audit`.

## Progress
- ✅ **Stage 0a — `(user_id, updated_at)` index** on all 12 personal_* row tables
  (`supabase/migrations/20260801020000_personal_sync_updated_at_indexes.sql`). Applied to **staging**;
  NOT yet prod (dormant — apply when the cursor pull ships).
- ✅ **Stage 1 — dormant per-store dirty tracking.** `_dirty*Ids` sets added to personalStore
  (transaction/subscription/budget/goal), walletStore (wallet/transfer), debtStore
  (debt/split/contact/sharedSub), savingsStore, receiptStore, notesStore — mirroring the `_deleted*Ids`
  pattern; marked on every add/edit, never on delete, never on the bulk-setState sync-apply path.
  Cross-store side-effects of wallet deletion (debt-payment + goal-contribution rewrites) also marked.
  Guarded by `scripts/test-sync-dirty.ts` (`npm run test:syncdirty`). Nothing consumes the sets yet.

### Stage 2 MUST handle (deferred from Stage 1, all currently harmless/dormant)
1. **receiptStore backfill:** `personalSync.ts:583` writes `remoteImagePath` via `updateReceipt`, which now
   marks dirty — a cloud-applied value falsely marked changed. Fix with a dedicated `setRemoteImagePath`
   mutator (or opts flag) that skips dirty-marking; do NOT drop dirty-marking from `updateReceipt`.
2. **splits & contacts** are synced but have NO `_deleted`/`_dirty` tracking → Stage 2's dirty-only push must
   FULL-push those tables (fallback), or add tracking first.
3. **General safety net:** the push consumer MUST filter the dirty set to `live rows ∖ deleted ids` before
   pushing, so a stale/deleted dirty id can never push a ghost row (makes per-delete scrubbing belt-and-suspenders).
4. **Pre-existing (not Stage-1 regressions), fix when they become load-bearing:** `setDefaultWallet` demotes the
   old default without bumping its `updatedAt` (could lose the demotion on LWW); `deleteContact` renames a
   contact inside debts/splits without bumping updatedAt/marking dirty (rename never propagates).

## The problem (plain)

Every time anything changes, the app re-downloads **and** re-uploads the user's **entire** financial
history (all 12 tables). Slow, wasteful, worsens as history grows, and costs cloud egress. We switch to
syncing **only what changed since last time**.

## Why it's safe by construction

- **Deletes stay tombstone-based, never absence-based.** `mergeById` (personalSyncMerge.ts:74-94) is a
  **union by id** — a local row missing from a partial remote delta is **kept**, so a smaller pull can't
  drop rows. Soft-deletes ride the cursor because `softDeleteTombstones` does an UPDATE that bumps the
  server `updated_at`, so a freshly deleted row still lands in the cursor window and the existing
  `deleted_at` plumbing surfaces it. No separate server delete-log needed.
- **Cursor = server `updated_at`** (default `now()` + `handle_updated_at` trigger), **never** the
  client-set `client_edit_at` (which stays the LWW tiebreak only). One `.gte('updated_at', watermark)`
  per table captures inserts, edits AND soft-deletes.
- **Everything behind a flag** (`personalSyncIncremental`, default OFF), instant rollback = flip OFF →
  next cycle runs today's full sync and self-heals any drift. No DB rollback needed (all changes additive).

## Approach

Per-`(userId, table)` watermark in `settingsStore`, advanced **only** from the server's own
`MAX(updated_at)` after a fully-successful pull+push, reset on account switch. Push becomes
**dirty-tracked** (a `_dirtyIds` set mirroring the existing `_deleted*Ids` machinery) — mandatory, because
an incremental pull buys nothing while the full push keeps re-stamping every row's `updated_at`. Keyset
pagination on `(updated_at, local_id)` replaces offset `.range()`. Inclusive cursor + small overlap +
id-keyed idempotent merge absorb boundary re-pulls. A periodic/forced **full reconcile** is retained as
the self-healing net that today's full sync gives for free.

## Stages (each small, independently shippable, tested before it ships)

| # | Stage | Risk | What |
|---|---|---|---|
| 0 | DB groundwork | low | Add `(user_id, updated_at)` index (concurrently) to all 12 tables; make `updated_at` server-stamped on **INSERT** too (trigger → `BEFORE INSERT OR UPDATE`); confirm tombstone retention window. **Zero behavior change.** |
| 1 | Client dirty-tracking groundwork | low | Add `_dirty<Type>Ids` sets to each store, wired into every mutator + merge, but **not yet consumed by push**. Zero behavior change. |
| 2 | Incremental **PUSH** behind flag | med | Flag on → upsert only dirty rows (minus deleted ids); pull still full. Race-safe dirty-clear inside the existing success gate; force full push on first-sync / account-switch / reconcile. |
| 3 | Incremental **PULL** behind flag | high | Per-table watermark + cursor-filtered **keyset** pull. Requires Stage 0 + 2. Deletes ride the cursor; keep pulling `deleted_at` rows. |
| 4 | Full-reconcile safety net | med | Force full pull+push when watermark older than tombstone retention, on a periodic cadence, and via a manual "Resync now". Integrity check: local vs remote live-row counts. |
| 5 | Coverage-gap fix + gradual enable | med | Subscribe receipt/budgetProfile/category/learning stores in `PersonalSyncManager` (latent gap); optional blob trim; flip flag on for internal → % of users → all, watching telemetry. |

**Hard ordering rule:** Stage 2 (dirty push) MUST land + be enabled before Stage 3 (cursor pull) — else the
full push keeps re-stamping every row and the cursor re-downloads the whole table anyway (zero savings,
false confidence).

## DB migrations (all additive / backward-compatible)

1. `CREATE INDEX CONCURRENTLY personal_<t>_user_updated_idx ON personal_<t> (user_id, updated_at)` × 12 tables.
2. Extend `handle_updated_at()` to `BEFORE INSERT OR UPDATE` so `updated_at = now()` is server-stamped on
   INSERT (today UPDATE-only; 11/12 tables accept client wall-clock on insert = the lost-insert skew hazard).
   Safe: LWW reads `client_edit_at`, never `updated_at`.
3. Ops: ensure `purge_personal_tombstones` retention > max offline/cursor-staleness window; document the number.
4. No destructive changes; keep `(user_id, local_id)` conflict target + `(user_id, deleted_at)` index; upsert
   payloads keep **omitting** `deleted_at` (personalSync.ts:143-144) so no re-upsert clears a tombstone.

## Backward compatibility (mixed old/new clients during rollout)

All schema changes are additive + old-client-invisible. Old clients keep doing full pull+push, unaffected.
(a) An old client's full push bumps `updated_at`; a new incremental client just re-pulls those via its cursor
and merges idempotently (union by id) — wasted bandwidth, never loss. (b) A new client still writes
`deleted_at` + `client_edit_at`, so old clients see deletes and resolve LWW as before. Tombstone-survival
invariant holds both directions → deletes never resurrect in the mixed-version window.

## Test plan

Extend existing: `test:sync`, `test:syncmerge`, `test:deleteflow`, `test:wallet`, `test:txinvariant`.
New scripts: `test:synccursor` (watermark advance / keyset stability / overlap idempotency / account-switch
reset), `test:syncdirty` (mark rules / failed-push keeps dirty / race-safe clear / persist survives),
`test:syncbackcompat` (interleave old full push + new incremental pull → no lost/duped/misordered/resurrected),
`test:syncoffline` (stale-cursor device forced reconcile recovers a purged-tombstone delete). Wire new scripts
into the `test` chain in package.json.

## Top risks (all mitigated in the stages)

- **HIGH — pull-before-push coupling** → enforce stage order, same flag gates both.
- **HIGH — lost INSERT via clock skew** → Stage 0 makes `updated_at` server-set on insert; watermark only
  ever advances from server `MAX(updated_at)`, never device `Date.now()`.
- **HIGH — missed DELETE under partial pull** → cursor on server `updated_at` (bumped by soft-delete); keep
  pulling `deleted_at` rows.
- **HIGH — under-inclusive dirty tracking strands an edit** → mark dirty at every `updatedAt` bump site +
  merge emits changed ids; Stage 4 reconcile is the backstop; over-inclusion is a safe no-op.
- **HIGH — dirty-clear race** → clear only ids whose `updatedAt` is unchanged since the push snapshot
  (mirror the `_rerunRequested` pattern, personalSync.ts:739-746).
- **MED** — pagination boundary loss; long-offline missed delete; per-table `mergeFn` skew tiebreak gap;
  debounce coverage gaps. See mitigations in stages 3/4/5.

## Open questions (decide before/while building)

1. Exact tombstone retention (maps cite both 180d and 30d) vs max offline window — sets the Stage-4 threshold.
2. `personal_contacts` has no `client_edit_at` — add it for true LWW parity, or accept server-write-order?
3. Transfers carry no local `updatedAt` (treated immutable) — confirm a transfer edit never needs to win LWW.
4. Per-table watermarks (safer, more state) vs one per-user watermark (simpler, coarser)?
5. Migrate `sellerSync.ts` with the same pattern later, or leave as-is?
6. Telemetry channel for the Stage-4 integrity check during gradual rollout?
