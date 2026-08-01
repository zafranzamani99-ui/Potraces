# Potraces — Personal-Mode Fix Order
**Date:** 2026-05-02
**Mode:** Planning (read-only). Generated from audit/BACKLOG.md and the rung ladder defined in .claude/skills/potraces-flow-logic/.

## Preamble
Rungs are taken verbatim from `.claude/skills/potraces-flow-logic/SKILL.md` lines 38-48 and elaborated in `references/ladder.md` lines 1-145 (rung 0 onboarding → rung 8 reports). Personal-mode screens were mapped to rungs by reading each screen's role in `references/ladder.md`; screens not explicitly listed (e.g. `ImportFromCsv.tsx`, `ImportFromStatement.tsx`, `SubscriptionList.tsx`) were placed by role and marked "(inferred)". Per pilot directive, **Reports.tsx, FinancialPulse.tsx, AccountOverview.tsx are forced to the final 3 sequence indices** regardless of nominal rung — they are pure read-only projections of upstream data (ladder.md lines 109-122).

Cross-screen findings (e.g. `UX-C1` on the 5 entry surfaces, `DESIGN-C3` on WalletPicker reuse, `DESIGN-H1` on hardcoded hex) are listed under every screen they touch and should be solved once at the **earliest rung** they appear; later rows pick up the fix automatically. The `Blocked by` column flags those upstream-first dependencies.

## Fix order table

| Rung | Screen | Open findings (Critical / High BACKLOG IDs) | Blocked by | Effort | Sequence index |
|---|---|---|---|---|---|
| 0 | Onboarding.tsx (shared) | FIRSTRUN-C2, FIRSTRUN-C4, FIRSTRUN-H5, FIRSTRUN-H6 | — | M | 1 |
| 0 | GettingStarted.tsx (component) | FIRSTRUN-H2 | FIRSTRUN-C2 | XS | 2 |
| 0 | ScreenGuide.tsx (component) | FIRSTRUN-H1 | — | XS | 3 |
| 1 | WalletManagement.tsx | DESIGN-C3 | — | S | 4 |
| 2 | Dashboard.tsx | FIRSTRUN-C3, NAV-C1, NAV-C2, FIRSTRUN-H3, NAV-H6, SCALE-H2, UX-H3, UX-H5, DESIGN-H1 | FIRSTRUN-C2, DESIGN-C3 | M | 5 |
| 2 | QuickAddExpense.tsx (component, rung-2 entry surface) | UX-C1, FIRSTRUN-H7, WCAG-tapTargets | DESIGN-C3 | M | 6 |
| 2 | TransactionsList.tsx | UX-C1, NAV-H7 | UX-C1 (resolve at QuickAdd first) | S | 7 |
| 2 | ReceiptScanner.tsx (shared, rung-2 entry surface) (inferred) | UX-C1, SCALE-H8 | UX-C1 | S | 8 |
| 2 | ImportFromCsv.tsx (inferred — bulk transaction entry) | DESIGN-C3 | DESIGN-C3 (consolidate at WalletManagement) | XS | 9 |
| 2 | ImportFromStatement.tsx (inferred — bulk transaction entry) | DESIGN-C3 | DESIGN-C3 | XS | 10 |
| 2 | SubscriptionList.tsx (inferred — recurring rung-2 cadence) | DESIGN-H2 | — | S | 11 |
| 3 | NoteEditor.tsx (notes/, rung-3 entry surface) | UX-C1 | UX-C1 | S | 12 |
| 3 | MoneyChat.tsx | UX-C1, DESIGN-H4 | UX-C1 | M | 13 |
| 4 | BudgetPlanning.tsx | UX-H5, DESIGN-H1 | DESIGN-H1 (resolve at Dashboard) | S | 14 |
| 5 | Goals.tsx | WCAG-tapTargets | WCAG-tapTargets (resolve at QuickAdd) | XS | 15 |
| 6 | SavingsTracker.tsx | (no open findings — visit during polish pass) | — | — | 16 |
| 7 | DebtTracking.tsx (shared, personal-only) | DESIGN-H1, DESIGN-H3, DESIGN-H4 | DESIGN-H1, DESIGN-H4 | M | 17 |
| 8 | Reports.tsx | (no open findings — pilot file, visit during polish pass) | every rung-1→7 fix above | — | 18 |
| 8 | FinancialPulse.tsx | UX-H5 | UX-H5 (resolve at BudgetPlanning), every rung-1→7 fix | S | 19 |
| 8 | AccountOverview.tsx | DESIGN-C3 | DESIGN-C3 (resolve at WalletManagement), every rung-1→7 fix | XS | 20 |

(Total rows: 20. Sequence index 1 → 20 contiguous. Reports / FinancialPulse / AccountOverview occupy the final three indices per pilot directive.)

## Excluded — out of personal scope

These BACKLOG Critical/High findings touch files that are NOT personal-mode screens. Tracked here so the parent fix-order roadmap can pick them up under business / infra sprints.

