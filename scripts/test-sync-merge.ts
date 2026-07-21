/**
 * Sync merge tests — personalSyncMerge (pure conflict/merge/tombstone rules).
 *
 * Covers the multi-device conflict-resolution contract:
 *   - remoteWinsScalar skew-tolerant LWW (incl. exact SKEW_MS boundary + id tie-break)
 *   - mergeById add/keep/merge + the M1 anti-resurrection tombstone guarantee
 *   - mergeWallet: money block wholesale from the newer side, cosmetics per-field
 *   - mergeSavings: snapshot union + basis re-derivation (order-independent convergence)
 *   - dedupeBudgetsByCategory: one-budget-per-category invariant
 *   - mergeDebt / mergeGoal / mergeReceipt representative conflicts
 *   - idempotence: re-merging the same remote is a no-op for every mergeFn
 *
 * Pure modules only (no RN / store / Supabase). Run: npm run test:syncmerge
 */
import {
  round2, newer, keep, childUnion, SKEW_MS, remoteWinsScalar, mergeById,
  mergeDebt, mergeGoal, mergeReceipt, mergeSavings, mergeWallet, dedupeBudgetsByCategory,
} from '../src/services/personalSyncMerge';
import { replayCapitalMoves } from '../src/screens/personal/savings/savingsMath';
import { roundMoney } from '../src/utils/money';
import type { Debt, Goal, SavingsAccount, SavedReceipt, Wallet } from '../src/types';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// Deep equality: Dates by time, undefined == absent key, arrays ordered.
const deepEq = (a: any, b: any): boolean => {
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEq(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (!deepEq(a[k], b[k])) return false;
    return true;
  }
  return a === b;
};

const EPOCH = Date.UTC(2026, 5, 1); // 2026-06-01T00:00:00Z
const T = (offsetMs: number) => new Date(EPOCH + offsetMs);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort().join(',');

// ═══ 0. Scalar helpers ════════════════════════════════════════════════════════
check('round2: 1.005 → 1.01 (EPSILON-safe)', round2(1.005) === 1.01);
check('round2: 0.1+0.2 → 0.3', round2(0.1 + 0.2) === 0.3);

{
  const a = { id: 'a', updatedAt: T(0) };
  const b = { id: 'b', updatedAt: T(1) };
  check('newer: later side wins', newer(a, b) === b && newer(b, a) === b);
  const b2 = { id: 'b', updatedAt: T(0) };
  check('newer: exact tie → remote (second arg) wins', newer(a, b2) === b2 && newer(b2, a) === a);
}

check('keep: skips undefined/null/empty-string', keep(undefined, null, '', 'x') === 'x');
check('keep: real 0 is a value, not empty', keep(0, 5) === 0);
check('keep: nothing present → undefined', keep(undefined, '', null) === undefined);

{
  const p1 = { id: 'p1', amount: 100 };
  const p1edited = { id: 'p1', amount: 120, editLog: [{ editedAt: T(0), previousAmount: 100 }] };
  const p2 = { id: 'p2', amount: 150 };
  const u = childUnion<any>([p1], [p1edited, p2]);
  check('childUnion: unions distinct ids', u.length === 2 && ids(u) === 'p1,p2');
  check('childUnion: id conflict → longer editLog wins', u.find((x) => x.id === 'p1') === p1edited);
  const u2 = childUnion<any>([p1], [{ id: 'p1', amount: 999 }]);
  check('childUnion: id conflict with equal editLog length → first-arg copy kept', u2[0] === p1 && u2.length === 1);
}

