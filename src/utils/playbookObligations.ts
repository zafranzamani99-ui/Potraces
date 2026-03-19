/**
 * Computes obligations (subscriptions + debts) that fall within a playbook's pay period.
 * This is the key differentiator: auto-populated from real data, not typed like notes.
 */

import { format, isWithinInterval, isAfter, isBefore } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { Playbook } from '../types';

// ─── Types ──────────────────────────────────────────────────

export interface PlaybookObligation {
  id: string;
  type: 'subscription' | 'debt';
  label: string;
  amount: number;
  dueDate?: Date;
  meta: string;
  isCovered: boolean;
  sourceId: string;
  category?: string;
}

export interface ObligationsResult {
  items: PlaybookObligation[];
  totalAmount: number;
  coveredAmount: number;
}

// ─── Main Function ──────────────────────────────────────────

export function getPlaybookObligations(
  playbook: Playbook,
  coveredIds: string[],
): ObligationsResult {
  const coveredSet = new Set(coveredIds);
  const items: PlaybookObligation[] = [];

  const startDate = playbook.startDate instanceof Date ? playbook.startDate : new Date(playbook.startDate);
  const endDate = playbook.endDate
    ? (playbook.endDate instanceof Date ? playbook.endDate : new Date(playbook.endDate))
    : (playbook.suggestedEndDate instanceof Date ? playbook.suggestedEndDate : new Date(playbook.suggestedEndDate));

  // ── Subscriptions ──
  const subscriptions = usePersonalStore.getState().subscriptions;
  for (const sub of subscriptions) {
    if (!sub.isActive || sub.isPaused) continue;

    const nextBill = sub.nextBillingDate instanceof Date ? sub.nextBillingDate : new Date(sub.nextBillingDate);
    if (isNaN(nextBill.getTime())) continue;

    // Check if billing date falls within playbook period
    const inRange = isWithinInterval(nextBill, { start: startDate, end: endDate })
      || isBefore(nextBill, startDate); // already due but not yet paid

    if (!inRange) continue;

    const cycleMeta = sub.billingCycle === 'monthly' ? 'monthly'
      : sub.billingCycle === 'yearly' ? 'yearly'
      : sub.billingCycle === 'weekly' ? 'weekly'
      : 'quarterly';

    const dueMeta = !isNaN(nextBill.getTime())
      ? `${cycleMeta} · due ${format(nextBill, 'MMM d')}`
      : cycleMeta;

    items.push({
      id: `sub-${sub.id}`,
      type: 'subscription',
      label: sub.name,
      amount: sub.amount,
      dueDate: nextBill,
      meta: dueMeta,
      isCovered: coveredSet.has(`sub-${sub.id}`),
      sourceId: `sub-${sub.id}`,
      category: sub.category || undefined,
    });
  }

  // ── Debts I owe ──
  const debts = useDebtStore.getState().debts;
  for (const debt of debts) {
    if (debt.type !== 'i_owe') continue;
    if (debt.status === 'settled') continue;

    const remaining = debt.totalAmount - debt.paidAmount;
    if (remaining <= 0) continue;

    let dueMeta = `${remaining.toLocaleString('en-MY')} remaining`;
    let dueDate: Date | undefined;

    if (debt.dueDate) {
      const dd = debt.dueDate instanceof Date ? debt.dueDate : new Date(debt.dueDate);
      if (!isNaN(dd.getTime())) {
        dueDate = dd;
        dueMeta = `due ${format(dd, 'MMM d')} · ${remaining.toLocaleString('en-MY')} remaining`;
      }
    }

    items.push({
      id: `debt-${debt.id}`,
      type: 'debt',
      label: `${debt.contact.name}${debt.description ? ` — ${debt.description}` : ''}`,
      amount: remaining,
      dueDate,
      meta: dueMeta,
      isCovered: coveredSet.has(`debt-${debt.id}`),
      sourceId: `debt-${debt.id}`,
    });
  }

  // Sort: uncovered first, then by due date (soonest first), then by amount descending
  items.sort((a, b) => {
    if (a.isCovered !== b.isCovered) return a.isCovered ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.amount - a.amount;
  });

  let totalAmount = 0;
  let coveredAmount = 0;
  for (const item of items) {
    totalAmount += item.amount;
    if (item.isCovered) coveredAmount += item.amount;
  }

  return { items, totalAmount, coveredAmount };
}
