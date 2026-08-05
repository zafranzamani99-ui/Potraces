/**
 * Unit test for sheetsLogic — the pure half of the Google Sheets sync.
 * Locks the sheet contract so it can't silently regress:
 *   • row mapping: 9 columns, local YYYY-MM-DD dates (Date OR ISO-string
 *     input), positive 2-decimal amounts, income/expense in the Type column,
 *     Vendor = description / Notes = rawInput, empty Wallet fallback
 *   • dedupe: an ID in the remote sheet OR the local synced set is skipped,
 *     everything else survives in input order
 *   • append chunking: 0 / 1 / 500 / 501-item boundaries
 *
 * Run:  npx tsx scripts/test-sheets-dedupe.ts
 */
import {
  SHEETS_SCHEMA_VERSION,
  SHEET_TAB,
  SHEET_HEADER,
  SHEETS_APPEND_CHUNK,
  SheetTxInput,
  transactionToSheetRow,
  filterUnsyncedTransactionIds,
  chunkArray,
} from '../src/services/sheetsLogic';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

function tx(partial: Partial<SheetTxInput> & { id: string }): SheetTxInput {
  return {
    type: 'expense',
    amount: 0,
    date: new Date(2026, 6, 15, 9, 0, 0),
    ...partial,
  };
}

console.log('constants');
check('schema version marker', SHEETS_SCHEMA_VERSION === 'potraces-schema-v1');
check('tab name', SHEET_TAB === 'Transactions');
check('header is 9 columns with ID first / Notes last',
  SHEET_HEADER.length === 9 && SHEET_HEADER[0] === 'ID' && SHEET_HEADER[8] === 'Notes');
check('append chunk is 500', SHEETS_APPEND_CHUNK === 500);

console.log('transactionToSheetRow — column mapping');
{
  const row = transactionToSheetRow(
    tx({
      id: 't1',
      amount: 12.5,
      category: 'food',
      description: 'Mamak Corner',
      rawInput: 'nasi lemak 12.50 at mamak',
      walletId: 'w1',
    }),
    { currency: 'RM', walletName: 'Maybank' },
  );
  check('9 columns', row.length === 9);
  check('ID', row[0] === 't1');
  check('Date local YYYY-MM-DD', row[1] === '2026-07-15');
  check('Type expense', row[2] === 'expense');
  check('Amount positive 2dp', row[3] === '12.50');
  check('Currency', row[4] === 'RM');
  check('Category', row[5] === 'food');
  check('Wallet name resolved', row[6] === 'Maybank');
  check('Vendor = description', row[7] === 'Mamak Corner');
  check('Notes = rawInput', row[8] === 'nasi lemak 12.50 at mamak');
}

console.log('transactionToSheetRow — income, ISO-string date, negative amount');
{
  // Build the ISO string from the same instant so the local-date expectation
  // holds in any machine timezone.
  const d = new Date(2026, 0, 5, 23, 30, 0);
  const row = transactionToSheetRow(
    tx({ id: 't2', type: 'income', amount: -7, date: d.toISOString(), description: 'Salary' }),
    { currency: 'RM' },
  );
  check('Type income', row[2] === 'income');
  check('Amount signed-positive (−7 → 7.00)', row[3] === '7.00');
  check('ISO-string date normalized to local YYYY-MM-DD', row[1] === '2026-01-05');
}

console.log('transactionToSheetRow — fallbacks');
{
  const row = transactionToSheetRow(tx({ id: 't3' }), { currency: 'RM' });
  check('missing walletName → empty Wallet cell', row[6] === '');
  check('missing description → empty Vendor cell', row[7] === '');
  check('missing rawInput → empty Notes cell', row[8] === '');
  check('missing category → empty Category cell', row[5] === '');
  const odd = transactionToSheetRow(tx({ id: 't4', date: 'not-a-date' }), { currency: 'RM' });
  check('unparseable date degrades to raw string, no crash', odd[1] === 'not-a-date');
}

console.log('filterUnsyncedTransactionIds');
{
  const all = ['a', 'b', 'c', 'd', 'e'];
  check('remote-only filtered', filterUnsyncedTransactionIds(all, ['b', 'd'], []).join(',') === 'a,c,e');
  check('local-only filtered', filterUnsyncedTransactionIds(all, [], ['a']).join(',') === 'b,c,d,e');
  check('union of both filtered', filterUnsyncedTransactionIds(all, ['b'], ['c', 'e']).join(',') === 'a,d');
  check('all known → empty', filterUnsyncedTransactionIds(all, ['a', 'b', 'c'], ['d', 'e']).length === 0);
  check('none known → all, input order', filterUnsyncedTransactionIds(all, [], []).join(',') === 'a,b,c,d,e');
  check('empty input → empty', filterUnsyncedTransactionIds([], ['x'], ['y']).length === 0);
  check('dupes in known sets are harmless',
    filterUnsyncedTransactionIds(['a', 'b'], ['a', 'a'], ['b', 'b']).length === 0);
}

console.log('chunkArray boundaries');
{
  const n = (count: number) => Array.from({ length: count }, (_, i) => i);
  check('0 items → no chunks', chunkArray(n(0), 500).length === 0);
  const one = chunkArray(n(1), 500);
  check('1 item → 1 chunk of 1', one.length === 1 && one[0].length === 1);
  const full = chunkArray(n(500), 500);
  check('500 items → exactly 1 chunk of 500', full.length === 1 && full[0].length === 500);
  const over = chunkArray(n(501), 500);
  check('501 items → 2 chunks (500 + 1)',
    over.length === 2 && over[0].length === 500 && over[1].length === 1);
  const twoFull = chunkArray(n(1000), 500);
  check('1000 items → 2 full chunks', twoFull.length === 2 && twoFull[1].length === 500);
  check('chunk contents preserved in order',
    over[0][0] === 0 && over[0][499] === 499 && over[1][0] === 500);
  check('size < 1 → no chunks', chunkArray(n(3), 0).length === 0);
}

console.log(`\n${failures === 0 ? '✅ all sheetsLogic tests passed' : `❌ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