// ═══ 1. remoteWinsScalar — skew-tolerant LWW ═════════════════════════════════
{
  const row = (id: string, tOff: number) => ({ id, updatedAt: T(tOff) });
  // clear wins beyond the skew window (id irrelevant)
  check('LWW: remote newer beyond skew → remote wins', remoteWinsScalar(row('z', 0), row('a', SKEW_MS + 1)) === true);
  check('LWW: local newer beyond skew → local wins', remoteWinsScalar(row('a', SKEW_MS + 1), row('z', 0)) === false);
  // exact-timestamp tie → deterministic id tie-break (higher id wins)
  check('LWW: exact tie, remote id higher → remote', remoteWinsScalar(row('a', 0), row('b', 0)) === true);
  check('LWW: exact tie, remote id lower → local', remoteWinsScalar(row('b', 0), row('a', 0)) === false);
  // exactly AT the boundary (|diff| === SKEW_MS): still inside the window → id tie-break, NOT time
  check('LWW boundary: remote exactly SKEW_MS newer but lower id → local (tie-break rules)',
    remoteWinsScalar(row('b', 0), row('a', SKEW_MS)) === false);
  check('LWW boundary: local exactly SKEW_MS newer but remote id higher → remote (tie-break rules)',
    remoteWinsScalar(row('a', SKEW_MS), row('b', 0)) === true);
  // one ms past the boundary: time wins again, id ignored
  check('LWW boundary+1: remote SKEW_MS+1 newer, lower id → remote (time wins)',
    remoteWinsScalar(row('b', 0), row('a', SKEW_MS + 1)) === true);
  check('LWW boundary+1: local SKEW_MS+1 newer, remote id higher → local (time wins)',
    remoteWinsScalar(row('b', SKEW_MS + 1), row('z', 0)) === false);
}

// ═══ 2. mergeById — add / keep / tombstones / mergeFn contract ═══════════════
{
  const row = (id: string, tOff: number, v: string) => ({ id, updatedAt: T(tOff), v });
  const local = [row('a', 0, 'local-a'), row('b', 0, 'local-b')];
  const remote = [row('b', 10_000, 'remote-b'), row('c', 0, 'remote-c')];

  // mergeFn contract: invoked ONLY for rows present on both sides, as (local, remote)
  const calls: Array<[any, any]> = [];
  const spy = (l: any, r: any) => { calls.push([l, r]); return { ...r, mergedBySpy: true }; };
  const out = mergeById<any>(local, remote, { mergeFn: spy });
  check('mergeById: remote-only added + local-only kept', ids(out) === 'a,b,c');
  check('mergeById: local-only row is the local copy', out.find((x) => x.id === 'a') === local[0]);
  check('mergeById: mergeFn invoked exactly once (only the overlap)', calls.length === 1);
  check('mergeById: mergeFn receives (localCopy, remoteCopy)', calls[0]?.[0] === local[1] && calls[0]?.[1] === remote[0]);
  check('mergeById: mergeFn result replaces the overlapping row', (out.find((x) => x.id === 'b') as any)?.mergedBySpy === true);

  // M1 anti-resurrection: tombstoned ids never come back — from EITHER side
  const dead = new Set(['b', 'c']);
  const calls2: Array<[any, any]> = [];
  const out2 = mergeById<any>(local, remote, { mergeFn: (l, r) => { calls2.push([l, r]); return r; }, deletedIds: dead });
  check('tombstone: remote copy can NEVER resurrect a deleted row', !out2.some((x) => x.id === 'c'));
  check('tombstone: a lingering LOCAL copy of a deleted row is removed too', !out2.some((x) => x.id === 'b'));
  check('tombstone: only live rows survive', ids(out2) === 'a');
  check('tombstone: mergeFn never runs for tombstoned rows', calls2.length === 0);

  // no mergeFn → whole-row skew-tolerant LWW
  const lwwOut = mergeById<any>(local, remote); // remote-b is 10s newer (beyond skew)
  check('mergeById LWW: remote newer beyond skew → remote row wins', (lwwOut.find((x) => x.id === 'b') as any)?.v === 'remote-b');
  const lwwOut2 = mergeById<any>([row('b', 10_000, 'local-b')], [row('b', 0, 'remote-b')]);
  check('mergeById LWW: local newer beyond skew → local row kept', (lwwOut2[0] as any).v === 'local-b');
  // same row id, near-tie: id tie-break compares identical ids → local retained (pinned)
  const lwwOut3 = mergeById<any>([row('x', 0, 'local-x')], [row('x', SKEW_MS, 'remote-x')]);
  check('mergeById LWW: same-id conflict within skew window → LOCAL copy retained (id tie-break is a no-op on equal ids)',
    (lwwOut3[0] as any).v === 'local-x');
}

