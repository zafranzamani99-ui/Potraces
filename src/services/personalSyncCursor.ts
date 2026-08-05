/**
 * personalSyncCursor — pure cursor-pull rules (incremental sync Stage 3, see
 * docs/INCREMENTAL_SYNC_PLAN.md). No RN/store/Supabase imports, so the rules
 * are unit-testable under plain tsx (scripts/test-sync-cursor.ts).
 *
 * The contract that makes a cursor pull safe:
 *  1. Cursor filters on the SERVER-stamped `updated_at` (Stage-0b trigger
 *     migration 20260805000000), never on client time.
 *  2. Inclusive lower bound with a small OVERLAP — boundary rows committed in
 *     the same instant as the watermark are re-pulled and absorbed by the
 *     id-keyed idempotent merge (mergeById union), never lost.
 *  3. The watermark only ever advances from the server's own MAX(updated_at)
 *     SEEN in pulled rows, after a fully-successful pull+push — never from
 *     device time, never backward.
 *  4. A missing/stale watermark forces a FULL pull (the self-healing net the
 *     full sync gives for free): first run, account switch, or a watermark
 *     older than the server tombstone-purge window.
 */

// Re-pull this far behind the watermark to absorb same-instant boundary rows.
export const CURSOR_OVERLAP_MS = 2_000; // matches SKEW_MS in personalSyncMerge

// Server soft-deletes are purged after ~90 days (purge_personal_tombstones).
// A device whose watermark is older than that can have MISSED a purged
// tombstone → force a full pull so the delete re-propagates. 80d leaves margin.
export const FORCE_FULL_AFTER_MS = 80 * 24 * 60 * 60 * 1000;

/**
 * The `.gte('updated_at', …)` lower bound for a cursor pull, or null for a
 * FULL pull (no watermark yet — first run / account switch / post-wipe).
 */
export function cursorSince(watermark: string | null | undefined, nowMs: number): string | null {
  if (!watermark) return null;
  const wm = Date.parse(watermark);
  if (Number.isNaN(wm)) return null;
  if (nowMs - wm > FORCE_FULL_AFTER_MS) return null; // stale → full reconcile
  return new Date(wm - CURSOR_OVERLAP_MS).toISOString();
}

/**
 * The newest server updated_at actually SEEN in a pulled page set, as an ISO
 * string, or null when nothing was pulled. Compared via Date.parse (PostgREST
 * timestamptz strings are ISO-8601; parse is safer than lexicographic compare
 * across microsecond/offset formatting).
 */
export function maxSeenUpdatedAt(rows: readonly { updated_at?: unknown }[]): string | null {
  let max = -Infinity;
  for (const r of rows) {
    if (typeof r?.updated_at !== 'string') continue;
    const t = Date.parse(r.updated_at);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max === -Infinity ? null : new Date(max).toISOString();
}

/**
 * The watermark to persist after a fully-successful pull+push: the stored one
 * versus what this cycle saw, whichever is NEWER. Never goes backward; a cycle
 * that saw nothing keeps the stored watermark (re-querying an empty delta is
 * cheap and safe).
 */
export function advanceWatermark(
  stored: string | null | undefined,
  seen: string | null | undefined,
): string | null {
  const s = stored ? Date.parse(stored) : NaN;
  const n = seen ? Date.parse(seen) : NaN;
  const sValid = !Number.isNaN(s);
  const nValid = !Number.isNaN(n);
  if (sValid && nValid) return new Date(Math.max(s, n)).toISOString();
  if (nValid) return new Date(n).toISOString();
  return sValid ? new Date(s).toISOString() : null;
}
