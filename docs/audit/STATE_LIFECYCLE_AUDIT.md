# State Lifecycle Audit

**Auditor**: Claude Opus 4.6 (systems engineer)
**Date**: 2026-05-28
**Scope**: All Zustand stores (16), all services (6)

---

## Severity Legend

| Tag | Meaning |
|-----|---------|
| **CRITICAL** | Data loss, financial corruption, or impossible state reachable in normal use |
| **HIGH** | Integrity violation that produces incorrect numbers or broken UX |
| **MEDIUM** | Missing guard that allows nonsensical data but unlikely to cause harm in isolation |
| **LOW** | Defensive gap; no known trigger but violates defense-in-depth |

---

## 1. Entity Lifecycle Violations

### 1.1 Orders (sellerStore)

| # | Severity | Finding |
|---|----------|---------|
| O-1 | **HIGH** | **No formal order lifecycle enforced.** `updateOrderStatus` accepts any `OrderStatus` value with zero validation. A deleted order's ID only lands in `_deletedOrderIds`; nothing prevents a stale UI reference from calling `markOrderPaid(deletedId)` -- the `.map()` is a no-op, but the deposit entry logic still runs (harmlessly, but indicates missing guard). |
| O-2 | **MEDIUM** | **Order with 0 items is possible.** `addOrder` does not validate `order.items.length > 0`. An empty-items order has `totalAmount = 0` and pollutes season stats. |
| O-3 | **MEDIUM** | **No status transition validation.** `updateOrderStatus` allows any status to any status (e.g., `delivered` -> `pending`). The `updateOrdersStatus` batch variant has the same gap. |
| O-4 | **LOW** | **Paid order can be re-paid.** `markOrderPaid` does not check `o.isPaid` before adding a new deposit. If called twice, it creates a duplicate deposit entry (though `paidAmount` is capped at `totalAmount`). |

### 1.2 Debts (debtStore)

| # | Severity | Finding |
|---|----------|---------|
| D-1 | **HIGH** | **Payment can exceed debt amount in `updatePayment`.** When editing a payment upward, `rawPaidAmount` is computed from all payments including the edited one. The result is capped with `Math.min(debt.totalAmount, rawPaidAmount)` for `paidAmount`, but the individual payment's `.amount` field is stored uncapped. This means `sum(payments.amount)` can exceed `totalAmount`, creating an inconsistent audit trail. |
| D-2 | **MEDIUM** | **Settled debt can be reopened via `updateDebt`.** If a user edits `totalAmount` upward on a settled debt, the recalculation downgrades status from `settled` to `partial`. This is intentional but undocumented -- there is no "disputed" or "reopened" state. |
| D-3 | **MEDIUM** | **Debtor === creditor not prevented.** `addDebt` does not validate that `debt.contact` differs from the user. Self-debts are possible. |
| D-4 | **LOW** | **`addPayment` blocks on settled debts but `updatePayment` does not.** A payment on a settled debt can be edited to increase its amount (the status recalculation handles it, but the guard asymmetry is surprising). |

### 1.3 Seasons (sellerStore)

| # | Severity | Finding |
|---|----------|---------|
| S-1 | **GOOD** | **Dual-active-season guard exists.** `addSeason` auto-ends any currently active season when a new active one starts. This is correct. |
| S-2 | **MEDIUM** | **Ended season can be reactivated.** There is no `reactivateSeason` action, but `updateOrder` / direct `setState` could set `isActive: true` on an ended season. No guard prevents this. |
| S-3 | **MEDIUM** | **Season with endDate before startDate is possible.** `endSeason` sets `endDate = new Date()` but does not validate against `startDate`. If `endSeason` is called on a season whose `startDate` is in the future (e.g., pre-created), the season has `endDate < startDate`. |

### 1.4 Stall Sessions (stallStore)

