/**
 * budgetMath — pure money math for the Budget screen.
 *
 * Extracted from BudgetPlanning.tsx so the headline "free to spend" logic is
 * unit-testable (see scripts/test-budget-math.ts). Every function takes `now`
 * explicitly and reads nothing from the environment, so results are
 * deterministic. No React / native imports → tsx-loadable.
 *
 * Model (LOCKED 2026-07-17): the headline is BUDGETED-MONEY-ONLY.
 *   totalAllocated   = Σ effectiveAmount × monthlyFactor(period)   (weekly ×52/12, yearly ÷12)
 *   totalBudgetSpent = Σ monthSpent                                (real calendar-month RM, no factor)
 *   budgetLeft       = max(totalAllocated − totalBudgetSpent, 0)
 *   dailyFigure      = freeToSpend / daysRemaining                 (the one headline number)
 * Bills + goals are NOT subtracted here — they live in the commitments card.
 * Rollover: when a budget's `rollover` is on, last period's unspent lifts this
 * period's effective limit (one period only).
 */
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subWeeks, subMonths, subYears, isWithinInterval, getDaysInMonth, getDate,
} from 'date-fns';
import { Budget, Transaction } from '../../types';

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly';

/** Normalize a period allocation to a monthly-equivalent amount. */
export const monthlyFactor = (period: BudgetPeriod): number =>
  period === 'weekly' ? 52 / 12 : period === 'yearly' ? 1 / 12 : 1;

/** Current period window for a budget. Weeks start Monday. */
export const getPeriodInterval = (period: BudgetPeriod, now: Date): { start: Date; end: Date } => {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'yearly':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'monthly':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
};

/** Previous period window — shift `now` back exactly one period (rollover carry). */
export const getPreviousPeriodInterval = (period: BudgetPeriod, now: Date): { start: Date; end: Date } => {
  const shifted =
    period === 'weekly' ? subWeeks(now, 1)
    : period === 'yearly' ? subYears(now, 1)
    : subMonths(now, 1);
  return getPeriodInterval(period, shifted);
};

/** Sum finite expense amounts in one category within [start, end]. */
export function sumExpenses(transactions: Transaction[], category: string, start: Date, end: Date): number {
  return transactions
    .filter((t) => t.type === 'expense' && t.category === category && isWithinInterval(t.date, { start, end }))
    .reduce((sum, t) => sum + (Number.isFinite(t.amount) ? t.amount : 0), 0);
}

export interface BudgetRowMath {
  spentAmount: number;    // period-scoped spend (drives per-category ring + detail)
  monthSpent: number;     // calendar-month spend (drives the hero headline)
  carry: number;          // rollover carry from the previous period (0 unless rollover on)
  effectiveAmount: number; // allocated + carry — the real limit
}

/** Per-budget derived amounts (spent / monthSpent / rollover carry / effective limit). */
export function computeBudgetRow(budget: Budget, transactions: Transaction[], now: Date): BudgetRowMath {
  const period = budget.period as BudgetPeriod;
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const { start, end } = getPeriodInterval(period, now);

  const spentAmount = sumExpenses(transactions, budget.category, start, end);
  const monthSpent = sumExpenses(transactions, budget.category, monthStart, monthEnd);

  const allocated = Number.isFinite(budget.allocatedAmount) ? budget.allocatedAmount : 0;
  let carry = 0;
  if (budget.rollover) {
    const prev = getPreviousPeriodInterval(period, now);
    // Rollover carries LEFTOVER from the PRIOR period. If the budget didn't exist
    // for that whole prior period, there is no leftover to carry — else prevSpent=0
    // fabricates a full extra allocation, doubling the limit and the "free to spend"
    // hero on a brand-new rollover budget (or any category with no prior spend).
    const startedMs = new Date(budget.startDate ?? budget.createdAt).getTime();
    const existedPriorPeriod = Number.isFinite(startedMs) && startedMs <= prev.start.getTime();
    if (existedPriorPeriod) {
      const prevSpent = sumExpenses(transactions, budget.category, prev.start, prev.end);
      carry = Math.max(allocated - prevSpent, 0);
    }
  }
  return { spentAmount, monthSpent, carry, effectiveAmount: allocated + carry };
}

