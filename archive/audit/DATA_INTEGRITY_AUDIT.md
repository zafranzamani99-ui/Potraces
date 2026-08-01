# Data Integrity Audit

**Date**: 2026-05-28
**Auditor**: Claude Opus 4.6 (automated production audit)
**Scope**: All Zustand stores, sync services, and cross-store data lifecycle

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 12    |
| HIGH     | 16    |
| MEDIUM   | 14    |
| LOW      | 6     |
| **Total**| **48**|

---

## CRITICAL Findings

### CRIT-1: Floating-point money arithmetic without rounding (systemic)

- **Severity**: CRITICAL
- **Files**: `debtStore.ts:81,165,207`, `walletStore.ts:79,84,98,100`, `personalStore.ts:204,344,351,370,402`, `stallStore.ts:107-109,150-152,248,268`, `crmStore.ts:74,97-99`, `businessStore.ts:153,204`, all derived getters in `onTheRoadStore`, `mixedStore`, `partTimeStore`, `freelancerStore`
- **What**: Nearly every financial `.reduce()`, `+=`, and `- amount` operates on raw floats without `roundMoney()`. Only `sellerStore` uses `roundMoney()` consistently (and even then, not in `getSeasonStats`).
- **How it breaks**: User adds 3 transactions: RM 10.10 + RM 20.20 + RM 30.30. JavaScript computes `60.599999999999994`. Dashboard shows "RM 60.60" after `.toFixed(2)` -- but the stored balance is wrong. After 100s of transactions, wallet balances drift by sen. Debt `paidAmount` accumulates sub-sen errors: `reduce(sum + p.amount)` on 5 payments of RM 19.99 = `99.94999999999999` -- debt shows "RM 0.01 remaining" when it should be settled.
- **Fix**: Wrap every financial reduce/sum with `roundMoney()`:
  ```ts
  // debtStore.ts:81
  const rawPaid = roundMoney(updated.payments.reduce(...));
  // walletStore.ts:79
  balance: roundMoney(w.balance - amount),
  ```
  Apply to ALL stores. The `roundMoney` utility exists in `src/utils/money.ts` but is only imported by `sellerStore.ts`.

### CRIT-2: Non-atomic cross-store mutations -- transaction + wallet balance

- **Severity**: CRITICAL
- **File:Line**: `personalStore.ts:91-93` (updateTransaction), `personalStore.ts:96-104` (deleteTransaction), `personalStore.ts:277-299` (addTransferIncome)
- **What**: `updateTransaction` calls `set()` to update the transaction, then reads `walletStore.getState()` and calls `addToWallet/deductFromWallet` OUTSIDE the setter. If the app crashes between the two operations, the transaction is updated but the wallet balance is not adjusted (or vice versa).
- **How it breaks**: User edits a RM 50 expense to RM 100. The transaction updates to RM 100 (persisted). App crashes before `deductFromWallet` runs. Wallet still shows the old balance. On restart, the transaction says RM 100 but the wallet is RM 50 too high. The user's net worth is wrong.
- **Fix**: These are inherently separate stores so true atomicity is impossible with current architecture. Add a reconciliation check on app startup that recalculates wallet balances from transactions, or use a transaction log pattern. At minimum, perform the wallet operation FIRST (fail-safe: money is deducted but transaction not yet saved is safer than the reverse).

### CRIT-3: Non-atomic cross-store mutations -- goal contribution + wallet deduction

- **Severity**: CRITICAL
- **File:Line**: `Goals.tsx:422-432`
- **What**: `contributeToGoal()` is called, then `deductFromWallet()` is called separately. If crash occurs between the two calls, the goal has the contribution but the wallet was never deducted.
- **How it breaks**: User contributes RM 500 to a savings goal from their bank wallet. `contributeToGoal` succeeds and persists. App crashes before `deductFromWallet`. On restart: goal shows RM 500 contributed, wallet still has the original balance. User has phantom money.
- **Fix**: Same pattern as CRIT-2. The `contributeToGoal` store method already accepts `walletId` as a parameter but does NOT deduct from the wallet -- the screen does it separately. Move the wallet deduction into the store method itself so both happen in sequence with minimal gap, or better yet, make `contributeToGoal` call `deductFromWallet` internally.

### CRIT-4: `removeContribution` does not reverse wallet -- silent balance corruption

