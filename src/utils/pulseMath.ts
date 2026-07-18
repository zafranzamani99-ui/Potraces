// ─────────────────────────────────────────────────────────────
// pulseMath.ts — pure math for the Financial Pulse screen (v2).
//
// Same house rules as insights.ts: no React, no zustand, no copy —
// plain arrays + an injectable `now` in, NUMBERS ONLY out. Every
// denominator guarded. `transfer-` ids never count (realTxns()).
//
// Why this module exists (vs piling onto insights.ts):
//   • Pulse v2 reads entities insights.ts never sees (wallets, debts,
//     takeHome) — keeping that surface here keeps insights.ts lean.
//   • The old wellnessScore self-contradicts the streak card (it REWARDS
//     spending every day) and mechanically decays over the month (no
//     time proration). pulseScore() below fixes both; the old function
//     stays untouched for anything else that may adopt it.
//   • upcomingBills() counts one occurrence per subscription — a weekly
//     sub inside a 30-day window is undercounted 4×. expandBills() walks
//     the cycle properly.
// ─────────────────────────────────────────────────────────────
import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  endOfMonth,
  format,
  getDaysInMonth,
  isValid,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { Transaction, Subscription, Budget, Goal, Wallet, Debt, CategoryOption } from '../types';
import { realTxns, inRange, isLiveRecurring, isGoalMove } from './insights';

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

// ─── Cycle-expanded bill forecast ────────────────────────────
// Every occurrence of every live bill inside [today, today + days], not just
// the single nextBillingDate. nextBillingDate is the OLDEST UNPAID cycle, so
// occurrences that fall before today are genuinely owed — they collapse onto
// "today" (dueInDays 0) instead of being dropped.
export interface ExpandedBill {
  id: string; // subId:yyyy-MM-dd — unique per occurrence
  subId: string;
  name: string;
  category: string;
  amount: number;
  dueInDays: number;
  date: Date;
}
export interface BillsForecast {
  items: ExpandedBill[]; // sorted by due date
  total: number;
}

const stepCycle = (d: Date, cycle: Subscription['billingCycle']): Date => {
  switch (cycle) {
    case 'weekly':
      return addDays(d, 7);
    case 'quarterly':
      return addMonths(d, 3);
    case 'yearly':
      return addYears(d, 1);
    default:
      return addMonths(d, 1);
  }
};