// ═══ 3. mergeWallet — money wholesale, cosmetics per-field ═══════════════════
const wallet = (over: Partial<Wallet> & { id: string; updatedAt: Date }): Wallet => ({
  name: 'Cash', type: 'cash', balance: 0, icon: 'wallet', color: '#111111',
  isDefault: false, createdAt: T(0), ...over,
} as Wallet);
{
  // Both sides fully define ALL FOUR money fields with distinct values — proves no cross-side mixing.
  const lNewer = wallet({ id: 'w1', updatedAt: T(60_000), name: 'Maybank', type: 'credit', balance: 900, usedCredit: 150, creditLimit: 4000, initialBalance: 100 });
  const rOlder = wallet({ id: 'w1', updatedAt: T(0), name: 'Old Maybank', type: 'credit', balance: 700, usedCredit: 300, creditLimit: 6000, initialBalance: 50 });
  const m = mergeWallet(lNewer, rOlder);
  check('wallet money: newer (local) side wins WHOLESALE — all four fields',
    m.balance === 900 && m.usedCredit === 150 && m.creditLimit === 4000 && m.initialBalance === 100);
  check('wallet money: balance and usedCredit never mix across sides',
    !(m.balance === 900 && m.usedCredit === 300) && !(m.balance === 700 && m.usedCredit === 150));
  const m2 = mergeWallet(rOlder, lNewer); // remote newer → remote block wholesale
  check('wallet money: newer (remote) side wins WHOLESALE symmetrically',
    m2.balance === 900 && m2.usedCredit === 150 && m2.creditLimit === 4000 && m2.initialBalance === 100);

  // cosmetic per-field newer-wins with the empty guard
  const lName = wallet({ id: 'w2', updatedAt: T(0), name: 'Maybank', color: '#4F5104', presetId: 'maybank', creditBank: 'CIMB', creditNetwork: 'visa' });
  const rBlank = wallet({ id: 'w2', updatedAt: T(60_000), name: '', color: '#222222' });
  const m3 = mergeWallet(lName, rBlank);
  check('wallet cosmetic: empty-string name on the newer side never blanks the real name', m3.name === 'Maybank');
  check('wallet cosmetic: real newer value wins per-field (color)', m3.color === '#222222');
  check('wallet cosmetic: absent presetId/creditBank/creditNetwork fill from the other side',
    m3.presetId === 'maybank' && m3.creditBank === 'CIMB' && m3.creditNetwork === 'visa');
  const m3rev = mergeWallet(rBlank, lName); // older side has the name, newer side blank — either arg order
  check('wallet cosmetic: empty-guard holds regardless of arg order', m3rev.name === 'Maybank');

  // absent-value ?? fallback fills, but a REAL 0 is never treated as missing
  const lHasCredit = wallet({ id: 'w3', updatedAt: T(0), type: 'credit', balance: 500, usedCredit: 200, creditLimit: 5000, initialBalance: 500 });
  const rNoCredit = wallet({ id: 'w3', updatedAt: T(60_000), type: 'credit', balance: 480 }); // non-credit round-trip: money extras undefined
  const m4 = mergeWallet(lHasCredit, rNoCredit);
  check('wallet fill: newer side missing usedCredit/creditLimit/initialBalance → filled from other side',
    m4.balance === 480 && m4.usedCredit === 200 && m4.creditLimit === 5000 && m4.initialBalance === 500);
  const rZeroCredit = wallet({ id: 'w3', updatedAt: T(60_000), type: 'credit', balance: 480, usedCredit: 0 });
  const m5 = mergeWallet(lHasCredit, rZeroCredit);
  check('wallet fill: a REAL usedCredit 0 on the newer side survives (?? does not fabricate/replace zeros)', m5.usedCredit === 0);
}

