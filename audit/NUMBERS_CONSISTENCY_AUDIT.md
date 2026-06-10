# Numbers Consistency Audit

**Date**: 2026-05-28
**Auditor**: Claude (forensic code audit)
**Scope**: Every displayed financial number across all screens — personal mode, seller mode, debt/split tracking, wallet management

---

## Methodology

For every monetary value displayed to the user, I traced back to:
1. Which store provides the raw data
2. Which filter predicates select the subset
3. Which reduce/formula computes the displayed number
4. Whether any rounding is applied before display

Then I grouped by semantic meaning and compared computation paths across screens.

---

## FINDING 1 — CRITICAL: Dashboard "Upcoming Bills" uses TWO different date windows

### Where it appears
| Location | Window | Code |
|---|---|---|
| Dashboard `stats.upcomingBills` (Details section) | `today` to `today + 8 days` | `addDays(today, 8)` |
| Dashboard `insightStrip.upcomingTotal` (Insight strip) | `today` to `today + 7 days` | `addDays(today, 7)` |
| WalletManagement `upcomingBillsWallet` | `today` to `today + 7 days` | `sevenDaysOut.setDate(getDate() + 7)` |

### Impact
A subscription due exactly 7-8 days from now will appear in the Dashboard Details card but NOT in the Insight Strip or WalletManagement. The Dashboard Details shows "total: RM X" while the Insight Strip shows a different "RM Y this week" for the same concept.

### Root cause
Dashboard `stats` uses `addDays(today, 8)` (inclusive of day 8), while the insight strip and WalletManagement use 7 days. The `isWithinInterval` function is inclusive on both ends, so `addDays(today, 8)` captures bills 0-8 days out (9 days total) while `addDays(today, 7)` captures 0-7 days (8 days total).

### Edge case
User has a bill due exactly 8 days from now. Dashboard Details section says "1 bill, RM 50" but the insight strip says "0 bills, RM 0 this week".

**Files**: `src/screens/personal/Dashboard.tsx` lines 171-176 vs 341-348

---

## FINDING 2 — CRITICAL: Dashboard "Kept" (net) is computed THREE different ways

### Where it appears
| Location | Computation | Code path |
|---|---|---|
| Dashboard `stats.balance` | `income - expenses` from `isWithinInterval(monthStart, monthEnd)` | Dashboard.tsx line 168 |
| Dashboard `netThisMonth` | `stats.income - stats.expenses` (same as above) | Dashboard.tsx line 235 |
| Dashboard insight strip "Kept" card | `useKeptNumber().keptThisMonth` | `useKeptNumber.ts` |
| Reports `currentMonthTotals` | `income - expenses` from `isWithinInterval(monthStart, monthEnd)` | Reports.tsx lines 117-118 |
| FinancialPulse `monthlyStats` | `income - expenses` from `isWithinInterval(monthStart, monthEnd)` | FinancialPulse.tsx lines 112-118 |
| TransactionsList `totals.net` | `income - expenses` from **filteredTransactions** (varies by active filters) | TransactionsList.tsx lines 321-328 |

### Analysis
- Dashboard `stats`, Reports, FinancialPulse, and `useKeptNumber` all use the **same** filter predicate: `isWithinInterval(t.date, { start: startOfMonth(now), end: endOfMonth(now) })`. These are **consistent**.
- TransactionsList computes `totals.net` from `filteredTransactions` which applies the user's active date range, category, and wallet filters. This is **intentionally different** (it shows the filtered view's net) and is clearly labeled with the period name. **Not a bug**, but the "you kept" label could confuse users who expect it to match the Dashboard.

### Verdict
The "Kept" number is consistent across Dashboard, Reports, FinancialPulse, and `useKeptNumber`. TransactionsList is intentionally filter-relative. **No discrepancy.**

---

## FINDING 3 — MODERATE: Dashboard hero balance vs WalletManagement total balance

### Where it appears
| Location | Computation |
|---|---|
| Dashboard `heroBalance` | `wallets.filter(w => w.type !== 'credit').reduce(balance)` if wallets exist, else `stats.balance` (income - expenses) |
| WalletManagement `totalBalance` | `bankWallets.reduce(balance) + ewalletWallets.reduce(balance)` |

### Analysis
Both computations exclude credit wallets and sum the `balance` field. The Dashboard uses `w.type !== 'credit'` while WalletManagement explicitly sums `bank` + `ewallet`. These are **equivalent** — the only wallet types are `bank`, `ewallet`, and `credit`.

### Verdict
**Consistent.** The two approaches produce identical results.

---

