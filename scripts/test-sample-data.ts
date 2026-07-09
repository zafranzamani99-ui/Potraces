/**
 * Regression tests for the sample-data engine.  Run: npm run test:sampledata
 *
 * WHY: seeded wallet balances are the persona's FINAL balances, but
 * reconcileWalletBalances() recomputes every balance from
 *   initialBalance + Σtxn ± transfers
 * and autoReconcileWallets() runs after every personal sync. If the seed leaves
 * ANY drift, reconcile silently rewrites the demo balances — and for credit
 * wallets it also recomputes usedCredit (balance = computed, usedCredit =
 * creditLimit - computed), destroying the seeded card utilisation.
 *
 * So the load-bearing assertion is: after seeding each persona, the REAL
 * reconcileWalletBalances() reports ZERO drifted wallets, and the REAL
 * autoReconcileWallets() corrects ZERO wallets (i.e. it is a no-op).
 *
 * Also guards two bugs found in review:
 *  - appending demo data onto a real account must NOT steal the default wallet
 *  - isPersonalAccountEmpty() must count the (unsynced) budget profile, or the
 *    demo banner arms a one-tap wipe of real data
 */
(globalThis as Record<string, unknown>).__DEV__ = false;

import { seedPersona, isPersonalAccountEmpty, PERSONAS } from '../src/utils/sampleData/engine';
import { reconcileWalletBalances, autoReconcileWallets } from '../src/utils/walletReconcile';
import { useWalletStore } from '../src/store/walletStore';
import { usePersonalStore } from '../src/store/personalStore';
import { useDebtStore } from '../src/store/debtStore';
import { useSavingsStore } from '../src/store/savingsStore';
import { useNotesStore } from '../src/store/notesStore';
import { useReceiptStore } from '../src/store/receiptStore';
import { useBudgetProfileStore } from '../src/store/budgetProfileStore';
import { usePendingPaymentsStore } from '../src/store/pendingPaymentsStore';
import type { SampleBracket } from '../src/utils/sampleData/core';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

function resetAll(): void {
  useWalletStore.setState({ wallets: [], transfers: [], selectedWalletId: null });
  usePersonalStore.setState({ transactions: [], subscriptions: [], budgets: [], goals: [] });
  useDebtStore.setState({ debts: [], splits: [], contacts: [] });
  useSavingsStore.setState({ accounts: [] });
  useNotesStore.setState({ pages: [], activePageId: null });
  useReceiptStore.setState({ receipts: [] });
  useBudgetProfileStore.setState({ takeHome: null, commitments: [], modelId: null });
  usePendingPaymentsStore.setState({ pending: [] });
}

const BRACKETS = Object.keys(PERSONAS) as SampleBracket[];

