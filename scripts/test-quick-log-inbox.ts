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

// ── Wallet alias resolution (field bug: "TNG"/"Cash" silently hit Bank) ──────
// User wallets named nothing like the Shortcut's labels: "Touch 'n Go" +
// default "Maybank" bank. Choosing "📱 TNG" must hit the e-wallet, not Bank.
useWalletStore.setState({ wallets: [
  { id: 'b1', name: 'Maybank', type: 'bank', balance: 1000, icon: 'home', color: '#000', isDefault: true } as any,
  { id: 'e1', name: "Touch 'n Go", type: 'ewallet', balance: 50, icon: 'phone', color: '#000', isDefault: false } as any,
] });
const tngResult = logQuickExpense({ amount: 5, type: 'expense', wallet: '📱 TNG' });
check('TNG resolves to the e-wallet (type fallback), not default Bank', tngResult?.walletId === 'e1');
check('bank untouched by TNG log', useWalletStore.getState().wallets.find((w) => w.id === 'b1')!.balance === 1000);

// Choosing "💵 Cash" with NO cash-like wallet must create one — never charge Bank.
const cashResult = logQuickExpense({ amount: 7, type: 'expense', wallet: '💵 Cash' });
check('Cash auto-creates a Cash wallet instead of hitting Bank', cashResult?.walletName === 'Cash');
check('bank untouched by Cash log', useWalletStore.getState().wallets.find((w) => w.id === 'b1')!.balance === 1000);
check('created Cash wallet carries the deduction', useWalletStore.getState().wallets.find((w) => w.name === 'Cash')!.balance === -7);

// Unknown label still falls back to the default wallet (unchanged behaviour).
const unknownResult = logQuickExpense({ amount: 3, type: 'expense', wallet: 'Duitku' });
check('unknown label falls back to default wallet', unknownResult?.walletId === 'b1');

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log('all passed');
// Explicit exit: usePersonalStore/useWalletStore are zustand `persist` stores
// backed by AsyncStorage, whose fire-and-forget setItem() throws asynchronously
// under tsx ("window is not defined" — no browser/RN globals). That rejection
// surfaces on the microtask queue after this synchronous script body finishes,
// which would otherwise crash the process with exit 1 despite every check
// passing. process.exit(0) here wins the race, same as test-wallet-reconcile.ts.
process.exit(0);