export function expandBills(
  subs: Subscription[],
  days: number,
  now: Date = new Date()
): BillsForecast {
  const today = startOfDay(now);
  const horizon = addDays(today, Math.max(days, 0));
  const items: ExpandedBill[] = [];
  for (const s of subs) {
    if (!isLiveRecurring(s)) continue;
    let due = startOfDay(toDate(s.nextBillingDate));
    if (!isValid(due)) continue;
    // Installments only have so many cycles left.
    let remaining =
      s.isInstallment && s.totalInstallments
        ? Math.max(s.totalInstallments - (s.completedInstallments ?? 0), 0)
        : Infinity;
    let guard = 0; // hard stop — a corrupt date can't loop forever
    while (due <= horizon && remaining > 0 && guard < 420) {
      const eff = due < today ? today : due; // overdue cycles are payable now
      items.push({
        id: `${s.id}:${format(due, 'yyyy-MM-dd')}`,
        subId: s.id,
        name: s.name,
        category: s.category,
        amount: s.amount,
        dueInDays: differenceInDays(eff, today),
        date: eff,
      });
      remaining -= 1;
      guard += 1;
      due = startOfDay(stepCycle(due, s.billingCycle));
    }
  }
  items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

// ─── Wallet liquidity vs upcoming bills ──────────────────────
// Liquid = spendable-now money. Credit cards are debt capacity, not cash.
export function liquidBalance(wallets: Wallet[]): number {
  return wallets
    .filter((w) => w.type !== 'credit')
    .reduce((s, w) => s + (Number.isFinite(w.balance) ? w.balance : 0), 0);
}

export interface BillsCoverage {
  total: number;
  liquid: number;
  ratio: number; // 0..1 of the bill total the wallets can cover (1 when no bills)
  covered: boolean;
  shortBy: number; // RM missing to cover the whole window
  shortOnDay: number | null; // dueInDays of the first bill the cash can't reach
}

export function billsCoverage(liquid: number, forecast: BillsForecast): BillsCoverage {
  if (forecast.total <= 0) {
    return { total: 0, liquid, ratio: 1, covered: true, shortBy: 0, shortOnDay: null };
  }
  let cum = 0;
  let shortOnDay: number | null = null;
  for (const b of forecast.items) {
    cum += b.amount;
    if (shortOnDay === null && cum > liquid + 0.005) shortOnDay = b.dueInDays;
  }
  const safeLiquid = Math.max(liquid, 0); // ratio only — 0..1 progress semantics
  return {
    total: forecast.total,
    liquid,
    ratio: Math.max(0, Math.min(safeLiquid / forecast.total, 1)),
    covered: liquid + 0.005 >= forecast.total,
    // Unfloored: an overdrawn wallet makes the true gap total + |liquid|,
    // matching covered/shortOnDay which already use the raw balance.
    shortBy: Math.max(0, forecast.total - liquid),
    shortOnDay,
  };
}

// ─── Trailing baselines (the "your usual" anchors) ───────────
// Average monthly spend over the prior 3 FULL months that had any activity.
// null when there's no history at all — callers show a neutral state.
export function typicalMonthlySpend(
  txns: Transaction[],
  now: Date = new Date(),
  lookbackMonths = 3
): number | null {
  const real = realTxns(txns);
  const monthTotals: number[] = [];
  for (let i = 1; i <= lookbackMonths; i++) {
    const d = subMonths(now, i);
    const slice = inRange(real, { start: startOfMonth(d), end: endOfMonth(d) });
    if (slice.length === 0) continue;
    monthTotals.push(
      slice.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    );
  }
  if (monthTotals.length === 0) return null;
  return monthTotals.reduce((s, a) => s + a, 0) / monthTotals.length;
}

// Per-day version of the same baseline (for rhythm comparisons).
export function baselineDailySpend(
  txns: Transaction[],
  now: Date = new Date(),
  lookbackMonths = 3
): number | null {
  const real = realTxns(txns);
  let total = 0;
  let days = 0;
  let sawActivity = false;
  for (let i = 1; i <= lookbackMonths; i++) {
    const d = subMonths(now, i);
    const slice = inRange(real, { start: startOfMonth(d), end: endOfMonth(d) });
    if (slice.length === 0) continue;
    sawActivity = true;
    total += slice.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    days += getDaysInMonth(d);
  }
  if (!sawActivity || days === 0) return null;
  return total / days;
}

// Average daily spend over the last 14 days (including today).
export function last14DailySpend(txns: Transaction[], now: Date = new Date()): number {
  const start = startOfDay(addDays(now, -13));
  const spent = inRange(realTxns(txns), { start, end: now })
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  return spent / 14;
}

// ─── Safe to spend TODAY (bill-aware) ────────────────────────
// The old safeToSpend() divides "remaining" evenly but ignores bills — "safe
// RM40/day" the day before rent is a lie. This subtracts what's still due
// this month first. On the budget basis, bills in BUDGETED categories are
// already provisioned by their allocation, so only unbudgeted bills are
// subtracted (no double-penalty).
export interface SafeTodayResult {
  perDay: number | null;
  leftToday: number | null; // perDay minus what's already spent today (floor 0)
  spentToday: number;
  basis: 'budget' | 'income' | 'planned' | 'none';
  remaining: number; // pool after bills
  billsAhead: number; // what was subtracted
  daysLeft: number; // includes today
}

export function safeToday(a: {
  scopedMonth: Transaction[]; // this month's real txns (scopeTxns output)
  budgets: Budget[];
  restOfMonthBills: BillsForecast; // expandBills(subs, daysInMonth - date, now)
  takeHome: number | null;
  now: Date;
}): SafeTodayResult {
  const { scopedMonth, budgets, restOfMonthBills, takeHome, now } = a;
  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(daysInMonth - dayOfMonth + 1, 1);

  // Split the month's spend around TODAY. perDay must come from the
  // START-of-day pool — deriving it after today's spend and then subtracting
  // spentToday again double-counts (leftToday understated by spentToday/daysLeft,
  // up to the whole of spentToday on the last day). Future-dated entries are
  // ignored (the month scope runs to endOfMonth).
  const dayOf = (t: Transaction): number | null => {
    const d = toDate(t.date);
    return isValid(d) ? d.getDate() : null;
  };
  const sumExpenses = (pred: (t: Transaction, day: number) => boolean) =>
    scopedMonth.reduce((s, t) => {
      if (t.type !== 'expense') return s;
      const day = dayOf(t);
      return day !== null && pred(t, day) ? s + t.amount : s;
    }, 0);

  const finish = (
    startOfDayPool: number,
    billsAhead: number,
    basis: SafeTodayResult['basis'],
    spentTodayPool: number // today's spend that counts against this basis' pool
  ): SafeTodayResult => {
    const remaining = Math.max(startOfDayPool - billsAhead, 0);
    const perDay = remaining / daysLeft;
    return {
      perDay,
      leftToday: Math.max(perDay - spentTodayPool, 0),
      spentToday: spentTodayPool,
      basis,
      remaining,
      billsAhead,
      daysLeft,
    };
  };

  // Budget basis — monthly budgets with a real allocation (same set the old
  // safeToSpend used; weekly budgets stay out until the Budget cluster's own
  // math audit lands). Pool + "spent today" both use budgeted categories only,
  // so the allowance and the bar measure the same thing.
  const monthlyBudgets = budgets.filter((b) => b.period === 'monthly' && b.allocatedAmount > 0);
  if (monthlyBudgets.length > 0) {
    const totalAlloc = monthlyBudgets.reduce((s, b) => s + b.allocatedAmount, 0);
    const budgetCats = new Set(monthlyBudgets.map((b) => b.category));
    const spentBefore = sumExpenses((t, day) => day < dayOfMonth && budgetCats.has(t.category));
    const spentTodayBudgeted = sumExpenses((t, day) => day === dayOfMonth && budgetCats.has(t.category));
    const billsAhead = restOfMonthBills.items
      .filter((b) => !budgetCats.has(b.category))
      .reduce((s, b) => s + b.amount, 0);
    return finish(Math.max(totalAlloc - spentBefore, 0), billsAhead, 'budget', spentTodayBudgeted);
  }

  const cameIn = scopedMonth
    .filter((t) => {
      const day = dayOf(t);
      return t.type === 'income' && day !== null && day <= dayOfMonth;
    })
    .reduce((s, t) => s + t.amount, 0);
  const spentBeforeAll = sumExpenses((_t, day) => day < dayOfMonth);
  const spentTodayAll = sumExpenses((_t, day) => day === dayOfMonth);

  // Income basis — money that actually arrived this month.
  if (cameIn > 0) {
    return finish(Math.max(cameIn - spentBeforeAll, 0), restOfMonthBills.total, 'income', spentTodayAll);
  }

  // Planned basis — salary hasn't landed yet but Echo knows the take-home.
  // Uses the full month's take-home as the pool (the money is coming), so the
  // pre-payday stretch gets a real number instead of "none".
  if (takeHome !== null && takeHome > 0) {
    return finish(Math.max(takeHome - spentBeforeAll, 0), restOfMonthBills.total, 'planned', spentTodayAll);
  }

  return {
    perDay: null,
    leftToday: null,
    spentToday: spentTodayAll,
    basis: 'none',
    remaining: 0,
    billsAhead: restOfMonthBills.total,
    daysLeft,
  };
}

// ─── Month curve (the scrubbable chart's data) ───────────────
// Cumulative spend per day so far, plus the "expected pace" total the dashed
// line climbs to: the monthly budget if one exists, else the trailing-3-month
// typical spend.
export interface MonthCurve {
  cums: number[]; // index 0 = day 1 … index (today-1) = today, cumulative spend
  today: number; // day of month
  daysInMonth: number;
  paceTotal: number | null; // where the dashed line ends (null → no pace line)
  paceBasis: 'budget' | 'typical' | 'none';
  projectedOut: number; // linear projection of the month's spend
  spentSoFar: number;
  confident: boolean; // enough of the month elapsed to project
}

export function monthCurve(a: {
  scopedMonth: Transaction[];
  budgets: Budget[];
  typicalSpend: number | null; // typicalMonthlySpend(txns, now)
  now: Date;
}): MonthCurve {
  const { scopedMonth, budgets, typicalSpend, now } = a;
  const today = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const daily = new Array<number>(today).fill(0);
  for (const t of scopedMonth) {
    if (t.type !== 'expense') continue;
    const d = toDate(t.date);
    if (!isValid(d)) continue;
    const day = d.getDate();
    if (day >= 1 && day <= today) daily[day - 1] += t.amount;
  }
  const cums: number[] = [];
  let run = 0;
  for (const v of daily) {
    run += v;
    cums.push(run);
  }
  const spentSoFar = run;

  const monthlyBudgets = budgets.filter((b) => b.period === 'monthly' && b.allocatedAmount > 0);
  const totalAlloc = monthlyBudgets.reduce((s, b) => s + b.allocatedAmount, 0);
  let paceTotal: number | null = null;
  let paceBasis: MonthCurve['paceBasis'] = 'none';
  if (totalAlloc > 0) {
    paceTotal = totalAlloc;
    paceBasis = 'budget';
  } else if (typicalSpend !== null && typicalSpend > 0) {
    paceTotal = typicalSpend;
    paceBasis = 'typical';
  }

  const confident = today > 2 && spentSoFar > 0;
  const projectedOut = confident ? (spentSoFar / today) * daysInMonth : spentSoFar;
  return { cums, today, daysInMonth, paceTotal, paceBasis, projectedOut, spentSoFar, confident };
}

// ─── Pulse score v2 (replaces wellnessScore for this screen) ─
// Fixes vs the old formula:
//   • budget component is TIME-PRORATED — spending exactly on pace holds a
//     full score all month instead of decaying to 0 by the 31st.
//   • "consistency" (which rewarded spending every day, contradicting the
//     no-spend streak card on the same screen) is replaced by RHYTHM —
//     last-14-days spend vs your own 3-month baseline.
//   • BILLS COVERED is new — liquid wallet money vs the next 14 days of
//     cycle-expanded bills.
//   • savings uses the planner's take-home as an anchor pre-payday instead
//     of scoring 0 the week before salary lands.
//   • goals excludes archived/paused.
// Neutral (not punitive) mid-scores when a signal has no data to speak.
export type PulseBand = 'good' | 'steady' | 'building' | 'starting' | 'finding';
export type ComponentBand = 'strong' | 'steady' | 'fair' | 'attention';
export interface PulseComponent {
  key: 'budget' | 'saving' | 'bills' | 'rhythm' | 'goals';
  score: number;
  max: number;
  band: ComponentBand;
  neutral: boolean; // true when scored on no-data partial credit
}
export interface PulseScoreResult {
  score: number;
  band: PulseBand;
  components: PulseComponent[];
}

const componentBand = (score: number, max: number): ComponentBand => {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return 'strong';
  if (pct >= 0.55) return 'steady';
  if (pct >= 0.35) return 'fair';
  return 'attention';
};

export const pulseBand = (score: number): PulseBand =>
  score >= 80 ? 'good' : score >= 60 ? 'steady' : score >= 40 ? 'building' : score >= 20 ? 'starting' : 'finding';

export function pulseScore(a: {
  scopedMonth: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  wallets: Wallet[];
  bills14: BillsForecast; // expandBills(subs, 14, now)
  takeHome: number | null;
  baselineDaily: number | null; // baselineDailySpend(txns, now)
  last14Daily: number; // last14DailySpend(txns, now)
  now: Date;
}): PulseScoreResult {
  const { scopedMonth, budgets, goals, wallets, bills14, takeHome, baselineDaily, last14Daily, now } = a;
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const dayFrac = Math.min(Math.max(dayOfMonth / daysInMonth, 0), 1);

  // Exclude goal moves so the saving score credits a goal contribution as KEPT (not spent)
  // and a withdrawal isn't counted as fresh income — matches Reports + the Goals screen.
  const income = scopedMonth.filter((t) => t.type === 'income' && !isGoalMove(t)).reduce((s, t) => s + t.amount, 0);
  const expenses = scopedMonth.filter((t) => t.type === 'expense' && !isGoalMove(t)).reduce((s, t) => s + t.amount, 0);

  // Budget (25) — prorated: on/under pace = full marks, 1.75× pace = 0.
  let budgetScore: number;
  let budgetNeutral = false;
  const monthlyBudgets = budgets.filter((b) => b.period === 'monthly' && b.allocatedAmount > 0);
  const totalAlloc = monthlyBudgets.reduce((s, b) => s + b.allocatedAmount, 0);
  if (totalAlloc > 0) {
    const budgetCats = new Set(monthlyBudgets.map((b) => b.category));
    const spent = scopedMonth
      .filter((t) => t.type === 'expense' && budgetCats.has(t.category))
      .reduce((s, t) => s + t.amount, 0);
    const expected = totalAlloc * Math.max(dayFrac, 1 / daysInMonth);
    const ratio = spent / expected; // expected > 0 always (alloc > 0)
    budgetScore = Math.round(Math.max(0, Math.min(1, (1.75 - ratio) / 0.75)) * 25);
  } else {
    budgetScore = 13;
    budgetNeutral = true;
  }

  // Saving (25) — 30% kept = full marks (a real-world "great" rate; scoring
  // linearly to 100% kept made normal months look weak).
  let savingScore: number;
  let savingNeutral = false;
  if (income > 0) {
    const rate = (income - expenses) / income;
    savingScore = Math.round(Math.max(0, Math.min(rate / 0.3, 1)) * 25);
  } else if (takeHome !== null && takeHome > 0) {
    const expectedIncome = takeHome * Math.max(dayFrac, 1 / daysInMonth);
    const rate = (expectedIncome - expenses) / expectedIncome;
    savingScore = Math.round(Math.max(0, Math.min(rate / 0.3, 1)) * 25);
  } else {
    savingScore = 12;
    savingNeutral = true;
  }

  // Bills covered (20) — liquid cash vs the next 14 days of bills.
  let billsScore: number;
  let billsNeutral = false;
  if (bills14.total <= 0) {
    billsScore = 20; // nothing due → fully covered
  } else if (wallets.length === 0) {
    billsScore = 10; // bills exist but no wallets tracked — can't judge
    billsNeutral = true;
  } else {
    billsScore = Math.round(billsCoverage(liquidBalance(wallets), bills14).ratio * 20);
  }

  // Rhythm (15) — the last two weeks vs your own trailing baseline.
  let rhythmScore: number;
  let rhythmNeutral = false;
  if (baselineDaily !== null && baselineDaily > 0) {
    const ratio = last14Daily / baselineDaily;
    // ≤1.05× your usual = full marks, 2× = 0.
    rhythmScore = Math.round(Math.max(0, Math.min(1, (2 - ratio) / 0.95)) * 15);
  } else {
    rhythmScore = 8;
    rhythmNeutral = true;
  }

  // Goals (15) — average progress across live goals only.
  let goalsScore: number;
  let goalsNeutral = false;
  const liveGoals = goals.filter((g) => !g.isArchived && !g.isPaused);
  if (liveGoals.length > 0) {
    const avg =
      liveGoals.reduce(
        (s, g) => s + Math.min(g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0, 1),
        0
      ) / liveGoals.length;
    goalsScore = Math.round(avg * 15);
  } else {
    goalsScore = 8;
    goalsNeutral = true;
  }

  const score = Math.min(budgetScore + savingScore + billsScore + rhythmScore + goalsScore, 100);
  const mk = (
    key: PulseComponent['key'],
    s: number,
    max: number,
    neutral: boolean
  ): PulseComponent => ({ key, score: s, max, band: componentBand(s, max), neutral });
  return {
    score,
    band: pulseBand(score),
    components: [
      mk('budget', budgetScore, 25, budgetNeutral),
      mk('saving', savingScore, 25, savingNeutral),
      mk('bills', billsScore, 20, billsNeutral),
      mk('rhythm', rhythmScore, 15, rhythmNeutral),
      mk('goals', goalsScore, 15, goalsNeutral),
    ],
  };
}

// ─── Debt pulse ──────────────────────────────────────────────
export interface DebtPulse {
  iOweOutstanding: number;
  iOweCount: number;
  nextDue: { name: string; amount: number; inDays: number } | null; // nearest dated i_owe
  overdueCount: number;
  theyOweOutstanding: number;
  theyOweCount: number;
}

export function debtPulse(debts: Debt[], now: Date = new Date()): DebtPulse {
  const today = startOfDay(now);
  const live = debts.filter(
    (d) => !d.isArchived && d.status !== 'settled' && d.mode !== 'business'
  );
  const outstanding = (d: Debt) => Math.max(d.totalAmount - d.paidAmount, 0);
  const iOwe = live.filter((d) => d.type === 'i_owe' && outstanding(d) > 0.005);
  const theyOwe = live.filter((d) => d.type === 'they_owe' && outstanding(d) > 0.005);

  let nextDue: DebtPulse['nextDue'] = null;
  let overdueCount = 0;
  for (const d of iOwe) {
    if (!d.dueDate) continue;
    const due = startOfDay(toDate(d.dueDate));
    if (!isValid(due)) continue;
    const inDays = differenceInDays(due, today);
    if (inDays < 0) overdueCount += 1;
    if (nextDue === null || inDays < nextDue.inDays) {
      nextDue = { name: d.contact?.name || d.description || '', amount: outstanding(d), inDays };
    }
  }
  return {
    iOweOutstanding: iOwe.reduce((s, d) => s + outstanding(d), 0),
    iOweCount: iOwe.length,
    nextDue,
    overdueCount,
    theyOweOutstanding: theyOwe.reduce((s, d) => s + outstanding(d), 0),
    theyOweCount: theyOwe.length,
  };
}

// ─── No-spend streak (moved out of the screen so it's testable) ──
export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  noSpendDays: number;
  daysElapsed: number;
}