## FINDING 4 — MODERATE: Wallet balance is STORED, not computed — dual source of truth

### Architecture
Wallet balance is a **stored number** in `walletStore.wallets[n].balance`. It is mutated by:
- `addToWallet(id, amount)` — increments balance
- `deductFromWallet(id, amount)` — decrements balance
- `setWalletBalance(id, balance)` — overwrites (reconciliation only)
- `transferBetweenWallets(from, to, amount)` — decrements from, increments to
- `repayCredit(id, amount)` — increases balance, decreases usedCredit
- `useCredit(id, amount)` — decreases balance, increases usedCredit

Meanwhile, `reconcileWallet()` in `src/utils/walletReconcile.ts` can RECOMPUTE the balance from transactions:
```
computed = startingBalance(0) + sum(income txns) - sum(expense txns)
```

### Risk
If ANY code path mutates the wallet balance without a corresponding transaction (or vice versa), the stored balance and the transaction-derived balance will diverge permanently. The reconciliation tool exists precisely because this has happened historically.

### Known safe patterns
- Dashboard edit/delete transaction: reverses old wallet effect, applies new one. **Safe.**
- TransactionsList edit/delete: same pattern. **Safe.**
- WalletManagement transfer: calls `transferBetweenWallets` AND creates two transactions (expense from source, income to destination). **Safe but creates inflated income/expense totals** — these transfer transactions show up in Dashboard monthly income/expense, artificially inflating both numbers.
- WalletManagement repay credit: calls `repayCredit` + `deductFromWallet` + creates expense transaction. **Safe.**

### FINDING 4a — MODERATE: Wallet transfers inflate monthly income/expense
When a user transfers RM 500 between wallets, WalletManagement creates:
- An expense transaction of RM 500 on the source wallet
- An income transaction of RM 500 on the destination wallet

These are real transactions in `personalStore.transactions`. The Dashboard's monthly income/expense stats (`stats.income`, `stats.expenses`) include them. So if a user transfers RM 500, their Dashboard shows RM 500 more income AND RM 500 more expenses than actual money flow.

The `kept` number (income - expenses) is unaffected because the transfer adds equally to both sides. But the individual income/expense numbers are misleading.

**Impact**: User sees "RM 2,500 came in this month" when actually RM 2,000 was income and RM 500 was a wallet transfer. The Reports screen's income trend line is similarly inflated.

**Files**: `src/screens/personal/WalletManagement.tsx` lines 899-926 (transfer handler)

---

## FINDING 5 — CRITICAL: Budget "spent" computed differently on Dashboard vs BudgetPlanning vs BreathingRoom

### Where it appears
| Location | How "spent per budget" is computed |
|---|---|
| Dashboard `stats.budgetProgress` | Iterates ALL budgets, uses `getDateRange(budget)` per period (weekly/monthly/yearly), sums all spent, divides by total allocated | 
| BudgetPlanning `budgetsWithSpent` | Per budget, uses `getPeriodInterval(budget.period, now)`, sums transactions matching category + period |
| BreathingRoom (Dashboard component) | Only uses **monthly** budgets (`b.period !== 'monthly' → skip`), sums transactions for `startOfMonth..endOfMonth` |

### Discrepancy 1: Dashboard `budgetProgress` is a GLOBAL percentage
Dashboard computes a single `budgetProgress` percentage by summing ALL budget allocations and ALL budget spending. This means a weekly budget of RM 100 is added to a monthly budget of RM 500 as if they were the same period. A user with:
- Weekly food budget: RM 100 (spent RM 50 this week)
- Monthly transport budget: RM 200 (spent RM 180 this month)

Dashboard shows: `(50 + 180) / (100 + 200) * 100 = 76.7%`

But this is **meaningless** — the RM 100 weekly budget resets every week, so comparing "RM 50 spent this week" against a monthly time horizon makes no sense.

### Discrepancy 2: BreathingRoom excludes non-monthly budgets
BreathingRoom only shows monthly budgets. A user's weekly food budget won't appear in BreathingRoom at all. The Dashboard budget progress bar includes it.

### Discrepancy 3: BreathingRoom also draws from `breathingRooms` (AI-set limits)
BreathingRoom first checks `aiInsightsStore.breathingRooms` and falls back to budgets. These AI-generated limits are entirely separate from the user's budgets. A category can have a breathing room limit of RM 300 while the budget says RM 200. The BreathingRoom component will show RM 300; the Dashboard budget progress uses RM 200.

