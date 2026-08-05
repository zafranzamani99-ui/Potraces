/**
 * personalSyncDirty — pure dirty-push planning (incremental sync Stage 2, see
 * docs/INCREMENTAL_SYNC_PLAN.md). No RN/store imports so the rules are
 * unit-testable under plain tsx (scripts/test-sync-dirty.ts).
 *
 * The two rules that make dirty push safe:
 *  1. Push targets are ALWAYS filtered to live rows ∖ deleted ids — a
 *     stale/deleted dirty id can never push a ghost row (belt-and-suspenders
 *     with per-delete scrubbing).
 *  2. Dirty ids are cleared ONLY after a fully-successful push, and only for
 *     rows unchanged since the push snapshot — an edit landing mid-push keeps
 *     its dirty mark so the newer version goes out next cycle.
 */

/** Rows to push this cycle: full mode = all live rows; incremental = dirty ∖ deleted. */
export function planPushRows<T extends { id: string }>(
  rows: readonly T[],
  opts: {
    incremental: boolean;
    dirtyIds: readonly string[] | undefined;
    deletedIds?: readonly string[] | undefined;
  },
): T[] {
  const deleted = new Set(opts.deletedIds ?? []);
  if (!opts.incremental) return rows.filter((r) => !deleted.has(r.id));
  const dirty = new Set(opts.dirtyIds ?? []);
  return rows.filter((r) => dirty.has(r.id) && !deleted.has(r.id));
}

export interface PushedSnapshot {
  id: string;
  updatedAt: unknown;
}

/**
 * Race-safe dirty clear — the ids that must STAY dirty after a fully-successful
 * push. An id stays iff:
 *  - it was NOT pushed this round and its row is still live (marked dirty
 *    mid-push, after the snapshot), or
 *  - it WAS pushed but the row's updatedAt changed since the push snapshot
 *    (an edit landed mid-push — the newer version must go out next cycle).
 * Ids whose row is gone (deleted mid-push) are dropped: the tombstone path owns
 * deletes, and a lingering dirty id for a dead row is pure churn (filtered from
 * every future push by planPushRows anyway).
 */
export function planDirtyClear(
  currentDirty: readonly string[] | undefined,
  liveRows: readonly { id: string; updatedAt?: unknown }[],
  pushed: readonly PushedSnapshot[],
): string[] {
  const pushedAt = new Map(pushed.map((p) => [p.id, p.updatedAt]));
  const liveAt = new Map(liveRows.map((r) => [r.id, r.updatedAt]));
  return (currentDirty ?? []).filter((id) => {
    if (!pushedAt.has(id)) return liveAt.has(id);
    return liveAt.get(id) !== pushedAt.get(id);
  });
}
