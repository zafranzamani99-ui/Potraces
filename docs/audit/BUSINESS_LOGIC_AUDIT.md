# Business Logic Audit

**Date:** 2026-05-28
**Auditor:** Domain expert (Malaysian small-seller finance context)
**Scope:** All financial calculations, insights, and operations across personal, seller, stall, and business modes.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| **Critical** | User sees wrong money numbers. Could cause bad financial decisions. |
| **High** | Logic is incorrect in edge cases that real users will hit. |
| **Medium** | Inconsistency that confuses but doesn't lose money. |
| **Low** | Minor formatting / polish issue. |
| **OK** | Audited and found correct. |

---

## 1. Margin / Kept Calculation

### [OK] `useSeasonInsights.ts` -- Kept = paid income - costs
- Line 48-50: `income = paidOrders.reduce(...)`, `totalCosts = seasonCosts.reduce(...)`, `kept = income - totalCosts`.
- Correctly filters to `isPaid` orders only. Unpaid orders excluded from income.
- Costs are always included regardless of payment status (correct -- you owe the supplier either way).

### [OK] `seller/Dashboard.tsx` -- Monthly kept
- Line 108-130: `_totalIncome` uses `filter((o) => o.isPaid)` before reducing. Correct.
- `_totalCosts` includes all costs in the month. Correct.
- `kept = _totalIncome - _totalCosts`. Consistent with season insights.

### [OK] `seller/SeasonSummary.tsx` -- Season kept
- Line 147-155: Same pattern. `paidOrders.reduce(...)` for income, all costs for totalCosts. Consistent.

### [OK] Kept rate calculation
- `seller/Dashboard.tsx` line 313: `keptRate = (kept / totalIncome) * 100`. This is margin on income, not markup on cost. Correct for a seller's perspective ("I kept X% of what came in").

---

## 2. Paid vs Unpaid Confusion

### [OK] All seller income calculations filter `isPaid`
- `useSeasonInsights.ts:43` -- `paidOrders = seasonOrders.filter((o) => o.isPaid)`
- `seller/Dashboard.tsx:108-109` -- same pattern
- `seller/SeasonSummary.tsx:150` -- same pattern

### [OK] Unpaid shown separately
- Dashboard shows unpaid count and amount as a distinct card (line 1139-1173).
- Season summary shows unpaid notice (line 647-663).
- `useSeasonInsights.ts:137` returns `unpaidAmount` separately.

### [Medium] `seller/Dashboard.tsx` -- `collectionRate` uses ALL orders including unpaid
- Line 314-316: `totalOrderValue = currentOrders.reduce(...)` (no isPaid filter), then `collectionRate = totalIncome / totalOrderValue * 100`.
- This is intentionally "what % of orders have been collected" -- so it's correct by design.
- **However**: `collectionRate` is computed but never displayed on the dashboard UI. Dead code. Not harmful but wastes cycles.

### [Medium] `seller/Dashboard.tsx` -- `topCustomer` includes unpaid orders in totals
- Line 341-352: `currentOrders` (no isPaid filter) used. A customer's total includes unpaid amounts.
- **Impact**: If a customer has 5 big unpaid orders, they appear as "top customer" even though no money came in. Misleading for the seller's sense of who is actually paying.

---

## 3. Target Progress

### [OK] Season target -- capped at 100% visually, shows "target reached!" text
- `useSeasonInsights.ts:52-53`: `targetPct = (income / revenueTarget) * 100` -- NOT capped. Can exceed 100%.
- `seller/Dashboard.tsx:738-739`: Progress bar width uses `Math.min(100, targetPct)%` -- capped visually. Correct.
- Text shows "target reached!" when >= 100% (line 741-742). Good.
- `seller/SeasonSummary.tsx:550`: Same `Math.min(100, ...)` capping on bar. Consistent.

### [OK] Target = 0 handled
- `useSeasonInsights.ts:52`: Guard `season.revenueTarget && season.revenueTarget > 0` -- returns null if 0.
- `seller/SeasonSummary.tsx:538`: `season.revenueTarget ?` -- falsy check catches 0.

