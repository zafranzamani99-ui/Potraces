import { Playbook, PlaybookLineItem, PlaybookStats, Transaction } from '../types';
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

  // Merged allocation map: line items with categories take precedence
  const catAllocMap: Record<string, number> = {};
  for (const a of playbook.allocations) catAllocMap[a.category] = a.allocatedAmount;
  for (const li of (playbook.lineItems || [])) {
    if (li.category) catAllocMap[li.category] = (catAllocMap[li.category] || 0) + li.plannedAmount;
  }

  const categoryBreakdown = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, spent]) => ({
      category,
      spent,
      allocated: catAllocMap[category],
      percentOfTotal: totalSpent > 0 ? (spent / totalSpent) * 100 : 0,
    }));

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

/** Compute summary stats for notebook line items. */
export function computeNotebookStats(lineItems: PlaybookLineItem[]): {
  totalPlanned: number;
  totalPaid: number;
  totalUnpaid: number;
  paidCount: number;
  totalCount: number;
} {
  let totalPlanned = 0;
  let totalPaid = 0;
  let paidCount = 0;
  for (const li of lineItems) {
    totalPlanned += li.plannedAmount;
    if (li.isPaid) {
      totalPaid += li.actualAmount ?? li.plannedAmount;
      paidCount++;
    }
  }
  return {
    totalPlanned,
    totalPaid,
    totalUnpaid: totalPlanned - totalPaid,
    paidCount,
    totalCount: lineItems.length,
  };
}

// ─── Live Stats (time-aware dashboard metrics) ─────────────

export interface LiveStatsData {
  remaining: number;
  burnRate: number;
  daysLeft: number;
  daysElapsed: number;
  totalDays: number;
  paceRatio: number;       // >1 = spending faster than time passing
  projectedRemaining: number;
}

export function computeLiveStats(playbook: Playbook, stats: PlaybookStats): LiveStatsData {
  const now = new Date();
  const startDate = playbook.startDate instanceof Date ? playbook.startDate : new Date(playbook.startDate);
  const endDate = playbook.endDate
    ? (playbook.endDate instanceof Date ? playbook.endDate : new Date(playbook.endDate))
    : (playbook.suggestedEndDate instanceof Date ? playbook.suggestedEndDate : new Date(playbook.suggestedEndDate));

  const totalDays = Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
  const daysElapsed = Math.max(1, Math.min(differenceInCalendarDays(now, startDate) + 1, totalDays));
  const daysLeft = Math.max(0, differenceInCalendarDays(endDate, now));

  const remaining = playbook.sourceAmount - stats.totalSpent;
  const burnRate = stats.dailyBurnRate;

  const timeRatio = daysElapsed / totalDays;
  const spendRatio = stats.percentSpent / 100;
  const paceRatio = timeRatio > 0 ? spendRatio / timeRatio : 0;

  const projectedRemaining = playbook.sourceAmount - (burnRate * totalDays);

  return { remaining, burnRate, daysLeft, daysElapsed, totalDays, paceRatio, projectedRemaining };
}

// ─── Spending Reality (category breakdown from linked transactions) ──

export interface SpendingCategoryItem {
  category: string;
  spent: number;
  percentOfTotal: number;
  isPlanned: boolean;
  transactionCount: number;
  allocatedAmount?: number;
}

export function computeSpendingReality(
  playbook: Playbook,
  allTransactions: Transaction[],
): SpendingCategoryItem[] {
  const linkedSet = new Set(playbook.linkedExpenseIds);
  const linkedTxns = allTransactions.filter((t) => linkedSet.has(t.id) && t.playbookLinks);

  const catMap: Record<string, { spent: number; count: number }> = {};
  let totalSpent = 0;

  for (const tx of linkedTxns) {
    const link = tx.playbookLinks?.find((l) => l.playbookId === playbook.id);
    if (!link) continue;
    totalSpent += link.amount;
    if (!catMap[tx.category]) catMap[tx.category] = { spent: 0, count: 0 };
    catMap[tx.category].spent += link.amount;
    catMap[tx.category].count++;
  }

  // Build set of "planned" categories from allocations + line items
  const plannedCategories = new Set<string>();
  for (const a of playbook.allocations) plannedCategories.add(a.category.toLowerCase());
  for (const li of (playbook.lineItems || [])) {
    plannedCategories.add(li.label.toLowerCase());
    if (li.category) plannedCategories.add(li.category.toLowerCase());
  }

  // Category allocation map from line items (sum if multiple) + fallback to allocations
  const spendAllocMap: Record<string, number> = {};
  for (const a of playbook.allocations) {
    if (!spendAllocMap[a.category]) spendAllocMap[a.category] = a.allocatedAmount;
  }
  for (const li of (playbook.lineItems || [])) {
    if (li.category) spendAllocMap[li.category] = (spendAllocMap[li.category] || 0) + li.plannedAmount;
  }

  return Object.entries(catMap)
    .sort((a, b) => b[1].spent - a[1].spent)
    .map(([category, data]) => ({
      category,
      spent: data.spent,
      percentOfTotal: totalSpent > 0 ? (data.spent / totalSpent) * 100 : 0,
      isPlanned: plannedCategories.has(category.toLowerCase()),
      transactionCount: data.count,
      allocatedAmount: spendAllocMap[category],
    }));
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
