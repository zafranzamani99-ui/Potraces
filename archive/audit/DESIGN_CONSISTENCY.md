# Potraces — Design Consistency Audit
**Date:** 2026-05-01
**Scope:** ~75 screens, ~34 common components, 7 dashboards, dual-mode (personal + 6 business sub-modes), light + dark themes.

## 60-second read

Token discipline is mostly good (Feather is the only icon set, RN Gesture Handler ScrollView is universal, no `react-native` ScrollView leaks). What hurts the user is **dashboard pattern divergence**: 7 dashboards use 3 different hero APIs (`TYPE.hero`, `TYPE.amount`, `TYPE.balance`) and at most 2 of 7 implement pull-to-refresh. **Sub-modes diverge silently**: stall, freelancer, mixed, part-time, on-the-road, seller, personal each invented their own header, FAB placement, and empty state. **Picker reuse is broken** — `WalletPicker`/`CategoryPicker` are reimplemented inline in 6+ screens (`ImportFromCsv`, `ImportFromStatement`, `ReceiptScanner` second instance, `WalletManagement`, `AccountOverview`, `SubscriptionList`). **Date pickers are split 2-ways** — 7 screens use `@react-native-community/datetimepicker` directly, 7 use the custom `CalendarPicker`, with screens like `seller/OrderList` and `seller/NewOrder` using the custom one while `freelancer/AddPayment` (same conceptual task) uses the native one. Hardcoded hex inside `src/screens/` totals **~94 occurrences across 15 files**, concentrated in `DebtTracking` (39), `personal/Dashboard` (14), `BudgetPlanning` (12). Banned vocabulary leaks (`profit`, `revenue`, `inventory`, `ROI`) appear **207 times across 30 files**, including `seller/Dashboard.tsx` (43 hits) and `seller/SeasonSummary.tsx` (22).

---

## Critical (breaks the user's mental model)

### DESIGN-C1. Hero number style diverges across 7 dashboards
- `src/screens/business/freelancer/FreelancerDashboard.tsx:252` — `...TYPE.hero`
- `src/screens/business/mixed/MixedDashboard.tsx:386` — `...TYPE.hero`
- `src/screens/business/ontheroad/OnTheRoadDashboard.tsx:358` — `...TYPE.hero`
- `src/screens/business/parttime/PartTimeDashboard.tsx:323` — `...TYPE.hero`
- `src/screens/seller/Dashboard.tsx:1771` — `...TYPE.amount` (different scale)
- `src/screens/business/Dashboard.tsx:366` — `...TYPE.amount`
- `src/screens/personal/AccountOverview.tsx:65-66` — destructures `TYPE.amount.fontSize/fontWeight` only (loses `tabular-nums` variant)
- `src/screens/personal/SavingsTracker.tsx:1393-1394` — same partial-destructure pattern
- `src/screens/stall/Dashboard.tsx:441`, `stall/CloseSession.tsx:275`, `stall/SessionSummary.tsx:411`, `business/freelancer/ClientDetail.tsx:292` — `...TYPE.balance`

User opens stall vs freelancer vs personal Dashboard and the headline number renders at three visually distinct sizes/weights. Fix: standardize on a single `<HeroNumber>` primitive (already exists as `BusinessHeroNumber`) and use it everywhere. Personal screens that destructure `fontSize+fontWeight` separately MUST spread the full `TYPE.amount` to preserve `fontVariant: tabular-nums`.

### DESIGN-C2. Banned vocabulary widespread in seller/stall mode
README rule (and `MEMORY.md` strict): "never use profit/loss/revenue/ROI/inventory."
- `src/screens/seller/Dashboard.tsx` — 43 occurrences
- `src/screens/seller/SeasonSummary.tsx` — 22 occurrences
- `src/screens/seller/Products.tsx` — 15
- `src/screens/seller/CostManagement.tsx` — 8
- `src/screens/stall/SessionSummary.tsx` — 23, `stall/SessionHistory.tsx` — 6, `stall/Dashboard.tsx` — 5
- `src/screens/business/Dashboard.tsx` (parent navigator), `BusinessNavigator.tsx:3` — 3 each
- Even `src/i18n/en.ts:2` and `src/i18n/ms.ts:2` contain banned terms — these are surfaced to UI