| # | Severity | Finding |
|---|----------|---------|
| ST-1 | **HIGH** | **Multiple active sessions possible.** `startSession` sets `activeSessionId` to the new session and marks it `isActive: true`, but does NOT close the previous active session. If called twice rapidly (race condition, double-tap), two sessions have `isActive: true`. Only `activeSessionId` tracks which is "really" active, but `getLifetimeStats` filters on `!s.isActive`, so the orphaned active session is invisible to stats. |
| ST-2 | **MEDIUM** | **Closed session's sales can't be removed.** `removeSale` only operates on the active session (`activeSessionId`). Once closed, sales are frozen -- this is likely intentional but means data correction requires re-opening or direct state manipulation. |
| ST-3 | **LOW** | **`addSale` does not validate active session exists.** It reads `activeSessionId` and returns early if null, but if the session was closed between the caller's check and this call, the sale is silently dropped. |

### 1.5 Savings Goals (personalStore)

| # | Severity | Finding |
|---|----------|---------|
| SG-1 | **GOOD** | **Progress is capped.** `contributeToGoal` caps `actualAmount` at `remaining` and `newCurrentAmount` at `targetAmount`. Progress cannot exceed 100%. |
| SG-2 | **MEDIUM** | **Contributions allowed after goal reached.** If `remaining <= 0`, `contributeToGoal` still runs with `actualAmount = amount` (the else branch of the ternary), effectively allowing over-contribution. The `Math.min` on line 351 then clamps `newCurrentAmount` to `targetAmount`, so the display is correct, but the contribution is recorded at the full requested amount, not the actual effective amount. |
| SG-3 | **LOW** | **Paused goal accepts contributions.** Neither `contributeToGoal` nor `withdrawFromGoal` checks `goal.isPaused`. |

### 1.6 Savings Accounts (savingsStore)

| # | Severity | Finding |
|---|----------|---------|
| SA-1 | **MEDIUM** | **Negative snapshot values allowed.** `addSnapshot` does not validate `value >= 0`. A negative savings account value is likely nonsensical. |

---

## 2. Impossible States

| # | Severity | Finding | Store |
|---|----------|---------|-------|
| IS-1 | **MEDIUM** | **Transaction with amount 0.** `addTransaction` does not validate `amount > 0`. Zero-amount transactions pass through and affect wallet balances (adding/deducting 0, which is a no-op but pollutes lists). | personalStore |
| IS-2 | **MEDIUM** | **Negative transaction amounts.** No guard against negative amounts in `addTransaction`. A negative expense would behave as income for wallet purposes. | personalStore |
| IS-3 | **MEDIUM** | **Budget with 0 allocation.** `addBudget` does not validate `allocatedAmount > 0`. A zero-allocation budget causes division-by-zero in percentage calculations downstream. | personalStore |
| IS-4 | **MEDIUM** | **Product with price 0 and cost 0.** `addProduct` (sellerStore) does not validate pricing. Orders with such products have `totalAmount = 0`. | sellerStore |
| IS-5 | **HIGH** | **Wallet balance can go negative without limit.** `deductFromWallet` subtracts unconditionally -- there is no overdraft guard. For non-credit wallets, negative balances are likely wrong. Credit wallets intentionally go negative, but there is no `creditLimit` enforcement in `deductFromWallet` or `useCredit`. | walletStore |
| IS-6 | **MEDIUM** | **CRM `addOrderPayment` allows overpayment.** `newPaidAmount = order.paidAmount + amount` with no cap at `order.totalAmount`. Status becomes `paid` but `paidAmount > totalAmount`. | crmStore |
| IS-7 | **LOW** | **Transfer to self.** `transferBetweenWallets` does not check `fromId !== toId`. A self-transfer deducts then adds, netting to zero but creating a spurious transfer record. | walletStore |
| IS-8 | **MEDIUM** | **Subscription with amount 0 or negative.** `addSubscription` does not validate amount. Marking it paid creates a zero-amount transaction. | personalStore |
| IS-9 | **LOW** | **Business sale can reduce product stock below 0.** `businessStore.addSale` does `stock - quantity` without clamping at 0. | businessStore |

---

## 3. Missing Guards

