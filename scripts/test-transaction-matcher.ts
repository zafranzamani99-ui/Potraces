/**
 * Pure-logic tests for the import reconciliation matching engine (design doc §3/§10).
 * No RN imports, so tsx runs it. Run: npm run test:txmatcher
 */
import { matchTransactions, MatchCandidate, MatchResult } from '../src/utils/transactionMatcher';
import type { Transaction } from '../src/types';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

let _id = 0;
const tx = (
  amount: number,
  type: 'income' | 'expense',
  date: string,
  description: string,
  walletId = 'w1',
  extra: Partial<Transaction> = {},
): Transaction =>
  ({
    id: `t${++_id}`, amount, category: 'other', description, date: new Date(date),
    type, mode: 'personal', walletId, createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  } as Transaction);
const cand = (
  amount: number,
  type: 'income' | 'expense',
  date: string,
  description = '',
  walletId = 'w1',
  extra: Partial<MatchCandidate> = {},
): MatchCandidate => ({ amount, type, date, description, walletId, ...extra });
const tiers = (rs: MatchResult[]) => rs.map((r) => r.tier).join(',');

// 1. Tier 0: identical re-import → tier 0 (exact importRowKey match)
{
  const e = [tx(12.5, 'expense', '2026-07-01', 'QR PAY ZABEDIN NASI KANDAR MY')];
  const r = matchTransactions(e, [cand(12.5, 'expense', '2026-07-01', 'QR PAY ZABEDIN NASI KANDAR MY')]);
  check('tier0: identical re-import → tier 0', r[0].tier === 0);
  check('tier0: matchedTxId + gap 0 reported', r[0].matchedTxId === e[0].id && r[0].dateGapDays === 0);
  // multiset: only ONE identical existing row → second identical candidate is new
  // (and the tier-0-consumed row must be unavailable to the second candidate's tier 1)
  const r2 = matchTransactions(e, [
    cand(12.5, 'expense', '2026-07-01', 'QR PAY ZABEDIN NASI KANDAR MY'),
    cand(12.5, 'expense', '2026-07-01', 'QR PAY ZABEDIN NASI KANDAR MY'),
  ]);
  check('tier0 multiset: 1 existing vs 2 identical → [0, new]', tiers(r2) === '0,new');
}

// 2. Tier 1: same wallet, exact amount, Δ0 / Δ1 / Δ2 days → all tier 1
{
  const e = [
    tx(10, 'expense', '2026-07-10', 'A'),
    tx(10, 'expense', '2026-07-10', 'B'),
    tx(10, 'expense', '2026-07-10', 'C'),
  ];
  const r = matchTransactions(e, [
    cand(10, 'expense', '2026-07-10'),
    cand(10, 'expense', '2026-07-11'),
    cand(10, 'expense', '2026-07-12'),
  ]);
  check('tier1: Δ0/Δ1/Δ2 same wallet → all tier 1', tiers(r) === '1,1,1');
  check('tier1: dateGapDays 0/1/2 reported',
    r[0].dateGapDays === 0 && r[1].dateGapDays === 1 && r[2].dateGapDays === 2);
  check('tier1: one-to-one (distinct rows claimed)',
    r[0].matchedTxId !== r[1].matchedTxId && r[1].matchedTxId !== r[2].matchedTxId);
}

// 3. Δ3 same wallet → tier 2, NOT tier 1
check('Δ3 same wallet → tier 2 (not tier 1)', (() => {
  const r = matchTransactions([tx(10, 'expense', '2026-07-10', 'A')], [cand(10, 'expense', '2026-07-13')]);
  return r[0].tier === 2 && r[0].dateGapDays === 3;
})());

// 4. Tier-2 window edges: Δ7 → tier 2; Δ8 → new
check('Δ7 same wallet → tier 2', (() => {
  const r = matchTransactions([tx(10, 'expense', '2026-07-10', 'A')], [cand(10, 'expense', '2026-07-17')]);
  return r[0].tier === 2 && r[0].dateGapDays === 7;
})());
check('Δ8 same wallet → new',
  matchTransactions([tx(10, 'expense', '2026-07-10', 'A')], [cand(10, 'expense', '2026-07-18')])[0].tier === 'new');

// 5. Cross-wallet: same amount + type, Δ0, different wallets → tier 2 with matchedWalletId
{
  const e = [tx(10, 'expense', '2026-07-10', 'A', 'w2')];
  const r = matchTransactions(e, [cand(10, 'expense', '2026-07-10', '', 'w1')]);
  check('cross-wallet Δ0 → tier 2', r[0].tier === 2);
  check('cross-wallet → matchedWalletId set to the other wallet', r[0].matchedWalletId === 'w2');
}