### [High] Target -- negative value not rejected
- `seller/SeasonSummary.tsx:1239-1242`: Target input validation is `val > 0`, which correctly rejects negatives.
- **But**: If a user types "0" it silently does nothing (no toast/error). Confusing UX but not a math bug.

### [OK] Goals target progress
- `Goals.tsx:202-207`: `overallPercentage = (totalSaved / totalTarget) * 100` -- not capped.
- Individual goal completion at line 205: `g.currentAmount >= g.targetAmount`. Allows exceeding. Correct.

---

## 4. Break-Even Logic

### [Medium] `useSeasonInsights.ts` -- Break-even skips days with no activity
- Lines 70-97: Daily series only contains days that have either orders or costs. Days with zero activity are skipped.
- **Impact**: If costs are logged on day 1 (RM 500) and income trickles in on days 3, 5, 7, the break-even day number is calculated as `differenceInDays(entry.date, seasonStart) + 1` which is correct calendar-wise.
- Break-even is found when `cumulativeIncome >= cumulativeCosts`. Correct.
- **Edge case OK**: If only costs exist (no income), `breakEvenDay` stays null because the loop never finds income >= costs. Guard at line 90 `if (totalCosts > 0)` is correct.

### [OK] Break-even on Dashboard
- `seller/Dashboard.tsx:972-985`: Monthly break-even uses `kept >= 0` (income - costs >= 0). Simpler check, but logically equivalent for the current month view. Fine.

---

## 5. Date Range Filtering

### [High] `Reports.tsx` / `Dashboard.tsx` -- `isWithinInterval(t.date, ...)` without Date coercion
- `Reports.tsx:70`: `isWithinInterval(t.date, { start: monthStart, end: monthEnd })`.
- `t.date` comes from the store which uses `onRehydrateStorage` to convert dates. After rehydration, `t.date` should be a Date object.
- **Risk**: If `t.date` is still a string (e.g., ISO string from JSON before rehydration completes, or from an edge in date-fns v3+), `isWithinInterval` may silently fail or throw.
- **Observed pattern**: `seller/Dashboard.tsx:63` does `d instanceof Date ? d : new Date(d)` for orders, but personal mode `Reports.tsx` does NOT do this coercion.
- **Impact**: Transactions at midnight boundaries could be misclassified if date-fns receives a string instead of a Date. Low probability after rehydration but a latent bug.

### [OK] `startOfMonth`/`endOfMonth` are timezone-aware
- date-fns uses the local timezone by default, which matches the user's phone timezone. Malaysian users will see month boundaries at MYT midnight. Correct.

### [Medium] `spendingAlerts.ts` -- "this week" is rolling 7 days, not calendar week
- Line 30: `thisWeekStart = new Date(now.getTime() - 7 * DAILY_MS)`.
- This is a rolling 7-day window, not Mon-Sun. This is fine conceptually but differs from how "weekly" budgets are calculated (Mon-Sun via `startOfWeek`). Could confuse a user who sees "this week's spending is high" but their weekly budget shows differently.

---

## 6. Currency Formatting

### [Critical] Hardcoded "RM" in `explainStallSession.ts` and `explainStallHistory.ts`
- `explainStallSession.ts:52`: `RM${perHour.toFixed(0)}/hour pace.`
- `explainStallSession.ts:93`: `RM${totalRevenue.toFixed(0)} total.`
- `explainStallHistory.ts:106`: `RM${avgRevenue.toFixed(0)} average.`
- **Impact**: If a user changes currency to USD/SGD, stall insights still show "RM". The `currency` setting is not passed to these utility functions. Every other screen in the app uses the dynamic `currency` variable.