User is told "kept / went out / came in" everywhere except seller and stall mode, where the financial dashboards still say "profit", "revenue", "inventory". Fix: pass over each file, replace with the documented vocabulary; add an ESLint rule (`no-restricted-syntax` / banned strings) to prevent regression.

### DESIGN-C3. Picker reuse broken — inline reimplementations of WalletPicker
The component exists at `src/components/common/WalletPicker.tsx` and is used correctly by `notes/NoteEditor.tsx:735`, `shared/ReceiptScanner.tsx:847`, `personal/TransactionsList.tsx:1162`, `personal/SubscriptionList.tsx`. But these screens reinvent it inline:
- `src/screens/personal/ImportFromCsv.tsx:73,310,342-349` — local `walletPickerOpen` state, hand-rolled `Modal` + `Pressable` backdrop + `wallets.map` rows
- `src/screens/personal/ImportFromStatement.tsx` — same local state, same custom modal
- `src/screens/personal/WalletManagement.tsx` — inline wallet selection list
- `src/screens/personal/AccountOverview.tsx` — local wallet picker
- `src/screens/seller/Customers.tsx:1496,2381` — `contactEmptyState` is a hand-rolled empty-state instead of `<EmptyState>` (used everywhere else)

Visual inconsistencies: spacing, icon size, "Add new wallet" CTA presence, and dark-mode handling all differ between the canonical `WalletPicker` and these inlines. Fix: mandate `<WalletPicker>` for every wallet selection; mandate `<EmptyState>` for every list-empty state. AUDIT.md UX-M3 already flagged this — still unfixed.

### DESIGN-C4. Date picker split 2-ways for the same conceptual action
- Native `@react-native-community/datetimepicker` (7 files): `business/mixed/AddCost.tsx`, `mixed/AddIncome.tsx`, `freelancer/AddPayment.tsx`, `ontheroad/AddCost.tsx`, `ontheroad/AddEarnings.tsx`, `parttime/AddIncome.tsx`, `shared/DebtTracking.tsx`
- Custom `CalendarPicker` component (7 files): `personal/SubscriptionList.tsx`, `personal/Goals.tsx`, `seller/OrderList.tsx`, `seller/Transactions.tsx`, `seller/NewOrder.tsx`, `shared/ReceiptScanner.tsx`, `shared/DebtTracking.tsx` (uses BOTH)

User picks a date in `freelancer/AddPayment` (native iOS spinner) vs `seller/NewOrder` (custom calendar grid) for the same task — "set transaction date." Fix: pick one, port the rest. Recommendation: keep `CalendarPicker` (Malay locale support, theme parity). Migrate 7 native-picker files.

### DESIGN-C5. Dashboards diverge on header / FAB / pull-to-refresh
Only 2 of 7 dashboards have `RefreshControl`:
- HAS pull-to-refresh: `personal/Dashboard.tsx`, `seller/Dashboard.tsx`
- MISSING: `stall/Dashboard.tsx`, `business/Dashboard.tsx`, `business/freelancer/FreelancerDashboard.tsx`, `business/mixed/MixedDashboard.tsx`, `business/ontheroad/OnTheRoadDashboard.tsx`, `business/parttime/PartTimeDashboard.tsx`

Sync exists for seller; the other business sub-modes are local-only — fair. But personal Dashboard has it. The 5 sub-mode dashboards inconsistent with both their parents. Fix: every dashboard supports pull-to-refresh as a no-op revalidation gesture (refresh stores, recompute insights).

---

## High (visible drift across the app)

### DESIGN-H1. Hardcoded hex inside `src/screens/` (94 occurrences across 15 files)
- `src/screens/shared/DebtTracking.tsx` — 39 hex literals
- `src/screens/personal/Dashboard.tsx` — 14
- `src/screens/personal/BudgetPlanning.tsx` — 12
- `src/screens/notes/NoteEditor.tsx` — 6
- `src/screens/stall/SellScreen.tsx` — 5
- `src/screens/seller/CostManagement.tsx` — 4
- `src/screens/seller/Customers.tsx`, `stall/RegularCustomers.tsx`, `stall/SessionSummary.tsx`, `stall/StallProducts.tsx` — 2-3 each

