/**
 * Pure-logic tests for equal-split shares. No RN imports, so tsx runs it.
 * Run: npm run test:splitshares
 */
import { computeEqualShares } from '../src/utils/splitShares';
import type { Contact } from '../src/types';

const c = (id: string): Contact => ({ id, name: id, isFromPhone: false });
const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };
const sum = (ps: { amount: number }[]) => Math.round(ps.reduce((a, p) => a + p.amount, 0) * 100) / 100;

// even 4-way of 100
let r = computeEqualShares(100, [c('me'), c('a'), c('b'), c('d')], 'me');
check('4-way even → 25 each', r.every((p) => p.amount === 25));
check('4-way total preserved', sum(r) === 100);
check('payer flagged isPaid', r.find((p) => p.contact.id === 'me')!.isPaid === true);
check('non-payer not isPaid', r.find((p) => p.contact.id === 'a')!.isPaid === false);

// 3-way of 100 → remainder to payer
r = computeEqualShares(100, [c('me'), c('a'), c('b')], 'me');
check('3-way total preserved', sum(r) === 100);
check('payer absorbs remainder (33.34)', r.find((p) => p.contact.id === 'me')!.amount === 33.34);
check('others get 33.33', r.filter((p) => p.contact.id !== 'me').every((p) => p.amount === 33.33));

// single participant
r = computeEqualShares(50, [c('me')], 'me');
check('single participant gets all', r.length === 1 && r[0].amount === 50 && r[0].isPaid === true);

// payer not in contacts → remainder to first, nobody isPaid
r = computeEqualShares(90, [c('a'), c('b'), c('d')], 'ghost');
check('payer absent → total preserved', sum(r) === 90);
check('payer absent → none isPaid', r.every((p) => p.isPaid === false));

// null payer → remainder to first contact, none isPaid
r = computeEqualShares(10, [c('a'), c('b'), c('d')], null);
check('null payer → total preserved', sum(r) === 10);
check('null payer → none isPaid', r.every((p) => p.isPaid === false));

// empty contacts → empty
check('empty contacts → []', computeEqualShares(100, [], 'me').length === 0);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`split-shares OK (${passed} checks)`);