| # | Severity | Finding | Store |
|---|----------|---------|-------|
| MG-1 | **HIGH** | **No duplicate ID check.** All `add*` mutations generate IDs but never verify uniqueness against existing items. `Date.now().toString()` IDs (used in sellerStore, stallStore, businessStore, crmStore) can collide under rapid creation. The seller rehydration has a dedup pass, but runtime `addOrder` does not. | Multiple |
| MG-2 | **HIGH** | **No referenced-entity validation.** `addOrder` does not check that `item.productId` refers to an existing product. `contributeToGoal` with a nonexistent `goalId` is a no-op (safe). `recordPayment` with a nonexistent order ID is also a no-op. But `addSale` (stallStore) with a nonexistent `productId` will corrupt the product snapshot. | Multiple |
| MG-3 | **MEDIUM** | **No empty-string guards on required fields.** `addProduct`, `addSeason`, `addDebt`, `addWallet` all accept empty-string names. | Multiple |
| MG-4 | **MEDIUM** | **`removeContribution` uses `currentAmount - contrib.amount` but `contrib.amount` can be negative** (for withdrawals). Removing a withdrawal contribution would decrease `currentAmount` further instead of restoring it. The `Math.max(0, ...)` prevents negatives but the logic is inverted for withdrawal entries. | personalStore |
| MG-5 | **MEDIUM** | **No active-season guard for orders.** `addOrder` does not require an active season. Orders without a `seasonId` are invisible to season stats but still affect product `totalSold`. | sellerStore |
| MG-6 | **LOW** | **`deleteWallet` does not orphan-check.** Transactions referencing the deleted wallet's ID retain their `walletId`. Future edits to those transactions will try to adjust a nonexistent wallet (the `addToWallet`/`deductFromWallet` calls silently fail since the `.map()` finds no match). | walletStore |
| MG-7 | **LOW** | **`deleteProduct` does not cascade to orders.** Orders referencing the deleted product retain the `productId` in their items. Product name in the order item is not stored (only `productId`), so the UI may show "Unknown Product". | sellerStore |

---

## 4. Concurrent Lifecycle Conflicts

| # | Severity | Finding |
|---|----------|---------|
| CC-1 | **HIGH** | **sellerSync has no sync mutex.** `syncAll` can be called from startup AND foreground simultaneously. Both invoke `pullAll()` then push. If two syncs overlap: (a) pull A reads remote, (b) pull B reads remote, (c) push A writes with state at time A, (d) push B writes with state at time B -- the second push overwrites the first without seeing its changes. Tombstone deletion is particularly dangerous: both read `_deletedOrderIds`, both delete remotely, but only one clears the tombstone array. |
| CC-2 | **MEDIUM** | **personalSync has a mutex (`inflight`), which is good.** `syncPersonal` returns the existing promise if one is in-flight, preventing concurrent syncs. However, the mutex is per-process only -- if `syncPersonal` is triggered from a background task AND foreground simultaneously, the in-memory `inflight` variable doesn't protect against the background instance. |
| CC-3 | **MEDIUM** | **User edits during sync.** Both sync services read store state, push it, then in the seller case re-read state after pull. If the user edits an order between the pull-merge and push-read, the edit is included in the push (good). But if the user deletes an order between the pull and push, the order reappears from the pull merge, and the delete tombstone is cleared after push, so the deletion is lost on next sync. |
| CC-4 | **LOW** | **Receipt queue drain is not atomic per item.** `drainQueue` iterates the list, but between `processor(entry)` succeeding and `removePending(entry.id)` completing, a crash loses the "processed" state. The receipt would be re-processed on next drain, creating a duplicate in receiptStore. The `inflight` guard in `runReceiptDrain` prevents concurrent drains. |

---

## 5. Queue / Batch Operation Integrity

