/**
 * Unit test for budgetMath — pure money math for the Budget screen headline.
 * Locks the 2026-07-17 audit fixes so they can't silently regress:
 *   • weekly budgets use REAL month spend, not current-week extrapolation
 *   • the daily figure is an honest zero when budgets are exhausted (no fallback)
 *   • rollover carry lifts the effective limit (one period)
 *   • empty-world / NaN inputs never produce NaN
 * Deterministic: every function takes `now`; fixtures are built in local time.
 *
 * Run:  npx tsx scripts/test-budget-math.ts
 */
import {
  monthlyFactor, getPeriodInterval, getPreviousPeriodInterval,
  computeBudgetRow, computeHeroMoney,
} from '../src/screens/personal/budgetMath';
import { Budget, Transaction } from '../src/types';

// July 15 2026, 09:00 local — mid-month so period/month windows are distinct.
// July has 31 days → dayOfMonth 15, daysRemaining = 31 − 15 + 1 = 17.
const NOW = new Date(2026, 6, 15, 9, 0, 0);
const DAYS_REMAINING = 17;
const d = (day: number, monthIndex = 6, hour = 12) => new Date(2026, monthIndex, day, hour);

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

function tx(category: string, amount: number, date: Date): Transaction {
  return {
    id: `${category}-${amount}-${date.getTime()}`,
    amount, category, description: category, date, type: 'expense',
    mode: 'personal', createdAt: date, updatedAt: date,
  };
}
function budget(category: string, allocatedAmount: number, period: Budget['period'], rollover = false): Budget {
  return {
    id: `b-${category}`, category, allocatedAmount, spentAmount: 0, period, rollover,
    startDate: NOW, endDate: NOW, createdAt: NOW, updatedAt: NOW,
  };
}
// A hero row as the screen builds it: full budget + its computed math fields.
const heroRow = (b: Budget, txns: Transaction[]) => ({ ...b, ...computeBudgetRow(b, txns, NOW) });

console.log('monthlyFactor');
close('monthly = 1', monthlyFactor('monthly'), 1);
close('weekly = 52/12', monthlyFactor('weekly'), 52 / 12);
close('yearly = 1/12', monthlyFactor('yearly'), 1 / 12);

console.log('period intervals');
const mi = getPeriodInterval('monthly', NOW);
check('monthly starts Jul 1', mi.start.getMonth() === 6 && mi.start.getDate() === 1);
check('monthly ends Jul 31', mi.end.getMonth() === 6 && mi.end.getDate() === 31);
const pmi = getPreviousPeriodInterval('monthly', NOW);
check('prev monthly is June', pmi.start.getMonth() === 5 && pmi.start.getDate() === 1);
const pw = getPreviousPeriodInterval('weekly', NOW);
check('prev weekly window is 7 days before this week', getPeriodInterval('weekly', NOW).start.getTime() - pw.start.getTime() === 7 * 86400000);

console.log('computeBudgetRow — period vs month scope');
{
  // A weekly budget: this-week spend must differ from whole-month spend.
  const b = budget('food', 100, 'weekly');
  const txns = [tx('food', 30, d(15)) /* this week */, tx('food', 20, d(2)) /* this month, not this week */];
  const r = computeBudgetRow(b, txns, NOW);
  close('weekly spentAmount = this week only (30)', r.spentAmount, 30);
  close('weekly monthSpent = whole month (50)', r.monthSpent, 50);
  close('no rollover → carry 0', r.carry, 0);
  close('effectiveAmount = allocated (100)', r.effectiveAmount, 100);
}

console.log('computeBudgetRow — rollover carry');
{
  const b = budget('food', 500, 'monthly', true);
  const txns = [tx('food', 200, d(20, 5)) /* June, prev period */, tx('food', 100, d(10)) /* July */];
  const r = computeBudgetRow(b, txns, NOW);
  close('carry = prev-period leftover (500 − 200)', r.carry, 300);
  close('effectiveAmount = allocated + carry (800)', r.effectiveAmount, 800);
  close('monthSpent = this month only (100)', r.monthSpent, 100);
}

