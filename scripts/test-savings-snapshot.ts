/**
 * Unit test for savingsSnapshot — the Echo context string.
 * Run:  npx tsx scripts/test-savings-snapshot.ts
 */
import { buildSavingsSnapshot } from '../src/screens/personal/savings/savingsSnapshot';
import { computePortfolio, computeBreakdown } from '../src/screens/personal/savings/savingsMath';
import { SavingsAccount } from '../src/types';

const NOW = new Date('2026-07-12T09:00:00.000Z');
const dAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

type HP = [value: number, daysAgo: number];
function mk(id: string, name: string, type: string, initial: number, current: number, hist: HP[], extra: Partial<SavingsAccount> = {}): SavingsAccount {
  return {
    id, name, type, initialInvestment: initial, currentValue: current,
    history: hist.map(([value, days], i) => ({ id: `${id}_${i}`, value, date: dAgo(days) })),
    createdAt: dAgo(120), updatedAt: dAgo(1), ...extra,
  };
}

const accounts = [
  mk('a1', 'ASB', 'asb', 5000, 6500, [[6300, 5], [6500, 1]], { target: 15000, annualRate: 4.25 }),
  mk('a2', 'Luno BTC', 'crypto', 500, 720, [[600, 5], [720, 1]]),
];
const snap = buildSavingsSnapshot({
  accounts,
  portfolio: computePortfolio(accounts, NOW),
  breakdown: computeBreakdown(accounts),
  currency: 'RM',
  now: NOW,
});

console.log('buildSavingsSnapshot');
console.log(snap.split('\n').map((l) => `      ${l}`).join('\n'));
console.log('');

check('has header', snap.includes('[Savings & investments snapshot]'));
check('portfolio value present', snap.includes('Portfolio value: RM 7,220 across 2 accounts'));
check('invested + gain + return', snap.includes('Invested: RM 5,500') && snap.includes('+31.3%'));
check('allocation section', snap.includes('Allocation by type:'));
check('uses real type name ASB (not Other)', snap.includes('ASB:') || snap.includes('(ASB)'));
check('uses real type name Crypto (not Other)', snap.includes('Crypto'));
check('NO "Other" leakage for known types', !snap.includes('(Other)'));
check('per-account line with return %', snap.includes('ASB (ASB): RM 6,500 [+30.0%]'));
check('target rendered', snap.includes('target RM 15,000'));
check('annual rate rendered', snap.includes('4.25% p.a.'));
check('last-updated rendered', /updated \w+ \d+/.test(snap));

// Empty portfolio
const empty = buildSavingsSnapshot({
  accounts: [], portfolio: computePortfolio([], NOW), breakdown: [], currency: 'RM', now: NOW,
});
check('empty → friendly no-accounts line', empty.includes('No savings or investment accounts yet.'));

console.log('');
if (failures > 0) { console.error(`✗ ${failures} assertion(s) failed`); process.exit(1); }
console.log('✓ all savings-snapshot assertions passed');
