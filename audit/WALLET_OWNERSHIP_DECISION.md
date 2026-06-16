# Wallet reconciliation: double-counting root cause (2026-06-13)

## Confirmed bug
`personalStore.updateTransaction` (lines 83-95) and `deleteTransaction` (106-108) reconcile the
wallet INTERNALLY (added by commit 10de514 "Architectural audit fixes: wallet reconciliation").
But the UI callers ALSO adjust the wallet manually around those calls → every edit/delete
double-counts the balance.

## Caller classification
MANUAL adjust (double-counts with store):
- QuickAddExpense.tsx:461-465 (undo)        — delete
- Dashboard.tsx:593-610 (handleUpdate)      — update
- Dashboard.tsx:673-679 (doDelete)          — delete
- TransactionsList.tsx:598-613 (handleUpdate) — update
- TransactionsList.tsx:678-687 (doDelete)   — delete
- Goals.tsx:~919                            — delete (verify)
- DebtTracking personal-mode linked-tx sites — delete/update (interacts w/ debt payment sync)

RELY ON STORE (no manual adjust — would break if store logic removed):
- receiptStore.ts:52, sellerStore.ts:28/31, chatActions, quickLog
- non-financial updates (receiptUrl, playbookLinks) hit the early-return at store line 81 → safe

## Decision: STORE is the single owner (Option A)
`addToWallet`/`deductFromWallet` no-op when the wallet id is missing (walletStore .map, no match
= unchanged) and guard non-finite/<=0 amounts — so the screens' wallet-exists guards are redundant
and the store can safely own reconciliation even for deleted wallets. Programmatic callers already
rely on this. Fix = REMOVE the manual adjust blocks from the UI callers; keep store as source of truth.
Caveat: `addTransaction` stays caller-owned (callers deduct on create) — contract is
"create: caller adjusts; update/delete: store adjusts."

## Separate money bugs (not the same cluster)
- #1  debtStore.deletePayment refunds wallet AND callers refund → double (debt domain)
- #4  handleTransfer writes BOTH a transfer record (mutates balances) AND two plain transactions → Recalculate double-counts
- #9  walletStore.deleteTransfer rollback of a repayment never restores usedCredit
- #22 credit repayment logged as a 'bills' expense → double-counts spending in reports