console.log('computeHeroMoney — WEEKLY EXTRAPOLATION regression (the fix)');
{
  // Weekly RM100 budget, RM100 spent in each of two earlier July weeks, RM0 this week.
  // OLD BUG: used current-week spend (0) × factor → inflated free-to-spend.
  // FIX: totalBudgetSpent = real month spend (200), NOT extrapolated.
  const b = budget('food', 100, 'weekly');
  const txns = [tx('food', 100, d(2)), tx('food', 100, d(9))]; // none in Jul 13–19
  const row = heroRow(b, txns);
  check('row.spentAmount (this week) is 0', row.spentAmount === 0);
  const m = computeHeroMoney([row], NOW, { totalIncome: 0, totalExpenses: 200 });
  close('totalAllocated = 100 × 52/12 (weekly normalized)', m.totalAllocated, 433.333, 0.01);
  close('totalBudgetSpent = REAL month spend 200 (not week-extrapolated)', m.totalBudgetSpent, 200);
  close('budgetLeft = 433.33 − 200', m.budgetLeft, 233.333, 0.01);
  close('dailyFigure = budgetLeft ÷ 17', m.dailyFigure, 233.333 / DAYS_REMAINING, 0.01);
}

console.log('computeHeroMoney — honest zero (no fallback)');
{
  const row = { ...budget('food', 300, 'monthly'), spentAmount: 300, monthSpent: 300, carry: 0, effectiveAmount: 300 };
  const m = computeHeroMoney([row], NOW, { totalIncome: 0, totalExpenses: 300 });
  close('budgetLeft = 0', m.budgetLeft, 0);
  check('dailyFigure is exactly 0 (not a bigger fallback)', m.dailyFigure === 0);
}

console.log('computeHeroMoney — over budget');
{
  const row = { ...budget('food', 300, 'monthly'), spentAmount: 350, monthSpent: 350, carry: 0, effectiveAmount: 300 };
  const m = computeHeroMoney([row], NOW, { totalIncome: 0, totalExpenses: 350 });
  check('alreadyOver = true', m.alreadyOver === true);
  check('overBudgets has the row', m.overBudgets.length === 1);
  close('totalOverBy = 50', m.totalOverBy, 50);
  close('budgetLeft clamps to 0', m.budgetLeft, 0);
  close('dailyFigure = 0', m.dailyFigure, 0);
}

console.log('computeHeroMoney — rollover lifts the headline');
{
  const row = { ...budget('food', 500, 'monthly', true), spentAmount: 100, monthSpent: 100, carry: 300, effectiveAmount: 800 };
  const m = computeHeroMoney([row], NOW, { totalIncome: 0, totalExpenses: 100 });
  close('totalAllocated includes carry (800)', m.totalAllocated, 800);
  close('budgetLeft = 800 − 100', m.budgetLeft, 700);
  close('dailyFigure = 700 ÷ 17', m.dailyFigure, 700 / DAYS_REMAINING, 0.01);
}

console.log('computeHeroMoney — empty world / income fallback (no NaN)');
{
  const m = computeHeroMoney([], NOW, { totalIncome: 1000, totalExpenses: 400 });
  close('totalAllocated 0', m.totalAllocated, 0);
  close('freeToSpend = income − expenses (600)', m.freeToSpend, 600);
  close('dailyFigure = 600 ÷ 17', m.dailyFigure, 600 / DAYS_REMAINING, 0.01);
  close('percentSpent = income fallback 0.4', m.percentSpent, 0.4);
  check('dailyFigure finite (not NaN)', Number.isFinite(m.dailyFigure));
  check('paceRatio finite (not NaN)', Number.isFinite(m.paceRatio));
}

console.log('computeHeroMoney — NaN-tainted rows never poison the totals');
{
  const bad = { period: 'monthly' as const, effectiveAmount: NaN, monthSpent: NaN, spentAmount: 0 };
  const good = { period: 'monthly' as const, effectiveAmount: 200, monthSpent: 50, spentAmount: 50 };
  const m = computeHeroMoney([bad, good], NOW, { totalIncome: 0, totalExpenses: 50 });
  close('NaN row contributes 0 → totalAllocated 200', m.totalAllocated, 200);
  close('NaN monthSpent contributes 0 → totalBudgetSpent 50', m.totalBudgetSpent, 50);
  check('dailyFigure finite', Number.isFinite(m.dailyFigure));
}

console.log(`\n${failures === 0 ? '✅ all budgetMath tests passed' : `❌ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
