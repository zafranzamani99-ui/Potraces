/**
 * Round-trip completeness test for personal-mode sync mappers.
 *
 * WHY: the 2026-06-11 data loss happened because mappers silently dropped fields.
 * This test builds a FULLY-POPULATED fixture for every synced entity, runs it
 * through toRemote → (server adds timestamps) → fromRemote, and asserts the value
 * survives unchanged. If a field stops round-tripping, this FAILS.
 *
 * DISCIPLINE: when you add a field to a synced type, you MUST (1) carry it in both
 * mappers in personalSyncMappers.ts, (2) add a column in the Supabase migration,
 * and (3) add it to the fixture below. Do not relax this test to make it pass —
 * that is exactly how data was lost. Fields intentionally NOT synced go in IGNORE
 * with a written reason.
 *
 * Run:  npm run test:sync   (uses tsx — no React-Native/Supabase imports needed,
 *       because the mappers are pure.)
 */
import {
  txToRemote, walletToRemote, transferToRemote, subToRemote, budgetToRemote,
  goalToRemote, debtToRemote, splitToRemote, contactToRemote, savingsToRemote, receiptToRemote,
  txFromRemote, walletFromRemote, transferFromRemote, subFromRemote, budgetFromRemote,
  goalFromRemote, debtFromRemote, splitFromRemote, contactFromRemote, savingsFromRemote, receiptFromRemote,
} from '../src/services/personalSyncMappers';
import type {
  Transaction, Wallet, WalletTransfer, Subscription, Budget, Goal,
  Debt, SplitExpense, Contact, SavingsAccount, SavedReceipt,
} from '../src/types';

const UID = 'user-123';
const D0 = new Date('2026-01-01T08:00:00.000Z');
const D1 = new Date('2026-06-11T10:30:00.000Z');
const D2 = new Date('2026-06-12T12:00:00.000Z');

const contact = (over: any = {}): Contact =>
  ({ id: 'ct1', name: 'Ali', phone: '0123456789', email: 'ali@example.com', isFromPhone: true, ...over } as unknown as Contact);

// ─── Fully-populated fixtures (every field set) ────────────────────────────────
const fixtures = {
  transaction: {
    id: 't1', amount: 25.5, category: 'food', description: 'lunch', date: D1, type: 'expense',
    mode: 'personal', walletId: 'w1', receiptUrl: 'https://r/1.jpg', tags: ['lunch', 'work'],
    timeContext: 'night', dayContext: 'weekend', sizeContext: 'medium', frequencyContext: 'clustered',
    emotionalFlag: true, rawInput: 'lunch rm25.50', inputMethod: 'text', confidence: 'high',
    linkedPaymentId: 'pay1', linkedDebtId: 'd1', linkedGoalId: 'g1', linkedGoalContributionId: 'gc1',
    playbookLinks: [{ playbookId: 'pb1', amount: 10 }],
    originalAmount: 6.2, originalCurrency: 'USD', fxRate: 4.1, categoryExplanation: 'because lunch',
    editLog: [{ editedAt: D0, field: 'amount', previousValue: 20, newValue: 25.5 }],
    createdAt: D0, updatedAt: D1,
  } as unknown as Transaction,

  wallet: {
    id: 'w1', name: 'Maybank', type: 'bank', balance: 1000.5, initialBalance: 500,
    icon: 'home', color: '#4F5104', isDefault: true, presetId: 'maybank',
    creditBank: 'CIMB', creditNetwork: 'visa', usedCredit: 200, creditLimit: 5000,
    createdAt: D0, updatedAt: D1,
  } as unknown as Wallet,

  transfer: {
    id: 'tr1', fromWalletId: 'w1', toWalletId: 'w2', amount: 50, note: 'move', kind: 'transfer',
    date: D1, createdAt: D0,
  } as unknown as WalletTransfer,

  subscription: {
    id: 's1', name: 'Netflix', amount: 39.9, billingCycle: 'monthly', startDate: D0, nextBillingDate: D1,
    category: 'entertainment', isActive: true, isPaused: false, reminderDays: 5, isInstallment: true,
    totalInstallments: 12, completedInstallments: 3, walletId: 'w1', note: 'shared with sis',
    imageUri: 'https://i/netflix.png', iconName: 'tv', outstandingBalance: 120.5, lastPaidAt: D1, sharedSubId: 'ss1',
    paymentHistory: [
      { id: 'ph1', paidAt: D1, periodDate: D0, amount: 39.9, transactionId: 't1', walletId: 'w1', note: 'paid late', undoneAt: D2 },
    ],
    createdAt: D0, updatedAt: D1,
  } as unknown as Subscription,

  budget: {
    id: 'b1', category: 'food', allocatedAmount: 500, spentAmount: 120, period: 'monthly',
    startDate: D0, endDate: D1, rollover: true, rolloverAmount: 50, createdAt: D0, updatedAt: D1,
  } as unknown as Budget,

  goal: {
    id: 'g1', name: 'Umrah', targetAmount: 20000, currentAmount: 5000, deadline: D1, category: 'travel',
    icon: 'f/target', imageUri: 'https://i/umrah.jpg', color: '#B2780A', walletId: 'w1',
    contributions: [{ id: 'c1', amount: 5000, note: 'first', date: D0, walletId: 'w1', transactionId: 't1' }],
    milestones: [{ percentage: 25, label: '25%', reached: true, reachedAt: D1 }],
    isPaused: false, isArchived: false, createdAt: D0, updatedAt: D1,
  } as unknown as Goal,

  debt: {
    id: 'd1', groupId: 'grp-ali', contact: contact(), type: 'i_owe', totalAmount: 300, paidAmount: 100,
    status: 'partial', description: 'lunch loan', category: 'food',
    payments: [
      { id: 'pay1', amount: 100, date: D1, note: 'cash', tipAmount: 5, linkedTransactionId: 't1', walletId: 'w1',
        createdAt: D0, editLog: [{ editedAt: D0, previousAmount: 90, previousNote: 'old' }] },
    ],
    mode: 'personal', dueDate: D1, splitId: 'sp1', sharedSubId: 'ss1', sharedSubMonth: '2026-06',
    editLog: [{ editedAt: D0, field: 'totalAmount', previousValue: 200, newValue: 300 }],
    isArchived: false, createdAt: D0, updatedAt: D1,
  } as unknown as Debt,

  split: {
    id: 'sp1', description: 'dinner', totalAmount: 120, splitMethod: 'item_based',
    participants: [{ contact: contact(), amount: 60, isPaid: false }],
    items: [{ name: 'pizza', amount: 60, assignedTo: [contact()] }],
    paidBy: contact({ id: 'me', name: 'Me', isFromPhone: false }), category: 'food',
    taxAmount: 6, taxHandling: 'divide', linkedTransactionId: 't1', walletId: 'w1', mode: 'personal',
    status: 'final', isArchived: false, createdAt: D0, updatedAt: D1,
  } as unknown as SplitExpense,

  contact: contact(),

  savings: {
    id: 'sv1', name: 'ASB', type: 'investment', description: 'long term', initialInvestment: 1000,
    currentValue: 1200, target: 5000, goalName: 'house', annualRate: 5.5,
    history: [{ id: 'h1', date: D0, value: 1000, note: 'start' }], createdAt: D0, updatedAt: D1,
  } as unknown as SavingsAccount,

  receipt: {
    id: 'rc1', title: 'Tesco run', vendor: 'Tesco', items: [{ name: 'milk', price: 6.5, qty: 1 }],
    subtotal: 6.5, tax: 0.4, total: 6.9, date: D1, category: 'groceries', myTaxCategory: 'none',
    paymentMethod: 'card', location: 'KL', walletId: 'w1', verified: true, year: 2026,
    transactionId: 't1', imageUri: 'https://i/receipt.jpg', createdAt: D0, updatedAt: D1,
  } as unknown as SavedReceipt,
};

