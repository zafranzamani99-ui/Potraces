import type { Transaction } from '../types';

/** Find a recent duplicate transaction matching the given shape.
 *  Duplicate = same amount (± 0.01) + same wallet + same type, created
 *  within the last `windowMinutes` minutes. Returns null if no match.
 */
export function findRecentDuplicate(
  transactions: Transaction[],
  candidate: { amount: number; walletId?: string; type: Transaction['type'] },
  windowMinutes = 10,
): Transaction | null {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  for (const t of transactions) {
    if (t.type !== candidate.type) continue;
    if (t.walletId !== candidate.walletId) continue;
    if (Math.abs(t.amount - candidate.amount) > 0.01) continue;
    const created = t.createdAt instanceof Date
      ? t.createdAt.getTime()
      : new Date(t.createdAt as any).getTime();
    if (!isNaN(created) && now - created < windowMs) return t;
  }
  return null;
}

/** Same-day duplicate (design doc §10 — cross-channel guard): same wallet +
 *  sen-exact amount + same type, created on the same LOCAL calendar day as
 *  `now` but MORE than `recentWindowMinutes` ago — the recent window stays
 *  findRecentDuplicate's job, so the two checks partition the day with no
 *  overlap. `now` is injectable for tests. Returns null if no match.
 */
export function findSameDayDuplicate(
  transactions: Transaction[],
  candidate: { amount: number; walletId?: string; type: Transaction['type']; now?: Date },
  recentWindowMinutes = 10,
): Transaction | null {
  const now = candidate.now ?? new Date();
  const windowMs = recentWindowMinutes * 60 * 1000;
  const candidateSen = Math.round((Number(candidate.amount) || 0) * 100);
  for (const t of transactions) {
    if (t.type !== candidate.type) continue;
    if (t.walletId !== candidate.walletId) continue;
    if (Math.round(t.amount * 100) !== candidateSen) continue;
    const created = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt as any);
    if (isNaN(created.getTime())) continue;
    // ≤ the recent window (or clock-skew future) → the 10-minute guard owns it.
    if (now.getTime() - created.getTime() <= windowMs) continue;
    if (
      created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth() &&
      created.getDate() === now.getDate()
    ) return t;
  }
  return null;
}
