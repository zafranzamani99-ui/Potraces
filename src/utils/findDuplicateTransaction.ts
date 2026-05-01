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