// ── 1. Per-persona: zero drift + reconcile is a no-op + full feature coverage ──
for (const bracket of BRACKETS) {
  resetAll();
  const { wasEmpty } = seedPersona(bracket);
  check(`${bracket}: seeds into an empty account`, wasEmpty === true);

  const w = useWalletStore.getState();
  const p = usePersonalStore.getState();
  const d = useDebtStore.getState();

  // Snapshot credit utilisation BEFORE reconcile, to prove it survives.
  const creditBefore = w.wallets
    .filter((x) => x.type === 'credit')
    .map((x) => ({ id: x.id, name: x.name, usedCredit: x.usedCredit, balance: x.balance }));

  // THE load-bearing assertion: reconcile finds no drift.
  const drifted = reconcileWalletBalances();
  check(
    `${bracket}: ZERO reconcile drift`,
    drifted.length === 0,
    drifted.map((x) => `${x.walletName} stored=${x.stored} computed=${x.computed} drift=${x.drift}`).join('; '),
  );

  // ...and autoReconcile therefore corrects nothing (never rewrites balances).
  const corrected = autoReconcileWallets();
  check(`${bracket}: autoReconcileWallets is a no-op`, corrected === 0, `corrected=${corrected}`);

  // Credit cards keep their seeded utilisation (the thing reconcile would clobber).
  const wAfter = useWalletStore.getState().wallets;
  for (const c of creditBefore) {
    const now = wAfter.find((x) => x.id === c.id)!;
    check(
      `${bracket}: credit "${c.name}" keeps usedCredit`,
      now.usedCredit === c.usedCredit && now.balance === c.balance,
      `before used=${c.usedCredit} bal=${c.balance} / after used=${now.usedCredit} bal=${now.balance}`,
    );
  }

  // Feature coverage — the whole point of the 4 personas.
  check(`${bracket}: has a Cash wallet`, w.wallets.some((x) => x.type === 'cash'));
  check(`${bracket}: has >=1 wallet transfer`, (w.transfers ?? []).length >= 1);
  check(`${bracket}: has expenses`, p.transactions.some((t) => t.type === 'expense'));
  check(`${bracket}: has income`, p.transactions.some((t) => t.type === 'income'));
  check(`${bracket}: has subscriptions`, p.subscriptions.length > 0);
  check(`${bracket}: has budgets`, p.budgets.length > 0);
  check(`${bracket}: has goals with contributions`, p.goals.length > 0 && p.goals.some((g) => g.contributions.length > 0));
  check(`${bracket}: has debts with a payment`, d.debts.length > 0 && d.debts.some((x) => x.payments.length > 0));
  check(`${bracket}: has splits`, d.splits.length > 0);
  check(
    `${bracket}: has savings with snapshots`,
    useSavingsStore.getState().accounts.length > 0,
  );
  check(`${bracket}: has notes`, useNotesStore.getState().pages.length > 0);
  check(`${bracket}: has receipts`, useReceiptStore.getState().receipts.length > 0);

  // Exactly one default wallet on a fresh seed.
  check(
    `${bracket}: exactly one default wallet`,
    w.wallets.filter((x) => x.isDefault).length === 1,
  );

  // Budgets must map onto categories that actually have spend.
  const spendCats = new Set(p.transactions.filter((t) => t.type === 'expense').map((t) => t.category));
  const orphanBudgets = p.budgets.filter((b) => !spendCats.has(b.category)).map((b) => b.category);
  check(`${bracket}: every budget category has spend`, orphanBudgets.length === 0, orphanBudgets.join(','));
}

// ── 2. Appending demo data onto a REAL account must not steal the default wallet ──
{
  resetAll();
  useWalletStore.getState().addWallet({
    name: 'My Real CIMB', type: 'bank', balance: 500, icon: 'home', color: '#EC1C24', isDefault: true,
  } as Parameters<ReturnType<typeof useWalletStore.getState>['addWallet']>[0]);
  const realId = useWalletStore.getState().wallets[0].id;

  const { wasEmpty } = seedPersona('professional');
  check('append: account correctly detected as NOT empty', wasEmpty === false);

  const wallets = useWalletStore.getState().wallets;
  const realWallet = wallets.find((x) => x.id === realId)!;
  check('append: user keeps their default wallet', realWallet.isDefault === true);
  check(
    'append: no seeded wallet claims default',
    wallets.filter((x) => x.isDefault).length === 1,
    `defaults=${wallets.filter((x) => x.isDefault).map((x) => x.name).join(',')}`,
  );
  // And the real wallet's own balance is untouched by seeding/finalize.
  check('append: real wallet balance untouched', realWallet.balance === 500, `balance=${realWallet.balance}`);
  // Reconcile must still be clean for the seeded wallets.
  const drifted = reconcileWalletBalances().filter((x) => x.walletId !== realId);
  check('append: seeded wallets still have zero drift', drifted.length === 0, drifted.map((x) => x.walletName).join(','));
}

// ── 3. Emptiness gate must count the unsynced budget profile ──
{
  resetAll();
  check('empty account is empty', isPersonalAccountEmpty() === true);

  useBudgetProfileStore.setState({ takeHome: 4000, commitments: [], modelId: null });
  check('account with a budget profile is NOT empty', isPersonalAccountEmpty() === false);

  resetAll();
  usePendingPaymentsStore.setState({ pending: [{ id: 'x' }] as never });
  check('account with a pending Quick-Log payment is NOT empty', isPersonalAccountEmpty() === false);
}

if (failures.length) {
  console.error(`\nFAIL (${failures.length}):\n  - ` + failures.join('\n  - '));
  process.exit(1);
}
console.log(`sample-data OK (${passed} checks across ${BRACKETS.length} personas)`);
// Explicit exit — same trick as test-wallet-reconcile.ts: the persist stores'
// pending AsyncStorage rejections (no `window` under tsx) would otherwise fail
// an already-passing run.
process.exit(0);