| # | Severity | Finding |
|---|----------|---------|
| QB-1 | **HIGH** | **Receipt queue processes sequentially and continues on failure.** `drainQueue` iterates all entries: success removes, failure increments attempt count. Items after a failure ARE processed (good). But failure on item 3 does NOT roll back items 1-2 -- they're already committed to receiptStore via `addReceipt`. This is correct for a queue but means partial processing is the norm, not the exception. |
| QB-2 | **MEDIUM** | **Bulk delete (`deleteOrders`) is NOT atomic with cross-store reconciliation.** The `set()` call is atomic within sellerStore, but the subsequent `reconcileTransferIncome` loop calls into personalStore and businessStore separately. If the app crashes between the sellerStore mutation and the personalStore reconciliation, orders are deleted but personal income is stranded. |
| QB-3 | **MEDIUM** | **`clearAllData` is not atomic.** It resets 15+ stores sequentially, then clears AsyncStorage. A crash mid-way leaves some stores cleared and others intact. The AsyncStorage.clear() at the end is the safety net, but if it's the clear that fails, stores rehydrate with stale data on next launch. The fallback key-by-key removal is a good mitigation. |
| QB-4 | **MEDIUM** | **CSV import (implied, not in audited files) and statement import likely commit item-by-item.** Each `addTransaction` is a separate `set()`. If import fails at item 47, items 1-46 are committed. No rollback mechanism exists. |
| QB-5 | **LOW** | **Receipt queue drops entries after MAX_ATTEMPTS (5).** `recordAttemptFailure` filters out entries exceeding the limit. The dropped receipt's image persists on disk but is never processed. No user notification of permanent failure. |

---

## 6. Timer / Interval State

| # | Severity | Finding |
|---|----------|---------|
| TI-1 | **MEDIUM** | **Sync retry relies on in-memory backoff.** `syncBackoff.ts` uses a `Map<string, BackoffState>` that resets on app restart. This means every app launch gets a fresh first attempt (intended), but also means backoff state is lost if the user force-closes and reopens rapidly. Stages cap at 1 hour, which is reasonable. |
| TI-2 | **LOW** | **Stall session duration timer does not survive backgrounding.** `getSessionSummary` computes duration as `closedAt - startedAt`. If the app is backgrounded or killed during an active session, the session stays `isActive: true` with no `closedAt`. The duration calculation uses `new Date()` as fallback for `closedAt`, which is correct for display but means the session is never auto-closed. |
| TI-3 | **LOW** | **Premium scan/AI count reset is checked on-access, not on a timer.** `resetScanCountIfNeeded` and `resetAiCallsIfNeeded` compare `scanResetDate` against `startOfMonth(new Date())`. This is correct but means the count only resets when the user actually tries to scan/use AI. Edge case: if the user checks `getRemainingScans` at 11:59 PM on the last day of the month, gets 0, then checks at 12:01 AM, gets the full count. No timer race. |
| TI-4 | **LOW** | **`personalSync` inflight promise prevents stacking.** The `let inflight` guard ensures only one sync runs at a time. But the returned promise means callers who await get the result of the first caller's sync, which may have started with stale state relative to the second caller's expectations. |

---

## 7. Feature Flag / Premium State Transitions

| # | Severity | Finding |
|---|----------|---------|
| PR-1 | **MEDIUM** | **Premium data persists after downgrade.** `unsubscribe` sets `tier: 'free'` but does NOT delete or restrict access to data created while premium (extra wallets beyond FREE_TIER.maxWallets, extra budgets, scanned receipts). The `canCreateWallet` check only gates NEW creation. Existing wallets over the limit remain usable. This is likely intentional but should be documented. |
| PR-2 | **LOW** | **Trial start is implicit.** `startTrialIfNeeded` is called inside `incrementAiCalls`. The first AI call auto-starts the trial. If the user never calls AI, no trial starts. The `isInTrial` check returns false if `trialStartDate` is null, so untrialed users simply hit the free-tier limit. |
| PR-3 | **LOW** | **No grace period on premium expiry.** `unsubscribe` immediately sets `tier: 'free'`. There's no expiry date or grace window. This implies subscription management is external (App Store / Play Store) and the store just reflects the current state. |

---

## 8. Cross-Store Consistency