- **Severity**: CRITICAL
- **File:Line**: `personalStore.ts:397-418`
- **What**: `removeContribution` subtracts the contribution amount from the goal's `currentAmount` and removes the contribution from the array, but does NOT call `addToWallet` to refund the wallet. The wallet deduction that happened when the contribution was made is never reversed.
- **How it breaks**: User contributes RM 200 to a goal from their bank wallet. Later, they undo the contribution via `removeContribution`. The goal drops by RM 200 (correct), but the wallet stays RM 200 lower (wrong). RM 200 has vanished from the user's tracked net worth.
- **Fix**: The screen-level `handleUndoContribution` in `Goals.tsx:494-523` DOES handle wallet refunds. But any other caller of `removeContribution` (e.g., future code, sync) would corrupt balances. Move wallet refund logic into the store method.

### CRIT-5: stallStore `onRehydrateStorage` uses raw `new Date()` without null/NaN guards

- **Severity**: CRITICAL
- **File:Line**: `stallStore.ts:339-359`
- **What**: Every date in `onRehydrateStorage` uses raw `new Date(s.startedAt)` etc. without the `sd()` guard. If any date string is corrupted, `null`, or `undefined` in AsyncStorage, `new Date(null)` returns epoch (wrong) and `new Date(undefined)` returns `Invalid Date` which crashes `date-fns` `format()`.
- **How it breaks**: User has a stall session with a corrupted `closedAt` field (e.g., from a failed write). On app restart, `new Date(undefined)` produces `Invalid Date`. Any screen calling `format(session.closedAt)` throws `RangeError: Invalid time value` and kills the app in a crash loop.
- **Fix**: Replace all raw `new Date()` calls with the `sd()` helper pattern used in every other store.

### CRIT-6: businessStore `onRehydrateStorage` uses raw `new Date()` without null/NaN guards

- **Severity**: CRITICAL
- **File:Line**: `businessStore.ts:252-291`
- **What**: Same as CRIT-5. Every date rehydration in businessStore uses raw `new Date(p.createdAt)` etc.
- **How it breaks**: Same crash-loop scenario as CRIT-5.
- **Fix**: Replace all raw `new Date()` calls with the `sd()` helper.

### CRIT-7: crmStore `onRehydrateStorage` uses raw `new Date()` without null/NaN guards

- **Severity**: CRITICAL
- **File:Line**: `crmStore.ts:119-133`
- **What**: Same as CRIT-5/6.
- **How it breaks**: Same crash-loop scenario.
- **Fix**: Same `sd()` pattern.

### CRIT-8: Debt payment deletion does NOT reverse wallet balance

- **Severity**: CRITICAL
- **File:Line**: `debtStore.ts:156-182`
- **What**: `deletePayment` removes the payment from the payments array and recalculates `paidAmount` and `status`, but does NOT reverse the wallet deduction that was made when the payment was recorded. The wallet interaction happens only at the screen level (`DebtTracking.tsx`).
- **How it breaks**: If `deletePayment` is ever called from code other than `DebtTracking.tsx` (sync, another screen, future refactor), the wallet balance is never restored. The RM the user "paid" is gone from their wallet tracking forever.
- **Fix**: Either move wallet reversal into the store method, or document with a loud warning that `deletePayment` MUST be accompanied by a wallet adjustment.

### CRIT-9: personalSync pull overwrites wallet balances without reconciliation

- **Severity**: CRITICAL
- **File:Line**: `personalSync.ts:525-548`
- **What**: `mergeById` for wallets uses last-write-wins on `updatedAt`. If Device A has wallet balance RM 500 and Device B has RM 450 (because B recorded a transaction), the merge picks whichever has the later `updatedAt`. But wallets are derived state -- the balance should be computed from transactions, not blindly synced.
- **How it breaks**: User on phone records RM 50 expense (wallet: RM 500 -> RM 450, transaction created). Before sync, user on tablet also records RM 30 expense (wallet: RM 500 -> RM 470, different transaction). Sync runs: both transactions are merged (correct), but wallet balance is set to whichever device's `updatedAt` is later -- let's say RM 470. The RM 50 expense from the phone is lost from the balance. Wallet should show RM 420 (500 - 50 - 30), but shows RM 470.
- **Fix**: After pulling wallets and transactions, recalculate wallet balances from the merged transaction set. Wallet balances in Supabase should be treated as hints, not authoritative.

### CRIT-10: Subscription `markSubscriptionPaid` creates paymentHistory entry with `Date.now()`-based ID -- collision risk

- **Severity**: CRITICAL
- **File:Line**: `personalStore.ts:213`
- **What**: Payment IDs use `` `pay-${Date.now()}` `` which can collide if two payments are marked in rapid succession (< 1ms apart, common on fast devices).
- **How it breaks**: User rapidly marks two subscriptions paid. Both get `pay-1716912345678`. `undoSubscriptionPayment` finds the first match and may undo the wrong payment. The user's billing dates, installment counts, and outstanding balances are now wrong.
- **Fix**: Use `newId()` (UUID-based) instead of `Date.now()`.

