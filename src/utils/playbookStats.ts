import { Playbook, PlaybookLineItem, PlaybookStats, Transaction } from '../types';
import { differenceInCalendarDays, startOfDay, endOfDay } from 'date-fns';
import { roundMoney } from './money';

/** Coerce a value to a Date, returning null if invalid/missing. */
function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve the playbook's tracking window.
 * start = playbook.startDate; end = playbook.endDate ?? playbook.suggestedEndDate.
 * Returns null start/end if a bound can't be coerced to a valid Date.
 */
export function resolvePlaybookWindow(playbook: Playbook): { start: Date | null; end: Date | null } {
  const start = toDate(playbook.startDate);
  const end = toDate(playbook.endDate ?? playbook.suggestedEndDate);
  // Normalize to whole-day bounds so same-day boundary spend isn't missed
  // (start/end otherwise carry the salary's creation time-of-day).
  return { start: start ? startOfDay(start) : null, end: end ? endOfDay(end) : null };
}

/**
 * True if tx is an expense whose date falls within [start, end] inclusive.
 * Window bounds and tx.date are coerced to Date; invalid → excluded.
 */
export function isInWindow(tx: Transaction, start: Date | null, end: Date | null): boolean {
  if (tx.type !== 'expense') return false;
  if (!start || !end) return false;
  const d = toDate(tx.date);
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function computePlaybookStats(
  playbook: Playbook,
  allTransactions: Transaction[],
): PlaybookStats {
  // Actual spend derives from ALL expense transactions in the playbook's window,
  // grouped by tx.category. No explicit links are consulted.
  const { start, end } = resolvePlaybookWindow(playbook);
  const windowTxns = allTransactions.filter((t) => isInWindow(t, start, end));

  let totalSpent = 0;
  const catMap: Record<string, number> = {};

  for (const tx of windowTxns) {
    totalSpent += tx.amount;
    catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
  }
  totalSpent = roundMoney(totalSpent);

  const remaining = playbook.sourceAmount - totalSpent;
  const percentSpent = playbook.sourceAmount > 0
    ? (totalSpent / playbook.sourceAmount) * 100
    : 0;

  // Planned/allocated per category comes from lineItems ONLY (authoritative).
  // Allocations are legacy and ignored for stats — migration clears them.
  const catAllocMap: Record<string, number> = {};
  for (const li of (playbook.lineItems || [])) {
    if (li.category) catAllocMap[li.category] = (catAllocMap[li.category] || 0) + li.plannedAmount;
  }

  const categoryBreakdown = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, spent]) => ({
      category,
      spent: roundMoney(spent),
      allocated: catAllocMap[category] !== undefined ? roundMoney(catAllocMap[category]) : undefined,
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
    linkedTransactionCount: windowTxns.length,
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

  return { remaining, burnRate, daysLeft, daysElapsed, totalDays, paceRatio };
}

// ─── Spending Reality (category breakdown from window expenses) ──

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
  const { start, end } = resolvePlaybookWindow(playbook);
  const windowTxns = allTransactions.filter((t) => isInWindow(t, start, end));

  const catMap: Record<string, { spent: number; count: number }> = {};
  let totalSpent = 0;

  for (const tx of windowTxns) {
    totalSpent += tx.amount;
    if (!catMap[tx.category]) catMap[tx.category] = { spent: 0, count: 0 };
    catMap[tx.category].spent += tx.amount;
    catMap[tx.category].count++;
  }

  // Build set of "planned" categories from line items only (allocations are legacy)
  const plannedCategories = new Set<string>();
  for (const li of (playbook.lineItems || [])) {
    plannedCategories.add(li.label.toLowerCase());
    if (li.category) plannedCategories.add(li.category.toLowerCase());
  }

  // Category allocation map from line items only (sum if multiple)
  const spendAllocMap: Record<string, number> = {};
  for (const li of (playbook.lineItems || [])) {
    if (li.category) spendAllocMap[li.category] = (spendAllocMap[li.category] || 0) + li.plannedAmount;
  }

  return Object.entries(catMap)
    .sort((a, b) => b[1].spent - a[1].spent)
    .map(([category, data]) => ({
      category,
      spent: roundMoney(data.spent),
      percentOfTotal: totalSpent > 0 ? (data.spent / totalSpent) * 100 : 0,
      isPlanned: plannedCategories.has(category.toLowerCase()),
      transactionCount: data.count,
      allocatedAmount: spendAllocMap[category] !== undefined ? roundMoney(spendAllocMap[category]) : undefined,
    }));
}

// ─── Plan vs Actual (close-out "where the money went") ───────

export interface PlanVsActualRow {
  category: string;
  planned: number;   // sum of lineItems[cat].plannedAmount
  actual: number;    // sum of window expense amounts for txns with that category
  overBy: number;    // max(actual - planned, 0)
}

/**
 * Derive per-category planned-vs-actual from window expenses.
 * planned = sum of lineItems[category].plannedAmount (the dead actualAmount field is NOT used).
 * actual  = sum of expense amounts within the playbook window, grouped by tx.category.
 * Includes categories that were planned but never spent, and spent-but-unplanned categories.
 * Sorted by actual desc. All sums rounded to 2dp.
 */
export function computePlanVsActual(
  playbook: Playbook,
  allTransactions: Transaction[],
): PlanVsActualRow[] {
  const { start, end } = resolvePlaybookWindow(playbook);
  const windowTxns = allTransactions.filter((t) => isInWindow(t, start, end));

  const actualMap: Record<string, number> = {};
  for (const tx of windowTxns) {
    actualMap[tx.category] = (actualMap[tx.category] || 0) + tx.amount;
  }

  const plannedMap: Record<string, number> = {};
  for (const li of (playbook.lineItems || [])) {
    if (li.category) plannedMap[li.category] = (plannedMap[li.category] || 0) + li.plannedAmount;
  }

  const categories = new Set<string>([...Object.keys(actualMap), ...Object.keys(plannedMap)]);

  return Array.from(categories)
    .map((category) => {
      const planned = roundMoney(plannedMap[category] || 0);
      const actual = roundMoney(actualMap[category] || 0);
      return { category, planned, actual, overBy: roundMoney(Math.max(actual - planned, 0)) };
    })
    .sort((a, b) => b.actual - a.actual);
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