// ═══ 4. mergeSavings — snapshot union + basis re-derivation ══════════════════
const savings = (over: Partial<SavingsAccount> & { id: string; updatedAt: Date }): SavingsAccount => ({
  name: 'ASB', type: 'investment', initialInvestment: 0, currentValue: 0,
  history: [], createdAt: T(0), ...over,
} as SavingsAccount);
{
  // Two-device invested-edit scenario:
  //   shared base: one deposit snapshot h0 (basis 1000, seed 0)
  //   device A: edits invested +500 → capitalDelta adjustment entry hA (value unchanged)
  //   device B: concurrently deposits 300 → hB
  const h0 = { id: 'h0', date: T(0), value: 1000, snapshotType: 'deposit' as const, capitalDelta: 1000 };
  const hA = { id: 'hA', date: T(9 * 86_400_000), value: 1000, capitalDelta: 500, note: 'invested edit adjustment' };
  const hB = { id: 'hB', date: T(10 * 86_400_000), value: 1300, snapshotType: 'deposit' as const, capitalDelta: 300 };
  const devA = savings({ id: 'sv1', updatedAt: T(11 * 86_400_000), initialInvestment: 1500, currentValue: 1000, history: [h0, hA] });
  const devB = savings({ id: 'sv1', updatedAt: T(11 * 86_400_000 + 5000), initialInvestment: 1300, currentValue: 1300, history: [h0, hB] });

  const expectedBasis = roundMoney(0 /* shared seed */ + replayCapitalMoves([h0, hA, hB])); // 1800
  const mAB = mergeSavings(devA, devB);
  const mBA = mergeSavings(devB, devA);

  check('savings: snapshot childUnion by id — shared h0 not duplicated, all three present',
    mAB.history.length === 3 && ids(mAB.history as any) === 'h0,hA,hB');
  check('savings: merged history sorted ascending by date',
    mAB.history.map((h) => h.id).join(',') === 'h0,hA,hB');
  check('savings: currentValue re-read from the LATEST merged snapshot', mAB.currentValue === 1300);
  check('savings: basis re-derived as seed + replayCapitalMoves(merged) = 1800',
    mAB.initialInvestment === expectedBasis && expectedBasis === 1800);
  check('savings: both merge orders converge — identical basis',
    mAB.initialInvestment === mBA.initialInvestment);
  check('savings: both merge orders converge — identical history length + order + currentValue',
    mBA.history.length === 3 && mAB.history.map((h) => h.id).join(',') === mBA.history.map((h) => h.id).join(',')
    && mAB.currentValue === mBA.currentValue);

  // seeds disagree (a conflicting "put in" edit) → fall back to the NEWER row's seed
  const devA2 = savings({ ...devA, initialInvestment: 1600, updatedAt: T(12 * 86_400_000) }); // seed 100, newer than devB
  const m2 = mergeSavings(devA2, devB);
  check('savings: disagreeing seeds → newer row\'s seed wins (100 + 1800 = 1900)', m2.initialInvestment === 1900);

  // no history → currentValue stays the newer row's scalar
  const bare1 = savings({ id: 'sv2', updatedAt: T(0), currentValue: 50, initialInvestment: 50 });
  const bare2 = savings({ id: 'sv2', updatedAt: T(5000), currentValue: 75, initialInvestment: 75 });
  check('savings: empty history → currentValue from the newer row', mergeSavings(bare1, bare2).currentValue === 75);
}

// ═══ 5. dedupeBudgetsByCategory ══════════════════════════════════════════════
{
  const bud = (id: string, category: string, tOff: number) => ({ id, category, updatedAt: T(tOff) });
  const older = bud('b1', 'food', 0);
  const recent = bud('b2', 'food', 5000); // beyond SKEW_MS → edit time decides
  let d = dedupeBudgetsByCategory([older, recent]);
  check('budget dedupe: same category → most-recently-edited wins', d.winners.length === 1 && d.winners[0].id === 'b2');
  check('budget dedupe: loser id reported for tombstoning', d.loserIds.length === 1 && d.loserIds[0] === 'b1');
  d = dedupeBudgetsByCategory([recent, older]);
  check('budget dedupe: input order does not change the winner', d.winners[0].id === 'b2' && d.loserIds[0] === 'b1');

  d = dedupeBudgetsByCategory([bud('b3', 'Food', 0), bud('b4', 'food', 5000)]);
  check('budget dedupe: category match is case-insensitive', d.winners.length === 1 && d.winners[0].id === 'b4' && d.loserIds[0] === 'b3');

  d = dedupeBudgetsByCategory([bud('b5', 'food', 0), bud('b6', 'transport', 0)]);
  check('budget dedupe: different categories untouched', d.winners.length === 2 && d.loserIds.length === 0);

  // near-tie inside the skew window → deterministic id tie-break, both input orders converge
  const tieA = bud('b7', 'food', 0);
  const tieB = bud('b8', 'food', 1000);
  const d1 = dedupeBudgetsByCategory([tieA, tieB]);
  const d2 = dedupeBudgetsByCategory([tieB, tieA]);
  check('budget dedupe: within-skew near-tie → higher id wins in BOTH input orders',
    d1.winners[0].id === 'b8' && d2.winners[0].id === 'b8' && d1.loserIds[0] === 'b7' && d2.loserIds[0] === 'b7');
}