### CRIT-11: `undoSubscriptionPayment` reads state outside setter then writes inside -- race condition

- **Severity**: CRITICAL
- **File:Line**: `personalStore.ts:222-275`
- **What**: `undoSubscriptionPayment` reads `usePersonalStore.getState()` to find the subscription and payment (lines 222-226), then performs wallet operations and transaction deletions (lines 244-252), and finally calls `set()` (line 259) to update the subscription. Between the `getState()` read and the `set()` call, another update could modify the subscription.
- **How it breaks**: User rapidly undoes two payments. The first undo reads state, starts processing. The second undo reads the SAME state (first undo hasn't called `set()` yet). Both compute `nextBillingDate` from the same base. Result: billing date is rolled back by only one cycle instead of two, but two payments are marked undone. Installment count and billing dates are corrupted.
- **Fix**: Move the entire read-and-write into a single `set()` callback that reads from the `state` parameter. Handle wallet operations after `set()` completes.

### CRIT-12: `addDebt` reads state outside setter for groupId lookup -- race condition

- **Severity**: CRITICAL
- **File:Line**: `debtStore.ts:26-52`
- **What**: `addDebt` calls `useDebtStore.getState()` to find an existing debt's `groupId` (line 31), then passes it into `set()`. If two debts for the same contact are added near-simultaneously, both read the same state and may generate different `groupId`s instead of sharing one.
- **How it breaks**: Two debts for the same person end up in different groups. The UI groups debts by `groupId` -- the user sees the same person twice with separate balances instead of a combined view.
- **Fix**: Move the groupId lookup inside the `set()` callback to use the current state.

---

## HIGH Findings

### HIGH-1: Wallet deletion does not adjust linked transactions, debts, or goals

- **Severity**: HIGH
- **File:Line**: `walletStore.ts:52-58`
- **What**: `deleteWallet` removes the wallet and clears `selectedWalletId` if it matched, but does NOT nullify `walletId` references in transactions (personalStore), debt payments (debtStore), goal contributions (personalStore), or subscriptions.
- **How it breaks**: User deletes "Cash" wallet. 50 transactions still reference `walletId: "cash-123"`. When user edits one of those transactions, `updateTransaction` tries to call `addToWallet("cash-123", amount)` to reverse the old wallet effect -- but the wallet doesn't exist. The guard `if (!w) return` in the map silently does nothing, so the OLD balance adjustment is skipped, but the NEW wallet (if any) gets the deduction. Net effect: the new wallet is debited without the old wallet being credited = phantom money loss.
- **Fix**: When deleting a wallet, either (a) nullify all `walletId` references across stores, or (b) soft-delete wallets so the reversal can still find them.

### HIGH-2: `updateTransaction` reads previous state via `getState()` outside `set()` -- race condition

- **Severity**: HIGH
- **File:Line**: `personalStore.ts:44`
- **What**: `const prev = (usePersonalStore.getState() as PersonalState).transactions.find(...)` reads state before the `set()` call on line 45. If another update runs between the `getState()` and `set()`, `prev` has stale data.
- **How it breaks**: User edits transaction A's amount from RM 50 to RM 100. Simultaneously, a sync updates transaction A's category. The `prev` snapshot has the old category, but the `set()` callback correctly maps over the current state. However, the wallet adjustment after `set()` (line 80-92) uses `prev.amount` which is correct. Risk is lower here because wallet adjustment uses `prev` values (not the mapped values), but the pattern is still unsafe if `prev.walletId` was changed by the racing update.
- **Fix**: Capture `prev` inside the `set()` callback: `set((state) => { const prev = state.transactions.find(...); ... })`.

### HIGH-3: `deleteTransaction` reads previous state via `getState()` outside `set()` -- race condition

- **Severity**: HIGH
- **File:Line**: `personalStore.ts:96`
- **What**: Same race condition pattern as HIGH-2. `prev` is read via `getState()` before `set()`.
- **How it breaks**: If the transaction is modified between the `getState()` read and the `set()` execution, the wallet reversal uses the wrong amount.
- **Fix**: Capture inside `set()`.

### HIGH-4: sellerStore `getSeasonStats` does not round totals

- **Severity**: HIGH
- **File:Line**: `sellerStore.ts:1022-1033`
- **What**: `totalIncome`, `totalCosts`, `kept`, and `unpaidAmount` are all raw `.reduce()` sums without `roundMoney()`. Individual order totals ARE rounded, but summing 50 rounded values still produces float drift.
- **How it breaks**: Season summary shows "Kept: RM 1,234.560000000001" or "Total income: RM 5,000.009999999999". The display `.toFixed(2)` masks this in most places, but any comparison (`kept > 0`, `totalIncome >= target`) can fail by a fraction of a sen.
- **Fix**: Wrap each sum with `roundMoney()`.

### HIGH-5: CRM `addOrderPayment` has no cap -- `paidAmount` can exceed `totalAmount`

- **Severity**: HIGH
- **File:Line**: `crmStore.ts:69-88`
- **What**: `newPaidAmount = order.paidAmount + amount` with no `Math.min(order.totalAmount, ...)`. The status check uses `>=` so it still marks as paid, but the stored `paidAmount` can be RM 150 on a RM 100 order.
- **How it breaks**: User pays RM 100 on a RM 80 order. `paidAmount` becomes RM 100. `outstanding` computed at line 99 becomes `80 - 100 = -20`. Negative outstanding shown to user, or worse, summed across orders producing a wrong total.
- **Fix**: `const newPaidAmount = Math.min(order.totalAmount, order.paidAmount + amount);`

### HIGH-6: businessStore `addSale` can make stock go negative

- **Severity**: HIGH
- **File:Line**: `businessStore.ts:46-70`
- **What**: `stock: product.stock - saleItem.quantity` with no `Math.max(0, ...)`. If quantity exceeds stock, stock goes negative.
- **How it breaks**: Product has 2 in stock. Sale of 5 units records stock as -3. Negative stock is nonsensical.
- **Fix**: `stock: Math.max(0, product.stock - saleItem.quantity)`

### HIGH-7: personalSync `mergeById` can resurrect locally-deleted items

- **Severity**: HIGH
- **File:Line**: `personalSync.ts:525-536`
- **What**: `mergeById` adds any remote item not found locally. If a user deletes a transaction on Device A, the tombstone is sent to delete from Supabase (line 598). But if Device B hasn't synced yet and still has the item, Device B's `pushAll` will re-upsert it. When Device A pulls next, `mergeById` will add the "new" remote item back -- the deleted transaction is resurrected.
- **How it breaks**: User deletes a RM 500 income transaction on their phone. Tablet (offline) still has it. Tablet comes online and pushes. Phone pulls and the deleted transaction reappears. Wallet balance is now wrong (income was "reversed" during delete but the resurrected transaction didn't re-add it).
- **Fix**: Tombstones need to be durable (stored in Supabase, not just local arrays). The seller sync has durable tombstones for cost categories (`seller_deleted_cost_categories`) -- extend this pattern to personal data.

### HIGH-8: Seller sync push can delete remote orders created on another device

- **Severity**: HIGH
- **File:Line**: `sellerSync.ts:411-432`
- **What**: Push fetches all remote app orders, compares against local order IDs, and deletes any remote order whose `local_id` is not in the local set (and whose `updated_at` is before `syncStart`). If Device A creates an order while Device B is syncing, Device B's push will see the remote order that isn't in B's local set and delete it.
- **How it breaks**: Seller adds an order on their phone. Meanwhile, tablet runs sync. Tablet's push sees the new remote order as "not in my local set" and deletes it (if timing allows the `updated_at < syncStart` check to pass).
- **Fix**: The `syncStart` timestamp guard mitigates most cases, but clock skew between devices can still cause this. Add explicit tombstone checking: only delete remote items that are in the `_deletedOrderIds` list, not "anything not in local set".

### HIGH-9: `useSeasonTemplate` performs 3 separate `set()` calls -- non-atomic

- **Severity**: HIGH
- **File:Line**: `sellerStore.ts:569-627`
- **What**: `useSeasonTemplate` calls `set()` up to 3 times: once for season metadata, once for costs, once for product prices. If the app crashes between calls, the season is partially templated.
- **How it breaks**: New season gets budget/target from template, app crashes before costs are copied. Season appears to have a cost budget but no costs, misleading the user about their spending.
- **Fix**: Merge all three updates into a single `set()` call.

### HIGH-10: stallStore session `totalRevenue/totalCash/totalQR` can desync from sales array

- **Severity**: HIGH
- **File:Line**: `stallStore.ts:94-118`, `stallStore.ts:130-162`
- **What**: Running totals (`totalRevenue`, `totalCash`, `totalQR`) are maintained via `+= sale.total` on add and `-= sale.total` on remove. If a sale's `total` is edited (currently no `updateSale` method exists, but if one is added) or if float arithmetic causes a tiny drift, the totals desync from the actual sales array.
- **How it breaks**: After 100 sales, `totalRevenue` could be `sum + 0.0000001` due to float accumulation. When user removes the last sale, `totalRevenue` becomes `0.0000001` instead of `0`. Session summary shows non-zero revenue with no sales.
- **Fix**: Recompute totals from sales array instead of maintaining running totals, or use `roundMoney()` on every increment/decrement.

### HIGH-11: Subscription payment undo deletes transaction but does NOT adjust wallet for that transaction

- **Severity**: HIGH
- **File:Line**: `personalStore.ts:248-252`
- **What**: `undoSubscriptionPayment` deletes the linked transaction (line 249-251) directly via `set()` on the transactions array. But `deleteTransaction` normally also reverses the wallet balance. This direct deletion via `set()` bypasses the wallet adjustment.
- **How it breaks**: Subscription was paid with wallet deduction, creating both a payment history entry and a transaction. Undo correctly refunds the wallet for the payment (line 245), but the linked transaction's wallet effect is not reversed because the transaction is deleted directly rather than via `deleteTransaction()`. If the transaction also had a wallet deduction, the wallet is double-deducted.
- **Fix**: Actually, looking more closely: the wallet reversal at line 244-245 handles the payment's wallet. The linked transaction may or may not have its own wallet deduction (depends on how it was created). If the transaction was created with a walletId, deleting it directly skips the wallet reversal -- but the payment undo at line 245 should cover it. Still, this is fragile. Use `deleteTransaction()` method instead of direct array filter.

### HIGH-12: `addPayment` reads debt state outside setter

- **Severity**: HIGH
- **File:Line**: `debtStore.ts:119-122`
- **What**: `addPayment` reads `useDebtStore.getState()` to find the debt and check if it's settled (lines 120-123), then passes data into `set()` (line 128). Between these reads and the set, the debt could be modified.
- **How it breaks**: Two payments submitted near-simultaneously. Both read `debt.paidAmount = 50` and `debt.totalAmount = 100`. Both compute `remaining = 50`. Both create payment entries. Both set `paidAmount = Math.min(100, 50 + 50) = 100`. But both payments of 50 are added to the array, so true paid is 150 on a 100 debt. Since paidAmount is capped at totalAmount in the set(), the stored value is 100 but the payments array sums to 150.
- **Fix**: Check status and compute remaining inside `set()`.

### HIGH-13: businessStore `logClientPayment` does not round and accumulates float error

- **Severity**: HIGH
- **File:Line**: `businessStore.ts:151-166`
- **What**: `totalPaid: c.totalPaid + amount` -- running sum without rounding.
- **How it breaks**: After many small payments (e.g., RM 9.99 x 20), `totalPaid` drifts: `199.79999999999998` instead of `199.80`.
- **Fix**: `totalPaid: roundMoney(c.totalPaid + amount)`

### HIGH-14: personalSync does not paginate -- large data sets silently truncated

- **Severity**: HIGH
- **File:Line**: `personalSync.ts:403-417`
- **What**: `pullTable` does `supabase.from(table).select('*').eq(...)` without `.range()`. Supabase PostgREST returns a max of 1000 rows by default. If a user has >1000 transactions, the pull silently drops the rest.
- **How it breaks**: Power user with 1500 transactions. Pull fetches first 1000. Push then runs `deleteMissing` which sees 500 "remote but not local" transactions and deletes them from Supabase. User permanently loses 500 transactions.
- **Fix**: Use `pullPaged` (already exists in `sellerSync.ts`) or add `range()` pagination.

### HIGH-15: freelancerStore `deleteClient` uses `setState` instead of store action

- **Severity**: HIGH
- **File:Line**: `freelancerStore.ts:52-53`
- **What**: `useBusinessStore.setState({ businessTransactions: ... })` directly sets state, bypassing any future middleware or validation in the businessStore. Also, no tombstone is recorded for the client deletion.
- **How it breaks**: (1) Direct `setState` skips any persistence side effects if businessStore adds middleware. (2) No tombstone means personal sync (if extended to business data) won't propagate the deletion. (3) The client's business transactions lose their `clientId` link but the transactions themselves persist -- orphaned income.
- **Fix**: Use `updateBusinessTransaction` from businessStore for each linked transaction. Add tombstone tracking.

### HIGH-16: mixedStore `renameStream` uses `setState` instead of store action

- **Severity**: HIGH
- **File:Line**: `mixedStore.ts:100-104`
- **What**: Same pattern as HIGH-15. `useBusinessStore.setState({ businessTransactions: updated })` bypasses businessStore actions.
- **How it breaks**: Same risks as HIGH-15.
- **Fix**: Use store actions.

---

## MEDIUM Findings

### MED-1: Tombstone arrays grow unbounded

- **Severity**: MEDIUM
- **File:Line**: All stores with `_deleted*Ids` arrays
- **What**: Tombstone arrays (`_deletedTransactionIds`, `_deletedOrderIds`, etc.) are never pruned after successful sync of personal data. sellerSync clears them after push, but only if push succeeds. After months of use, these arrays can grow to 1000s of entries, slowing down serialization and comparison.
- **How it breaks**: Performance degradation. Each `set()` call serializes the entire state including the tombstone array. With 5000 tombstone IDs, this adds measurable lag on low-end Android devices.
- **Fix**: Cap tombstone arrays (e.g., keep last 500), or clear after successful sync acknowledgment.

### MED-2: sellerStore `addProduct` uses `Date.now()` for ID instead of `newId()`

- **Severity**: MEDIUM
- **File:Line**: `sellerStore.ts:110-111`
- **What**: Product IDs use `${Date.now()}-${random}`. While collision is unlikely, this is inconsistent with the rest of the codebase which uses `newId()` (UUID-based).
- **How it breaks**: If two products are added in the same millisecond (e.g., during import), IDs can collide. The random suffix reduces but doesn't eliminate this. The rehydration dedup (line 1098-1108) catches collisions but with a random suffix that changes the ID, potentially breaking sync.
- **Fix**: Use `newId()` consistently.

### MED-3: sellerStore `addOrder` uses `Date.now()` + short random for ID

- **Severity**: MEDIUM
- **File:Line**: `sellerStore.ts:163`
- **What**: Order IDs use `Date.now().toString() + Math.random().toString(36).slice(2, 6)`. 4 random chars = ~1.7M combinations. With rapid order entry during a busy session, collision is possible.
- **How it breaks**: Two orders get the same ID. One overwrites the other in the orders array. The overwritten order's sale is lost. Product `totalSold` is wrong because it was incremented for both orders but only one exists.
- **Fix**: Use `newId()`.

### MED-4: `deleteSharedSubscription` cascades debt deletion without wallet reversal

- **Severity**: MEDIUM
- **File:Line**: `debtStore.ts:331-335`
- **What**: `deleteSharedSubscription` deletes the subscription and all linked debts (`debts.filter(d => d.sharedSubId !== id)`). If any of those debts had payments with wallet deductions, the wallet balances are not reversed.
- **How it breaks**: User has a Netflix shared sub with 3 friends. Two friends paid their share (wallet was credited when payments were recorded). User deletes the shared sub. The debts and payments vanish, but the wallet credits remain. Wallet balance is inflated.
- **Fix**: Before deleting linked debts, iterate through their payments and reverse wallet effects.

### MED-5: `updateMonthAmounts` modifies debt totalAmount without recalculating paidAmount/status

- **Severity**: MEDIUM
- **File:Line**: `debtStore.ts:487-493`
- **What**: When shared sub amounts change, linked debts' `totalAmount` is updated but `paidAmount` and `status` are not recalculated.
- **How it breaks**: Debt was RM 30, user paid RM 30 (settled). Amount changes to RM 25. Debt still shows `paidAmount: 30, totalAmount: 25, status: settled`. The overpayment of RM 5 is silently lost.
- **Fix**: Recalculate status: `if (d.paidAmount >= share.shareAmount) status = 'settled'` etc.

### MED-6: `markSplitParticipantPaid/unmarkSplitParticipantPaid` uses `contact.id` which may not be unique

- **Severity**: MEDIUM
- **File:Line**: `debtStore.ts:271-296`
- **What**: These methods find participants by `p.contact.id === contactId`. If two participants somehow share the same contact ID (e.g., manually entered contacts without phone-based IDs), both get marked paid/unpaid.
- **How it breaks**: Split between "Ali" (no phone) and "Ali" (no phone) -- both get `contact.id` generated the same way. Marking one paid marks both.
- **Fix**: Use a participant-specific ID (e.g., index or UUID) rather than contact ID for split operations.

### MED-7: sellerSync `pullAll` uses `setState` directly, bypassing store actions

- **Severity**: MEDIUM
- **File:Line**: `sellerSync.ts:804,852,895,959,1007,1049,1089,1121,1170`
- **What**: All `useSellerStore.setState(...)` calls in pullAll bypass store actions. This means no side effects run (e.g., product `totalSold` adjustments that happen in `addOrder`).
- **How it breaks**: When a new order is pulled from remote, it's added to the orders array but product `totalSold` and `stockQuantity` are NOT updated. The seller sees wrong stock counts.
- **Fix**: For new orders pulled from remote, also apply stock/totalSold adjustments as `addOrder` would.

### MED-8: personalSync `deleteMissing` can delete data added during sync

- **Severity**: MEDIUM
- **File:Line**: `personalSync.ts:443-464`
- **What**: `deleteMissing` runs after `pushAll` upserts. It deletes remote rows not in the local set whose `updated_at < syncStart`. But if the user adds a transaction DURING sync (between pullAll and deleteMissing), the new local transaction gets upserted, but a different client's push from another device could have a row that's "missing from local" and gets deleted.
- **How it breaks**: Narrow window, but the `syncStart` guard only protects against items updated AFTER sync started. Items updated before sync but not yet pulled are at risk.
- **Fix**: `deleteMissing` should be gated on the first sync completing (which it is via `lastSync` check), but consider skipping it entirely when the delta between `lastSync` and `syncStart` is small.

### MED-9: stallStore has no tombstone tracking

- **Severity**: MEDIUM
- **File:Line**: `stallStore.ts` (entire file)
- **What**: stallStore has no `_deleted*Ids` arrays. If sync is ever added for stall data, there's no way to propagate deletions.
- **How it breaks**: Future sync implementation would have no deletion mechanism. Deleted sessions, products, and customers would reappear.
- **Fix**: Add tombstone arrays now, even if sync isn't implemented yet.

### MED-10: crmStore has no tombstone tracking

- **Severity**: MEDIUM
- **File:Line**: `crmStore.ts` (entire file)
- **What**: Same as MED-9. No `_deleted*Ids`.
- **How it breaks**: Same future sync problem.
- **Fix**: Add tombstone arrays.

### MED-11: businessStore has no tombstone tracking

- **Severity**: MEDIUM
- **File:Line**: `businessStore.ts` (entire file)
- **What**: No `_deleted*Ids` for products, sales, suppliers, clients, or transfers.
- **How it breaks**: Same future sync problem.
- **Fix**: Add tombstone arrays.

### MED-12: `addTransferIncome` creates transaction with deterministic ID `transfer-{id}`

- **Severity**: MEDIUM
- **File:Line**: `personalStore.ts:281`
- **What**: Transfer income IDs are `transfer-${transfer.id}`. If the same transfer is applied twice (e.g., due to a UI bug or sync race), the second one silently duplicates because `set()` just prepends to the array without checking for existing ID.
- **How it breaks**: User clicks "transfer to personal" twice quickly. Two transactions with ID `transfer-abc123` are created. Income is double-counted. Wallet balance is double-inflated.
- **Fix**: Check if transaction with that ID already exists before adding.

### MED-13: Savings account `currentValue` can disagree with latest snapshot

- **Severity**: MEDIUM
- **File:Line**: `savingsStore.ts:57-78`
- **What**: `addSnapshot` sets `currentValue = value` and appends to history. But `updateAccount` allows directly setting any field including `currentValue` without adding a history entry. The `currentValue` and `history[last].value` can diverge.
- **How it breaks**: Code calls `updateAccount(id, { currentValue: 1000 })`. History still shows last snapshot as RM 800. UI shows RM 1000 in the card but RM 800 as the last entry. User is confused about which is correct.
- **Fix**: Ensure `currentValue` changes always go through `addSnapshot`, or derive `currentValue` from the latest history entry.

### MED-14: personalSync `debtFromRemote` hardcodes `contact.id` to `'synced'`

- **Severity**: MEDIUM
- **File:Line**: `personalSync.ts:330`
- **What**: When pulling debts from remote, the contact is reconstructed with `id: 'synced'`. This means all synced debts share the same contact ID. Group-by-contact logic (`addDebt` uses `contact.id` for grouping) will group ALL synced debts together regardless of who they're for.
- **How it breaks**: User has debts with Ali and Muthu. After sync, both debts have `contact.id: 'synced'`. The groupId logic finds "existing debt with contact.id 'synced'" and puts all debts in the same group. UI shows all debts grouped under one person.
- **Fix**: Generate a deterministic contact ID from the contact name + phone, e.g., `synced-${contactName}-${phone}`.

---

## LOW Findings

### LOW-1: `addWallet` prepends new wallet BEFORE clearing other defaults

- **Severity**: LOW
- **File:Line**: `walletStore.ts:21-38`
- **What**: When `isDefault` is true, the new wallet is prepended, then existing wallets are mapped to clear their `isDefault`. The new wallet is always first in the array. This is correct functionally but the order depends on insertion position, which could be confusing.
- **How it breaks**: No functional break, but if code relies on array order for default wallet finding (e.g., `wallets.find(w => w.isDefault)`), the result is always the newest default wallet. This is actually the desired behavior.
- **Fix**: No fix needed, but document the ordering guarantee.

### LOW-2: `generateOrderCode` can theoretically infinite-loop

- **Severity**: LOW
- **File:Line**: `sellerStore.ts:46-61`
- **What**: The loop tries 100 attempts to generate a unique code. With 23^2 * 10^3 = 529,000 possible codes, collision is extremely unlikely to exhaust 100 attempts. But the fallback (timestamp-based) is also not guaranteed unique.
- **How it breaks**: Only with >529K orders (impossible in practice for a small seller).
- **Fix**: No fix needed for current scale.

### LOW-3: `recordOpen` in savingsStore sums without rounding

- **Severity**: LOW
- **File:Line**: `savingsStore.ts:93-95`
- **What**: `accounts.reduce((s, a) => s + a.currentValue, 0)` without rounding. This is only used for the "change since last opened" display.
- **How it breaks**: Display might show "up RM 0.0000001" due to float artifacts.
- **Fix**: `roundMoney()` the sum.

### LOW-4: sellerStore `addSellerCustomer` uses `Date.now()` for ID

- **Severity**: LOW
- **File:Line**: `sellerStore.ts:840`
- **What**: Customer IDs use `Date.now().toString()`. No random suffix, so rapid additions can collide.
- **How it breaks**: Very unlikely in practice (adding two customers in <1ms), but inconsistent with the rest of the codebase.
- **Fix**: Use `newId()`.

### LOW-5: `partialize` in sellerStore does not serialize `updatedAt` for seasons

- **Severity**: LOW
- **File:Line**: `sellerStore.ts:1055-1060`
- **What**: Season serialization includes `createdAt` but not `updatedAt` in the partialize mapper. However, the spread (`...s`) carries `updatedAt` through as-is. If `updatedAt` is a Date object, it will be serialized as `{}` by JSON.stringify (Date objects without `.toISOString()` call).
- **How it breaks**: On rehydration, `updatedAt` may be `undefined` or `{}` instead of a valid date. The `sd()` guard in `onRehydrateStorage` would convert `{}` to current date, masking the issue but losing the actual update time.
- **Fix**: Add explicit `updatedAt: toIso(s.updatedAt)` to the season partialize mapper.

### LOW-6: CRM `getCustomerStats` includes cancelled orders in `orderCount` but excludes them from `totalSpent`

- **Severity**: LOW
- **File:Line**: `crmStore.ts:94-100`
- **What**: `orderCount` counts ALL orders for the customer, but `totalSpent` and `outstanding` use `completedOrders` (excluding cancelled). This is inconsistent -- "5 orders, RM 200 spent" when 2 were cancelled and only 3 had payments.
- **How it breaks**: Cosmetic inconsistency. The counts don't add up for the user.
- **Fix**: Use `completedOrders.length` for `orderCount`, or document that it includes cancelled.

---

## Data Lifecycle Analysis

### Entity: Transaction (personalStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | OK (partialize + rehydrate) | -- |
| Supabase | OK (personalSync) | Truncation at 1000 rows (HIGH-14) |
| Wallet balance | BROKEN | Non-atomic (CRIT-2), stale-read race (HIGH-2, HIGH-3) |
| Budget spentAmount | NOT SYNCED | Budgets track `spentAmount` but it's never auto-updated when transactions change |

### Entity: Wallet (walletStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | OK | -- |
| Supabase | OK (personalSync) | Balance synced as snapshot, not derived (CRIT-9) |
| Transaction references | BROKEN on delete | walletId orphaned (HIGH-1) |
| Float precision | BROKEN | No rounding (CRIT-1) |

### Entity: Debt + Payments (debtStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | OK | -- |
| Supabase | OK (personalSync) | Contact ID lost on round-trip (MED-14) |
| Wallet balance | BROKEN | deletePayment doesn't reverse wallet (CRIT-8) |
| Linked transactions | Partial | Created at screen level, deleted at screen level -- no store-level guarantee |

### Entity: Goal + Contributions (personalStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | OK | -- |
| Wallet balance | BROKEN | contributeToGoal doesn't deduct wallet (CRIT-3), removeContribution doesn't refund (CRIT-4) |

### Entity: Seller Order (sellerStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | OK (with dedup on rehydrate) | -- |
| Supabase | OK (sellerSync) | Pull doesn't adjust stock/totalSold (MED-7) |
| Product totalSold/stock | OK on local CRUD | Broken on sync pull (MED-7) |
| Transfer-to-personal | OK | reconcileTransferIncome handles edit/delete |

### Entity: Stall Session + Sales (stallStore)
| Dimension | Status | Gap |
|-----------|--------|-----|
| Zustand state | OK | -- |
| AsyncStorage | FRAGILE | No sd() guards (CRIT-5) |
| Running totals | FRAGILE | Float drift (HIGH-10) |
| No sync | N/A | No tombstones if sync added (MED-9) |