These bypass `CALM`/`CALM_DARK` so dark mode shows the wrong color. Fix: replace `'#xxxxxx'` literals with `C.surface`, `C.textPrimary`, `C.accent`, etc. inside `makeStyles(C)`.

### DESIGN-H2. Empty state divergence — three patterns, no unified rule
- Canonical `<EmptyState>` used by: `business/Inventory.tsx:378`, `business/SupplierList.tsx:236`, `business/CRM.tsx:666`, `business/Reports.tsx:199`, `business/POS.tsx:256`, `personal/FinancialPulse.tsx:376`, `personal/Reports.tsx:192`, `personal/SavingsTracker.tsx:932`, `personal/Dashboard.tsx:883`, `personal/TransactionsList.tsx`, `shared/DebtTracking.tsx:2525,2531,2670,2676`
- `<FreshStart>` used only in `personal/Dashboard.tsx:616` (zero data onboarding)
- Hand-rolled empty states: `seller/Customers.tsx:1496` (`contactEmptyState`), `personal/SubscriptionList.tsx:1866-1954` (`renderEmptyState`)
- `<BusinessEmptyState>` exists at `src/components/business/BusinessEmptyState.tsx` but is **not used by any screen** (verify with Grep — zero hits in `src/screens/`)

Fix: delete `BusinessEmptyState` (dead code) OR adopt it across business screens. Replace hand-rolled empty states with `<EmptyState>`.

### DESIGN-H3. Modal pattern inconsistency
48 distinct `<Modal>` usages across 20 files. `DebtTracking.tsx` alone has 11. Many use `animationType="fade"` for forms (should be bottom-sheet `slide`), some use `slide` for choice overlays (should be `fade` per MEMORY rule "Selection/choice overlays = floating centered card. Bottom sheets = forms/detail views"):
- `shared/ReceiptScanner.tsx:910` — uses `animationType="fade"` for a category dropdown — correct
- `personal/ImportFromCsv.tsx:342` — uses `animationType="fade"` for a wallet dropdown — correct, but reimplemented (see C3)
- Multiple business modals use `slide` for centered choice cards (verify case-by-case in: `business/freelancer/AddPayment`, `business/mixed/AddIncome`)

Fix: extract a `<BottomSheet>` and `<CenteredModal>` primitive. Audit each `<Modal>` against MEMORY rule.

### DESIGN-H4. Action verb drift
Banned-vocabulary plain-text labels still in JSX:
- `'Save'`, `'Done'`, `'Confirm'`, `'OK'`, `'Apply'`, `'Submit'`, `'Continue'` — 5 plain-string occurrences in `personal/MoneyChat.tsx`, `seller/SeasonSummary.tsx` (2), `shared/DebtTracking.tsx` (2). These bypass i18n entirely.

Fix: route all primary actions through `useT()` so `en.ts`/`ms.ts` define a single canonical verb (e.g. `t.actions.save`).

### DESIGN-H5. Outcome-driven `StoryCard` is personal-Dashboard-only
`docs/OUTCOME_UI_ARCHITECTURE.md` describes a story-card-driven dashboard. `StoryCard` exists at `src/components/common/StoryCard.tsx`. It appears used only on `personal/Dashboard.tsx`. The 6 business sub-mode dashboards never adopted the architecture.

Fix: either (a) port StoryCard architecture into FreelancerDashboard, MixedDashboard, OnTheRoadDashboard, PartTimeDashboard, or (b) document that StoryCard is personal-mode-only.

---

## Medium (token / pattern violations)

### DESIGN-M1. `borderRadius:` literals in screens (51 occurrences)
- `personal/BudgetPlanning.tsx` — 25
- `shared/DebtTracking.tsx` — 11
- `notes/NotesHome.tsx` — 4
Should use `RADIUS.sm/md/lg/xl/2xl/full`.

### DESIGN-M2. `elevation:` literals (21 occurrences)
- `personal/MoneyChat.tsx` — 5
- `notes/NoteEditor.tsx` — 2, `shared/DebtTracking.tsx` — 2, `common/QuickAddExpense.tsx` — 2
- `personal/Goals.tsx`, `auth/AuthScreen.tsx` — 1 each
- Even `src/constants/index.ts:8` has them but those are correct (inside `SHADOWS`)

Fix: spread `...SHADOWS.sm`/`md`/`lg` instead of inline `elevation` + `shadowOpacity`.

