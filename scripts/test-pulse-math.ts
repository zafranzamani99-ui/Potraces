/**
 * Unit tests for utils/pulseMath.ts — the Financial Pulse v2 math layer:
 * cycle-expanded bills, wallet coverage, bill-aware safe-today, month curve,
 * the prorated pulse score, debt pulse, streaks, prorated unusual-spend.
 * Deterministic: fixed `now`, fixtures month-anchored around it.
 *
 * Run:  npx tsx scripts/test-pulse-math.ts
 */
import {
  expandBills,
  liquidBalance,
  billsCoverage,
  typicalMonthlySpend,
  baselineDailySpend,
  last14DailySpend,
  safeToday,
  monthCurve,
  pulseScore,
  pulseBand,
  debtPulse,
  streakData,
  unusualSpendProrated,
} from '../src/utils/pulseMath';
import { scopeTxns, getRange } from '../src/utils/insights';
import { Transaction, Subscription, Budget, Goal, Wallet, Debt, CategoryOption } from '../src/types';

const NOW = new Date(2026, 6, 15, 9, 0, 0); // 15 July 2026 (31-day month)

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}
function close(label: string, actual: number, expected: number, eps = 0.01) {
  const ok = Math.abs(actual - expected) <= eps;
  console.log(`  ${ok ? '✓' : '✗'} ${label} (≈ ${expected})`);
  if (!ok) { console.log(`      got: ${actual}`); failures++; }
}

