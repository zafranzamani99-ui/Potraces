// ─────────────────────────────────────────────────────────────
// insights.ts — pure analytics for the Reports & Pulse screens.
//
// No React, no zustand, no formatting/copy: every function takes plain
// arrays + an injectable `now` and returns NUMBERS ONLY. Currency strings
// and i18n copy stay in the screens (for dark-mode + BM/EN parity).
//
// House rules baked in:
//   • `transfer-` ids are NEVER counted as income/expense (realTxns()).
//   • Every denominator is guarded — no NaN/Infinity ever reaches the UI.
//   • Income is never extrapolated (irregular/lumpy income is the norm);
//     only spending pace is projected.
// ─────────────────────────────────────────────────────────────
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  isWithinInterval,
  isValid,
  getDaysInMonth,
  format,
  startOfDay,
  addDays,
  differenceInDays,
} from 'date-fns';
import { Transaction, Subscription, Budget, Goal, CategoryOption } from '../types';

// ─── Time ranges ─────────────────────────────────────────────
export type RangeKey = 'this_month' | 'last_month' | '3m' | '6m' | 'year';
export interface DateRange {
  start: Date;
  end: Date;
  key: RangeKey;
}

export function getRange(key: RangeKey, now: Date = new Date()): DateRange {
  switch (key) {
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now), key };
    case 'last_month': {
      const l = subMonths(now, 1);
      return { start: startOfMonth(l), end: endOfMonth(l), key };
    }
    case '3m':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now), key };
    case '6m':
      return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now), key };
    case 'year':
      return { start: startOfYear(now), end: endOfMonth(now), key };
  }
}

// TransactionsList uses its own range union (no 3m/6m presets) — map to the
// closest so the drill-down lands sensibly. Full-range fidelity stays in
// Reports' own cards.
export type TxnListRange =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'all_time';

export function toTxnListRange(key: RangeKey): TxnListRange {
  switch (key) {
    case 'this_month':
      return 'this_month';
    case 'last_month':
      return 'last_month';
    case '3m':
      return 'last_3_months';
    case '6m':
      return 'last_3_months';
    case 'year':
      return 'this_year';
  }
}

// ─── Core filtering ──────────────────────────────────────────
const toDate = (v: Date | string): Date =>
  v instanceof Date ? v : new Date(v);

export const isTransfer = (t: Transaction): boolean => t.id.startsWith('transfer-');

export function realTxns(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => !isTransfer(t));
}

export function inRange(
  txns: Transaction[],
  r: { start: Date; end: Date }
): Transaction[] {
  return txns.filter((t) => {
    const d = toDate(t.date);
    return isValid(d) && isWithinInterval(d, { start: r.start, end: r.end });
  });
}

// ─── Cash flow ───────────────────────────────────────────────
export interface CashFlow {
  cameIn: number;
  wentOut: number;
  kept: number;
  count: number;
}

export function cashFlow(txns: Transaction[], r: DateRange): CashFlow {
  const scoped = inRange(realTxns(txns), r);
  let cameIn = 0;
  let wentOut = 0;
  for (const t of scoped) {
    if (t.type === 'income') cameIn += t.amount;
    else if (t.type === 'expense') wentOut += t.amount;
  }
  return { cameIn, wentOut, kept: cameIn - wentOut, count: scoped.length };
}

// ─── Category rollup ─────────────────────────────────────────
export interface CategoryRollup {
  id: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  percent: number;
}