### DESIGN-M3. Banned-vocabulary in services and i18n source files
- `src/services/aiService.ts:3`, `services/moneyChat.ts:6`, `services/queryEngine.ts:5`, `services/spendingMirror.ts:1`, `services/reportNarrative.ts:1` — banned words leak into AI prompts/output strings
- `src/i18n/en.ts:2`, `src/i18n/ms.ts:2` — translation source contains banned words
- `src/utils/explainStallSession.ts:10`, `utils/explainStallHistory.ts:14` — narrative generators

Fix: change AI prompts to enforce vocab, scrub i18n source.

### DESIGN-M4. `BusinessEmptyState`, `BusinessSectionHeader` unused
`src/components/business/` has 6 files. Of these, `BusinessHeroNumber` is used by 4 dashboards, `BusinessFAB` is used by some, but `BusinessEmptyState`, `BusinessSectionHeader`, `BusinessInsightLine`, `FilterTabRow` should be checked — initial scan suggests partial adoption.

Fix: either consolidate into `<EmptyState mode="business">` or delete unused.

### DESIGN-M5. `Alert.alert` usage despite Toast existing
96 `Alert.alert` calls across 25 files. Toast component exists (`src/components/common/Toast.tsx`). Heavy offenders:
- `shared/Settings.tsx` — 19
- `personal/WalletManagement.tsx` — 11
- `shared/DebtTracking.tsx` — 10
- `personal/BudgetPlanning.tsx` — 7
- `shared/ReceiptScanner.tsx`, `personal/ImportFromCsv.tsx`, `personal/ImportFromStatement.tsx` — 6 each

Fix: keep `Alert.alert` only for confirm-destructive flows. Replace success/info notices with `Toast`.

### DESIGN-M6. SubscriptionList renders inline empty state
`src/screens/personal/SubscriptionList.tsx:1866-1954` defines `renderEmptyState` locally instead of using `<EmptyState>`. Fix: replace with `<EmptyState>`.

---

## Low (polish)

### DESIGN-L1. Mode-toggle access not consistent across modes
ModeToggle is exported from `src/components/common/ModeToggle.tsx`. Verify it appears at the same place on every screen header (or only on dashboards). At least appears reachable from Settings; needs spot-check in stall/freelancer headers.

### DESIGN-L2. `RADIUS.full` (9999) not always used for circular icons
Several screens use `borderRadius: 24` or similar half-side values for what should be true circles. Use `RADIUS.full`.

### DESIGN-L3. Two parallel "safe" color systems
`DEBT_TYPES` + `DEBT_TYPES_SAFE`, `BIZ` + `BIZ_SAFE` exist (see `constants/index.ts:356-488`). Old screens still use legacy single-hex; new screens should use `semantic(token, isDark)`. Fix: write a one-time migration.

### DESIGN-L4. EN/MS i18n parity holds
`en.ts` and `ms.ts` both have 1783 key-like lines — encouraging signal. Spot-check: `MEMORY.md` says "Settings, Dashboard, tab labels fully translated. Other screens remain English." Confirmed: `seller/`, `business/freelancer/`, `business/mixed/`, `notes/` screens have hardcoded English copy. Migrate incrementally.

### DESIGN-L5. Icon set discipline holds
Grep for `MaterialIcons|Ionicons|MaterialCommunityIcons|FontAwesome` returned **0 hits** across `src/`. Only `Feather` is imported (25+ files confirmed). Keep enforcing.

### DESIGN-L6. RNGH ScrollView discipline holds
Grep for `import.*ScrollView.*from 'react-native'` returned 0 hits. All 30+ ScrollView importers use `react-native-gesture-handler`. Excellent.

---

## Dashboard consistency matrix

