/**
 * Unit test for savingsMath — pure portfolio math for the Savings screen.
 * Deterministic: every function takes `now`, and fixtures use day-offsets from it.
 *
 * Run:  npx tsx scripts/test-savings-math.ts
 */
import {
  computePortfolio, classifyAccounts, computeBreakdown, computeAccountDerived,
  sortDerived, emergencyRunway, nextMilestone, topConcentration,
} from '../src/screens/personal/savings/savingsMath';
import { SavingsAccount } from '../src/types';

const NOW = new Date('2026-07-12T09:00:00.000Z');
const dAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

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

type HistPair = [value: number, daysAgo: number];
function mk(
  id: string, type: string, initial: number, current: number,
  hist: HistPair[], extra: Partial<SavingsAccount> = {},
): SavingsAccount {
  return {
    id, name: id, type, initialInvestment: initial, currentValue: current,
    history: hist.map(([value, days], i) => ({ id: `${id}_h${i}`, value, date: dAgo(days) })),
    createdAt: dAgo(120), updatedAt: dAgo(hist.length ? hist[hist.length - 1][1] : 0),
    ...extra,
  };
}

// Demo-like set (matches the on-screen totals).
const asb = mk('ASB', 'asb', 5000, 6500, [[5000, 90], [6300, 40], [6500, 5]], { target: 15000, annualRate: 4.25 });
const th = mk('TabungHaji', 'tabung_haji', 2000, 2400, [[2000, 90], [2400, 6]], { annualRate: 3.1 });
const versa = mk('Versa', 'robo', 1000, 1180, [[1000, 90], [1180, 6]], { annualRate: 3.8 });
const luno = mk('Luno', 'crypto', 500, 720, [[500, 90], [400, 40], [720, 6]]);
const all = [asb, th, versa, luno];

console.log('computePortfolio');
const p = computePortfolio(all, NOW);
close('totalCurrent', p.totalCurrent, 10800);
close('totalInvested', p.totalInvested, 8500);
close('totalGain', p.totalGain, 2300);
close('totalReturn %', p.totalReturn, 27.0588, 0.01);
check('fullSparkline has points', p.fullSparkline.length >= 2);
check('sparkline ends at total (carry-forward)', Math.abs(p.fullSparkline[p.fullSparkline.length - 1].value - 10800) < 0.01);

console.log('computePortfolio (empty → no NaN)');
const pe = computePortfolio([], NOW);
check('empty totalCurrent 0', pe.totalCurrent === 0);
check('empty totalReturn 0 (not NaN)', pe.totalReturn === 0);
check('empty sparkline []', pe.fullSparkline.length === 0);

console.log('classifyAccounts');
const cls = classifyAccounts(all);
check('savings = ASB + TabungHaji', cls.savings.map((a) => a.id).sort().join() === 'ASB,TabungHaji');
check('investments = Versa + Luno', cls.investments.map((a) => a.id).sort().join() === 'Luno,Versa');

console.log('computeBreakdown (keyed by id, no collision)');
const bd = computeBreakdown(cls.savings);
check('two savings slices', bd.length === 2);
check('sorted desc (ASB first)', bd[0].id === 'asb');
close('pcts sum to 100', bd.reduce((s, x) => s + x.pct, 0), 100, 0.01);
// The exact old-crash repro: two coarse types must yield DISTINCT slice ids.
const coarse = computeBreakdown([
  mk('x', 'investment', 100, 100, [[100, 1]]),
  mk('y', 'savings', 100, 100, [[100, 1]]),
]);
check('coarse investment+savings → 2 distinct slices', coarse.length === 2 && coarse[0].id !== coarse[1].id);

console.log('computeAccountDerived');
const dAsb = computeAccountDerived(asb, NOW);
close('ASB gain', dAsb.gain, 1500);
close('ASB return %', dAsb.returnPct, 30);
close('ASB projectedAnnual', dAsb.projectedAnnual ?? -1, 276.25); // 6500 * 4.25%
check('ASB goalEta projectable (0<mo<=120)', dAsb.goalEtaMonths !== null && dAsb.goalEtaMonths! > 0 && dAsb.goalEtaMonths! <= 120);
// Clean, deterministic ETA: +100 over exactly 30 days, need 200 more → ~2 months.
const clean = mk('Clean', 'bank', 500, 800, [[700, 30], [800, 0]], { target: 1000 });
check('clean goalEta === 2 months', computeAccountDerived(clean, NOW).goalEtaMonths === 2);
// Flat recent history → not projectable.
const flat = mk('Flat', 'bank', 500, 800, [[800, 60], [800, 0]], { target: 2000 });
check('flat goalEta null', computeAccountDerived(flat, NOW).goalEtaMonths === null);
// No annualRate → no projection.
check('no-rate projectedAnnual null', computeAccountDerived(luno, NOW).projectedAnnual === null);

console.log('sortDerived');
const derived = all.map((a) => computeAccountDerived(a, NOW));
check('sort value → ASB first', sortDerived(derived, 'value', [])[0].account.id === 'ASB');
check('sort return → Luno first (44%)', sortDerived(derived, 'return', [])[0].account.id === 'Luno');
check('manual respects order', sortDerived(derived, 'manual', ['Luno', 'ASB', 'Versa', 'TabungHaji'])[0].account.id === 'Luno');

console.log('emergencyRunway');
close('9000 / 1500 → 6 months', emergencyRunway(9000, 1500).months, 6);
const r = emergencyRunway(4500, 1500);
close('4500 / 1500 → 3 months', r.months, 3);
close('gap to 6mo net', r.gapToTarget, 4500); // need 9000, have 4500
check('no spending → Infinity months', emergencyRunway(9000, 0).months === Infinity);

console.log('nextMilestone');
const nm = nextMilestone(10800);
check('next after 10800 = 15000', nm?.value === 15000);
close('remaining to 15000', nm?.remaining ?? -1, 4200);
check('above max → null', nextMilestone(2_000_000) === null);

console.log('topConcentration');
check('top slice is largest', topConcentration(bd)?.id === 'asb');
check('empty → null', topConcentration([]) === null);

console.log('');
if (failures > 0) { console.error(`✗ ${failures} assertion(s) failed`); process.exit(1); }
console.log('✓ all savings-math assertions passed');
