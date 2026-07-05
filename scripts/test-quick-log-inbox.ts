/**
 * Unit test for the pure inbox → logQuickExpense mapping and its wallet effect.
 * Imports only the native-free mapper + logQuickExpense (store deps are tsx-safe
 * per test:wallet) — NOT quickLogInbox.ts, which imports supabase
 * (expo-secure-store) and cannot load under tsx. The supabase fetch/mark path in
 * drainQuickLogInbox() is verified manually.
 * Run: npx tsx scripts/test-quick-log-inbox.ts
 */
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from '../src/services/quickLogInboxMap';
import { logQuickExpense } from '../src/services/quickLog';
import { useWalletStore } from '../src/store/walletStore';
import { usePersonalStore } from '../src/store/personalStore';

let failures = 0;
const check = (n: string, c: boolean) => { if (!c) { failures++; console.error('FAIL:', n); } else console.log('ok:', n); };

// Seed one wallet (categories fall back to 'other' inside logQuickExpense).
useWalletStore.setState({ wallets: [{ id: 'w1', name: 'Cash', type: 'ewallet', balance: 100, icon: 'dollar-sign', color: '#000', isDefault: true } as any] });

const row: QuickLogInboxRow = {
  id: 'r1', user_id: 'u1', amount: 23.9, type: 'expense',
  category: 'food', wallet: 'Cash', note: 'Dinner',
  occurred_at: '2026-07-05T10:00:00.000Z', consumed_at: null,
};

const params = mapInboxRowToQuickLog(row);
check('amount mapped', params.amount === 23.9);
check('type mapped', params.type === 'expense');
check('category mapped', params.category === 'food');
check('wallet mapped', params.wallet === 'Cash');
check('note mapped', params.note === 'Dinner');
check('date is a Date', params.date instanceof Date);
check('invalid occurred_at → undefined date', mapInboxRowToQuickLog({ ...row, occurred_at: 'not-a-date' }).date === undefined);

const before = useWalletStore.getState().wallets[0].balance;
const result = logQuickExpense(params);
check('logQuickExpense returned a result', !!result);
const after = useWalletStore.getState().wallets[0].balance;
check('wallet deducted by amount', Math.round((before - after) * 100) / 100 === 23.9);
check('transaction written', usePersonalStore.getState().transactions.some((t: any) => t.amount === 23.9));

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log('all passed');
// Explicit exit: usePersonalStore/useWalletStore are zustand `persist` stores
// backed by AsyncStorage, whose fire-and-forget setItem() throws asynchronously
// under tsx ("window is not defined" — no browser/RN globals). That rejection
// surfaces on the microtask queue after this synchronous script body finishes,
// which would otherwise crash the process with exit 1 despite every check
// passing. process.exit(0) here wins the race, same as test-wallet-reconcile.ts.
process.exit(0);
