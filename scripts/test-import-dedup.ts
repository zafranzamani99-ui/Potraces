/**
 * Pure-logic tests for count-aware import dedup.
 * No RN imports, so tsx runs it. Run: npm run test:importdedup
 */
import { markNewImportRows, importRowKey, ImportRowKey } from '../src/utils/importDedup';
import type { Transaction } from '../src/types';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

let _id = 0;
const tx = (amount: number, type: 'income' | 'expense', date: string, description: string, walletId = 'w1'): Transaction =>
  ({
    id: `t${++_id}`, amount, category: 'other', description, date: new Date(date),
    type, mode: 'personal', walletId, createdAt: new Date(), updatedAt: new Date(),
  } as Transaction);
const w = 'w1';

// 1. empty existing → everything is new
check('empty existing → all import', JSON.stringify(markNewImportRows([], [
  { amount: 10, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: w },
  { amount: 20, type: 'income', date: '2026-07-02', description: 'Salary', walletId: w },
])) === JSON.stringify([true, true]));

// 2. re-import the SAME file → every row skipped (the actual bug)
const existing2 = [tx(10, 'expense', '2026-07-01', 'Coffee', w), tx(20, 'income', '2026-07-02', 'Salary', w)];
const cand2: ImportRowKey[] = [
  { amount: 10, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: w },
  { amount: 20, type: 'income', date: '2026-07-02', description: 'Salary', walletId: w },
];
check('re-import identical → all skip', JSON.stringify(markNewImportRows(existing2, cand2)) === JSON.stringify([false, false]));

// 3. count-aware: 1 already exists, file has 2 of it → skip 1, import 1
const cand3: ImportRowKey[] = [
  { amount: 10, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: w },
  { amount: 10, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: w },
];
check('multiset: 1 existing, 2 candidates → [skip, import]',
  JSON.stringify(markNewImportRows([tx(10, 'expense', '2026-07-01', 'Coffee', w)], cand3)) === JSON.stringify([false, true]));

// 4. genuine same-day duplicates on a FIRST import → both kept
check('same-day dup, empty existing → both import', JSON.stringify(markNewImportRows([], cand3)) === JSON.stringify([true, true]));

// 5. any distinguishing attribute → treated as new
const ex5 = [tx(10, 'expense', '2026-07-01', 'Coffee', w)];
check('diff day → new', markNewImportRows(ex5, [{ amount: 10, type: 'expense', date: '2026-07-02', description: 'Coffee', walletId: w }])[0] === true);
check('diff amount → new', markNewImportRows(ex5, [{ amount: 11, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: w }])[0] === true);
check('diff wallet → new', markNewImportRows(ex5, [{ amount: 10, type: 'expense', date: '2026-07-01', description: 'Coffee', walletId: 'w2' }])[0] === true);
check('diff type → new', markNewImportRows(ex5, [{ amount: 10, type: 'income', date: '2026-07-01', description: 'Coffee', walletId: w }])[0] === true);

// 6. description normalized (case + collapsed whitespace) still matches
check('desc case/space normalized → skip',
  markNewImportRows([tx(10, 'expense', '2026-07-01', 'Kedai  Kopi', w)], [{ amount: 10, type: 'expense', date: '2026-07-01', description: 'kedai kopi', walletId: w }])[0] === false);

// 7. dedup is by transaction DATE (calendar day), not createdAt / time-of-day
check('same calendar day, diff time → skip',
  markNewImportRows([tx(10, 'expense', '2026-07-01T09:00:00', 'Coffee', w)], [{ amount: 10, type: 'expense', date: '2026-07-01T21:30:00', description: 'Coffee', walletId: w }])[0] === false);

// 8. importRowKey is stable across Date/string representations of the same input
check('importRowKey equal for string vs Date of same identity',
  importRowKey({ amount: 10, type: 'expense', date: '2026-07-01', description: 'A', walletId: w }) ===
  importRowKey({ amount: 10, type: 'expense', date: new Date('2026-07-01'), description: 'a', walletId: w }));

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`import-dedup OK (${passed} checks)`);