/** A budget row as consumed by the hero: only the fields the headline needs. */
export interface HeroBudgetRow {
  period: BudgetPeriod;
  effectiveAmount: number;
  monthSpent: number;
  spentAmount: number;
}

// Generic over the row type so `overBudgets` keeps the caller's full budget
// shape (the screen reads .category / .allocatedAmount off these rows).
export interface HeroMoney<T extends HeroBudgetRow = HeroBudgetRow> {
  totalAllocated: number;
  totalBudgetSpent: number;
  budgetLeft: number;
  freeToSpend: number;
  daysInMonth: number;
  dayOfMonth: number;
  daysRemaining: number;
  dailyFigure: number;
  percentElapsed: number;
  percentSpent: number;
  paceRatio: number;
  dailyBurn: number;
  runwayDays: number;
  runsOutOnDay: number;
  stretchesWholeMonth: boolean;
  runwayOverage: number;
  alreadyOver: boolean;
  overBudgets: T[];
  totalOverBy: number;
  totalIncome: number;
  totalSpent: number;
}

/**
 * The hero headline money model. `rows` are budgets with their computed
 * effectiveAmount / monthSpent / spentAmount; income/expenses are the
 * calendar-month totals (used only for the no-budgets income fallback).
 */
export function computeHeroMoney<T extends HeroBudgetRow>(
  rows: T[],
  now: Date,
  totals: { totalIncome: number; totalExpenses: number },
): HeroMoney<T> {
  const { totalIncome, totalExpenses } = totals;

  const totalAllocated = rows.reduce(
    (sum, b) => sum + (Number.isFinite(b.effectiveAmount) ? b.effectiveAmount * monthlyFactor(b.period) : 0), 0);
  // Real spend this month — NOT multiplied by the factor (no extrapolation).
  const totalBudgetSpent = rows.reduce(
    (sum, b) => sum + (Number.isFinite(b.monthSpent) ? b.monthSpent : 0), 0);

  const overBudgets = rows.filter((b) => b.spentAmount > b.effectiveAmount);
  const totalOverBy = overBudgets.reduce((s, b) => s + (b.spentAmount - b.effectiveAmount), 0);

  const budgetLeft = Math.max(totalAllocated - totalBudgetSpent, 0);
  const freeToSpend = totalAllocated > 0 ? budgetLeft : Math.max(totalIncome - totalExpenses, 0);

  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = getDate(now);
  const daysRemaining = Math.max(daysInMonth - dayOfMonth + 1, 1);
  // THE single headline number. 0 only when budgets are genuinely exhausted.
  const dailyFigure = freeToSpend / daysRemaining;

  const percentElapsed = dayOfMonth / daysInMonth;
  const percentSpent = totalAllocated > 0
    ? totalBudgetSpent / totalAllocated
    : totalIncome > 0 ? totalExpenses / totalIncome : 0;
  const paceRatio = percentElapsed > 0 ? percentSpent / percentElapsed : 0;

  // Runway prediction — budget baseline, burn floored at 3 days.
  const daysElapsed = Math.max(dayOfMonth, 3);
  const runwayBaseline = totalAllocated > 0 ? totalAllocated : totalIncome;
  const runwayBurn = totalAllocated > 0 ? totalBudgetSpent / daysElapsed : totalExpenses / daysElapsed;
  const runwayDays = runwayBurn > 0 && runwayBaseline > 0
    ? Math.floor(runwayBaseline / runwayBurn)
    : daysInMonth + 10;

  return {
    totalAllocated,
    totalBudgetSpent,
    budgetLeft,
    freeToSpend,
    daysInMonth,
    dayOfMonth,
    daysRemaining,
    dailyFigure,
    percentElapsed,
    percentSpent,
    paceRatio,
    dailyBurn: runwayBurn,
    runwayDays,
    runsOutOnDay: Math.min(runwayDays, daysInMonth + 5),
    stretchesWholeMonth: overBudgets.length === 0 && runwayDays >= daysInMonth,
    runwayOverage: Math.max(runwayDays - daysInMonth, 0),
    alreadyOver: overBudgets.length > 0,
    overBudgets,
    totalOverBy,
    totalIncome,
    totalSpent: totalExpenses,
  };
}
