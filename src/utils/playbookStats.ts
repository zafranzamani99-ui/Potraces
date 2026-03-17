import { Playbook, PlaybookStats, Transaction } from '../types';
import { differenceInCalendarDays } from 'date-fns';

export function computePlaybookStats(
  playbook: Playbook,
  allTransactions: Transaction[],
): PlaybookStats {
  // O(1) lookup instead of O(n) Array.includes per transaction
  const linkedSet = new Set(playbook.linkedExpenseIds);

  const linkedTxns = allTransactions.filter(
    (t) => linkedSet.has(t.id) && t.playbookLinks,
  );

  let totalSpent = 0;
  const catMap: Record<string, number> = {};

  for (const tx of linkedTxns) {
    const link = tx.playbookLinks?.find((l) => l.playbookId === playbook.id);
    if (!link) continue;
    totalSpent += link.amount;
    catMap[tx.category] = (catMap[tx.category] || 0) + link.amount;
  }

  const remaining = playbook.sourceAmount - totalSpent;
  const percentSpent = playbook.sourceAmount > 0
    ? (totalSpent / playbook.sourceAmount) * 100
    : 0;

  const categoryBreakdown = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, spent]) => {
      const alloc = playbook.allocations.find((a) => a.category === category);
      return {
        category,
        spent,
        allocated: alloc?.allocatedAmount,
        percentOfTotal: totalSpent > 0 ? (spent / totalSpent) * 100 : 0,
      };
    });

  const startDate = playbook.startDate instanceof Date
    ? playbook.startDate
    : new Date(playbook.startDate);
  const endRef = playbook.endDate
    ? (playbook.endDate instanceof Date ? playbook.endDate : new Date(playbook.endDate))
    : new Date();
  const daysActive = Math.max(1, differenceInCalendarDays(endRef, startDate) + 1);

  const dailyBurnRate = totalSpent / daysActive;

  const daysUntilEmpty = dailyBurnRate > 0 && remaining > 0
    ? Math.ceil(remaining / dailyBurnRate)
    : undefined;

  return {
    totalIncome: playbook.sourceAmount,
    totalSpent,
    remaining: Math.max(remaining, 0),
    percentSpent: Math.min(percentSpent, 100),
    categoryBreakdown,
    linkedTransactionCount: linkedTxns.length,
    daysActive,
    dailyBurnRate,
    daysUntilEmpty,
  };
}

export function isOverspent(playbook: Playbook, stats: PlaybookStats): boolean {
  return stats.totalSpent > playbook.sourceAmount;
}

export function getOverspentAmount(playbook: Playbook, stats: PlaybookStats): number {
  return Math.max(stats.totalSpent - playbook.sourceAmount, 0);
}

/** Check if a playbook is past its suggested end date. */
export function isPlaybookStale(playbook: Playbook): boolean {
  if (!playbook.isActive || playbook.isClosed) return false;
  const suggested = playbook.suggestedEndDate instanceof Date
    ? playbook.suggestedEndDate
    : new Date(playbook.suggestedEndDate);
  return new Date() > suggested;
}

/** Remove playbookLinks entries that reference deleted playbooks. */
export function cleanupOrphanedLinks(
  transactions: Transaction[],
  existingPlaybookIds: Set<string>,
): { id: string; playbookLinks: Transaction['playbookLinks'] }[] {
  const updates: { id: string; playbookLinks: Transaction['playbookLinks'] }[] = [];
  for (const tx of transactions) {
    if (!tx.playbookLinks?.length) continue;
    const cleaned = tx.playbookLinks.filter((l) => existingPlaybookIds.has(l.playbookId));
    if (cleaned.length !== tx.playbookLinks.length) {
      updates.push({ id: tx.id, playbookLinks: cleaned.length > 0 ? cleaned : undefined });
    }
  }
  return updates;
}