// ═══ 6. mergeDebt / mergeGoal / mergeReceipt ═════════════════════════════════
const contact = { id: 'ct1', name: 'Ali', isFromPhone: false };
const debt = (over: Partial<Debt> & { id: string; updatedAt: Date }): Debt => ({
  contact, type: 'i_owe', totalAmount: 300, paidAmount: 0, status: 'pending',
  description: 'lunch loan', payments: [], mode: 'personal', createdAt: T(0), ...over,
} as Debt);
{
  const p1 = { id: 'p1', amount: 100, date: T(0), createdAt: T(0) };
  const p2 = { id: 'p2', amount: 150, date: T(1000), createdAt: T(1000) };
  const lDebt = debt({ id: 'd1', updatedAt: T(0), paidAmount: 100, status: 'partial', payments: [p1] });
  const rDebt = debt({ id: 'd1', updatedAt: T(10_000), description: '', paidAmount: 150, status: 'partial', payments: [p2] });
  const m = mergeDebt(lDebt, rDebt);
  check('debt: payment-history childUnion — neither device\'s payment dropped', m.payments.length === 2 && ids(m.payments) === 'p1,p2');
  check('debt: paidAmount recomputed from merged payments', m.paidAmount === 250);
  check('debt: status re-derived (partial)', m.status === 'partial');
  check('debt: empty remote description never blanks the local one', m.description === 'lunch loan');

  const rOverpay = debt({ id: 'd1', updatedAt: T(10_000), payments: [p2, { id: 'p3', amount: 250, date: T(2000), createdAt: T(2000) }] });
  const mCap = mergeDebt(lDebt, rOverpay);
  check('debt: merged payments over total → paidAmount capped at totalAmount, settled', mCap.paidAmount === 300 && mCap.status === 'settled');
}

const goal = (over: Partial<Goal> & { id: string; updatedAt: Date }): Goal => ({
  name: 'Umrah', targetAmount: 20000, currentAmount: 0, category: 'travel',
  icon: 'target', color: '#B2780A', contributions: [], milestones: [], createdAt: T(0), ...over,
} as Goal);
{
  const c1 = { id: 'c1', amount: 500, date: T(0) };
  const c2 = { id: 'c2', amount: 250.005, date: T(1000) };
  const lGoal = goal({ id: 'g1', updatedAt: T(0), currentAmount: 500, contributions: [c1] });
  const rGoal = goal({ id: 'g1', updatedAt: T(10_000), icon: '', color: '', currentAmount: 250.005, contributions: [c2] });
  const m = mergeGoal(lGoal, rGoal);
  check('goal: contribution childUnion — both devices\' contributions kept', m.contributions.length === 2 && ids(m.contributions) === 'c1,c2');
  check('goal: currentAmount recomputed (rounded) from merged contributions', m.currentAmount === 750.01);
  check('goal: blank remote icon/color never blanks the local look', m.icon === 'target' && m.color === '#B2780A');
}

