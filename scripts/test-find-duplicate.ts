/**
 * Pure-logic tests for the manual-log duplicate guards: the 10-minute double-tap
 * window (findRecentDuplicate) and the same-day cross-channel warning
 * (findSameDayDuplicate, design doc §10). No RN imports, so tsx runs it.
 * Run: npm run test:findduplicate
 */
import { findRecentDuplicate, findSameDayDuplicate } from '../src/utils/findDuplicateTransaction';
import type { Transaction } from '../src/types';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

let _id = 0;
// walletId defaults to 'w1' when the key is absent; pass walletId: undefined
// explicitly to build a wallet-less transaction.
const tx = (over: { createdAt: Date; amount?: number; type?: 'income' | 'expense'; walletId?: string; description?: string }): Transaction =>
  ({
    id: `t${++_id}`, amount: over.amount ?? 12.5, category: 'other',
    description: over.description ?? 'Coffee', date: over.createdAt,
    type: over.type ?? 'expense', mode: 'personal',
    walletId: 'walletId' in over ? over.walletId : 'w1',
    createdAt: over.createdAt, updatedAt: over.createdAt,
  } as Transaction);

// Local-time constructors keep the calendar-day assertions timezone-independent.
const NOW = new Date(2026, 6, 5, 21, 0, 0); // 5 Jul 2026, 21:00 local
const cand = { amount: 12.5, walletId: 'w1', type: 'expense' as const, now: NOW };
const morning = new Date(2026, 6, 5, 8, 30, 0); // same local day, ~12.5h earlier

// 1. same calendar day, different hour, created >10 min ago → match
check('same day diff hour → match', findSameDayDuplicate([tx({ createdAt: morning })], cand) !== null);

// 2. ≤10 min old → NOT a same-day match (the recent window owns that range)
const nineMinAgo = new Date(NOW.getTime() - 9 * 60000);
const tenMinAgo = new Date(NOW.getTime() - 10 * 60000);
check('9 min old → no same-day match', findSameDayDuplicate([tx({ createdAt: nineMinAgo })], cand) === null);
check('exactly 10 min old → no same-day match (recent-window boundary)', findSameDayDuplicate([tx({ createdAt: tenMinAgo })], cand) === null);

// 3. 11 min old, same day → match (handover point from the recent window)
const elevenMinAgo = new Date(NOW.getTime() - 11 * 60000);
check('11 min old same day → match', findSameDayDuplicate([tx({ createdAt: elevenMinAgo })], cand) !== null);

// 4. yesterday same amount → no match — calendar day, not a 24h window
check('yesterday same amount → no match', findSameDayDuplicate([tx({ createdAt: new Date(2026, 6, 4, 10, 0, 0) })], cand) === null);
// previous day only 45 min before `now` (>10 min old) still must not match
check('prev day 45 min ago → no match (calendar day ≠ 24h)',
  findSameDayDuplicate([tx({ createdAt: new Date(2026, 6, 4, 23, 30, 0) })], { ...cand, now: new Date(2026, 6, 5, 0, 15, 0) }) === null);

// 5. 1-sen difference → no match (sen-exact, no tolerance)
check('1 sen off → no match', findSameDayDuplicate([tx({ createdAt: morning, amount: 12.51 })], cand) === null);

// 6. different wallet → no match
check('different wallet → no match', findSameDayDuplicate([tx({ createdAt: morning, walletId: 'w2' })], cand) === null);

// 7. income vs expense → no match
check('income vs expense → no match', findSameDayDuplicate([tx({ createdAt: morning, type: 'income' })], cand) === null);

// 8. returns the matched tx itself (the alert shows its description)
check('returns matched tx (description for alert)',
  findSameDayDuplicate([tx({ createdAt: morning, description: 'Nasi lemak' })], cand)?.description === 'Nasi lemak');

// 9. wallet-less candidate matches wallet-less tx (mirrors recent-guard semantics)
check('undefined wallet matches undefined wallet',
  findSameDayDuplicate([tx({ createdAt: morning, walletId: undefined })], { amount: 12.5, type: 'expense', now: NOW }) !== null);
check('undefined candidate wallet ≠ defined tx wallet',
  findSameDayDuplicate([tx({ createdAt: morning, walletId: 'w1' })], { amount: 12.5, type: 'expense', now: NOW }) === null);

// 10. existing 10-minute guard untouched (relative to real now — it reads Date.now())
check('recent guard still matches <10 min',
  findRecentDuplicate([tx({ createdAt: new Date(Date.now() - 9 * 60000) })], { amount: 12.5, walletId: 'w1', type: 'expense' }) !== null);
check('recent guard still ignores >10 min',
  findRecentDuplicate([tx({ createdAt: new Date(Date.now() - 60 * 60000) })], { amount: 12.5, walletId: 'w1', type: 'expense' }) === null);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`find-duplicate OK (${passed} checks)`);