export function streakData(scopedMonth: Transaction[], now: Date = new Date()): StreakData {
  const daysElapsed = now.getDate();
  const expenseDays = new Set<string>();
  for (const t of scopedMonth) {
    if (t.type !== 'expense') continue;
    const d = toDate(t.date);
    // Ignore future-dated entries — the month scope runs to endOfMonth, and a
    // 20th-dated expense must not eat a quiet day when today is the 15th.
    if (isValid(d) && d.getDate() <= daysElapsed) expenseDays.add(format(d, 'yyyy-MM-dd'));
  }
  const noSpendDays = Math.max(daysElapsed - expenseDays.size, 0);
  let currentStreak = 0;
  for (let i = 0; i < daysElapsed; i++) {
    const check = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!expenseDays.has(format(check, 'yyyy-MM-dd'))) currentStreak++;
    else break;
  }
  let bestStreak = 0;
  let temp = 0;
  for (let d = 1; d <= daysElapsed; d++) {
    const check = new Date(now.getFullYear(), now.getMonth(), d);
    if (!expenseDays.has(format(check, 'yyyy-MM-dd'))) {
      temp++;
      bestStreak = Math.max(bestStreak, temp);
    } else temp = 0;
  }
  return { currentStreak, bestStreak, noSpendDays, daysElapsed };
}