const receipt = (over: Partial<SavedReceipt> & { id: string; updatedAt: Date }): SavedReceipt => ({
  title: 'Tesco run', items: [], total: 6.9, date: T(0), category: 'groceries',
  myTaxCategory: 'none', verified: true, year: 2026, createdAt: T(0), ...over,
} as SavedReceipt);
{
  // Local holds the device-local image path; the (newer) remote copy holds only the bucket path.
  const lRec = receipt({ id: 'rc1', updatedAt: T(0), imageUri: 'file:///local/rc1.jpg' });
  const rRec = receipt({ id: 'rc1', updatedAt: T(10_000), title: 'Tesco Extra', remoteImagePath: 'uid/personal/rc1.jpg' });
  const m = mergeReceipt(lRec, rRec);
  check('receipt: scalar LWW — newer remote title wins', m.title === 'Tesco Extra');
  check('receipt: device-local imageUri preserved across LWW', m.imageUri === 'file:///local/rc1.jpg');
  check('receipt: remoteImagePath preserved from whichever side has it', m.remoteImagePath === 'uid/personal/rc1.jpg');
  const mRev = mergeReceipt(rRec, lRec); // local newer this time — bucket path must still survive
  check('receipt: both image references survive regardless of which side is newer',
    mRev.imageUri === 'file:///local/rc1.jpg' && mRev.remoteImagePath === 'uid/personal/rc1.jpg');
}

// ═══ 7. Idempotence — re-merging the same remote changes nothing ═════════════
{
  const idem = (name: string, local: any[], remote: any[], mergeFn: (l: any, r: any) => any) => {
    const M1 = mergeById<any>(local, remote, { mergeFn });
    const M1b = mergeById<any>(local, remote, { mergeFn });
    const M2 = mergeById<any>(M1, remote, { mergeFn });
    check(`idempotence(${name}): same inputs merge deterministically`, deepEq(M1, M1b));
    check(`idempotence(${name}): re-merging the merged result with the same remote is a no-op`, deepEq(M1, M2));
  };

  idem('wallet',
    [wallet({ id: 'w1', updatedAt: T(0), name: 'Maybank', type: 'credit', balance: 900, usedCredit: 200, creditLimit: 5000, initialBalance: 100 })],
    [wallet({ id: 'w1', updatedAt: T(60_000), name: '', type: 'credit', balance: 700 }), wallet({ id: 'w9', updatedAt: T(0), name: 'TNG', type: 'ewallet', balance: 20 })],
    mergeWallet);

  idem('debt',
    [debt({ id: 'd1', updatedAt: T(0), paidAmount: 100, status: 'partial', payments: [{ id: 'p1', amount: 100, date: T(0), createdAt: T(0) }] } as any)],
    [debt({ id: 'd1', updatedAt: T(10_000), description: '', payments: [{ id: 'p2', amount: 150, date: T(1000), createdAt: T(1000) }] } as any)],
    mergeDebt);

  idem('goal',
    [goal({ id: 'g1', updatedAt: T(0), currentAmount: 500, contributions: [{ id: 'c1', amount: 500, date: T(0) }] } as any)],
    [goal({ id: 'g1', updatedAt: T(10_000), icon: '', contributions: [{ id: 'c2', amount: 250, date: T(1000) }] } as any)],
    mergeGoal);

  idem('receipt',
    [receipt({ id: 'rc1', updatedAt: T(0), imageUri: 'file:///local/rc1.jpg' })],
    [receipt({ id: 'rc1', updatedAt: T(10_000), remoteImagePath: 'uid/personal/rc1.jpg' })],
    mergeReceipt);

  idem('savings',
    [savings({ id: 'sv1', updatedAt: T(11 * 86_400_000), initialInvestment: 1500, currentValue: 1000,
      history: [{ id: 'h0', date: T(0), value: 1000, snapshotType: 'deposit', capitalDelta: 1000 }, { id: 'hA', date: T(9 * 86_400_000), value: 1000, capitalDelta: 500 }] } as any)],
    [savings({ id: 'sv1', updatedAt: T(11 * 86_400_000 + 5000), initialInvestment: 1300, currentValue: 1300,
      history: [{ id: 'h0', date: T(0), value: 1000, snapshotType: 'deposit', capitalDelta: 1000 }, { id: 'hB', date: T(10 * 86_400_000), value: 1300, snapshotType: 'deposit', capitalDelta: 300 }] } as any)],
    mergeSavings);
}

// ═══ Report ══════════════════════════════════════════════════════════════════
if (failures.length) {
  console.error(`❌ FAIL (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log(`✅ sync-merge OK (${passed} checks)`);
process.exit(0);
