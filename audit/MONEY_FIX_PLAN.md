# Money-cluster fix plan (await approval) — 2026-06-13

## The single contract (what makes it consistent)
Personal-wallet balance changes flow through **exactly one owner**:
- `personalStore.addTransaction` → **caller** adjusts the wallet on create (unchanged).
- `personalStore.updateTransaction` / `deleteTransaction` → **store** adjusts (it already does, lines 83-95 / 106-108). Callers must NOT.
- **Debt payments never touch the personal wallet directly.** A personal-mode payment's wallet
  effect rides on its *linked personal transaction* (via delete/updateTransaction). Business-mode
  payments adjust through DebtTracking's existing `mode !== 'personal'` loop.

Evidence this is the intended model: DebtTracking:1895 comment "Skip for personal mode —
deleteTransaction already reversed the wallet" + the audit commit 10de514. The bugs are the
call sites that never got cleaned up to match.

`addToWallet`/`deductFromWallet` already no-op on missing wallet ids and guard non-finite/≤0
amounts (walletStore 99,120) — so removing the screens' redundant wallet-exists guards is safe.

---

## GROUP 1 — personalStore owns update/delete: remove redundant manual adjusts
Each site currently double-counts (manual adjust + store adjust). Remove the manual block ONLY.

1. **QuickAddExpense.tsx:461-465** (undo) — delete the `addToWallet/deductFromWallet` lines; keep `deleteTransaction(capturedTxId)`.
2. **Dashboard.tsx:593-610** (`handleUpdateTransaction`) — delete the "reverse old" + "apply new" blocks; keep `updateTransaction(...)`.
3. **Dashboard.tsx:673-679** (`doDelete`) — delete the manual reverse block; keep `deleteTransaction(...)`. (Combined with Group 2, debt-linked deletes go from 3× → 1×.)
4. **TransactionsList.tsx:598-613** (`handleUpdateTransaction`) — delete the same-wallet diff + reverse/apply blocks; keep `updateTransaction(...)`.
5. **TransactionsList.tsx:678-687** (`doDelete`) — delete the manual reverse block; keep `deleteTransaction(...)`.
6. **Goals.tsx ~919** — VERIFY then remove any manual reverse around `deleteTransaction(contrib.transactionId)`.
- After removals, drop `addToWallet`/`deductFromWallet` selectors/imports that become unused per file (re-grep each file first).

## GROUP 2 — debtStore.deletePayment must not touch the wallet (#1, critical)
7. **debtStore.ts:165-198** — remove the `deletedPayment` capture (166,174) and the `addToWallet` refund (195-197). Callers already own it.
   - Re-verify the 3 DebtTracking callers keep their paths intact:
     - **1882-1930** `handleRemovePayment`: personal→`deleteTransaction` (1890), business→manual loop (1899-1901). ✓
     - **~2131-2160**: confirm same skip-personal / manual-business shape.
     - **~6251-6270**: confirm same.
   - Dashboard:686 caller becomes correct once Group 1 #3 + this land.

## GROUP 3 — transfer / repay dual-ledger (#4, #22) — needs aggregation inspection first
Pre-req: read `recalculateBalances` (walletStore) + reports income/expense aggregation to see whether paired transactions are summed.
8. **WalletManagement.tsx:935-954** (`handleTransfer`) — the two paired `addTransaction`s duplicate the transfer (already moved by `transferBetweenWallets`). Fix = exclude them from spend/income totals (tag, e.g. `category:'transfer'` + filter in reports/recalc) OR stop creating them and render Recent Activity from transfer records.
9. **WalletManagement.tsx:982-991** (`handleRepay`) — repayment written as `category:'bills'` expense inflates spending. Reclassify as transfer/excluded so debt repayment isn't counted as spend.

## GROUP 4 — walletStore.deleteTransfer credit restore (#9)
10. **walletStore.ts:212-214** — `toWallet` branch ignores credit: when `w.type === 'credit'`, also restore `usedCredit: roundMoney((w.usedCredit||0) + t.amount)` (mirror the fromWallet branch 202-208). VERIFY whether repayments are stored as transfers vs activity before relying on this path.