// 6. FX: existing has originalAmount → never tier 1, even at Δ1 same wallet
{
  const e = [tx(46.5, 'expense', '2026-07-10', 'COFFEE STARBUCKS US', 'w1', { originalAmount: 10, originalCurrency: 'USD', fxRate: 4.65 })];
  const r = matchTransactions(e, [cand(46.5, 'expense', '2026-07-11', 'COFFEE STARBUCKS US')]);
  check('FX existing, same wallet Δ1 → tier 2 (not tier 1)', r[0].tier === 2 && r[0].matchedTxId === e[0].id);
}

// 7. Twins — one-to-one assignment
{
  // 2 existing vs 2 identical candidates → both matched, distinct rows
  const eA = [tx(8, 'expense', '2026-07-10', 'Food'), tx(8, 'expense', '2026-07-10', 'Food')];
  const rA = matchTransactions(eA, [cand(8, 'expense', '2026-07-10', 'QR PAY A'), cand(8, 'expense', '2026-07-10', 'QR PAY A')]);
  check('twins 2v2 → both tier 1', tiers(rA) === '1,1');
  check('twins 2v2 → one-to-one (distinct rows)', rA[0].matchedTxId !== rA[1].matchedTxId);

  // 2 existing vs 1 candidate → exactly one match, and the NEAREST row wins
  const eB = [tx(8, 'expense', '2026-07-11', 'Food'), tx(8, 'expense', '2026-07-10', 'Food')];
  const rB = matchTransactions(eB, [cand(8, 'expense', '2026-07-10', 'QR PAY A')]);
  check('twins 2v1 → exactly one tier-1 match', rB[0].tier === 1);
  check('twins 2v1 → nearest pair wins (gap 0 row)', rB[0].matchedTxId === eB[1].id && rB[0].dateGapDays === 0);

  // 1 existing vs 2 identical candidates → first matches, second is new (row consumed)
  const rC = matchTransactions([tx(8, 'expense', '2026-07-10', 'Food')],
    [cand(8, 'expense', '2026-07-10', 'QR PAY A'), cand(8, 'expense', '2026-07-10', 'QR PAY A')]);
  check('twins 1v2 → first tier 1, second new', tiers(rC) === '1,new');
}

// 8. Precedence: cross-wallet candidate A listed BEFORE same-wallet candidate B —
// B must still win the single existing row (same-wallet passes run first).
{
  const e = [tx(15, 'expense', '2026-07-10', 'Food', 'w1')];
  const r = matchTransactions(e, [
    cand(15, 'expense', '2026-07-10', '', 'w9'), // A: cross-wallet, listed first
    cand(15, 'expense', '2026-07-10', '', 'w1'), // B: same-wallet
  ]);
  check('precedence: same-wallet candidate wins the row', r[1].tier === 1 && r[1].matchedTxId === e[0].id);
  check('precedence: cross-wallet candidate (listed first) gets nothing', r[0].tier === 'new');
}

// 9. Hard boundaries
check('1-sen difference → new',
  matchTransactions([tx(10.0, 'expense', '2026-07-10', 'A')], [cand(10.01, 'expense', '2026-07-10')])[0].tier === 'new');
check('income vs expense → new',
  matchTransactions([tx(10, 'income', '2026-07-10', 'A')], [cand(10, 'expense', '2026-07-10')])[0].tier === 'new');
check('month boundary Jan 31 vs Feb 2 (Δ2) → tier 1', (() => {
  const r = matchTransactions([tx(10, 'expense', '2026-01-31', 'A')], [cand(10, 'expense', '2026-02-02')]);
  return r[0].tier === 1 && r[0].dateGapDays === 2;
})());

// 10. Description is never consulted for tiers 1/2:
// manual-log "Food" vs bank narrative, same amount/date/wallet → tier 1
check('manual "Food" vs bank narrative, same amount/date/wallet → tier 1',
  matchTransactions(
    [tx(12, 'expense', '2026-07-10', 'Food')],
    [cand(12, 'expense', '2026-07-10', 'QR PAY ZABEDIN NASI KANDAR MY')],
  )[0].tier === 1);

// 11. Invalid candidates (bad date, amount 0 / -5 / NaN / Infinity) → new, no crash
{
  const r = matchTransactions([tx(10, 'expense', '2026-07-10', 'Food')], [
    cand(10, 'expense', 'not-a-date'),
    cand(0, 'expense', '2026-07-10'),
    cand(-5, 'expense', '2026-07-10'),
    cand(NaN, 'expense', '2026-07-10'),
    cand(Infinity, 'expense', '2026-07-10'),
  ]);
  check('invalid candidates → all new, no crash', tiers(r) === 'new,new,new,new,new');
}