### [Medium] Inconsistent decimal places across the app
- **2 decimal places** (proper): `Dashboard.tsx` came-in/costs rows use `.toFixed(2)`, wallet balances use `.toFixed(2)`.
- **0 decimal places** (rounded): Hero amounts use `.toFixed(0)`, unpaid totals use `.toFixed(0)`, stall session totals use `.toFixed(0)`.
- **Pattern**: Hero/headline numbers are rounded (e.g., "RM 1,234"), detail rows show exact (e.g., "RM 1,234.50"). This is an intentional design choice and is acceptable, but:
  - `seller/Dashboard.tsx:1169` unpaid sub-amount: `.toFixed(0)` -- shows "RM 50" not "RM 50.00". Inconsistent with the "came in" row above which shows `.toFixed(2)`.
  - `seller/SeasonSummary.tsx:529`: Total income stat shows `.toFixed(0)` -- could mislead on exact amounts.

### [Low] No thousand separators
- All money amounts use raw `.toFixed()` without commas. "RM 12500.00" instead of "RM 12,500.00". For Malaysian kuih sellers hitting RM 5,000+ seasons, readability suffers. The `formatters.ts` utility exists but is rarely used in screens.

---

## 7. Debt Settlement Logic

### [OK] Payment capping prevents overpayment
- `debtStore.ts:124`: `remaining = Math.max(0, debt.totalAmount - debt.paidAmount)`.
- `debtStore.ts:122`: `if (debt.status === 'settled') return null` -- blocks payments on settled debts.
- `debtStore.ts:139`: `newPaidAmount = Math.min(d.totalAmount, d.paidAmount + payment.amount)` -- caps at total.

### [High] Overpayment silently capped, excess money lost
- If a debt is RM 100, user has paid RM 80, and adds a RM 30 payment:
  - `remaining = 100 - 80 = 20`. Guard at line 125 `if (remaining <= 0) return null` passes (remaining = 20).
  - But `newPaidAmount = Math.min(100, 80 + 30) = 100`. The RM 10 excess is silently discarded.
  - The user thinks they recorded RM 30 but the system only credits RM 20.
  - **No warning is shown** -- the payment object stores `amount: 30` but `paidAmount` only increased by 20.
- **Impact**: Payment history shows RM 30 was paid, but the debt math says only RM 20 counted. If user exports or audits, numbers won't add up.

### [OK] Delete payment recalculates correctly
- `debtStore.ts:156-182`: Rebuilds `paidAmount` from remaining payments using `reduce`. Correct.
- Uses `Math.min(debt.totalAmount, rawPaidAmount)` -- consistent capping.

### [OK] Update payment recalculates correctly
- `debtStore.ts:184-224`: Same rebuild-from-payments pattern. Correct.

### [Medium] Edit after settlement -- status correctly recalculated
- When `totalAmount` changes on a settled debt (line 78-91), paidAmount is recapped to new total, and status is recalculated. If new total > old total, debt can go from settled back to partial. This is correct behavior.

---

## 8. Budget vs Actual

### [OK] Budget period matching
- `BudgetPlanning.tsx:384-398`: `budgetsWithSpent` computes spent per budget using `getPeriodInterval(budget.period, now)`.
- Weekly budget uses `startOfWeek(now, { weekStartsOn: 1 })` (Monday start). Correct for Malaysia.
- Monthly and yearly use `startOfMonth`/`startOfYear`. Correct.

### [OK] Same period comparison
- Budget allocated amount is compared to spent in the same period. No cross-period mixing.

### [Medium] Mid-period budget changes not handled
- If a user changes budget amount mid-month from RM 500 to RM 300, and they've already spent RM 400, the budget immediately shows as exceeded. The old allocation is not prorated.
- This is standard behavior for budget apps, but worth noting that there's no "effective from next period" option.

### [OK] Pace ratio calculation
- `BudgetPlanning.tsx:141-145`: Pace ratio factors in how far through the period the user is. A user who spent 50% of budget in the first 50% of the month is "on track". Correct.

---

## 9. Stall Session Accounting

### [OK] Sale totals are incrementally maintained
- `stallStore.ts:97-109`: Each sale adds to `totalRevenue`, `totalCash`, or `totalQR`. Correct.
- `stallStore.ts:140-153`: Void/delete sale subtracts from the same fields. Correct.