## GROUP 5 — debt logic (non-wallet), medium
- **#5** DebtTracking ~1620 + 3 sibling sites — split participant id: use `const participantId = debt.type === 'i_owe' ? '__self__' : debt.contact.id;` in mark/unmark calls.
- **#6** DebtTracking splitBuckets ~509-537 — run the youOwe check before the `settled` check (2-person "someone else paid" splits currently vanish from youOwe).
- **#11** DebtTracking ~1724 — replace `iOweRem === theyOweRem` with `Math.abs(iOweRem - theyOweRem) < 0.01` (FP dust creates a phantom netting transaction).
- **#12** debtStore.updateMonthAmounts ~505 — recompute status/paidAmount + append editLog when patching linked totalAmount.
- **#13** debtStore.deleteSharedSubscription ~352 — add tombstones + payment/transaction cleanup (cascade currently silent).

---

## SAFE SET (no balance risk) — proceeding without approval
- #8 NaN edit validation (Dashboard + TransactionsList) — DONE.
- #28 pace card 0%/no-baseline → neutral color (Dashboard insight strip).
- #18 WeekTicks 8-vs-7-day window consistency.
- #20 credit-limit edit can't drop below usedCredit (WalletManagement save validation).
- #27 hero balance for credit-only wallet users.
- #32 transfer/repay: invert null-wallet guards (alert+return instead of silent skip).
- #33 WalletManagement: `buildWalletSnapshot()` inline prop → useMemo.
- #23 wallet list ScrollView+.map → FlatList (mandatory perf rule).
- Dead code: #36 (`const today` WalletManagement:1461), #34 (10 orphaned styles), #35 (8 unused imports), #29 (Dashboard orphaned styles/imports), #25 (unreachable un-settle block) — re-grep each before deleting.

## NOT COVERED (finders died on session limit)
TransactionsList and CommitmentForm were never analyzed by the finder agents. The TransactionsList
double-counts above were found by hand during root-cause; CommitmentForm has had no pass. Options:
re-run those two finders when quota resets (8:10pm KL), or hand-audit.

---
# PROGRESS (2026-06-13, applied + tsc-clean)
DONE — live-balance corruption cluster (the every-edit bugs):
- #1  debtStore.deletePayment no longer refunds the wallet (caller/linked-tx owns it).
- #2  Dashboard handleUpdateTransaction — manual reverse/apply removed.
- #3  Dashboard doDelete — manual reverse removed.
- TransactionsList handleUpdateTransaction + doDelete — manual reverse/apply removed (found by hand; finder had died).
- QuickAddExpense undo — manual reverse removed + 3 dead captured vars dropped.
- Goals handleUndoContribution — VERIFIED already correct (else-if), no change.
- #7  handleBulkDelete — added `mode !== 'personal'` guard to both branches (was double-counting personal).
- #9  walletStore.deleteTransfer — kind-aware usedCredit restore for repayments (doesn't affect plain transfers).
- #11 group-netting `iOweRem === theyOweRem` → epsilon compare (no phantom payment).
Net contract now consistent: create=caller adjusts; update/delete=store adjusts; debt payments ride their linked transaction.

NEEDS DECISION — Group 3 (#4, #22): reconcileWalletBalances double-counts transfers/repayments
(transfer record + paired transactions both summed → Recalculate corrupts balances; repayment also
shows as 'bills' spend). Live balances are CORRECT; only Recalculate + reports are wrong. Fork:
(A) mark transfer/repayment transactions internal + exclude from reconcile & reports (keeps them visible), or
(B) stop creating the paired transactions (show transfers only in wallet activity). Needs reports-aggregation pass.

NEEDS VERIFICATION (debt finder claims; their verifiers died on the limit) — do NOT apply blind:
- #5 split participant id (i_owe → '__self__'), #6 2-person split settled-immediately,
- #12 updateMonthAmounts recalc/editLog, #13 deleteSharedSubscription cascade tombstones, #14 business tip on reversal.

SAFE SET still open (no money risk): #8 DONE. #20, #27, #28, #32, #33, #23, dead code #29/#34/#35/#36/#25.
COVERAGE GAP: TransactionsList partially hand-audited; CommitmentForm never analyzed.