// Fields intentionally NOT synced (with reason). Round-trip won't preserve these.
const IGNORE: Record<string, Set<string>> = {
  // AI-derived heuristics — regenerated locally from the transaction, not user data.
  transaction: new Set([
    'timeContext', 'dayContext', 'sizeContext', 'frequencyContext',
    'emotionalFlag', 'confidence', 'categoryExplanation',
  ]),
};

// Each entity's mapper pair.
const ENTITIES: Array<{ key: string; to: (u: string, x: any) => any; from: (r: any) => any }> = [
  { key: 'transaction', to: txToRemote, from: txFromRemote },
  { key: 'wallet', to: walletToRemote, from: walletFromRemote },
  { key: 'transfer', to: transferToRemote, from: transferFromRemote },
  { key: 'subscription', to: subToRemote, from: subFromRemote },
  { key: 'budget', to: budgetToRemote, from: budgetFromRemote },
  { key: 'goal', to: goalToRemote, from: goalFromRemote },
  { key: 'debt', to: debtToRemote, from: debtFromRemote },
  { key: 'split', to: splitToRemote, from: splitFromRemote },
  { key: 'contact', to: contactToRemote, from: contactFromRemote },
  { key: 'savings', to: savingsToRemote, from: savingsFromRemote },
  { key: 'receipt', to: receiptToRemote, from: receiptFromRemote },
];

// ─── Deep equality (Date by time; undefined == absent; ignore at top level) ────
const failures: string[] = [];
function eq(a: any, b: any, path: string, ignore: Set<string> | null) {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : NaN;
    const tb = b instanceof Date ? b.getTime() : NaN;
    if (ta !== tb) failures.push(`${path}: date ${String(a)} != ${String(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      failures.push(`${path}: array mismatch len ${a?.length} != ${b?.length}`);
      return;
    }
    for (let i = 0; i < a.length; i++) eq(a[i], b[i], `${path}[${i}]`, null);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (ignore && ignore.has(k)) continue;
      eq(a[k], b[k], path ? `${path}.${k}` : k, null);
    }
    return;
  }
  if (a !== b) failures.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

// ─── Run ───────────────────────────────────────────────────────────────────────
let passed = 0;
for (const { key, to, from } of ENTITIES) {
  const before = failures.length;
  const fixture = (fixtures as any)[key];
  // toRemote → DB adds created_at (toRemote omits it; updated_at it does send) → fromRemote
  const row: any = to(UID, fixture);
  if (fixture.createdAt instanceof Date) row.created_at = fixture.createdAt.toISOString();
  const after = from(row);
  eq(fixture, after, key, IGNORE[key] ?? null);
  if (failures.length === before) {
    passed++;
    console.log(`  ✓ ${key}`);
  } else {
    console.log(`  ✗ ${key}`);
    for (const f of failures.slice(before)) console.log(`      ${f}`);
  }
}

console.log('');
if (failures.length === 0) {
  console.log(`PASS — ${passed}/${ENTITIES.length} entities round-trip losslessly.`);
  process.exit(0);
} else {
  console.log(`FAIL — ${failures.length} field(s) lost across ${ENTITIES.length} entities. Fix the mapper + migration before enabling sync.`);
  process.exit(1);
}