// 12. Perf sanity: 500 candidates × 5,000 existing completes (blocking keeps it fast)
{
  const bigExisting: Transaction[] = [];
  for (let i = 0; i < 5000; i++) {
    bigExisting.push(tx(
      (i % 200) + 0.5,
      i % 7 === 0 ? 'income' : 'expense',
      `2026-${String(1 + (i % 6)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      `row ${i}`,
      i % 3 === 0 ? 'w2' : 'w1',
    ));
  }
  const bigCands: MatchCandidate[] = [];
  for (let i = 0; i < 500; i++) {
    bigCands.push(cand(
      (i % 200) + 0.5,
      'expense',
      `2026-${String(1 + (i % 6)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      `import ${i}`,
      i % 2 === 0 ? 'w1' : 'w9',
    ));
  }
  const r = matchTransactions(bigExisting, bigCands);
  check('perf sanity: 500 × 5000 completes, results parallel to candidates', r.length === 500);
}

// 13. FX-exact: candidate USD 12.34 vs existing USD 12.34, same wallet, Δ3 →
// tier 1 (not tier 2) — foreign amount to the sen + currency is identity-grade.
{
  const e = [tx(52.4, 'expense', '2026-07-10', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD', fxRate: 4.2464 })];
  const r = matchTransactions(e, [
    cand(52.4, 'expense', '2026-07-13', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ]);
  check('FX-exact: same foreign amount/currency, Δ3 → tier 1 (not tier 2)',
    r[0].tier === 1 && r[0].matchedTxId === e[0].id && r[0].dateGapDays === 3);
}

// 14. FX-exact beats MYR drift: settled MYR differs (4.40 vs 4.55 rate), same
// foreign original → still tier 1 via the FX pass (the sen bucket can't see it).
{
  const e = [tx(56.15, 'expense', '2026-07-10', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD', fxRate: 4.55 })];
  const r = matchTransactions(e, [
    cand(54.3, 'expense', '2026-07-13', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ]);
  check('FX-exact: settled MYR differs (rate drift) → still tier 1',
    r[0].tier === 1 && r[0].matchedTxId === e[0].id);
}

// 15. FX-exact window: Δ8 > 7 → no FX match; the sen bucket differs (drift) so
// tier 2 can't see the row either → 'new'.
check('FX-exact: Δ8 outside window, MYR differs → new', (() => {
  const e = [tx(56.15, 'expense', '2026-07-10', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' })];
  return matchTransactions(e, [
    cand(54.3, 'expense', '2026-07-18', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ])[0].tier === 'new';
})());

// 16. Foreign amounts 1 cent apart (USD 12.34 vs 12.35) → no FX match; MYR sen
// equal + Δ1 + existing has FX → tier 2 (existing-FX rule still holds).
{
  const e = [tx(52.4, 'expense', '2026-07-10', 'AMAZON US', 'w1', { originalAmount: 12.35, originalCurrency: 'USD' })];
  const r = matchTransactions(e, [
    cand(52.4, 'expense', '2026-07-11', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ]);
  check('FX 1-cent mismatch → no FX match; MYR equal Δ1 → tier 2',
    r[0].tier === 2 && r[0].matchedTxId === e[0].id);
}

// 17. Candidate WITHOUT FX vs existing WITH FX, MYR equal, Δ1 → tier 2
// (unchanged behavior — the FX-exact pass needs both sides).
{
  const e = [tx(46.5, 'expense', '2026-07-10', 'COFFEE STARBUCKS US', 'w1', { originalAmount: 10, originalCurrency: 'USD', fxRate: 4.65 })];
  const r = matchTransactions(e, [cand(46.5, 'expense', '2026-07-11', 'COFFEE STARBUCKS US')]);
  check('plain candidate vs FX existing, Δ1 → tier 2 (unchanged)',
    r[0].tier === 2 && r[0].matchedTxId === e[0].id);
}

// 18. Currency mismatch: USD vs SGD with the same numbers → no FX match (falls
// to tier 2 via hasFx, since plain tier 1 excludes FX rows).
{
  const e = [tx(52.4, 'expense', '2026-07-10', 'AMAZON', 'w1', { originalAmount: 12.34, originalCurrency: 'SGD' })];
  const r = matchTransactions(e, [
    cand(52.4, 'expense', '2026-07-11', 'AMAZON', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ]);
  check('currency mismatch (USD vs SGD, same numbers) → no FX-exact (tier 2)',
    r[0].tier === 2 && r[0].matchedTxId === e[0].id);
}

// 19. One-to-one on FX pairs: two identical FX candidates, one FX existing →
// exactly one tier-1, and the nearer candidate (Δ1 over Δ2) wins the row.
{
  const e = [tx(52.4, 'expense', '2026-07-10', 'AMAZON US', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' })];
  const r = matchTransactions(e, [
    cand(52.4, 'expense', '2026-07-11', 'AMAZON US A', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
    cand(52.4, 'expense', '2026-07-12', 'AMAZON US B', 'w1', { originalAmount: 12.34, originalCurrency: 'USD' }),
  ]);
  check('FX one-to-one: 2 candidates vs 1 existing → exactly one tier-1 [1,new]',
    tiers(r) === '1,new');
  check('FX one-to-one: the nearer candidate wins the row',
    r[0].matchedTxId === e[0].id && r[0].dateGapDays === 1);
}

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`transaction-matcher OK (${passed} checks)`);
