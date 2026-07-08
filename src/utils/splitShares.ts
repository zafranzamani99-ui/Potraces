import type { Contact, SplitParticipant } from '../types';

/**
 * Split `total` equally across `contacts`. Mirrors the exact per-person math used
 * by the DebtTracking wizard's `equal` branch: floor to the sen, then hand the
 * leftover remainder to the payer (or the first contact when the payer is not in
 * the list). `isPaid` is true only for the exact `payerId`.
 */
export function computeEqualShares(
  total: number,
  contacts: Contact[],
  payerId: string | null,
): SplitParticipant[] {
  const count = contacts.length;
  if (count === 0) return [];
  const perPerson = Math.floor((total / count) * 100) / 100;
  const remainder = Math.round((total - perPerson * count) * 100) / 100;
  const remainderTargetId =
    payerId && contacts.some((c) => c.id === payerId) ? payerId : contacts[0].id;
  return contacts.map((c) => ({
    contact: c,
    amount: Math.round((perPerson + (c.id === remainderTargetId ? remainder : 0)) * 100) / 100,
    isPaid: payerId != null && c.id === payerId,
  }));
}
