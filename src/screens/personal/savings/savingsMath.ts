/**
 * savingsMath — PURE portfolio math for the Savings & Investments screen.
 *
 * Extracted verbatim (behaviour-preserving) from the old SavingsTracker memos,
 * then made deterministic by taking `now` as a parameter and keyed-by-id so the
 * allocation list can't collide. No React / native imports → tsx-testable.
 */
import {
  startOfMonth, endOfMonth, isWithinInterval, differenceInDays, subMonths, format,
} from 'date-fns';
import { SavingsAccount, SavingsSortBy } from '../../../types';
import { roundMoney } from '../../../utils/money';
import { getTypeInfo, classOf, TypeInfo, SavingsClass, CustomResolver } from './investmentTypes';

/** Milestone ladder for the "next milestone" nudge. */
export const MILESTONES = [
  1000, 2500, 5000, 10000, 15000, 20000, 25000, 50000,
  75000, 100000, 150000, 200000, 250000, 500000, 1000000,
];

const toDate = (v: Date | string | number): Date => (v instanceof Date ? v : new Date(v));

export interface Portfolio {
  totalCurrent: number;
  totalInvested: number;
  totalGain: number;
  totalReturn: number;
  monthContributed: number;
  monthUpdates: number;
  monthValueChange: number;
  fullSparkline: { date: string; value: number }[];
}

/** Portfolio aggregate over a set of accounts (pass the full list or one tab's). */
export function computePortfolio(accounts: SavingsAccount[], now: Date): Portfolio {
  const totalCurrent = accounts.reduce((s, a) => s + a.currentValue, 0);
  const totalInvested = accounts.reduce((s, a) => s + a.initialInvestment, 0);
  const totalGain = totalCurrent - totalInvested;
  const totalReturn = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);
  let monthContributed = 0;
  let monthUpdates = 0;
  for (const a of accounts) {
    for (let i = 1; i < a.history.length; i++) {
      const d = toDate(a.history[i].date);
      if (isWithinInterval(d, { start: mStart, end: mEnd })) {
        const diff = a.history[i].value - a.history[i - 1].value;
        if (diff > 0) monthContributed += diff;
        monthUpdates++;
      }
    }
  }

  let totalAtMonthStart = 0;
  for (const a of accounts) {
    const beforeMonth = a.history.filter((h) => toDate(h.date) < mStart);
    totalAtMonthStart += beforeMonth.length > 0
      ? beforeMonth[beforeMonth.length - 1].value
      : a.initialInvestment;
  }
  const monthValueChange = totalCurrent - totalAtMonthStart;

  // Date-merged sparkline: carry each account's latest snapshot forward per day.
  const dateMap = new Map<string, Map<string, number>>();
  for (const a of accounts) {
    for (const h of a.history) {
      const key = format(toDate(h.date), 'yyyy-MM-dd');
      if (!dateMap.has(key)) dateMap.set(key, new Map());
      dateMap.get(key)!.set(a.id, h.value);
    }
  }
  const sortedDates = Array.from(dateMap.keys()).sort();
  const latestValues = new Map<string, number>();
  const fullSparkline: { date: string; value: number }[] = [];
  for (const dateKey of sortedDates) {
    for (const [aid, val] of dateMap.get(dateKey)!) latestValues.set(aid, val);
    let total = 0;
    for (const val of latestValues.values()) total += val;
    fullSparkline.push({ date: dateKey, value: total });
  }

  return {
    totalCurrent, totalInvested, totalGain, totalReturn,
    monthContributed, monthUpdates, monthValueChange, fullSparkline,
  };
}

/** Split accounts into savings vs investment buckets by risk class. */
export function classifyAccounts(
  accounts: SavingsAccount[],
  resolveCustom?: CustomResolver,
): { savings: SavingsAccount[]; investments: SavingsAccount[] } {
  const savings: SavingsAccount[] = [];
  const investments: SavingsAccount[] = [];
  for (const a of accounts) {
    (classOf(a.type, resolveCustom) === 'investment' ? investments : savings).push(a);
  }
  return { savings, investments };
}

export interface AllocSlice {
  id: string;
  name: string;
  color: string;
  class: SavingsClass;
  value: number;
  pct: number;
}