let seq = 0;
function tx(type: 'income' | 'expense', amount: number, category: string, date: Date, description = ''): Transaction {
  return { id: `t${seq++}`, type, amount, category, description, date } as Transaction;
}
function sub(partial: Partial<Subscription>): Subscription {
  return {
    id: `s${seq++}`,
    name: 'Sub',
    amount: 50,
    billingCycle: 'monthly',
    startDate: new Date(2026, 0, 1),
    nextBillingDate: new Date(2026, 6, 20),
    category: 'bills',
    isActive: true,
    isInstallment: false,
    reminderDays: 3,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...partial,
  } as Subscription;
}
function wallet(partial: Partial<Wallet>): Wallet {
  return {
    id: `w${seq++}`,
    name: 'W',
    type: 'bank',
    balance: 0,
    icon: 'w',
    color: '#000',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Wallet;
}
function debt(partial: Partial<Debt>): Debt {
  return {
    id: `d${seq++}`,
    contact: { id: 'c1', name: 'Ali' } as any,
    type: 'i_owe',
    totalAmount: 100,
    paidAmount: 0,
    status: 'pending',
    description: '',
    payments: [],
    mode: 'personal',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Debt;
}

const jul = (d: number) => new Date(2026, 6, d);
const jun = (d: number) => new Date(2026, 5, d);
const may = (d: number) => new Date(2026, 4, d);
const apr = (d: number) => new Date(2026, 3, d);

const cats: CategoryOption[] = [
  { id: 'food', name: 'Food', icon: 'm/food', color: '#9B6A3A' },
  { id: 'shopping', name: 'Shopping', icon: 'i/bag', color: '#8B7000' },
];

// ─── expandBills ─────────────────────────────────────────────
console.log('\nexpandBills');
{
  // Weekly sub inside a 30-day window (15 Jul → 14 Aug) → 18, 25 Jul + 1, 8 Aug = 4 occurrences
  const weekly = sub({ billingCycle: 'weekly', amount: 25, nextBillingDate: jul(18) });
  const f = expandBills([weekly], 30, NOW);
  check('weekly sub expands to multiple occurrences (not 1)', f.items.length === 4);
  close('weekly total = 4 × 25', f.total, 100);

  // Monthly sub occurs once in a 30-day window
  const monthly = sub({ billingCycle: 'monthly', amount: 100, nextBillingDate: jul(20) });
  close('monthly sub once in 30d', expandBills([monthly], 30, NOW).total, 100);

  // Overdue cycles collapse to today (dueInDays 0), still owed
  const overdue = sub({ billingCycle: 'monthly', amount: 60, nextBillingDate: jul(10) });
  const fo = expandBills([overdue], 14, NOW);
  check('overdue cycle payable today', fo.items[0].dueInDays === 0);
  close('overdue + next cycle in horizon', fo.total, 60); // next cycle 10 Aug is outside 14d
  const fo30 = expandBills([overdue], 30, NOW);
  close('30d horizon catches the next cycle too', fo30.total, 120);

  // Finished installment (phantom nextBillingDate) contributes nothing
  const done = sub({ isInstallment: true, totalInstallments: 6, completedInstallments: 6, nextBillingDate: jul(18) });
  close('finished installment excluded', expandBills([done], 30, NOW).total, 0);

  // Installment with 1 cycle left only expands once even over a long horizon
  const oneLeft = sub({ isInstallment: true, totalInstallments: 6, completedInstallments: 5, amount: 200, billingCycle: 'monthly', nextBillingDate: jul(18) });
  close('installment respects remaining cycles', expandBills([oneLeft], 90, NOW).total, 200);

  // Paused sub excluded
  const paused = sub({ isPaused: true, nextBillingDate: jul(18) });
  close('paused sub excluded', expandBills([paused], 30, NOW).total, 0);
}

// ─── liquidBalance + billsCoverage ───────────────────────────
console.log('\nliquidBalance + billsCoverage');
{
  const wallets = [
    wallet({ type: 'bank', balance: 300 }),
    wallet({ type: 'ewallet', balance: 50 }),
    wallet({ type: 'cash', balance: 20 }),
    wallet({ type: 'credit', balance: 0, creditLimit: 5000, usedCredit: 1000 }),
  ];
  close('credit wallets are not liquid', liquidBalance(wallets), 370);

  const bills = expandBills(
    [
      sub({ amount: 200, nextBillingDate: jul(17) }),
      sub({ amount: 250, nextBillingDate: jul(24) }),
    ],
    14,
    NOW
  );
  const cov = billsCoverage(370, bills);
  check('370 vs 450 not covered', !cov.covered);
  close('shortBy', cov.shortBy, 80);
  check('short on the SECOND bill (day 9), first is payable', cov.shortOnDay === 9);
  close('ratio', cov.ratio, 370 / 450);

  const covOk = billsCoverage(500, bills);
  check('500 vs 450 covered', covOk.covered && covOk.shortOnDay === null);
  check('no bills → ratio 1', billsCoverage(0, { items: [], total: 0 }).ratio === 1);
  check('negative liquid → ratio 0', billsCoverage(-50, bills).ratio === 0);
  close('negative liquid → shortBy includes the overdraft', billsCoverage(-50, bills).shortBy, 500);
}

// ─── baselines ───────────────────────────────────────────────
console.log('\nbaselines');
{
  const txns = [
    tx('expense', 3000, 'food', jun(10)),
    tx('expense', 1000, 'food', may(10)),
    tx('income', 5000, 'food', apr(1)), // activity but zero spend
    { id: 'transfer-9', type: 'expense', amount: 9999, category: 'food', description: '', date: jun(11) } as Transaction,
  ];
  close('typicalMonthlySpend = mean of active months (3000+1000+0)/3', typicalMonthlySpend(txns, NOW)!, 4000 / 3);
  check('no history → null', typicalMonthlySpend([tx('expense', 10, 'food', jul(2))], NOW) === null);
  // baselineDaily: total 4000 over 30(jun)+31(may)+30(apr) days
  close('baselineDailySpend', baselineDailySpend(txns, NOW)!, 4000 / 91);
  // last14: window 2 Jul – 15 Jul
  const recent = [tx('expense', 140, 'food', jul(5)), tx('expense', 140, 'food', jul(14)), tx('expense', 999, 'food', jul(1))];
  close('last14DailySpend ignores outside window', last14DailySpend(recent, NOW), 280 / 14);
}

// ─── safeToday ───────────────────────────────────────────────
console.log('\nsafeToday');
{
  const budgets = [
    { id: 'b1', category: 'food', allocatedAmount: 900, spentAmount: 0, period: 'monthly' } as Budget,
  ];
  const scoped = scopeTxns(
    [tx('expense', 300, 'food', jul(10)), tx('expense', 100, 'shopping', jul(12)), tx('expense', 30, 'food', jul(15))],
    getRange('this_month', NOW)
  );
  // Rest-of-month bills: one unbudgeted RM120 + one in the budgeted 'food' cat RM50
  const bills = expandBills(
    [
      sub({ amount: 120, category: 'bills', nextBillingDate: jul(20) }),
      sub({ amount: 50, category: 'food', nextBillingDate: jul(22) }),
    ],
    16,
    NOW
  );
  const st = safeToday({ scopedMonth: scoped, budgets, restOfMonthBills: bills, takeHome: null, now: NOW });
  check('budget basis', st.basis === 'budget');
  // START-of-day pool = 900 − 300 (food spend BEFORE today) = 600; bills = 120 (unbudgeted only)
  close('billsAhead only counts unbudgeted bills', st.billsAhead, 120);
  close('remaining (start-of-day pool − bills)', st.remaining, 480);
  close('perDay over 17 days left', st.perDay!, 480 / 17);
  close('spentToday counts budgeted food only (15 Jul)', st.spentToday, 30);
  close('leftToday = perDay − spentToday, floored', st.leftToday!, Math.max(480 / 17 - 30, 0));

  // The double-subtract repro from the review: last day, budget 900,
  // 800 spent earlier + 40 today → allowance left today must be 60, not 20.
  const LAST_DAY = new Date(2026, 6, 31, 9, 0, 0);
  const stLast = safeToday({
    scopedMonth: scopeTxns([tx('expense', 800, 'food', jul(20)), tx('expense', 40, 'food', jul(31))], getRange('this_month', LAST_DAY)),
    budgets,
    restOfMonthBills: { items: [], total: 0 },
    takeHome: null,
    now: LAST_DAY,
  });
  close('last-day perDay from start-of-day pool', stLast.perDay!, 100);
  close('last-day leftToday not double-subtracted', stLast.leftToday!, 60);

  // Future-dated entries are ignored by the daily allowance
  const stFuture = safeToday({
    scopedMonth: scopeTxns([tx('income', 2000, 'salary', jul(1)), tx('expense', 500, 'food', jul(25))], getRange('this_month', NOW)),
    budgets: [],
    restOfMonthBills: { items: [], total: 0 },
    takeHome: null,
    now: NOW,
  });
  close('future-dated expense does not shrink the pool', stFuture.remaining, 2000);

  // Income basis subtracts ALL bills
  const stInc = safeToday({
    scopedMonth: scopeTxns([tx('income', 2000, 'salary', jul(1)), tx('expense', 500, 'food', jul(5))], getRange('this_month', NOW)),
    budgets: [],
    restOfMonthBills: bills,
    takeHome: null,
    now: NOW,
  });
  check('income basis', stInc.basis === 'income');
  close('income remaining = 1500 − 170', stInc.remaining, 1330);

  // Planned basis: no income yet, takeHome known
  const stPlan = safeToday({
    scopedMonth: scopeTxns([tx('expense', 400, 'food', jul(5))], getRange('this_month', NOW)),
    budgets: [],
    restOfMonthBills: { items: [], total: 0 },
    takeHome: 3000,
    now: NOW,
  });
  check('planned basis pre-payday', stPlan.basis === 'planned');
  close('planned remaining = 3000 − 400', stPlan.remaining, 2600);

  // Nothing to go on
  const stNone = safeToday({ scopedMonth: [], budgets: [], restOfMonthBills: { items: [], total: 0 }, takeHome: null, now: NOW });
  check('none basis → perDay null', stNone.basis === 'none' && stNone.perDay === null);
}

// ─── monthCurve ──────────────────────────────────────────────
console.log('\nmonthCurve');
{
  const scoped = scopeTxns(
    [tx('expense', 100, 'food', jul(1)), tx('expense', 50, 'food', jul(3)), tx('expense', 200, 'shopping', jul(15))],
    getRange('this_month', NOW)
  );
  const mc = monthCurve({ scopedMonth: scoped, budgets: [], typicalSpend: 1200, now: NOW });
  check('15 points on day 15', mc.cums.length === 15);
  close('cumulative day 3', mc.cums[2], 150);
  close('cumulative today', mc.cums[14], 350);
  check('pace falls back to typical', mc.paceBasis === 'typical' && mc.paceTotal === 1200);
  close('projection = 350/15×31', mc.projectedOut, (350 / 15) * 31);

  const mcBudget = monthCurve({
    scopedMonth: scoped,
    budgets: [{ id: 'b', category: 'food', allocatedAmount: 800, spentAmount: 0, period: 'monthly' } as Budget],
    typicalSpend: 1200,
    now: NOW,
  });
  check('budget beats typical as pace basis', mcBudget.paceBasis === 'budget' && mcBudget.paceTotal === 800);
}

// ─── pulseScore ──────────────────────────────────────────────
console.log('\npulseScore');
{
  const budgets = [{ id: 'b1', category: 'food', allocatedAmount: 1000, spentAmount: 0, period: 'monthly' } as Budget];
  // Exactly on pace: day 15/31 → expected 483.87; spend exactly that.
  const onPace = [tx('expense', 1000 * (15 / 31), 'food', jul(10)), tx('income', 5000, 'salary', jul(1))];
  const base = {
    budgets,
    goals: [] as Goal[],
    wallets: [wallet({ balance: 1000 })],
    bills14: { items: [], total: 0 },
    takeHome: null,
    baselineDaily: 30,
    now: NOW,
  };
  const scoreOnPace = pulseScore({
    ...base,
    scopedMonth: scopeTxns(onPace, getRange('this_month', NOW)),
    last14Daily: 30,
  });
  const compOnPace = Object.fromEntries(scoreOnPace.components.map((c) => [c.key, c]));
  check('on-pace budget = full 25 (no intra-month decay)', compOnPace.budget.score === 25);
  check('on-rhythm = full 15', compOnPace.rhythm.score === 15);
  check('no bills → bills full 20', compOnPace.bills.score === 20);

  // Spending every day does NOT tank the score (old consistency bug) —
  // rhythm only reacts to the AMOUNT vs baseline, not day count.
  const frugal = pulseScore({
    ...base,
    scopedMonth: scopeTxns([tx('income', 5000, 'salary', jul(1))], getRange('this_month', NOW)),
    last14Daily: 0,
  });
  const compFrugal = Object.fromEntries(frugal.components.map((c) => [c.key, c]));
  check('a no-spend month scores BETTER, not worse (rhythm full)', compFrugal.rhythm.score === 15);
  check('under-pace budget also full', compFrugal.budget.score === 25);

  // 2× the usual rhythm → 0
  const hot = pulseScore({
    ...base,
    scopedMonth: scopeTxns([], getRange('this_month', NOW)),
    last14Daily: 60,
  });
  check('2× baseline rhythm → 0', Object.fromEntries(hot.components.map((c) => [c.key, c])).rhythm.score === 0);

  // Pre-payday with takeHome anchor: no income logged, low spend → healthy saving score
  const prePayday = pulseScore({
    ...base,
    takeHome: 4000,
    scopedMonth: scopeTxns([tx('expense', 500, 'food', jul(10))], getRange('this_month', NOW)),
    last14Daily: 30,
  });
  const compPre = Object.fromEntries(prePayday.components.map((c) => [c.key, c]));
  check('pre-payday saving not 0 (takeHome anchor)', compPre.saving.score > 15);

  // Bills coverage flows into the score
  const shortOnBills = pulseScore({
    ...base,
    wallets: [wallet({ balance: 100 })],
    bills14: expandBills([sub({ amount: 400, nextBillingDate: jul(20) })], 14, NOW),
    scopedMonth: [],
    last14Daily: 30,
  });
  const compShort = Object.fromEntries(shortOnBills.components.map((c) => [c.key, c]));
  close('bills component = coverage ratio × 20', compShort.bills.score, Math.round((100 / 400) * 20));

  // Goals: archived/paused excluded
  const goals: Goal[] = [
    { id: 'g1', targetAmount: 100, currentAmount: 100 } as Goal,
    { id: 'g2', targetAmount: 100, currentAmount: 0, isArchived: true } as Goal,
  ];
  const withGoals = pulseScore({ ...base, goals, scopedMonth: [], last14Daily: 30 });
  check('archived goal ignored → full goals score', Object.fromEntries(withGoals.components.map((c) => [c.key, c])).goals.score === 15);

  check('bands map: 85→good, 65→steady, 45→building, 25→starting, 10→finding',
    pulseBand(85) === 'good' && pulseBand(65) === 'steady' && pulseBand(45) === 'building' && pulseBand(25) === 'starting' && pulseBand(10) === 'finding');
}

// ─── debtPulse ───────────────────────────────────────────────
console.log('\ndebtPulse');
{
  const debts = [
    debt({ totalAmount: 500, paidAmount: 200, dueDate: jul(20) }),
    debt({ totalAmount: 300, paidAmount: 0, dueDate: jul(10) }), // overdue
    debt({ type: 'they_owe', totalAmount: 120, paidAmount: 20 }),
    debt({ totalAmount: 999, paidAmount: 999, status: 'settled' }), // settled → out
    debt({ totalAmount: 400, paidAmount: 0, isArchived: true }), // archived → out
    debt({ totalAmount: 250, paidAmount: 0, mode: 'business' }), // business → out
  ];
  const dp = debtPulse(debts, NOW);
  close('iOwe outstanding = 300 + 300', dp.iOweOutstanding, 600);
  check('overdue counted', dp.overdueCount === 1);
  check('nearest due is the overdue one', dp.nextDue !== null && dp.nextDue.inDays === -5);
  close('theyOwe outstanding', dp.theyOweOutstanding, 100);
}

// ─── streakData ──────────────────────────────────────────────
console.log('\nstreakData');
{
  const scoped = scopeTxns(
    [
      tx('expense', 10, 'food', jul(2)),
      tx('expense', 10, 'food', jul(3)),
      tx('expense', 10, 'food', jul(10)),
      tx('income', 100, 'salary', jul(14)), // income does NOT break a streak
      tx('expense', 10, 'food', jul(20)), // future-dated — must not eat a quiet day
    ],
    getRange('this_month', NOW)
  );
  const s = streakData(scoped, NOW);
  check('current streak = 5 (11–15 Jul quiet)', s.currentStreak === 5);
  check('best streak = 6 (4–9 Jul)', s.bestStreak === 6);
  check('noSpendDays = 12 of 15 (future entry ignored)', s.noSpendDays === 12 && s.daysElapsed === 15);
}

// ─── unusualSpendProrated ────────────────────────────────────
console.log('\nunusualSpendProrated');
{
  // Usual food = 600/mo. Half-month at 500 → prorated usual ≈290 → ratio ≈1.72: fires
  // (the un-prorated version needs 840+ to fire at 1.4× of the FULL month).
  const txns = [
    tx('expense', 600, 'food', jun(10)),
    tx('expense', 600, 'food', may(10)),
    tx('expense', 500, 'food', jul(8)),
  ];
  const notes = unusualSpendProrated(txns, cats, NOW);
  check('fires mid-month where full-month compare could not', notes.length === 1 && notes[0].categoryId === 'food');
  check('carries full-month usual for copy', Math.abs(notes[0].usualAmount - 600) < 0.01);

  // Too early in the month → silent
  check('quiet in the first days of a month', unusualSpendProrated(txns, cats, new Date(2026, 6, 3)).length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
