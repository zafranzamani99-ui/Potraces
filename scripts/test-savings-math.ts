/**
 * Unit test for savingsMath — pure portfolio math for the Savings screen.
 * Deterministic: every function takes `now`, and fixtures use day-offsets from it.
 *
 * Run:  npx tsx scripts/test-savings-math.ts
 */
import {
  computePortfolio, classifyAccounts, computeBreakdown, computeAccountDerived,
  sortDerived, emergencyRunway, nextMilestone, topConcentration, nextBasis,
  capitalDeltaFor, replayCapitalMoves,
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

console.log('nextBasis (average-cost basis across deposits / withdrawals)');
{
  const retPct = (v: number, b: number) => (b > 0 ? ((v - b) / b) * 100 : 0);
  // Lifecycle: put in 10000 → grows to 12000 → withdraw to 7000 → deposit 3000 → dividend.
  let basis = 10000, value = 10000;
  basis = nextBasis(basis, value, 12000, 'manual'); value = 12000;
  close('manual growth leaves basis', basis, 10000);
  close('return is +20% before withdrawal', retPct(value, basis), 20);
  // Withdrawal is PROPORTIONAL: take out 5000/12000 of value → remove the same fraction
  // of basis. Basis = 10000 * (7000/12000) = 5833.33.
  basis = nextBasis(basis, value, 7000, 'withdrawal'); value = 7000;
  close('withdrawal removes basis proportionally', basis, 5833.33);
  check('withdrawal keeps a GAIN (not a fake loss)', value - basis > 0);
  close('KEY: return% is UNCHANGED by a withdrawal (still +20%)', retPct(value, basis), 20);
  // Deposit adds exactly what was put in (3000) to the basis.
  basis = nextBasis(basis, value, 10000, 'deposit'); value = 10000;
  close('deposit raises basis by exactly 3000', basis, 8833.33);
  // Dividend is a pure revaluation — basis untouched, whole move is gain.
  basis = nextBasis(basis, value, 10200, 'dividend'); value = 10200;
  close('dividend leaves basis', basis, 8833.33);
  check('dividend adds to gain', value - basis > 1000);
  // Full close realizes the basis to 0 — no phantom basis on an emptied account.
  check('full withdrawal (value→0) realizes basis to 0', nextBasis(5000, 7000, 0, 'withdrawal') === 0);
  check('withdrawal never goes below 0', nextBasis(1000, 1000, -50000, 'withdrawal') === 0);
  // Refill an emptied (basis 0) account via a plain manual/dividend update → the
  // reappearing value seeds the basis (no phantom +gain / incoherent 0% return).
  check('manual update off a ZERO basis seeds basis from value', nextBasis(0, 0, 3000, 'manual') === 3000);
  check('dividend off a ZERO basis seeds basis from value', nextBasis(0, 0, 200, 'dividend') === 200);
  check('manual on a NON-zero basis still leaves basis (real gain)', nextBasis(1000, 1000, 1200, 'manual') === 1000);
  // Over-basis withdrawal on a WINNER no longer clamps to a broken 0%: basis stays
  // proportional, so the remainder keeps a coherent positive return.
  const b2 = nextBasis(1000, 2000, 500, 'withdrawal'); // basis 1000 * (500/2000) = 250
  close('over-basis withdrawal keeps proportional basis', b2, 250);
  close('...and a coherent +100% return on the remainder', retPct(500, b2), 100);
}

console.log('capitalDeltaFor / replayCapitalMoves (multi-device basis re-derivation)');
{
  // capitalDeltaFor now = the signed BASIS change (nextBasis − prevBasis).
  check('deposit delta = +amount put in', capitalDeltaFor(10000, 10000, 13000, 'deposit') === 3000);
  check('withdrawal delta is negative (basis removed)', capitalDeltaFor(10000, 10000, 8000, 'withdrawal') === -2000);
  check('manual/dividend delta = 0', capitalDeltaFor(10000, 10000, 12000, 'manual') === 0 && capitalDeltaFor(10000, 10000, 10200, 'dividend') === 0);
  // Stored deltas replay as a plain sum → basis = seed + Σ(deltas), order-independent.
  const dep = { capitalDelta: capitalDeltaFor(10000, 10000, 13000, 'deposit') };   // +3000
  const wd = { capitalDelta: capitalDeltaFor(10000, 10000, 8000, 'withdrawal') };  // −2000
  close('replay sums stored deltas', replayCapitalMoves([{}, dep, wd]), 1000);
  close('replay is ORDER-INDEPENDENT after a merge re-sort', replayCapitalMoves([{}, wd, dep]), 1000);
  close('merged basis = seed + net capital (both moves counted)', 10000 + replayCapitalMoves([{}, dep, wd]), 11000);
  check('legacy snapshots without capitalDelta contribute 0', replayCapitalMoves([{}, {}, {}]) === 0);
}

console.log('');
if (failures > 0) { console.error(`✗ ${failures} assertion(s) failed`); process.exit(1); }
console.log('✓ all savings-math assertions passed');