**Impact**: Dashboard shows a budget progress bar that doesn't match what BreathingRoom shows underneath it. User sees 76% on the bar but BreathingRoom says "comfortable" because it's using different limits and different period filtering.

**Files**: 
- `src/screens/personal/Dashboard.tsx` lines 180-195
- `src/screens/personal/BudgetPlanning.tsx` lines 384-398
- `src/components/common/BreathingRoom.tsx` lines 40-91

---

## FINDING 6 — LOW: Seller "Kept" is consistent across all seller screens

### Where it appears
| Location | Computation |
|---|---|
| Seller Dashboard `kept` | `paidOrders.reduce(totalAmount) - currentCosts.reduce(amount)` (monthly) |
| Seller Dashboard `heroKept` | Uses `seasonInsights.kept` if active season, else monthly `kept` |
| `useSeasonInsights` hook | `paidOrders.reduce(totalAmount) - seasonCosts.reduce(amount)` (season-scoped) |
| SeasonSummary `stats.kept` | `paidOrders.reduce(totalAmount) - seasonCosts.reduce(amount)` (season-scoped) |
| PastSeasons `statsMap[id].kept` | `isPaid orders.reduce(totalAmount) - seasonCosts.reduce(amount)` |

### Analysis
All seller screens use the identical formula: `sum(paid order totalAmount) - sum(ingredient cost amount)`. The only difference is the filter scope (monthly vs season). When the Dashboard shows `heroKept` for an active season, it delegates to `useSeasonInsights` which uses the same formula as SeasonSummary.

### Verdict
**Consistent.** No discrepancy.

---

## FINDING 7 — MODERATE: Debt "remaining" computed differently on Dashboard vs DebtTracking

### Where it appears
| Location | Filter | Formula |
|---|---|---|
| Dashboard `stats.youOwe` | `debts.filter(d.mode === 'personal' && d.type === 'i_owe' && d.status !== 'settled')` | `sum(totalAmount - paidAmount)` |
| Dashboard `stats.owedToYou` | `debts.filter(d.mode === 'personal' && d.type === 'they_owe' && d.status !== 'settled')` | `sum(totalAmount - paidAmount)` |
| DebtTracking `balanceSummary.youOwe` | `modeDebts.filter(!d.isArchived && d.type === 'i_owe' && d.status !== 'settled')` | `sum(totalAmount - paidAmount)` |
| DebtTracking `balanceSummary.owedToYou` | `modeDebts.filter(!d.isArchived && d.type === 'they_owe' && d.status !== 'settled')` | `sum(totalAmount - paidAmount)` |

### Discrepancy: Dashboard includes archived debts, DebtTracking excludes them
Dashboard filters by `d.mode === 'personal'` and `d.status !== 'settled'` but does **NOT** check `d.isArchived`. DebtTracking explicitly excludes archived debts with `!d.isArchived`.

**Impact**: If a user archives an unsettled debt (e.g., "don't want to see this anymore but it's not paid"), the Dashboard will still show it in "You owe RM X" while DebtTracking won't. The numbers disagree.

**Edge case**: User has RM 200 unsettled debt, archives it. Dashboard shows "You owe RM 200". DebtTracking shows "You owe RM 0". This is a trust-destroying discrepancy.

**Files**:
- `src/screens/personal/Dashboard.tsx` lines 197-203
- `src/screens/shared/DebtTracking.tsx` lines 635-644

---

## FINDING 8 — LOW: Seller customer "totalSpent" only counts PAID orders

### Where it appears
| Location | Computation |
|---|---|
| Customers screen `derivedCustomers` | `if (order.isPaid) entry.totalSpent += order.totalAmount` |
| Customers screen `derivedCustomers` | `if (!order.isPaid) entry.unpaidAmount += order.totalAmount` |

### Analysis
`totalSpent` explicitly only counts paid orders. `unpaidAmount` counts unpaid orders. The card shows both: "3 orders, RM 150, RM 30 unpaid". This is **internally consistent** and semantically correct. The total order value is `totalSpent + unpaidAmount`, which isn't displayed but could be derived.

### Verdict
**Consistent and correct.**

---

## FINDING 9 — MODERATE: Rounding inconsistencies across screens

### Where it appears
| Location | Rounding |
|---|---|
| Dashboard hero balance | `.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` (2 decimal places) |
| Dashboard hero sub-line (kept) | `.toFixed(0)` (0 decimal places) |
| Dashboard insight strip kept | `.toFixed(0)` |
| Dashboard debt stats | `.toFixed(2)` |
| WalletManagement summary | `.toLocaleString(undefined, { min: 2, max: 2 })` |
| TransactionsList header | `formatAmount(Math.abs(totals.net), currency, 0)` (0 decimal places) |
| DebtTracking balanceSummary | `.toFixed(2)` |
| Seller Dashboard kept | `.toFixed(0)` via animated counter |
| Reports income/expenses | `.toFixed(2)` implied by chart data |