| # | Severity | Finding |
|---|----------|---------|
| XS-1 | **HIGH** | **Wallet balance drift from non-atomic cross-store operations.** `updateTransaction` (personalStore) first mutates the transaction, then adjusts wallets. If the app crashes between these two operations, the transaction has the new amount but the wallet has the old balance. There is no reconciliation mechanism. |
| XS-2 | **HIGH** | **`undoSubscriptionPayment` performs 3 separate mutations** -- wallet restore, transaction delete, and subscription update. Each is a separate `set()`. Crash between any two leaves inconsistent state. |
| XS-3 | **MEDIUM** | **`clearAllData` and `clearBusinessData` don't reset tombstone arrays in all stores.** `clearAllData` resets personalStore without `_deletedTransactionIds`, etc. If the user creates data, deletes some, then clears all data, the tombstone arrays persist in the in-memory state (though AsyncStorage.clear() wipes them on next launch). Between the clear and the next rehydration, a sync could use stale tombstones to delete remote data. |
| XS-4 | **MEDIUM** | **personalSync wallet merge doesn't reconcile balances.** `mergeById` for wallets takes the remote wallet if its `updatedAt` is newer. But the remote balance may not account for transactions the local device just created. This could cause balance jumps when syncing between devices. |
| XS-5 | **LOW** | **`deleteContact` (debtStore) sets contact name to "(deleted)" but does not update sharedSubscriptions** that reference the contact. Shared subscription member entries still hold the old contact reference. |

---

## 9. Rehydration Safety

| # | Severity | Finding |
|---|----------|---------|
| RH-1 | **MEDIUM** | **stallStore rehydration uses raw `new Date()` without the `sd()` safety helper.** If a date string is malformed, `new Date(s.startedAt)` returns Invalid Date, which will crash `format()` calls downstream. Other stores (personalStore, sellerStore, debtStore, savingsStore) use the safe `sd()` helper. |
| RH-2 | **MEDIUM** | **businessStore rehydration uses raw `new Date()` without `sd()`.** Same risk as RH-1. |
| RH-3 | **MEDIUM** | **crmStore rehydration uses raw `new Date()` without `sd()`.** Same risk as RH-1. |
| RH-4 | **LOW** | **freelancerStore has no rehydration callback at all.** Dates stored as ISO strings in `createdAt` are never parsed back to Date objects. `toDate()` helper in the store handles this at query time, but the stored type is inconsistent (string after rehydration, Date after creation). |

---

## 10. Data Integrity Summary

### Critical Path: Money Flow

The most dangerous path is: **Transaction -> Wallet balance adjustment**

```
addTransaction() -> set(transactions) -> deductFromWallet/addToWallet
updateTransaction() -> set(transactions) -> reverse old wallet -> apply new wallet
deleteTransaction() -> set(transactions) -> reverse wallet
```

Each step is a separate Zustand `set()`. There is NO transaction wrapping. A crash at any boundary creates drift between recorded transactions and wallet balances. The only mitigation is that the wallet balance is a running total that could theoretically be reconstructed from transaction history -- but no such reconciliation exists.

### Critical Path: Order -> Season Stats -> Transfer to Personal

```
addOrder() -> update products totalSold/stock -> set(orders)
markOrderPaid() -> set(orders with deposits)
markOrdersTransferred() -> set(orders) -> personalStore.addTransferIncome()
deleteOrder() -> reverse products -> set(orders) -> reconcileTransferIncome()
```

The `reconcileTransferIncome` function modifies personalStore and businessStore from within sellerStore, creating a 3-store mutation chain with no atomicity.

---

## Recommendations (Priority Order)

1. **Add a wallet reconciliation utility** that recomputes wallet balances from transaction history. Run on app start or expose in Settings as "fix my balances." This mitigates XS-1, XS-2, and any crash-induced drift.

2. **Add a sync mutex to sellerSync** (matching personalSync's `inflight` pattern). This prevents CC-1.

3. **Add the `sd()` safe date helper to stallStore, businessStore, and crmStore rehydration.** This prevents RH-1/2/3 crashes.

4. **Cap CRM `addOrderPayment`** at `totalAmount - paidAmount` to prevent IS-6 overpayment.

5. **Validate `items.length > 0` in seller `addOrder`** to prevent O-2 ghost orders.

6. **Guard stall `startSession` against orphaned active sessions** by closing any existing active session first (matching seller season pattern).

7. **Add `amount > 0` validation** to `addTransaction`, `addSubscription`, `addBudget(allocatedAmount)`, and `addDebt(totalAmount)`.

8. **Document the premium downgrade behavior** (PR-1) -- data persists, only creation is gated.

9. **Consider a lightweight WAL (write-ahead log)** for cross-store mutations (wallet + transaction, order + personal income). Log the intended operation, perform it, then mark complete. On next launch, replay incomplete operations.