| Dashboard | Hero number style | Insight pattern | Quick actions | FAB | Pull-to-refresh | Empty state | Dark mode |
|---|---|---|---|---|---|---|---|
| personal/Dashboard | `TYPE.amount` (partial spread) | `<StoryCard>` | Yes (modal grid) | No | ✓ | `<FreshStart>` + `<EmptyState>` | `makeStyles(C)` ✓ |
| seller/Dashboard | `TYPE.amount` ✓ full spread | Custom inline cards | Yes | Yes | ✓ | Inline | ✓ |
| stall/Dashboard | `TYPE.balance` ✗ different | Inline | Partial | Inline | ✗ | Inline | ✓ |
| business/Dashboard (parent) | `TYPE.amount` | Inline | Mode-router only | n/a | ✗ | Mode-router | ✓ |
| freelancer/FreelancerDashboard | `TYPE.hero` ✗ | Inline | Inline | `<BusinessFAB>` | ✗ | Inline | ✓ |
| mixed/MixedDashboard | `TYPE.hero` ✗ | Inline | Inline | `<BusinessFAB>` | ✗ | Inline | ✓ |
| ontheroad/OnTheRoadDashboard | `TYPE.hero` ✗ | Inline | Inline | `<BusinessFAB>` | ✗ | Inline | ✓ |
| parttime/PartTimeDashboard | `TYPE.hero` ✗ | Inline | Inline | `<BusinessFAB>` | ✗ | Inline | ✓ |

**Worst divergence**: hero column. Three different APIs for one concept across 7 screens.

---

## Component reuse health

| Component | Intended use | Actual usages | Inline reimplementations | Recommendation |
|---|---|---|---|---|
| `WalletPicker` | wallet select dropdown | 4 screens (NoteEditor, ReceiptScanner, TransactionsList, SubscriptionList) | 4+ (ImportFromCsv, ImportFromStatement, WalletManagement, AccountOverview) | **Consolidate** — port inlines |
| `CategoryPicker` | category select | 5 screens | 1+ (ReceiptScanner has both inline and component, see :910 vs `setCategoryPickerVisible`) | Consolidate |
| `ContactPicker` | debt/split contact picker | shared/DebtTracking | None obvious | Keep |
| `EmptyState` | universal empty list | 12 screens | 2 (seller/Customers contactEmptyState, SubscriptionList renderEmptyState) | Consolidate |
| `FreshStart` | first-run onboarding | 1 screen (personal/Dashboard) | n/a | Keep — single-purpose |
| `BusinessEmptyState` | business list empty | **0 screen usages** | n/a | **Delete or adopt** |
| `BusinessHeroNumber` | dashboard hero | 4 (FreelancerDashboard, MixedDashboard, etc.) | 3 (personal, seller, stall use different APIs) | Promote to canonical `<HeroNumber>` |
| `BusinessFAB` | business mode FAB | 4+ business sub-modes | 1 (seller/Dashboard inline FAB) | Consolidate |
| `Card`, `HeroCard`, `StatCard`, `GlassCard`, `StoryCard` | layered cards | mixed; rules undocumented | many | **Document the variant matrix** |
| `Button` | primary/secondary CTA | wide use | many `<TouchableOpacity>` with custom styles for buttons | Audit, port to `<Button>` |
| `CalendarPicker` | date pick | 7 screens | 7 use native `DateTimePicker` instead | Pick one |
| `Toast` | non-blocking notice | sparse | 96 `Alert.alert` calls | Migrate non-destructive alerts |

---

## Quick wins (under 2 hours each)

- **Replace 7 native-picker files with `<CalendarPicker>`** — single component, no behavior change
- **Migrate `BusinessHeroNumber` to all 7 dashboards** — kills DESIGN-C1 in one PR
- **Add `<RefreshControl>` to 5 sub-mode dashboards** — closes DESIGN-C5
- **Delete or adopt `BusinessEmptyState`** — currently dead code
- **Run a vocab sweep on `seller/Dashboard.tsx` (43 hits) + `seller/SeasonSummary.tsx` (22)** — biggest banned-word offenders, ~30 min each
- **Replace `personal/SubscriptionList.tsx:1866` `renderEmptyState` with `<EmptyState>`** — direct swap
- **Replace inline wallet pickers in `ImportFromCsv` + `ImportFromStatement` with `<WalletPicker>`** — closes DESIGN-C3 partially
- **Add ESLint `no-restricted-syntax` rule for banned vocabulary** — prevents regression
- **Spread full `TYPE.amount` (not partial destructure) in `personal/AccountOverview.tsx:65-66` and `personal/SavingsTracker.tsx:1393-1394`** — restores `tabular-nums` font variant

---

Critical: 5 · High: 5 · Medium: 6 · Low: 6