- **DESIGN-C1** — 7 dashboards (Freelancer/Mixed/OnTheRoad/PartTime/Seller/Stall/Personal). Personal Dashboard partially in scope, but the consolidation work is cross-mode → handle in Sprint 3 hero-number consolidation.
- **DESIGN-C2** — `seller/Dashboard.tsx`, `seller/SeasonSummary.tsx`, `stall/*` (banned vocabulary).
- **DESIGN-C4** — 7 native + 7 custom date pickers across `Add*` screens (mostly business/seller).
- **DESIGN-C5** — 5 of 7 dashboards diverge on header/FAB/pull-to-refresh (cross-mode).
- **DESIGN-H5** — `StoryCard.tsx`, 6 business sub-mode dashboards.
- **FIRSTRUN-C1** — `OtpVerificationScreen.tsx` (auth, business mode entry).
- **FIRSTRUN-H4** — `i18n/ms.ts` `kau` rename (global, not screen-bound).
- **LOGIC-C1..C5, LOGIC-H1..H7** — all marked FIXED in BACKLOG; no action.
- **NAV-C1, NAV-C2** — listed against `PersonalNavigator.tsx` / `CustomTabBar.tsx` in BACKLOG file:lines but the **fix surface is Dashboard.tsx** so attached at row 5; the navigator-side edits are paired follow-on.
- **NAV-C3** — `src/screens/personal/ExpenseEntry.tsx` (file already deleted on disk; commit-only cleanup).
- **NAV-C4** — `RootNavigator.tsx` (`SellerCustomersStack` dead route).
- **NAV-H1, NAV-H2, NAV-H3, NAV-H4, NAV-H5** — `RootNavigator.tsx`, `App.tsx`, `Settings.tsx`, `BusinessNavigator.tsx` (infra/auth).
- **SCALE-C1..C5, SCALE-H1..H8** — stores, sync, migrations, Supabase (infra, not personal screens).
- **SEC-C1..C3, SEC-H1..H5** — Supabase migrations, edge functions, premium store (backend/auth).
- **UX-C2** — `RootNavigator.tsx`.
- **UX-C3** — app-wide launch blockers (CSV export, biometric, sync) — features, not screen edits.
- **UX-H1, UX-H2, UX-H4** — folder structure, components/common dumping, i18n coverage (cross-cutting refactors).
- **WCAG-textMuted, WCAG-borders, WCAG-darkAccent, WCAG-bizProfit, WCAG-debtColors, WCAG-a11yLabels** — `src/constants/index.ts` and app-wide token edits; resolve at the source. Once tokens flip, every rung's screens inherit AA contrast — schedule before rung-1 work for maximum cascade.

## Notes
- **WCAG token fixes (textMuted / borders / darkAccent)** are listed under "Excluded" because they live in `constants/index.ts`, not on a personal screen — but they are upstream of every row in the table. Treat them as **rung-(-1) prerequisite**: do them once at the start of Sprint 2 and every personal row inherits the contrast pass.
- **UX-C1** (5-entry-surface divergence) appears on 5 different rows (rows 6, 7, 8, 12, 13). The first occurrence (QuickAddExpense, row 6) is where the canonical save logic should land; downstream rows then route through it. Doing it later means doing it twice.
- **DESIGN-C3** (WalletPicker reimplemented) appears on 5 rows (4, 9, 10, and downstream at row 20 AccountOverview). Consolidate at row 4 (WalletManagement), then rows 9, 10, 20 are pure swap-in.
- **DESIGN-H1** (hardcoded hex) appears on 3 rows (5, 14, 17). Highest density on Dashboard (row 5) and DebtTracking (row 17); BudgetPlanning (row 14) inherits half the fix once Dashboard's StoryCard/insight strip use tokens.
- **SavingsTracker.tsx** has no open Critical/High findings — listed for completeness; visit during polish pass.
- **Reports.tsx** has no open Critical/High findings — it was the pilot file, already passed. Listed at row 18 to enforce its rung-8 position; visit during polish only.
- All listed rungs are populated; no rung is empty.

## Open dependency questions
- **NoteEditor.tsx** lives in `src/screens/notes/` — confirmed by glob, but I haven't verified whether it's reachable from personal-mode-only navigation or also from business mode. Mapped to rung 3 per ladder.md line 48; if it's also a business-mode entry, the UX-C1 fix needs to be mode-isolated. Marked `?` in spirit — verify before editing.
- **ReceiptScanner.tsx** lives in `src/screens/shared/`; treated as rung-2 personal entry surface per ladder.md line 35. If business mode also uses it for receipt-based business expenses, scope the UX-C1 unification accordingly.
- **DebtTracking.tsx** lives in `src/screens/shared/` but per `ladder.md` line 98 is "personal-mode-only" — kept in this plan. Re-confirm before starting row 17 work.
- **SubscriptionList.tsx** rung placement is "(inferred)": ladder.md line 132 says subscriptions are "rung 2 with a different cadence" but only become their own rung when bill notifications ship (PLAN.md 3.3). Treated as rung 2 here; revisit if 3.3 lands first.
- **ImportFromCsv.tsx / ImportFromStatement.tsx** are not mentioned in the ladder at all — placed at rung 2 (bulk transaction entry) by inference. Verify they don't deserve their own rung if statement-import becomes the primary onboarding path for power users.