// ─── Unusual spend, prorated ─────────────────────────────────
// The insights.ts version compares a PARTIAL month against full-month
// averages, so it can barely fire before the 20th. Prorating the "usual"
// to the elapsed fraction of the month lets it notice while there's still
// time to react. First few days are skipped (too noisy to prorate).
export interface UnusualNoteV2 {
  categoryId: string;
  name: string;
  thisAmount: number;
  usualAmount: number; // full-month usual, for copy
  ratio: number; // vs prorated usual
}

export function unusualSpendProrated(
  txns: Transaction[],
  cats: CategoryOption[],
  now: Date = new Date(),
  lookbackMonths = 3
): UnusualNoteV2[] {
  const dayOfMonth = now.getDate();
  const daysInMonth = getDaysInMonth(now);
  const dayFrac = dayOfMonth / daysInMonth;
  if (dayFrac < 0.15) return [];

  const real = realTxns(txns).filter((t) => t.type === 'expense');
  const thisTotals: Record<string, number> = {};
  for (const t of inRange(real, { start: startOfMonth(now), end: now })) {
    thisTotals[t.category] = (thisTotals[t.category] || 0) + t.amount;
  }
  const priorTotals: Record<string, number[]> = {};
  for (let i = 1; i <= lookbackMonths; i++) {
    const d = subMonths(now, i);
    const monthTotals: Record<string, number> = {};
    for (const t of inRange(real, { start: startOfMonth(d), end: endOfMonth(d) })) {
      monthTotals[t.category] = (monthTotals[t.category] || 0) + t.amount;
    }
    for (const [cat, amt] of Object.entries(monthTotals)) {
      (priorTotals[cat] ||= []).push(amt);
    }
  }

  const notes: UnusualNoteV2[] = [];
  for (const [cat, thisAmount] of Object.entries(thisTotals)) {
    const arr = priorTotals[cat];
    if (!arr || arr.length === 0) continue;
    const usual = arr.reduce((s, x) => s + x, 0) / arr.length;
    if (usual <= 0) continue;
    const proratedUsual = usual * dayFrac;
    const ratio = thisAmount / proratedUsual;
    if (ratio >= 1.35 && thisAmount >= 50) {
      const c = cats.find((x) => x.id === cat);
      notes.push({ categoryId: cat, name: c?.name || cat, thisAmount, usualAmount: usual, ratio });
    }
  }
  return notes.sort((a, b) => b.ratio - a.ratio).slice(0, 2);
}