export function categoryRollup(
  txns: Transaction[],
  r: DateRange,
  cats: CategoryOption[],
  fallbackColor: string,
  limit = 6
): CategoryRollup[] {
  const scoped = inRange(realTxns(txns), r).filter((t) => t.type === 'expense');
  const totals: Record<string, number> = {};
  for (const t of scoped) totals[t.category] = (totals[t.category] || 0) + t.amount;
  const total = Object.values(totals).reduce((s, a) => s + a, 0) || 1;
  return Object.entries(totals)
    .map(([id, amount]) => {
      const c = cats.find((x) => x.id === id);
      return {
        id,
        name: c?.name || id,
        color: c?.color || fallbackColor,
        icon: c?.icon || 'tag',
        amount,
        percent: (amount / total) * 100,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// ─── Merchant rollup (groups by free-text description) ───────
export interface MerchantRollup {
  key: string;
  label: string;
  amount: number;
  count: number;
  percent: number;
}

export function merchantRollup(
  txns: Transaction[],
  r: DateRange,
  limit = 5
): MerchantRollup[] {
  const scoped = inRange(realTxns(txns), r).filter((t) => t.type === 'expense');
  const groups: Record<string, { label: string; amount: number; count: number }> = {};
  for (const t of scoped) {
    const raw = (t.description || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!groups[key]) groups[key] = { label: raw, amount: 0, count: 0 };
    groups[key].amount += t.amount;
    groups[key].count += 1;
  }
  const total = Object.values(groups).reduce((s, g) => s + g.amount, 0) || 1;
  return Object.entries(groups)
    .map(([key, g]) => ({
      key,
      label: g.label,
      amount: g.amount,
      count: g.count,
      percent: (g.amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// ─── Monthly series (oldest → newest) ────────────────────────
export interface MonthPoint {
  label: string;
  monthKey: string;
  cameIn: number;
  wentOut: number;
  kept: number;
}

export function monthlySeries(
  txns: Transaction[],
  months: number,
  now: Date = new Date()
): MonthPoint[] {
  const real = realTxns(txns);
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(now, i);
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    let cameIn = 0;
    let wentOut = 0;
    for (const t of real) {
      const td = toDate(t.date);
      if (!isValid(td) || !isWithinInterval(td, { start, end })) continue;
      if (t.type === 'income') cameIn += t.amount;
      else if (t.type === 'expense') wentOut += t.amount;
    }
    out.push({
      label: format(d, 'MMM'),
      monthKey: format(d, 'yyyy-MM'),
      cameIn,
      wentOut,
      kept: cameIn - wentOut,
    });
  }
  return out;
}

// ─── Month projection (spend pace only) ──────────────────────
export interface MonthProjection {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  inSoFar: number;
  projectedOut: number;
  projectedKept: number;
  confident: boolean;
}

export function projectMonth(
  txns: Transaction[],
  now: Date = new Date()
): MonthProjection {
  const cf = cashFlow(txns, getRange('this_month', now));
  const daysElapsed = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const spentSoFar = cf.wentOut;
  const inSoFar = cf.cameIn;
  // Day 1–2 is too noisy to extrapolate; hold the projection at "so far".
  const confident = daysElapsed > 2 && spentSoFar > 0;
  const projectedOut = confident
    ? Math.round((spentSoFar / daysElapsed) * daysInMonth)
    : spentSoFar;
  return {
    daysElapsed,
    daysInMonth,
    spentSoFar,
    inSoFar,
    projectedOut,
    projectedKept: inSoFar - projectedOut,
    confident,
  };
}

// ─── Safe-to-spend per day ───────────────────────────────────
export interface SafeToSpend {
  perDay: number | null;
  basis: 'budget' | 'income' | 'none';
  remaining: number;
  daysLeft: number;
}

export function safeToSpend(
  txns: Transaction[],
  budgets: Budget[],
  now: Date = new Date()
): SafeToSpend {
  const r = getRange('this_month', now);
  const daysInMonth = getDaysInMonth(now);
  const daysLeft = Math.max(daysInMonth - now.getDate() + 1, 1); // includes today
  const scoped = inRange(realTxns(txns), r);

  // Budget basis: monthly budgets with a real allocation.
  const monthlyBudgets = budgets.filter(
    (b) => b.period === 'monthly' && b.allocatedAmount > 0
  );
  if (monthlyBudgets.length > 0) {
    const totalAlloc = monthlyBudgets.reduce((s, b) => s + b.allocatedAmount, 0);
    const budgetCats = new Set(monthlyBudgets.map((b) => b.category));
    const spent = scoped
      .filter((t) => t.type === 'expense' && budgetCats.has(t.category))
      .reduce((s, t) => s + t.amount, 0);
    const remaining = Math.max(totalAlloc - spent, 0);
    return { perDay: remaining / daysLeft, basis: 'budget', remaining, daysLeft };
  }

  // Income basis: what's come in this month, minus what's gone out.
  const cameIn = scoped
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const wentOut = scoped
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  if (cameIn > 0) {
    const remaining = Math.max(cameIn - wentOut, 0);
    return { perDay: remaining / daysLeft, basis: 'income', remaining, daysLeft };
  }

  return { perDay: null, basis: 'none', remaining: 0, daysLeft };
}

// ─── Recurring / subscriptions ───────────────────────────────
export function monthlyEquivalent(sub: Subscription): number {
  switch (sub.billingCycle) {
    case 'weekly':
      return (sub.amount * 52) / 12;
    case 'quarterly':
      return sub.amount / 3;
    case 'yearly':
      return sub.amount / 12;
    default:
      return sub.amount;
  }
}

export interface UpcomingBill {
  id: string;
  name: string;
  amount: number;
  dueInDays: number;
  date: Date;
}
export interface RecurringForecast {
  items: UpcomingBill[];
  total: number;
}

export function upcomingBills(
  subs: Subscription[],
  days: number,
  now: Date = new Date()
): RecurringForecast {
  const today = startOfDay(now);
  const horizon = addDays(today, Math.max(days, 0));
  const items = subs
    .filter((s) => s.isActive && !s.isPaused)
    .map((s) => ({ s, due: toDate(s.nextBillingDate) }))
    .filter(
      ({ due }) => isValid(due) && isWithinInterval(due, { start: today, end: horizon })
    )
    .map(({ s, due }) => ({
      id: s.id,
      name: s.name,
      amount: s.amount,
      dueInDays: differenceInDays(startOfDay(due), today),
      date: due,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const total = items.reduce((s, i) => s + i.amount, 0);
  return { items, total };
}

export interface RecurringShare {
  monthlyRecurring: number;
  ofSpendPercent: number;
}

export function recurringShare(
  subs: Subscription[],
  monthWentOut: number
): RecurringShare {
  const monthlyRecurring = subs
    .filter((s) => s.isActive && !s.isPaused)
    .reduce((s, sub) => s + monthlyEquivalent(sub), 0);
  return {
    monthlyRecurring,
    ofSpendPercent: monthWentOut > 0 ? (monthlyRecurring / monthWentOut) * 100 : 0,
  };
}

// ─── Month-end outlook (the flagship forward forecast) ───────
export interface MonthEndOutlook {
  keptSoFar: number;
  billsToCome: number;
  projectedOut: number;
  projectedKept: number;
  tone: 'comfortable' | 'snug';
  confident: boolean;
}

export function monthEndOutlook(
  txns: Transaction[],
  subs: Subscription[],
  now: Date = new Date()
): MonthEndOutlook {
  const proj = projectMonth(txns, now);
  const keptSoFar = proj.inSoFar - proj.spentSoFar;
  // Bills still due before this month ends.
  const daysRemaining = Math.max(proj.daysInMonth - now.getDate(), 0);
  const billsToCome = upcomingBills(subs, daysRemaining, now).total;
  // Conservative: projected outflow is at least the pace estimate, OR what's
  // already gone out plus known upcoming bills — whichever is larger. This
  // avoids double-counting while keeping the estimate on the safe side.
  const projectedOut = Math.max(proj.projectedOut, proj.spentSoFar + billsToCome);
  const projectedKept = proj.inSoFar - projectedOut;
  return {
    keptSoFar,
    billsToCome,
    projectedOut,
    projectedKept,
    tone: projectedKept >= 0 ? 'comfortable' : 'snug',
    confident: proj.confident,
  };
}

// ─── Savings-rate trend ──────────────────────────────────────
export interface SavingsPoint {
  label: string;
  monthKey: string;
  rate: number; // 0–100, % of what came in that was kept
}

export function savingsRateSeries(
  txns: Transaction[],
  months: number,
  now: Date = new Date()
): SavingsPoint[] {
  return monthlySeries(txns, months, now).map((m) => ({
    label: m.label,
    monthKey: m.monthKey,
    rate: m.cameIn > 0 ? Math.max(0, Math.min(m.kept / m.cameIn, 1)) * 100 : 0,
  }));
}

// ─── Wellness score (with tappable breakdown) ────────────────
export interface WellnessComponent {
  key: 'budget' | 'savings' | 'consistency' | 'goals';
  score: number;
  max: number;
}
export interface Wellness {
  score: number;
  components: WellnessComponent[];
}

export function wellnessScore(a: {
  txnsThisMonth: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  income: number;
  expenses: number;
  dayOfMonth: number;
}): Wellness {
  const { txnsThisMonth, budgets, goals, income, expenses, dayOfMonth } = a;
  const real = realTxns(txnsThisMonth);

  // Budget adherence (30)
  let budgetScore: number;
  const totalBudget = budgets.reduce((s, b) => s + b.allocatedAmount, 0);
  if (totalBudget > 0) {
    const spent = budgets.reduce(
      (s, b) =>
        s +
        real
          .filter((t) => t.type === 'expense' && t.category === b.category)
          .reduce((x, t) => x + t.amount, 0),
      0
    );
    budgetScore = Math.round(Math.max(0, 1 - spent / totalBudget) * 30);
  } else {
    budgetScore = 15; // no budgets set → partial credit
  }

  // Savings rate (30)
  let savingsScore = 0;
  if (income > 0) {
    savingsScore = Math.round(
      Math.min(Math.max(0, (income - expenses) / income), 1) * 30
    );
  } else if (expenses === 0) {
    savingsScore = 15; // no activity → partial credit
  }

  // Consistency (20): how many distinct days have activity vs days elapsed
  const uniqueDays = new Set(
    real
      .filter((t) => isValid(toDate(t.date)))
      .map((t) => format(toDate(t.date), 'yyyy-MM-dd'))
  ).size;
  const consistencyScore = Math.round(
    Math.min(uniqueDays / Math.max(dayOfMonth, 1), 1) * 20
  );

  // Goal progress (20)
  let goalsScore: number;
  if (goals && goals.length > 0) {
    const avg =
      goals.reduce(
        (s, g) =>
          s + Math.min(g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0, 1),
        0
      ) / goals.length;
    goalsScore = Math.round(avg * 20);
  } else {
    goalsScore = 10; // no goals → partial credit
  }

  const score = Math.min(
    budgetScore + savingsScore + consistencyScore + goalsScore,
    100
  );
  return {
    score,
    components: [
      { key: 'budget', score: budgetScore, max: 30 },
      { key: 'savings', score: savingsScore, max: 30 },
      { key: 'consistency', score: consistencyScore, max: 20 },
      { key: 'goals', score: goalsScore, max: 20 },
    ],
  };
}

// ─── Unusual-spend noticing (calm "heads up", never alarm) ───
export interface UnusualNote {
  categoryId: string;
  name: string;
  thisAmount: number;
  usualAmount: number;
  ratio: number;
}

export function unusualSpend(
  txns: Transaction[],
  cats: CategoryOption[],
  now: Date = new Date(),
  lookbackMonths = 3
): UnusualNote[] {
  const real = realTxns(txns).filter((t) => t.type === 'expense');

  // This month's totals per category.
  const thisTotals: Record<string, number> = {};
  for (const t of inRange(real, getRange('this_month', now))) {
    thisTotals[t.category] = (thisTotals[t.category] || 0) + t.amount;
  }

  // Trailing average per category over prior N full months.
  const priorTotals: Record<string, number[]> = {};
  for (let i = 1; i <= lookbackMonths; i++) {
    const d = subMonths(now, i);
    const monthTotals: Record<string, number> = {};
    for (const t of inRange(real, { start: startOfMonth(d), end: endOfMonth(d) })) {
      monthTotals[t.category] = (monthTotals[t.category] || 0) + t.amount;
    }
    for (const [cat, amt] of Object.entries(monthTotals)) {
      if (!priorTotals[cat]) priorTotals[cat] = [];
      priorTotals[cat].push(amt);
    }
  }

  const notes: UnusualNote[] = [];
  for (const [cat, thisAmount] of Object.entries(thisTotals)) {
    const arr = priorTotals[cat];
    if (!arr || arr.length === 0) continue;
    const usual = arr.reduce((s, a) => s + a, 0) / arr.length;
    if (usual <= 0) continue;
    const ratio = thisAmount / usual;
    if (ratio >= 1.4 && thisAmount >= 50) {
      const c = cats.find((x) => x.id === cat);
      notes.push({
        categoryId: cat,
        name: c?.name || cat,
        thisAmount,
        usualAmount: usual,
        ratio,
      });
    }
  }
  return notes.sort((a, b) => b.ratio - a.ratio).slice(0, 2);
}