/** Allocation by instrument type — keyed by canonical type id (never by name). */
export function computeBreakdown(accounts: SavingsAccount[], resolveCustom?: CustomResolver): AllocSlice[] {
  const map: Record<string, { info: TypeInfo; value: number }> = {};
  for (const a of accounts) {
    const info = getTypeInfo(a.type, resolveCustom);
    if (!map[info.id]) map[info.id] = { info, value: 0 };
    map[info.id].value += a.currentValue;
  }
  const total = Object.values(map).reduce((s, v) => s + v.value, 0);
  return Object.values(map)
    .map(({ info, value }) => ({
      id: info.id,
      name: info.name,
      color: info.color,
      class: info.class,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface AccountDerived {
  account: SavingsAccount;
  typeInfo: TypeInfo;
  gain: number;
  returnPct: number;
  monthGain: number;
  /** months until `target` at the recent 3-month pace, or null if not projectable / >120mo */
  goalEtaMonths: number | null;
  projectedAnnual: number | null;
}

/** Per-account derived stats (gain, return, monthly gain, goal ETA, projection). */
export function computeAccountDerived(account: SavingsAccount, now: Date, resolveCustom?: CustomResolver): AccountDerived {
  const typeInfo = getTypeInfo(account.type, resolveCustom);
  const gain = account.currentValue - account.initialInvestment;
  const returnPct = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;

  const mStart = startOfMonth(now);
  const beforeMonth = account.history.filter((h) => toDate(h.date) < mStart);
  const monthStartVal = beforeMonth.length > 0 ? beforeMonth[beforeMonth.length - 1].value : account.initialInvestment;
  const monthGain = account.currentValue - monthStartVal;

  let goalEtaMonths: number | null = null;
  if (account.target && account.target > account.currentValue) {
    const remaining = account.target - account.currentValue;
    const threeMonthsAgo = subMonths(now, 3);
    const recent = account.history.filter((h) => toDate(h.date) >= threeMonthsAgo);
    if (recent.length >= 2) {
      const oldVal = recent[0].value;
      const newVal = recent[recent.length - 1].value;
      const monthsElapsed = Math.max(differenceInDays(toDate(recent[recent.length - 1].date), toDate(recent[0].date)) / 30.44, 0.5);
      const monthlyRate = (newVal - oldVal) / monthsElapsed;
      if (monthlyRate > 0) {
        const months = Math.ceil(remaining / monthlyRate);
        if (months <= 120) goalEtaMonths = months;
      }
    }
  }

  const projectedAnnual = account.annualRate && account.annualRate > 0
    ? account.currentValue * account.annualRate / 100 : null;

  return { account, typeInfo, gain, returnPct, monthGain, goalEtaMonths, projectedAnnual };
}

/** Sort derived accounts per the chosen sort mode (manual respects accountOrder). */
export function sortDerived(list: AccountDerived[], sortBy: SavingsSortBy, accountOrder: string[]): AccountDerived[] {
  const copy = [...list];
  switch (sortBy) {
    case 'value':
      return copy.sort((a, b) => b.account.currentValue - a.account.currentValue);
    case 'return':
      return copy.sort((a, b) => b.returnPct - a.returnPct);
    case 'updated':
      return copy.sort((a, b) => toDate(b.account.updatedAt).getTime() - toDate(a.account.updatedAt).getTime());
    case 'manual':
    default:
      if (accountOrder.length > 0) {
        return copy.sort((a, b) => {
          const ai = accountOrder.indexOf(a.account.id);
          const bi = accountOrder.indexOf(b.account.id);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
      }
      return copy;
  }
}

export interface Runway {
  months: number;      // Infinity if no spending data
  targetMonths: number;
  gapToTarget: number; // extra RM needed to hit targetMonths (0 if already there)
}

/** Emergency-fund runway: how many months of spending the savings covers. */
export function emergencyRunway(savingsValue: number, avgMonthlySpend: number, targetMonths = 6): Runway {
  const months = avgMonthlySpend > 0 ? savingsValue / avgMonthlySpend : Infinity;
  const needed = avgMonthlySpend * targetMonths;
  const gapToTarget = roundMoney(Math.max(0, needed - savingsValue));
  return { months, targetMonths, gapToTarget };
}

/** Nearest un-reached milestone above the current total. */
export function nextMilestone(total: number): { value: number; remaining: number; pct: number } | null {
  const value = MILESTONES.find((m) => m > total);
  if (!value) return null;
  return { value, remaining: roundMoney(value - total), pct: (total / value) * 100 };
}

/** Largest single slice — for the concentration nudge. */
export function topConcentration(slices: AllocSlice[]): AllocSlice | null {
  return slices.length ? slices[0] : null;
}
