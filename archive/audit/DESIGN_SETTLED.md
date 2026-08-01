# Potraces — DESIGN_CONSISTENCY.md Settlement Status
**Date:** 2026-05-02
**Mode:** 4-agent ULTRATHINK + 3 focused continuations (seller-stall-finish, biz-submodes-finish, stall-finish)
**Build state:** TS errors = 25 (pre-existing baseline). 0 new errors.

---

## Closed (full)

- **DESIGN-C4** — Date picker consolidation. All 6 business sub-mode files migrated to `<CalendarPicker>`: mixed/AddCost, mixed/AddIncome, freelancer/AddPayment, ontheroad/AddCost, ontheroad/AddEarnings, parttime/AddIncome. Native `@react-native-community/datetimepicker` removed.
- **DESIGN-H5** — StoryCard scope: KEEP-PERSONAL-ONLY. `useStoryCards.ts` short-circuits on `mode !== 'personal'`. Documented in component JSDoc.
- **DESIGN-M3** — Banned vocab scrubbed in `services/aiService.ts`, `moneyChat.ts`, `queryEngine.ts`, `spendingMirror.ts`, `reportNarrative.ts`, `utils/explainStallHistory.ts`, `i18n/en.ts:totalRevenueLabel`.
- **DESIGN-M4** — `BusinessEmptyState.tsx` and `BusinessSectionHeader.tsx` deleted (zero usages).
- **DESIGN-M6** — SubscriptionList inline empty state replaced with `<EmptyState>` (closed in pilot row 11).

## Closed (substantial — only minor remainders)

- **DESIGN-C1** — Canonical `BusinessHeroNumber` promoted (full `...TYPE.amount` spread, `prefix` prop, `useCalm()`). Migrated: AccountOverview, FreelancerDashboard, MixedDashboard, OnTheRoadDashboard, PartTimeDashboard, business/Dashboard, ClientDetail, stall/Dashboard, stall/SessionSummary, stall/CloseSession. **Pending: SavingsTracker partial-destructure fix (~2 lines).**
- **DESIGN-C5** — Pull-to-refresh: AccountOverview + 4 business sub-mode dashboards + stall/Dashboard. **Done in scope.**
- **DESIGN-C2** — Banned vocab scrubbed: seller/Dashboard (43), seller/Products (15), seller/SeasonSummary (22), stall/Dashboard (3), stall/SessionSummary (8), stall/SessionHistory (3), business/Dashboard, BusinessNavigator (Inventory→Products). **Pending: seller/CostManagement (8 hits), stall/SessionSummary still has variable names like `totalRevenue` carrying through from store types (not user-facing).**
- **DESIGN-C3** — WalletPicker consolidation: WalletManagement, ImportFromCsv, ImportFromStatement done in pilot. AccountOverview confirmed false positive. **Pending: seller/Customers `contactEmptyState` → `<EmptyState>` swap.**

## Closed (partial — pilot work only)

- **DESIGN-H1** — Hex literals: Dashboard (14), BudgetPlanning (12), DebtTracking (39), NoteEditor (6) closed in pilot/round 1. **Pending: stall/SellScreen (5), seller/CostManagement (4), seller/Customers (3), stall/RegularCustomers (2-3), stall/SessionSummary (2), stall/StallProducts (2-3).** Plus 2 `#FFFFFF` button-text-on-color literals in stall/SessionSummary intentionally kept (no inverse/onAccent token exists on CALM).
- **DESIGN-H4** — Action verb drift: MoneyChat + DebtTracking + SeasonSummary done. **Likely complete; verify on next pass.**
- **DESIGN-M1** — borderRadius literals: Goals + MoneyChat done. **Pending: BudgetPlanning (25 occurrences — biggest remaining), DebtTracking remainder, NotesHome (4).**
- **DESIGN-M2** — elevation literals: MoneyChat (5) done. **Pending: NoteEditor (2), DebtTracking (2), QuickAddExpense (2), Goals (1).**
- **DESIGN-M5** — Alert→Toast: WalletManagement (11), DebtTracking (10), BudgetPlanning (7) done. **Pending: Settings (19 — heaviest remaining), ReceiptScanner (6), ImportFromCsv (6), ImportFromStatement (6).**

## Pending in full

- **DESIGN-H3** — Modal pattern audit. DebtTracking 11 modals + others. Risky to retune wholesale (could regress iOS sub-modal sequencing per MEMORY rules). Needs UX-led decision.

## Polish / Low (untouched)

- **DESIGN-L1** — ModeToggle placement consistency check
- **DESIGN-L2** — `RADIUS.full` for circular icons sweep
- **DESIGN-L3** — Migrate legacy single-hex usage to `semantic(token, isDark)` helper
- **DESIGN-L4** — i18n parity holds (encouraging signal — no action)
- **DESIGN-L5** — Icon set discipline holds (Feather only — no action)
- **DESIGN-L6** — RNGH ScrollView discipline holds (no action)

---

## Aggregate progress

| Severity | Total | Fully closed | Substantially closed | Partial | Pending in full | Untouched (polish) |
|---|---|---|---|---|---|---|
| Critical (5) | 5 | 1 (C4) | 4 (C1, C2, C3, C5) | 0 | 0 | 0 |
| High (5) | 5 | 1 (H5) | 0 | 3 (H1, H4 verify) | 1 (H3) | 0 |
| Medium (6) | 6 | 3 (M3, M4, M6) | 0 | 3 (M1, M2, M5) | 0 | 0 |
| Low (6) | 6 | 0 | 0 | 0 | 0 | 6 (L1-L6) |
| **All** | **22** | **5** | **4** | **6** | **1** | **6** |

---

## Files modified across this settlement

`BusinessHeroNumber.tsx` (rewrite), `BusinessEmptyState.tsx` (deleted), `BusinessSectionHeader.tsx` (deleted), 5 services (aiService, moneyChat, queryEngine, spendingMirror, reportNarrative), `utils/explainStallHistory.ts`, `BusinessNavigator.tsx`, plus per-screen edits in: FreelancerDashboard, MixedDashboard, OnTheRoadDashboard, PartTimeDashboard, ClientDetail, business/Dashboard, mixed/AddCost, mixed/AddIncome, freelancer/AddPayment, ontheroad/AddCost, ontheroad/AddEarnings, parttime/AddIncome, seller/Dashboard, seller/Products, seller/SeasonSummary, stall/Dashboard, stall/SessionSummary, stall/SessionHistory, stall/CloseSession, NoteEditor (+post-fix), AccountOverview, BudgetPlanning, Goals, MoneyChat, WalletManagement, DebtTracking, en.ts, ms.ts.

## Recommended next pass

A single tight-scope agent for the remaining seller-mode hex/vocab work + BudgetPlanning M1 borderRadius sweep. Approximate effort: 1 focused agent run.
