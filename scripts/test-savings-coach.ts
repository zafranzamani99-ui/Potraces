/**
 * Unit test for coachingEngine — which nudge fires, and priority order.
 * Run:  npx tsx scripts/test-savings-coach.ts
 */
import { selectNudge, buildNudges, CoachInput } from '../src/screens/personal/savings/coachingEngine';
import { computePortfolio, computeBreakdown } from '../src/screens/personal/savings/savingsMath';
import { SavingsAccount } from '../src/types';

const NOW = new Date('2026-07-12T09:00:00.000Z');
const dAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) { console.log(`      got: ${JSON.stringify(actual)} expected: ${JSON.stringify(expected)}`); failures++; }
}

type HP = [value: number, daysAgo: number];
function mk(id: string, type: string, initial: number, current: number, hist: HP[], extra: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id, name: id, type, initialInvestment: initial, currentValue: current,
    history: hist.map(([value, days], i) => ({ id: `${id}_${i}`, value, date: dAgo(days) })),
    createdAt: dAgo(120), updatedAt: dAgo(hist.length ? hist[hist.length - 1][1] : 0), ...extra,
  };
}
function input(tab: 'savings' | 'investment', accounts: SavingsAccount[], avgMonthlySpend: number): CoachInput {
  return { tab, accounts, portfolio: computePortfolio(accounts, NOW), breakdown: computeBreakdown(accounts), avgMonthlySpend, now: NOW };
}

console.log('coachingEngine priority');

// 1. Stale beats everything (account last touched 20 days ago).
const staleAcc = [mk('Bank', 'bank', 4000, 4500, [[4300, 25], [4500, 20]])];
eq('stale account → stale', selectNudge(input('savings', staleAcc, 1500))?.kind, 'stale');

// 2. Runway fires on savings tab (fresh accounts, 3 months covered < 6).
const freshLow = [mk('Bank', 'bank', 4000, 4500, [[4300, 5], [4500, 1]])];
eq('savings, months<6 → runway', selectNudge(input('savings', freshLow, 1500))?.kind, 'runway');
eq('runway skipped when no spend data → milestone', selectNudge(input('savings', freshLow, 0))?.kind, 'milestone');

// 3. Concentration fires on investments tab when one type ≥60%.
const conc = [
  mk('Versa', 'robo', 1000, 1200, [[1100, 5], [1200, 1]]),
  mk('Luno', 'crypto', 300, 400, [[350, 5], [400, 1]]),
];
eq('investments, 75% in one → concentration', selectNudge(input('investment', conc, 0))?.kind, 'concentration');

// 4. Milestone when nothing higher applies (savings, no spend data, well diversified-ish).
const milestoneSet = [
  mk('ASB', 'asb', 5000, 6500, [[6300, 5], [6500, 1]]),
  mk('TH', 'tabung_haji', 2000, 2400, [[2350, 5], [2400, 1]]),
];
eq('savings, no runway/conc → milestone', selectNudge(input('savings', milestoneSet, 0))?.kind, 'milestone');

// 5. Best performer fallback when milestone is null (above the ladder) and up this month.
const huge = [mk('Stocks', 'stocks', 1_500_000, 2_000_000, [[1_900_000, 40], [2_000_000, 1]])];
eq('above milestones, grew this month → bestPerformer', selectNudge(input('investment', huge, 0))?.kind, 'bestPerformer');

// 6. Empty → null.
eq('empty accounts → null', selectNudge(input('savings', [], 1500)), null);

// Priority: stale present AND runway would apply → stale still first.
const both = input('savings', staleAcc, 1500);
eq('stale is first in buildNudges', buildNudges(both)[0]?.kind, 'stale');

// data payloads are present for copy interpolation
const runwayNudge = selectNudge(input('savings', freshLow, 1500));
eq('runway carries gap number', typeof runwayNudge?.data.gap, 'number');
eq('runway carries months number', typeof runwayNudge?.data.months, 'number');

console.log('');
if (failures > 0) { console.error(`✗ ${failures} assertion(s) failed`); process.exit(1); }
console.log('✓ all coaching-engine assertions passed');
