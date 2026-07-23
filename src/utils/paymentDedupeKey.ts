/**
 * Pure dedupe-key derivation for logged payments — kept free of native/store
 * imports so it is unit-testable under tsx (see __tests__/paymentDedupeKey.test.ts)
 * and reusable by both the share pipeline and any future auto-log path.
 *
 * The key is the strongest STABLE identity of a payment so the same payment
 * arriving by two paths (a shared screenshot + an auto-log) collapses to one:
 *   - a reference id when the screen shows one, else
 *   - direction | amount | minute-of-datetime | normalized-payee.
 * The datetime is TRUNCATED to the minute (floor, not round) so any two reads
 * within the same displayed minute land in one bucket — round would split them
 * at the 30-second boundary (e.g. :48 → next minute).
 */
export interface DedupeKeyInput {
  refId?: string | null;
  direction?: 'out' | 'in' | null;
  amount?: number | null;
  datetime?: Date | null;
  payee?: string | null;
}

export function dedupeKeyFor(p: DedupeKeyInput): string {
  if (p.refId) return `ref:${p.refId}`;
  const min = p.datetime ? Math.floor(p.datetime.getTime() / 60000) : 'na';
  const payee = (p.payee ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `cmp:${p.direction ?? 'out'}|${p.amount ?? 0}|${min}|${payee}`;
}
