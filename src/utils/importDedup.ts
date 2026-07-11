import type { Transaction } from '../types';

/** The fields that identify a transaction for import-dedup purposes. */
export type ImportRowKey = {
  amount: number;
  type: Transaction['type'];
  date: Date | string | number;
  description?: string;
  walletId?: string;
};

/** Local calendar-day key (YYYY-MM-DD). Bank rows are date-only; time/createdAt is irrelevant. */
function dayKey(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return 'invalid';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Content-identity key: same wallet + calendar day + amount (to the sen) + type +
 * normalized description = the same real-world transaction. Deliberately ignores
 * createdAt, so re-importing a file days later still matches the first import.
 */
export function importRowKey(r: ImportRowKey): string {
  return [
    r.walletId ?? '',
    dayKey(r.date),
    Math.round((Number(r.amount) || 0) * 100), // sen — exact, no float drift
    r.type,
    (r.description ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
}

/**
 * Count-aware import dedup. Returns a boolean[] parallel to `candidates`:
 * `true` = import (new), `false` = skip (an equal transaction already exists).
 *
 * Multiset-aware: N identical candidates are only skipped while N matching
 * existing transactions remain unmatched — so re-importing the same file is a
 * no-op, yet genuinely repeated same-day purchases are preserved (and a partial
 * re-import tops up only the missing copies).
 */
export function markNewImportRows(existing: Transaction[], candidates: ImportRowKey[]): boolean[] {
  const remaining = new Map<string, number>();
  for (const t of existing) {
    const k = importRowKey(t);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  return candidates.map((c) => {
    const k = importRowKey(c);
    const n = remaining.get(k) ?? 0;
    if (n > 0) {
      remaining.set(k, n - 1); // consume one existing match → this candidate is a duplicate
      return false;
    }
    return true;
  });
}