### Impact
A kept amount of RM 1,234.56 shows as:
- "RM 1,235" on the Dashboard sub-line (toFixed(0) rounds up)
- "RM 1,234.56" in Reports
- "+RM 1,235" on the TransactionsList header

This is not a calculation discrepancy but a **display inconsistency**. Users may notice the Dashboard says RM 1,235 while a detail screen says RM 1,234.56.

### Verdict
Minor polish issue. Not a trust problem unless the rounding crosses a sign boundary (e.g., kept = -0.4 rounds to RM 0 on Dashboard but shows -RM 0.40 elsewhere).

---

## FINDING 10 — LOW: `isWithinInterval` date filtering is consistent

Every screen that filters "this month's transactions" uses the identical pattern:
```ts
const monthStart = startOfMonth(now);
const monthEnd = endOfMonth(now);
isWithinInterval(t.date, { start: monthStart, end: monthEnd })
```

This is consistent across:
- Dashboard.tsx
- Reports.tsx
- FinancialPulse.tsx
- BudgetPlanning.tsx
- BreathingRoom.tsx
- useKeptNumber.ts

All use `date-fns` functions with inclusive boundaries. **No timezone issues** because all dates are local Date objects.

### Verdict
**Consistent.** The `isWithinInterval` predicate is used uniformly.

---

## FINDING 11 — LOW: Wallet reconciliation assumes starting balance of 0

`reconcileWallet()` in `src/utils/walletReconcile.ts` defaults `startingBalance = 0`. This means if a user creates a wallet with RM 5,000 initial balance and has no prior transactions, the reconciliation will compute RM 0 and show a "difference of RM 5,000". The UI warns about this ("If your wallet had an unlogged initial deposit, the recomputed balance will be off"), so it's documented. But the warning is only in the Alert text — an automated reconciliation would silently wipe the initial balance.

### Verdict
**By design, with adequate warning.** No automated reconciliation occurs — it's always user-initiated with an alert.

---

## Summary Table

| # | Severity | Finding | Screens affected |
|---|---|---|---|
| 1 | **CRITICAL** | Upcoming bills uses 8-day vs 7-day window | Dashboard (details vs insight strip), WalletManagement |
| 2 | LOW | Kept number consistent across screens | Dashboard, Reports, FinancialPulse, useKeptNumber |
| 3 | LOW | Hero balance consistent | Dashboard, WalletManagement |
| 4a | **MODERATE** | Wallet transfers inflate income/expense | Dashboard, Reports, FinancialPulse |
| 5 | **CRITICAL** | Budget progress computed differently | Dashboard, BudgetPlanning, BreathingRoom |
| 6 | LOW | Seller kept consistent | Seller Dashboard, SeasonSummary, PastSeasons |
| 7 | **MODERATE** | Archived debts included on Dashboard but not DebtTracking | Dashboard, DebtTracking |
| 8 | LOW | Customer totalSpent internally consistent | Customers |
| 9 | MODERATE | Rounding (0 vs 2 decimals) varies by screen | All screens |
| 10 | LOW | Date filtering consistent | All personal screens |
| 11 | LOW | Wallet reconciliation assumes 0 start | WalletManagement |

---

## Recommended Fix Priority

1. **FINDING 7** (archived debts) — Highest user trust impact. Dashboard showing debt the user explicitly archived is confusing. Fix: add `!d.isArchived` to Dashboard debt filter. One-line fix.

2. **FINDING 1** (upcoming bills window) — Standardize on 7 days everywhere. Change Dashboard `stats.upcomingBills` from `addDays(today, 8)` to `addDays(today, 7)`.

3. **FINDING 5** (budget progress) — The Dashboard budget progress bar mixes weekly/monthly/yearly periods. Either remove it (BreathingRoom already replaced it) or compute period-normalized percentages. Since BreathingRoom is already the primary budget indicator, consider removing the legacy `budgetProgress` from `stats`.

4. **FINDING 4a** (transfer inflation) — Tag transfer transactions with a `isTransfer: true` flag and exclude them from income/expense totals. Or use a distinct category like `_transfer` that's excluded from aggregations.

5. **FINDING 9** (rounding) — Standardize: hero numbers use `.toFixed(0)`, detail/edit views use `.toFixed(2)`. Document this as a design decision.
