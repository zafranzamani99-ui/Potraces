# Potraces — Unified Audit Backlog
**Date:** 2026-05-01

## All Critical findings (sorted by domain)

| ID | Domain | File:lines | Finding | Effort |
|---|---|---|---|---|
| DESIGN-C1 | Design | 7 dashboards (Freelancer/Mixed/OnTheRoad/PartTime/Seller/Stall/Personal) | Hero number style diverges across 7 dashboards (3 different APIs) | S |
| DESIGN-C2 | Design | seller/Dashboard.tsx, seller/SeasonSummary.tsx, stall/* | Banned vocabulary (profit/revenue/inventory/ROI) used 207 times across 30 files | M |
| DESIGN-C3 | Design | ImportFromCsv.tsx:73, ImportFromStatement.tsx, WalletManagement.tsx, AccountOverview.tsx | WalletPicker reimplemented inline in 4+ screens instead of reused | S |
| DESIGN-C4 | Design | 7 native + 7 custom date pickers across Add* screens | Date picker split 2-ways for the same conceptual action | M |
| DESIGN-C5 | Design | 5 of 7 dashboards | Dashboards diverge on header / FAB / pull-to-refresh; only 2/7 have RefreshControl | S |
| FIRSTRUN-C1 | First-Run | OtpVerificationScreen.tsx:121-126, 191-208 | Telegram-only OTP gate kills non-Telegram users (~65% of MY market) | M |
| FIRSTRUN-C2 | First-Run | Onboarding.tsx:205-210, RootNavigator.tsx:243-265 | Mode-selection happens AFTER 6 onboarding slides and defaults to personal | S |
| FIRSTRUN-C3 | First-Run | personal/Dashboard.tsx:600-700 | Personal Dashboard shows 5+ competing first-run surfaces with no priority | S |
| FIRSTRUN-C4 | First-Run | Onboarding.tsx:34-40, 187-193 | 6 slides (1 over README); skip button inconsistent on first/last slide | XS |
| LOGIC-C1 | Logic | personalStore.ts:60-63 | deleteTransaction does NOT roll back wallet balance (FIXED) | S |
| LOGIC-C2 | Logic | personalStore.ts:31-56 | updateTransaction allows amount/wallet edit without wallet reconciliation (FIXED) | S |
| LOGIC-C3 | Logic | QuickAddExpense.tsx:280-374 | Stale closures in category/wallet callbacks; missing useCallback deps (FIXED) | XS |
| LOGIC-C4 | Logic | sellerSync.ts:591-916 | Sync tombstone can nuke remote data on transient failure or race (FIXED) | M |
| LOGIC-C5 | Logic | debtStore.ts:32-161 | debtStore payment validation inconsistent; no overpayment cap (FIXED) | S |
| NAV-C1 | Navigation | PersonalNavigator.tsx:78-82, CustomTabBar.tsx:161-189 | Center FAB opens Notes, not "+ expense" — primary action unreachable globally | S |
| NAV-C2 | Navigation | Dashboard.tsx:51, 1082; QuickAddExpense.tsx:135-159 | QuickAddExpense mounted ONLY on Personal Dashboard — no FAB on other tabs | S |
| NAV-C3 | Navigation | src/screens/personal/ExpenseEntry.tsx | ExpenseEntry deleted from disk but still in git index (close pending commit) | XS |
| NAV-C4 | Navigation | RootNavigator.tsx:422-426 | SellerCustomersStack registered in root, never navigated to (dead route) | XS |
| SCALE-C1 | Scalability | App.tsx:54-55; 22 stores in src/store/*.ts | AsyncStorage cold-start parse blocks JS thread for 22 stores; 3MB+ at scale | L |
| SCALE-C2 | Scalability | sellerSync.ts:258-565 | sellerSync.pullAll() unbounded select('*') on every cold start; tombstone risk | M |
| SCALE-C3 | Scalability | moneyChat.ts:397-820 | moneyChat rebuilds entire financial context per chat send (no aggregates) | M |
| SCALE-C4 | Scalability | supabase/migrations/20260307172000_enable_realtime.sql | Realtime subscription scope per seller is full-table on seller_orders | S |
| SCALE-C5 | Scalability | RootNavigator.tsx:1-567 | All per-income-type screens registered at root regardless of mode | S |
| SEC-C1 | Security | supabase/migrations/20260309130000_claim_profile.sql:6-53 | claim_seller_profile RPC = trivial hostile shop takeover (FIXED) | S |
| SEC-C2 | Security | supabase/functions/request-otp/index.ts:112 | OTP code returned in HTTP response body — Telegram channel is theater (DEFERRED) | M |
| SEC-C3 | Security | supabase/functions/telegram-webhook/index.ts:58-64 | OTP online-brute-forceable; no attempts counter, no rate limit (FIXED) | S |
| UX-C1 | UX | QuickAddExpense.tsx, MoneyChat.tsx, ReceiptScanner.tsx, NoteEditor.tsx | 5 different expense entry surfaces with diverging save logic | M |
| UX-C2 | UX | RootNavigator.tsx | RootNavigator was 1,744-line junk drawer (now 567 — partial fix) | M |
| UX-C3 | UX | app-wide | Launch blockers: no CSV export, no biometric lock, no personal-mode sync | L |
| WCAG-textMuted | WCAG | constants/index.ts | textMuted #A0A0A0 fails AA on light surfaces (2.6:1) — used for hints app-wide | XS |
| WCAG-borders | WCAG | constants/index.ts | All borders fail 3:1 UI-component minimum (1.13–1.36:1) in both modes | XS |
| WCAG-darkAccent | WCAG | constants/index.ts (CALM_DARK.accent) | Dark-mode accent #7A7D2E only passes AA-large (3.8–4.3:1); fails body text | XS |
| WCAG-bizProfit | WCAG | constants/index.ts (BIZ.profit) | BIZ.profit #332D03 fails hard on dark surface (1.2:1); invisible | XS |
| WCAG-debtColors | WCAG | constants/index.ts (DEBT_TYPES) | Every DEBT color fails AA in either light or dark mode; color-only differentiation | S |
| WCAG-a11yLabels | WCAG | 2,367 Touchables app-wide | Only 13% of interactive elements have accessibilityLabel | L |
| WCAG-tapTargets | WCAG | QuickAddExpense:798, PlaybookNotebook, Goals:1898, Onboarding:46/111 | Many tap targets below 44×44 / 48×48 minimums | S |

## All High findings

| ID | Domain | File:lines | Finding | Effort |
|---|---|---|---|---|
| DESIGN-H1 | Design | shared/DebtTracking.tsx (39), personal/Dashboard.tsx (14), BudgetPlanning.tsx (12) | 94 hardcoded hex literals across 15 screens bypass CALM/CALM_DARK | M |
| DESIGN-H2 | Design | seller/Customers.tsx:1496, SubscriptionList.tsx:1866 | Empty state divergence — three patterns; BusinessEmptyState dead code | S |
| DESIGN-H3 | Design | 48 Modal usages across 20 files; DebtTracking 11 | Modal pattern inconsistency — fade vs slide vs sheet rules violated | M |
| DESIGN-H4 | Design | MoneyChat.tsx, SeasonSummary.tsx, DebtTracking.tsx | Action verbs (Save/Done/Confirm) bypass i18n in 5 plain-string places | XS |
| DESIGN-H5 | Design | StoryCard.tsx, 6 business sub-mode dashboards | Outcome-driven StoryCard is personal-Dashboard-only; sub-modes never adopted | M |
| FIRSTRUN-H1 | First-Run | ScreenGuide.tsx:58-64 | ScreenGuide overlays steal screen space and block primary CTAs | XS |
| FIRSTRUN-H2 | First-Run | GettingStarted.tsx:30-55 | First chip "add your first expense" wrong for income-earners (rider/seller) | XS |
| FIRSTRUN-H3 | First-Run | i18n/en.ts:1880-1888, Dashboard.tsx:659/678, FreshStart.tsx:118 | 7+ novel AI vocab terms (Echo/Pulse/Mirror/Playbook) in first session | S |
| FIRSTRUN-H4 | First-Run | i18n/ms.ts:330, 461, 1655 | BM register "kau" too informal for older audience (Salmah persona) | XS |
| FIRSTRUN-H5 | First-Run | App.tsx:144-153 | iOS ATT prompt fires with no pre-permission rationale screen | XS |
| FIRSTRUN-H6 | First-Run | Onboarding.tsx:212-219 | Onboarding name only persists when handleNext fires, not on swipe | XS |
| FIRSTRUN-H7 | First-Run | QuickAddExpense.tsx step flow | WalletPicker forces wallet on first tap — no "skip / decide later" | S |
| LOGIC-H1 | Logic | shared/ReceiptScanner.tsx:233-259 | Receipt scan counter decremented on failure (FIXED) | XS |
| LOGIC-H2 | Logic | shared/ReceiptScanner.tsx:308-411 | Receipt save has no double-submit guard; partial writes on throw (FIXED) | XS |
| LOGIC-H3 | Logic | shared/ReceiptScanner.tsx:320-334 | Cancel mid-upload orphans the image file (FIXED) | XS |
| LOGIC-H4 | Logic | RootNavigator.tsx:65 vs Dashboard L504/736 | SellerOrders/SellerOrderList duplication (verified not crash; cleanup) | XS |
| LOGIC-H5 | Logic | RootNavigator.tsx:91-122 | Auth effect wrong deps + OTP can be re-spammed on back-nav (FIXED) | XS |
| LOGIC-H6 | Logic | personalStore.ts, debtStore.ts, ReceiptScanner.tsx | Every new Date() is device-local; MYT bucket drift (PARTIAL) | M |
| LOGIC-H7 | Logic | QuickAddExpense.tsx:42-45, 190 | _quickAddOpenRef assigned in render body; StrictMode orphan risk (FIXED) | XS |
| NAV-H1 | Navigation | RootNavigator.tsx:55-78, 467-556 | 57 of 75 screens mounted regardless of mode; eager imports of dead routes | M |
| NAV-H2 | Navigation | App.tsx:297-312 | Push notification deep link uses 300ms setTimeout shotgun (race-prone) | S |
| NAV-H3 | Navigation | Settings.tsx:1367, 942 | Mode toggle buried in 1,998-line Settings; 4-tap detour | S |
| NAV-H4 | Navigation | RootNavigator.tsx:140-162 | AuthGatedBusiness re-runs OTP request on every back-from-Otp-screen | S |
| NAV-H5 | Navigation | PersonalNavigator.tsx:30, BusinessNavigator.tsx:181 | Tab nav lazy:false everywhere — entire tab tree mounted on first focus | XS |
| NAV-H6 | Navigation | RootNavigator.tsx:259 | Hardware back on Personal Dashboard exits app without confirmation | XS |
| NAV-H7 | Navigation | personal/TransactionsList.tsx:657, 859 | No transaction search input on TransactionsList | S |
| SCALE-H1 | Scalability | 25/26 long-list screens | No FlatList performance props (getItemLayout) on 25 of 26 long lists | M |
| SCALE-H2 | Scalability | personal/Dashboard.tsx (1,532 lines), useFinancialInsights.ts:221 | Dashboard uses .map() over arrays for week-bar/quick-actions/story-cards | M |
| SCALE-H3 | Scalability | All 22 stores in src/store/*.ts | No partialize on stores — entire state including ephemeral flags persists | S |
| SCALE-H4 | Scalability | supabase/migrations/20260307180000_push_notifications.sql | Push trigger pg_net.http_post on seller_orders insert blocks under load | S |
| SCALE-H5 | Scalability | supabase/migrations/20260417100000_personal_sync_schema.sql:312-322 | auth.uid() called per-row in 11 RLS policies; not subqueried | XS |
| SCALE-H6 | Scalability | geminiClient.ts:13; 7 callers | AI cost ceiling: receipt+statement+chat+intent+mirror uncapped per-user | M |
| SCALE-H7 | Scalability | sellerSync.ts:251-253, 315-317 | Sync conflict resolution is last-write-wins; silent multi-device data loss | L |
| SCALE-H8 | Scalability | shared/ReceiptScanner.tsx | documentDirectory/receipts/ storage growth never evicted (~156MB/year) | S |
| SEC-H1 | Security | seller_orders_customer_insert policy + docs/index.html:459 | Unauthenticated order insert = push-spam amplifier; phishing via customer_name | M |
| SEC-H2 | Security | supabase/migrations/20260307062816_seller_schema.sql:136-137 | seller_profiles_public_read leaks phone + push_token (FIXED partial) | S |
| SEC-H3 | Security | supabase/migrations/20260307180000_push_notifications.sql:12-60 | Push trigger spammable; phishing via customer_name in title/body | S |
| SEC-H4 | Security | shop_logo.sql:19-23, product_images.sql:19-23 | Storage buckets accept any MIME, any size (HTML/100MB upload) (FIXED) | XS |
| SEC-H5 | Security | src/store/premiumStore.ts:21, 73-123 | Premium gates pure client-side; flippable on rooted device (DEFERRED) | L |
| UX-H1 | UX | screens/seller/, screens/stall/ vs screens/business/ | Folder structure is lying; sub-modes inconsistent peers | S |
| UX-H2 | UX | components/common/ (33 files) | components/common/ is a dumping ground; QuickAddExpense (883 lines) here | M |
| UX-H3 | UX | personal/Dashboard.tsx | Three competing onboarding surfaces on Dashboard (overlaps FIRSTRUN-C3) | S |
| UX-H4 | UX | 18 of 75 screens call useT() | i18n coverage is ~24%; ms.ts gap of 25 lines vs en.ts | L |
| UX-H5 | UX | BudgetPlanning, Dashboard, OrderList, SessionHistory, CRM, IncomeStreams | Dark mode broken on 6 screens — direct CALM. references | M |

## Top 10 quick wins (under 4 hours each)

1. **WCAG-textMuted + WCAG-borders + WCAG-darkAccent** — One 5-line edit in `src/constants/index.ts` flips ~30 contrast pairs from FAIL to AA. Highest accessibility gain per minute in the codebase. (XS, ~30 min)
2. **NAV-C1** — Reorder personal tabs so center index is `QuickAdd` synthetic tab; biggest UX win in the audit. (S, ~1 hr)
3. **NAV-C2** — Hoist `<QuickAddExpense />` to App.tsx so the FAB exists on every tab. (S, ~1 hr)
4. **SCALE-H5** — Replace `auth.uid() = user_id` with `(select auth.uid()) = user_id` in 11 RLS policies; one-line migration, 10× bulk-insert perf. (XS, ~30 min)
5. **NAV-C4 + NAV-C3** — Delete `SellerCustomersStack` registration; commit ExpenseEntry deletion. Cleans dead routes. (XS, ~15 min)
6. **FIRSTRUN-H4** — Global `kau` → `anda` rename in `ms.ts`; trust signal for older BM users. (XS, ~30 min)
7. **FIRSTRUN-H2** — Replace "add your first expense" chip with "log money in or out" — fixes income-earner framing. (XS, ~20 min)
8. **NAV-H6** — Add `useBackHandler` confirm-to-exit on root Dashboards. Prevents accidental cold-restart pain. (XS, ~30 min)
9. **DESIGN-H4** — Route 5 plain-string action verbs through `useT()`; closes i18n leak. (XS, ~30 min)
10. **SCALE-C2 partial** — Add `.range(0, 999)` + `count: 'exact'` overflow guard to all 7 pulls in sellerSync; mitigates tombstone-mass-deletion. (S, ~2 hrs)

## Domain tallies

| Domain | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Scalability | 5 | 8 | 7 | 7 | 27 |
| Navigation | 4 | 7 | 9 | 6 | 26 |
| Design | 5 | 5 | 6 | 6 | 22 |
| First-Run | 4 | 7 | 10 | 8 | 29 |
| Security | 3 | 5 | 6 | 6 | 20 |
| Logic | 5 | 7 | 7 | 6 | 25 |
| UX | 3 | 5 | 7 | 0 | 15 |
| WCAG | 7 | 0 | 0 | 0 | 7 |
| **TOTAL** | **36** | **44** | **52** | **39** | **171** |

## Recommended sprint plan

### Sprint 1 — Data integrity, security & production-blockers (1.5–2 weeks)
- **SEC-C2** — Stop returning OTP code to client; bind redemption to chat_id
- **SEC-H1** — Captcha/HMAC token + DB CHECK constraints on order_link inserts
- **SEC-H5** — Move premium tier server-side; IAP receipt verification
- **LOGIC-H6** — Finish MYT timezone normalization rollout across stores
- **SCALE-C2** — Pagination + delta-sync cursor for sellerSync.pullAll()
- **SCALE-H7** — Add `version` column for sync conflict resolution
- **SCALE-H5** — Wrap auth.uid() as (select auth.uid()) in 11 RLS policies (quick win)
- **NAV-C3** — Commit ExpenseEntry deletion
**Theme:** Stop the bleeding — close every path that can lose money, leak data, or wipe a shop. Most items are documented multi-device or financial bugs that compound at launch scale; clearing them unlocks confident GA.

### Sprint 2 — First-run, navigation & user-visible UX (1.5–2 weeks)
- **FIRSTRUN-C1** — SMS OTP fallback alongside Telegram
- **FIRSTRUN-C2** — Insert mode-pick screen at end of onboarding
- **FIRSTRUN-C3** — Progressive disclosure on Dashboard tied to transactions.length
- **FIRSTRUN-C4** — Cut onboarding 6→3 slides; consistent skip behavior
- **NAV-C1 + NAV-C2** — QuickAdd center tab + global FAB hoist
- **NAV-H3** — Surface mode toggle on Dashboard (not Settings)
- **NAV-H7** — Search input on TransactionsList
- **FIRSTRUN-H3** — Plain-language pass on Echo/Pulse/Mirror/Playbook/Kept/Pace
**Theme:** Make the first 5 minutes work — these are the journeys a new user actually takes. Together they stop the Salmah/Adi drop-off and finally make "+" mean "log a transaction" everywhere.

### Sprint 3 — Scalability foundation & design consolidation (2 weeks)
- **SCALE-C1** — Plan SQLite migration for heavy stores; ship `partialize` quick fix
- **SCALE-C5 + NAV-H1** — Lazy-mount per-income-type stacks under BusinessNavigator
- **SCALE-C3** — Pre-compute monthly aggregates; cap chat context to 30 days
- **DESIGN-C1** — Standardize `<HeroNumber>` across all 7 dashboards
- **DESIGN-C2** — Banned-vocabulary sweep + ESLint guard
- **DESIGN-C3 + DESIGN-C4** — Consolidate WalletPicker + CalendarPicker
- **WCAG-a11yLabels** — Mass-add accessibilityLabel to top 50 icon-only Touchables
- **UX-H4 + UX-H5** — i18n + dark-mode parity pass on 6 broken screens
**Theme:** Build the scaffolding the next 18 months of features will sit on. Consolidating dashboards, pickers, and per-mode stack mounting collapses maintenance cost while raising accessibility floor.

## Source reports
- audit/SCALABILITY.md
- audit/NAVIGATION_SPEED.md
- audit/DESIGN_CONSISTENCY.md
- audit/FIRST_TIME_ENGAGEMENT.md
- AUDIT.md (Security, Logic, UX)
- WCAG_AUDIT.md
