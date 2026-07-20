/**
 * Merchant → category guesser (Apple Pay Auto Log). Pure module, tsx-safe.
 * Layers: learned pattern → own history → built-in MY keywords → null (Other).
 * Run: npm run test:merchantguess
 */
import { guessMerchantCategory } from '../src/services/merchantCategoryGuess';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

const VALID = ['food', 'transport', 'shopping', 'entertainment', 'bills', 'health', 'other'];
const base = {
  type: 'expense' as const,
  learnedCategoryId: null as string | null,
  history: [] as Array<{ description: string; category: string; type: string }>,
  validCategoryIds: VALID,
};

// ── Layer 1: learned pattern wins ──
check('learned pattern beats keywords', guessMerchantCategory({
  ...base, note: 'McDonalds', learnedCategoryId: 'family',
  validCategoryIds: [...VALID, 'family'],
}) === 'family');
check('learned pattern skipped when category deleted', guessMerchantCategory({
  ...base, note: 'McDonalds', learnedCategoryId: 'deleted_cat',
}) === 'food'); // falls through to keywords

// ── Layer 2: own history ──
check('history match returns past category', guessMerchantCategory({
  ...base, note: 'Restoran Nasi Kandar Pelita',
  history: [{ description: 'NASI KANDAR PELITA', category: 'food', type: 'expense' }],
}) === 'food');
check('history tally picks most-used category', guessMerchantCategory({
  ...base, note: 'Warung Kak Yah',
  history: [
    { description: 'Warung Kak Yah', category: 'food', type: 'expense' },
    { description: 'Warung Kak Yah', category: 'food', type: 'expense' },
    { description: 'Warung Kak Yah', category: 'family', type: 'expense' },
  ],
  validCategoryIds: [...VALID, 'family'],
}) === 'food');
check('history ignores other type (income vs expense)', guessMerchantCategory({
  ...base, note: 'Mystery Shop',
  history: [{ description: 'Mystery Shop', category: 'salary', type: 'income' }],
}) === null);
check('history ignores invalid past category', guessMerchantCategory({
  ...base, note: 'Old Place',
  history: [{ description: 'Old Place', category: 'deleted_cat', type: 'expense' }],
}) === null);

// ── Layer 3: built-in keywords ──
check('McDonalds → food', guessMerchantCategory({ ...base, note: "McDONALD'S MALAYSIA" }) === 'food');
check('Shell → transport', guessMerchantCategory({ ...base, note: 'SHELL STATION PJ' }) === 'transport');
check('Petronas → transport', guessMerchantCategory({ ...base, note: 'PETRONAS KLIA2' }) === 'transport');
check('Watsons → health', guessMerchantCategory({ ...base, note: 'WATSONS PERSONAL CARE' }) === 'health');
check('Shopee → shopping', guessMerchantCategory({ ...base, note: 'SHOPEE*ORDER' }) === 'shopping');
check('Netflix → entertainment', guessMerchantCategory({ ...base, note: 'NETFLIX.COM' }) === 'entertainment');
check('Maxis → bills', guessMerchantCategory({ ...base, note: 'MAXIS POSTPAID' }) === 'bills');
check('Lotus groceries → food', guessMerchantCategory({ ...base, note: "LOTUS'S EXTRA" }) === 'food');

// ── Fallbacks ──
check('unknown merchant → null (keeps Other)', guessMerchantCategory({ ...base, note: 'Kedai Ah Chong' }) === null);
check('empty note → null', guessMerchantCategory({ ...base, note: '' }) === null);
check('keyword for deleted category → null', guessMerchantCategory({
  ...base, note: 'SHELL STATION', validCategoryIds: ['food', 'other'],
}) === null);
check('no valid categories at all → null', guessMerchantCategory({ ...base, note: 'KFC', validCategoryIds: [] }) === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