### [OK] Remaining stock tracked
- `stallStore.ts:98-102`: `remainingQty = Math.max(0, ps.remainingQty - sale.quantity)`. Floor at 0 prevents negative stock.

### [Medium] No concept of discounted / complimentary items
- All sales are at full price. There's no discount field on a sale or a "comp" flag.
- **Impact**: A stall seller who gives a free sample or discounts for a friend has no way to record this accurately. The session revenue will be overstated if they record it as a sale, or items will appear unsold if they don't.

### [OK] Session close does not recompute totals
- `stallStore.ts:62-72`: `closeSession` just sets `isActive: false, closedAt: new Date()`. Totals are already correct from incremental updates. Good.

### [Medium] `getSessionSummary` redundantly recomputes from sales
- `stallStore.ts:227+`: Iterates sales to build breakdown, but `totalRevenue`/`totalCash`/`totalQR` are already stored on the session. Minor inefficiency but ensures consistency if the incremental values ever drift.

---

## 10. Report Aggregation

### [OK] Personal Reports -- 6-month trend correctly computed
- `Reports.tsx:64-84`: Loops `i = 5..0`, computes `subMonths(now, i)`, filters transactions per month, sums income/expenses. Correct.
- No off-by-one: `startOfMonth` to `endOfMonth` is inclusive. Correct.

### [OK] Business Reports -- same pattern
- `business/Reports.tsx`: Uses `startOfMonth`/`endOfMonth` with `isWithinInterval`. Correct.

### [OK] Freelancer Reports -- income only (no expense tracking)
- `freelancer/FreelancerReports.tsx`: Only filters `type === 'income'`. Correct for freelancer mode which doesn't track costs.

### [Medium] Reports don't include investment transactions
- Transactions with `type === 'investment'` (if any exist) are excluded from both income and expense totals. This is likely intentional but means the "kept" number on the dashboard could differ from a full net-worth view.

---

## 11. Multi-Wallet Math

### [OK] Transfers are zero-sum
- `walletStore.ts:114-147`: `transferBetweenWallets` deducts from source (`balance - amount`) and adds to destination (`balance + amount`) in a single `set()` call. Atomic. Correct.
- Credit wallet transfers correctly increase `usedCredit` on the source side. Correct.

### [OK] Transfers are NOT counted as income or expense
- Transfer records go into `transfers` array, not into `personalStore.transactions`. No double-counting.

### [OK] Transfer deletion
- `WalletManagement.tsx` uses `deleteTransfer` from walletStore. Need to verify it reverses balances -- checking...

### [OK] Transfer deletion correctly reverses wallet balances
- `walletStore.ts:166-181`: `deleteTransfer` finds the transfer record, then reverses the balance changes on both wallets (adds back to source, deducts from destination). Credit wallets also reverse `usedCredit`. Correct.

---

## 12. Product Cost vs Selling Price

### [High] Business mode `Reports.tsx` -- profit uses `product.cost` which can be 0
- `business/Reports.tsx:46`: `profit = (item.unitPrice - product.cost) * item.quantity`.
- `StallProduct.cost` is typed as `number` (not optional) in `types/index.ts:770`.
- **If cost is 0** (user didn't set it): profit = full selling price. This inflates "kept" to equal total revenue. The user sees 100% margin, which is misleading.
- **No guard exists** to distinguish "cost is genuinely 0" from "user hasn't set cost yet".
- **Impact**: A stall seller who adds products without setting costs sees artificially high profit numbers.

### [OK] Seller mode -- costs are separate `ingredientCosts` array
- Seller mode uses a completely separate cost tracking system (`ingredientCosts`), not per-product cost fields. This avoids the per-product cost issue entirely.

---

## 13. Spending Alerts

### [OK] `spendingAlerts.ts` -- dual threshold prevents false alarms
- Line 9-10: Requires BOTH >150% of average AND >RM 20 absolute difference. Prevents alerts on tiny categories.

### [Medium] Trailing average is 4-week, not 4 full weeks
- Line 31: `trailingStart = new Date(now.getTime() - 5 * 7 * DAILY_MS)`.
- This is 5 weeks back from now, with `trailingEnd = thisWeekStart` (1 week back). So trailing window = 4 weeks. Correct.
- But if a category had spending in only 1 of those 4 weeks, the average is divided by 4, making it artificially low. This could trigger false alerts for infrequent categories.

---

## 14. Spending Mirror (AI)

### [OK] Data summary uses correct store data
- `spendingMirror.ts:29-137`: Pulls from personalStore, debtStore, walletStore. Correctly computes monthly totals.

### [Low] Subscription total doesn't account for billing frequency
- Line 115: `subsTotal = activeSubs.reduce((s, sub) => s + sub.amount, 0)` -- sums raw amounts.
- If a subscription is yearly (RM 120/year), it's summed with monthly ones (RM 15/month). The total shown as "/month" is inaccurate.
- Labeled as "total" not "/month" in the prompt, so the AI gets confused data.

---

## 15. Seller Transfer Bridge

### [OK] Transfer to personal -- amount validation
- `SeasonSummary.tsx:271-276`: Validates `amount > 0` and `amount <= untransferredAmount`. Correct.

### [OK] Orders marked as transferred
- `SeasonSummary.tsx:287-289`: `markOrdersTransferred` links order IDs to the transfer. Correct.

### [OK] Undo transfers -- full reversal
- `SeasonSummary.tsx:898-936`: Undo deletes both the business transfer and the personal transaction, and unmarks orders. Correct symmetry.

---

## Summary of Findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | **Critical** | Currency | `explainStallSession.ts` and `explainStallHistory.ts` hardcode "RM" instead of using the currency setting. |
| 2 | **High** | Debt | Overpayment is silently capped -- payment record shows RM 30 but only RM 20 is credited. No user warning. |
| 3 | **High** | Reports | Business mode profit calculation treats unset product cost (0) as genuine zero cost, showing 100% margin. |
| 4 | **High** | Dates | Personal Reports pass `t.date` to `isWithinInterval` without Date coercion. Risk of string dates after rehydration causing silent filter failures. |
| 5 | **Medium** | Seller | `topCustomer` includes unpaid orders, inflating the "top customer" ranking with uncollected money. |
| 6 | **Medium** | Formatting | Inconsistent decimal places: hero shows `.toFixed(0)`, detail rows show `.toFixed(2)`, some sub-amounts mix both. |
| 7 | **Medium** | Stall | No support for discounted or complimentary items in stall sessions. |
| 8 | **Medium** | Alerts | Spending alerts use rolling 7-day "week" while budgets use calendar Mon-Sun week. |
| 9 | **Medium** | Dead code | `collectionRate` computed but never displayed on seller Dashboard. |
| 10 | **Medium** | Reports | Investment-type transactions excluded from income/expense totals without explanation. |
| 11 | **Low** | Formatting | No thousand separators on money amounts. "RM 12500" instead of "RM 12,500". |
| 12 | **Low** | AI | Spending mirror sums subscription amounts regardless of billing frequency (yearly + monthly mixed). |

---

## Recommended Fix Priority

1. **Fix #1 (Critical)**: Pass `currency` parameter to `explainStallSession` and `explainStallHistory`. Simple 5-minute fix.
2. **Fix #2 (High)**: In `debtStore.addPayment`, cap `payment.amount` to `remaining` before storing, OR warn the user and reject the payment. The payment record should reflect the actual credited amount.
3. **Fix #3 (High)**: In business Reports profit calculation, skip products where `cost === 0` or show "margin unknown" instead of inflating to 100%.
4. **Fix #4 (High)**: Add Date coercion (`t.date instanceof Date ? t.date : new Date(t.date)`) in Reports.tsx `isWithinInterval` calls to match the seller-mode pattern.
