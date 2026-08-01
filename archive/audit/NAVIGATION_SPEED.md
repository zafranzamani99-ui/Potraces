# Potraces — Navigation & Perceived-Speed Audit
**Date:** 2026-05-01
**Scope:** Journey BETWEEN screens. Tap counts, perceived speed, dead ends, back-button traps, orphaned routes.
**Method:** Static read of all 5 navigation files + 5 high-traffic screens. Tap counts traced from source. Frequency-weighted severity per the agent spec.

> Note: AUDIT.md UX-C2 said `RootNavigator.tsx` was 1,744 lines. Current file is **567 lines** — the `makeBackHeader` extraction shipped (`RootNavigator.tsx:88-115`). The header copy-paste is fixed. The dead-route mounting and orphaned screens are not.

---

## 60-second read

The center tab "+" on personal mode does not add an expense — it opens **Notes**. The only way to log "coffee 5" via the FAB is to (a) be on Personal Dashboard tab, then (b) tap the draggable mini-FAB rendered inside Dashboard.tsx. On any other tab (Budget, Notes, MoneyChat, Settings) there is **no globally-accessible expense entry** — the user must first navigate to Dashboard. This breaks the entire "minimum taps" promise for the app's core action.

The other tap-count killer is mode switching: Personal → Business takes 4-7 taps depending on auth/setup state, with a 300ms scripted delay (`App.tsx:304`) on push-notification deep links. AUDIT.md UX-M6 understated this.

`RootNavigator.tsx` shrank from 1,744 to 567 lines (good), but **57 of 75 screens are still mounted regardless of mode** — every freelancer/parttime/ontheroad/mixed/seller/stall route is in the same root stack as personal routes. Cost: ~30+ component imports + their default-export module evaluation cost on every cold start, regardless of which mode the user picks.

**Counts:** 4 Critical · 7 High · 9 Medium · 6 Low

---

## Tap count table

Counted from "app already open on Personal Dashboard" unless noted. Each tap is a discrete user action (touch + release).

| # | Journey | Actual | Ideal | Gap | Bottleneck (file:line) |
|---|---|---|---|---|---|
| 1 | **Switch Personal → Seller dashboard** (cold, signed-in & verified) | **5-7** | 1 | +4-6 | `Settings.tsx:942` mode toggle lives in Settings; `RootNavigator.tsx:262-272` — `BusinessMain` lazy-mounts `AuthGatedBusiness` then `BusinessSetup` then `BusinessNavigator` |
| 2 | **Log cash expense via FAB from a non-Dashboard tab** (e.g. starting on MoneyChat) | **3** (tap Dashboard tab → tap FAB → enter amount → save) | 1 | +2 | `Dashboard.tsx:1082` — `<QuickAddExpense />` only mounted on Dashboard; CustomTabBar center button is `Notes`, not `+`. `PersonalNavigator.tsx:79-82` |
| 3 | **Log cash expense via FAB from Dashboard** | **2** (FAB → save; amount required) | 1 | +1 | `QuickAddExpense.tsx:209-256` modal animation + auto-focus chain |
| 4 | **Log expense via MoneyChat** ("coffee 5") | **3** (tap MoneyChat tab → type → send) | 2 | +1 | tab → input → submit. Acceptable but not the fastest path — yet AUDIT.md says it's the "stated AI differentiator" |
| 5 | **Log expense from receipt** (camera → save) | **5-6** (Dashboard → FAB → camera icon → permission → snap → confirm → save) | 3 | +2-3 | `QuickAddExpense.tsx` triggers `ReceiptScanner` route push; `RootNavigator.tsx:308-312`. Native picker has the iOS modal-blocks-picker setTimeout dance noted in MEMORY |
| 6 | **Add a debt** (Ali owes me RM50) | **4-6** (Dashboard → "Details" or open DebtTracking entry → DebtTracking → tab → add → fill → save) | 2 | +2-4 | `RootNavigator.tsx:303-307` DebtTracking only reachable via Dashboard hub; no tab |
| 7 | **Mark a debt settled** | **4** (Dashboard → DebtTracking → row → "mark settled") | 2 | +2 | `DebtTracking.tsx:2549,4753` — settled is a filter, not a swipe action |
| 8 | **Create a new wallet** | **4** (Dashboard → wallet card → WalletManagement → "+ add wallet" → form → save) | 2 | +2 | `RootNavigator.tsx:347-351` |
| 9 | **Add a budget for "Food"** | **3-4** (BudgetPlanning tab → "+ add" → category → amount → save) | 2 | +1-2 | `BudgetPlanning.tsx:1291,1474` — budget tab is full-tab real estate but adding still takes the modal route |
| 10 | **Switch language EN → BM** | **4** (any tab → Settings tab → scroll to Appearance → tap "BM") | 2 | +2 | `Settings.tsx:1310` — buried in scroll. Settings is 1,998 lines |
| 11 | **Switch theme light → dark** | **4** (Settings tab → scroll → tap "dark") | 2 | +2 | `Settings.tsx:1265`. Same pattern as #10 |
| 12 | **Sign out of business mode** | **4** (Settings tab → scroll to bottom → "sign out" → confirm) | 2 | +2 | `Settings.tsx:942`. Same scroll-and-find as theme/lang |
| 13 | **Add a product (seller mode)** | **3** (SellerHome → tap Manage → tap Products card → "+" → save) | 2 | +1 | `Manage.tsx:59` — Manage is a hub-spoke; Products lives one level deeper |
| 14 | **New order from WhatsApp paste** | **4** (SellerHome → SellerNewOrder tab → paste → parse → confirm) | 3 | +1 | `BusinessNavigator.tsx:104` SellerNewOrder is its own tab — good. NewOrder has paste support |
| 15 | **Close current stall session** | **3** (StallDashboard → "close session" button → CloseSession form → confirm) | 2 | +1 | `Dashboard.tsx:198` (stall) — present but a sub-screen push, not a sheet |

Hot-take: **rows 1, 2, 5, 6 are the journeys to fix first** — they are daily paths and the gap is the largest.

---

## Critical (broken or off-by-multiple)

### NAV-C1. Center FAB is `Notes`, not `+ expense` — primary action is unreachable globally
**File:** `src/navigation/PersonalNavigator.tsx:78-82` (Notes is index 2 of 5 = center) + `src/components/navigation/CustomTabBar.tsx:161-189` (renders middle index as the big circle)
**What:** `CustomTabBar` deliberately picks the middle index of the routes array as the popping-out "+" button (`centerIndex = Math.floor(state.routes.length / 2)` — line 123). On personal mode the middle index is `Notes`. The big colored circle therefore opens Notes, not a quick-add modal.
**Impact:** Every `+` icon in the world means "create the primary thing." On personal finance apps that's a transaction. New users will tap the big circle expecting expense entry and land on Notes. Existing users learn to ignore the center button — paying for the visual real estate without using it.
**Repro:** Open app → middle of bottom bar → tap. Expected: amount input. Actual: Notes editor list.
**Fix options (cheapest first):**
1. Reorder personal tabs: `[Dashboard, BudgetPlanning, **QuickAdd**, MoneyChat, Settings]`. Replace the Notes tab with a synthetic `QuickAdd` tab whose `tabPress` event calls `event.preventDefault()` and opens the QuickAddExpense modal. Notes moves to the Dashboard or to a Settings subscreen.
2. Or: special-case `centerIndex` in CustomTabBar to fire `openQuickAdd()` instead of navigating, regardless of which route lives there.
**Severity rationale:** Daily action × every user × 100% wrong destination.

### NAV-C2. `<QuickAddExpense />` is mounted ONLY on Personal Dashboard — no FAB on other tabs
**File:** `src/screens/personal/Dashboard.tsx:51,1082` is the *only* render site of the component. `src/components/common/QuickAddExpense.tsx:135-159` carries its own draggable Animated.ValueXY FAB.
**What:** When the user is on `BudgetPlanning`, `Notes`, `MoneyChat`, or `Settings`, the draggable FAB is unmounted. To log an expense they must first switch to the Dashboard tab.
**Impact:** 1 wasted tap per logging from any non-Dashboard tab. Combined with NAV-C1, the user has zero reliable "+" button anywhere except a hidden draggable floater that exists only on Dashboard.
**Fix:** Hoist `<QuickAddExpense />` to `App.tsx` between `BiometricGate` and `RootNavigator` (or to the root of `PersonalNavigator`). Use `openQuickAdd()` (already exported) for programmatic open. Keep the modal one source of truth.
**Severity rationale:** Compounds NAV-C1. Affects the AUDIT.md UX-C1 finding (5 expense entry surfaces) — the supposedly canonical surface is location-locked.

### NAV-C3. `ExpenseEntry.tsx` is deleted from disk but still in git index — confirmed orphan
**File:** `git status` shows `D src/screens/personal/ExpenseEntry.tsx`. No `RootNavigator.tsx` registration. AUDIT.md UX-C1 said it was orphaned — it has now been deleted on disk but the deletion is not committed.
**What:** Status reflects in-progress cleanup. Nothing to fix at the navigation layer; just commit the delete. Listed here so the open finding closes.
**Fix:** `git add -u src/screens/personal/ExpenseEntry.tsx` in the next commit.

### NAV-C4. `SellerCustomersStack` registered in root, never navigated to
**File:** `src/navigation/RootNavigator.tsx:422-426`. Grep across `src/` shows zero `navigate('SellerCustomersStack')` calls. `BusinessNavigator.tsx:105` registers a sibling tab `SellerCustomers` (the same `Customers` component). Users only ever reach the tab.
**What:** Dead route. Same component mounted twice in two different navigators with two different names. Adds startup module-evaluation cost; risk of a future code-path navigating to the wrong one and breaking back-stack expectations.
**Fix:** Remove the `Stack.Screen name="SellerCustomersStack"` registration. If a deep-push from a non-tab screen is needed, push the tab via `navigation.getParent()?.navigate('SellerCustomers')`.

---

## High (significantly slower than ideal)

### NAV-H1. Per-income-type screens all sit in root stack regardless of mode (UX-C2 partial)
**File:** `RootNavigator.tsx:55-78` imports + `:467-556` registrations. `FreelancerClientList`, `FreelancerClientDetail`, `FreelancerAddPayment`, `FreelancerReports`, `PartTimeSetup`, `PartTimeAddIncome`, `PartTimeIncomeHistory`, `PartTimeReports`, `OnTheRoadSetup`, `OnTheRoadAddEarnings`, `OnTheRoadAddCost`, `OnTheRoadCostHistory`, `OnTheRoadReports`, `MixedSetup`, `MixedAddIncome`, `MixedAddCost`, `MixedStreamHistory`, `MixedReports`, plus all `Seller*` and `Stall*` screens — **57 of the 75 stacks are unreachable in personal mode** but still imported eagerly via static `import` (lines 17-79).
**What:** Static ESM imports run their default-export evaluation regardless. AUDIT.md UX-C2 partially fixed (extracted `makeBackHeader`); this part still open.
**Impact:** Cold-start parse cost + memory footprint for screens the user can't see. Approximate weight: 18 income-type screens × ~10-30KB compiled = 180-540KB JS evaluation time before first paint.
**Fix:** Move per-income-type stack registrations into a sub-stack lazily mounted by `BusinessNavigator` keyed on `incomeType`. Use `React.lazy` + `Suspense` for the rare routes (Setup screens, Past Seasons, Reports). Keep the truly cross-mode routes (Settings, Receipt*, Onboarding) in root.

### NAV-H2. Push notification deep link uses 300ms `setTimeout` shotgun
**File:** `App.tsx:297-312`
**What:** On notification tap → `setMode('business')` → `setTimeout(300)` → `navigationRef.navigate('SellerOrderList', ...)`. MEMORY.md explicitly states "no setTimeout value is reliable" for cross-modal nav. 300ms is also a visible delay before the destination appears.
**Impact:** Race: if the navigator hasn't mounted by 300ms (cold start, slow device), the navigate call no-ops. If mode change took >300ms, same thing. User taps the notification, sees splash, lands on default tab, has to find the order manually.
**Fix:** Listen for `navigationRef`'s ready event + a single state subscription on `useAppStore.mode === 'business'`. Use `navigation.dispatch(StackActions.replace(...))` after both conditions hold. Or queue the intent in a `pendingDeepLinkRef` and have `BusinessNavigator`'s `useEffect` consume it on mount.

### NAV-H3. Mode toggle buried in Settings; Settings is 1,998 lines
**File:** `src/screens/shared/Settings.tsx:1367,942` (mode-related logic) + `RootNavigator.tsx:432-441` (Settings registered as a *pushed* screen on top of personal mode and as a separate `SellerSettings` registration)
**What:** Switching modes needs: (1) tap Settings tab, (2) scroll past Appearance/Categories/Sync/etc., (3) find "switch to business mode" / "sign out", (4) confirm. AUDIT.md UX-M6 called this "punishing." It still is.
**Impact:** Every mode-aware journey starts with a 4-tap detour. Combined with the auth gating, a freelancer logging a client payment then buying lunch is the classic 7-tap nightmare.
**Fix:** Add a one-tap mode pill at the top of every Dashboard (personal & business), or a long-press on the center FAB to switch. Promote the toggle out of Settings.

### NAV-H4. AuthGatedBusiness re-runs OTP request on every back-from-Otp-screen
**File:** `RootNavigator.tsx:140-162`. There IS a 30s `lastOtpAtRef` cooldown (line 143) — that fixes LOGIC-H5 from AUDIT.md. But the *navigation* effect still: on every `setOtpCode(null)` the user re-enters the gating check, which can re-trigger `OtpVerificationScreen` mount/unmount/mount ladders if `isVerified` flips.
**Impact:** Visible flicker between OTP and target screen on the first verified launch.
**Fix:** Consolidate the gate into a single rendering decision — wrap `OtpVerificationScreen` in `useMemo` keyed on `(isAuthenticated, isVerified, otpCode)` so React commits a single transition.

### NAV-H5. Tab nav `lazy: false` everywhere — entire tab tree mounted on first focus
**File:** `PersonalNavigator.tsx:30` + `BusinessNavigator.tsx:181` both set `lazy: false`. `freezeOnBlur: true` is good for memory but doesn't help first-paint cost.
**What:** Every tab's screen runs its full mount on first navigation to the navigator. Personal mode mounts Dashboard (1,532 lines + queries 4 stores) + BudgetPlanning (full screen) + NotesHome + MoneyChat + Settings (1,998 lines). On older Android devices that's a measurable hitch on cold start.
**Impact:** Splash → first tap responsiveness. Dashboard renders the first paint, but the Settings useEffect runs in the same frame.
**Fix:** Set `lazy: true` (default in RN Navigation 7). Verify the saved-state restoration still works (Notes scroll position, etc).

### NAV-H6. Hardware back on personal Dashboard exits app without confirmation
**File:** `RootNavigator.tsx:259` (`gestureEnabled: false` on `PersonalMain`) + no `BackHandler` registration anywhere except modals.
**What:** Stack-level back is disabled (correct — root tab navigator), but Android hardware back press at the Dashboard tab exits the app with no "press again to exit" guard.
**Impact:** Accidental exits, lost in-flight modal state. User taps back to dismiss something, exits the app, then has to wait for cold start.
**Fix:** Add `useBackHandler` on Dashboard (and StallDashboard, SellerDashboard) — first press shows toast "press back again to exit," second press exits. 30 minutes work.

### NAV-H7. No transaction search input on TransactionsList
**File:** `src/screens/personal/TransactionsList.tsx:657,859,865` — `FlatList` is well-virtualized (`removeClippedSubviews`, `keyExtractor`) but no `TextInput` filter exists in the file. AUDIT.md UX-C3 noted this; verifying it remains.
**Impact:** With 1,000+ transactions, finding "the RM200 expense at IKEA" is a manual scroll. Search would replace 10-30 scroll-flicks with 1 tap + typing.
**Fix:** Header `TextInput` that filters by `note`, `category`, `amount`. Same pattern as DebtTracking which already has search.

---

## Medium (friction or inconsistency)

### NAV-M1. iOS swipe-to-go-back is on globally — risks accidental dismissal of unsaved forms
**File:** `RootNavigator.tsx:240` — `gestureEnabled: true` at navigator level. Forms like `ReceiptScanner`, `LogIncome`, `FreelancerAddPayment`, `MixedAddIncome`, `MixedAddCost` don't override.
**Fix:** Add `gestureEnabled: false` on form screens with unsaved state. Show a confirmation sheet on swipe attempt if dirty.

### NAV-M2. After-save destination is inconsistent
**File:** Found by sampling: `QuickAddExpense.tsx:setVisible(false)` (modal) vs `ReceiptScanner.tsx:308-411` (`navigation.goBack()` after save) vs `FreelancerAddPayment` (likely `navigation.goBack()`). User lands in different places after the same conceptual action.
**Fix:** Pick the rule and document in MEMORY: "after save, return to the screen that initiated the action." Standardize the modal-vs-stack pattern.

### NAV-M3. Modal-from-modal pattern requires `setTimeout(50)` choreography
**File:** MEMORY.md documents this; `RootNavigator.tsx:308-312` ReceiptScanner is a stack push from inside QuickAddExpense modal — relies on the choreography.
**Fix:** Long-term, migrate to `react-native-bottom-sheet` (gesture-driven, no native modal collision). Short-term, audit the 4 places this pattern is used and add a comment.

### NAV-M4. Tab labels are never translated for stall mode "regulars" and "history"
**File:** `BusinessNavigator.tsx:114-116` — uses `t.tabs.history`, `t.tabs.regulars`. Verify both keys exist in `ms.ts`. Not directly nav cost, but i18n parity (AUDIT.md UX-H4).

### NAV-M5. `SellerSettings` as separate stack registration — duplicate component, divergent header
**File:** `RootNavigator.tsx:432-441` registers both `Settings` and `SellerSettings` to the same `Settings` component. Different `makeBackHeader(C, mode, 'Settings')` but same body.
**Fix:** One registration with mode-aware header. The `mode` param to `makeBackHeader` already handles fallback target.

### NAV-M6. ImportFromStatement / ImportFromCsv: registered, only entered from Settings
**File:** `RootNavigator.tsx:337-346`, `Settings.tsx` references. They have `headerShown: false` (line 340, 345) — meaning they own their own headers. Verify they have a working back button. Likely fine, but flagged for consistency since they're the only two routes that opt out of the shared header helper.

### NAV-M7. Order-link Vercel page → app: no deep-link handler
**File:** `App.tsx:282-294` only handles `potraces://quick-add`. The Vercel `docs/index.html:459` page is the customer-facing order form; if a seller wants to "open this order in my app" from the share link, there's no deep-link mapping for `/?slug=...&order=...`.
**Fix:** Add a route handler for `potraces://order/:id` and a meta tag on the Vercel page. Lower priority — current flow works via push notifications.

### NAV-M8. Tab bar `onLongPress` does nothing useful
**File:** `CustomTabBar.tsx:137-142` — emits `tabLongPress` but no handler is registered anywhere in the codebase.
**Fix opportunity:** Use long-press on Dashboard tab to open Quick Settings (theme, language, mode). Free tap-count savings (#10, #11 each become 2-tap).

### NAV-M9. No "back to Dashboard" home shortcut from deep stacks
**File:** `RootNavigator.tsx:88-115` `makeBackHeader` only goes back one level; no header-tap-to-home gesture (common on iOS).
**Fix:** Make the screen title tappable on stacks deeper than 2 — call `navigation.popToTop()`.

---

## Low (polish)

### NAV-L1. `Modal animationType="fade"` has 200-300ms perceived delay on Android
**Pattern:** MEMORY.md mandates `animationType="fade"` for sheets. On low-end Android the fade has a noticeable enter delay. Consider `animationType="none"` + a custom 150ms Reanimated fade for parity.

### NAV-L2. Dashboard renders before personal store is fully consumed
**File:** `App.tsx:77-81` waits for `useSellerStore`, `useSettingsStore`, `useAuthStore` — but **not** `usePersonalStore`. First render of `Dashboard.tsx` may flash empty wallets/transactions for one frame before the store hydrates. Add `usePersonalStore` to `waitForStore` calls.

### NAV-L3. `lazy: false` + `freezeOnBlur: true` is contradictory
**File:** `PersonalNavigator.tsx:30-31`. `freezeOnBlur` only matters if the screen was ever rendered. With `lazy: false`, every tab is rendered eagerly anyway. Pick one.

### NAV-L4. CustomTabBar derives icon name by calling `tabBarIcon` then digging into JSX `.props.name`
**File:** `CustomTabBar.tsx:163-167` — clever but fragile. If a tab uses an icon component other than `Feather`, the cast breaks silently and falls back to `'circle'`. Add a runtime guard.

### NAV-L5. Animation duration baked in at 300ms for mode switch
**File:** `RootNavigator.tsx:258,268` — `animationDuration: 300`. Fast devices feel sluggish. Use `Platform.select({ ios: 250, android: 200 })`.

### NAV-L6. No screen reader hint when switching modes
**File:** `Settings.tsx:942` mode flip is silent for AT users. Add `AccessibilityInfo.announceForAccessibility('Switched to personal mode')`.

---

## Orphaned screens (registered but unreachable)

Verified by grep across `src/`:

1. **`ExpenseEntry`** — file already deleted on disk (`git status` shows `D src/screens/personal/ExpenseEntry.tsx`); no longer registered. Per AUDIT.md UX-C1 — **closed pending commit**.
2. **`SellerCustomersStack`** (`RootNavigator.tsx:422-426`) — registered but only `src/types/index.ts` references the name. `BusinessNavigator.tsx:105` exposes the same `Customers` component as a tab `SellerCustomers`. **Orphan** — see NAV-C4.
3. **`POS`, `CRM`, `Inventory`** (`BusinessNavigator.tsx:32-34`) — only referenced from the `default` case fallback (no incomeType set). With current `BusinessSetup` gate (`RootNavigator.tsx:211-213`), no user reaches the default case. **Likely dead** — verify no first-launch path triggers it; if not, delete.
4. **`SellerOrderList`** is a *root stack* registration (`:402-406`) AND a tab `SellerOrders` (`BusinessNavigator.tsx:103`). Same component, two routes. AUDIT.md LOGIC-H4 already noted. The root stack registration is only used by `App.tsx:306` push deep-link. Could be consolidated.

No other true orphans found in this pass.

---

## Dead-route cost (UX-C2 follow-through)

`RootNavigator.tsx` registers ~50 stack screens. After the `makeBackHeader` extraction, the file is 567 lines (down from 1,744 — good). The remaining cost is **eager imports of mode-specific screens regardless of active mode**:

- **Personal mode users carry:** all 7 freelancer screens (`L43-58`), 4 part-time screens (`L61-64`), 5 on-the-road screens (`L67-71`), 5 mixed screens (`L74-78`), 9 seller screens (`L43-50`), 4 stall screens (`L51-54`). That's ~34 screen modules + their store dependencies they never use.
- **Seller mode users carry:** all freelancer/parttime/ontheroad/mixed/stall screens (~22 modules) plus all personal screens that are accessible from Settings (Wallet/Subscription/Budget/etc).

Estimated bytes (compiled): 180-540KB extra JS evaluation cost, plus the chains of imports they pull (each screen imports its store, which imports persistence, which imports AsyncStorage adapters).

**Recommendation per AUDIT.md UX-C2:** Nest income-type stacks under `BusinessNavigator` switch (`BusinessNavigator.tsx:97-170` already has the switch). Move the Stack.Screen registrations for `Freelancer*`, `PartTime*`, `OnTheRoad*`, `Mixed*` into per-incometype sub-stacks created lazily inside the relevant case branches. Use `React.lazy` for screens visited <1× per session (Setup, Reports, History).

---

## Quick wins (under 4 hours each)

- **Fix NAV-C1**: reorder personal tabs to put `QuickAdd` synthetic tab in the center. ~1 hour. Biggest UX win in the audit.
- **Hoist QuickAddExpense (NAV-C2)** to `App.tsx`. ~1 hour. Removes the "must-be-on-Dashboard" gotcha.
- **Add long-press on Dashboard tab → quick-settings sheet (NAV-M8)**. Halves the tap count for theme/language/mode. ~2 hours.
- **Add `BackHandler` confirm-to-exit on root Dashboards (NAV-H6)**. ~30 min.
- **Set `lazy: true` (NAV-H5)** in both navigators, verify state restoration. ~1 hour.
- **Delete `SellerCustomersStack` registration (NAV-C4)**. ~10 min.
- **Tappable header title → popToTop (NAV-M9)**. ~30 min for a small wrapper in `makeBackHeader`.
- **Search bar on TransactionsList (NAV-H7)**. ~3 hours.
- **Replace push-notification `setTimeout(300)` with proper ready-listener (NAV-H2)**. ~2 hours; requires testing on cold start.
- **Add `usePersonalStore` to App.tsx hydration wait (NAV-L2)**. ~10 min.

---

## Hot paths to optimize first

The 3 journeys with highest tap-count gap × frequency:

1. **Log a cash expense (any tab → save)** — Journey #2 + #3 in the table. Daily, multiple times. Fix NAV-C1 + NAV-C2 together collapses 3 taps to 2 and turns the mythical "+" into a real expense button. **Highest ROI in the codebase.**
2. **Switch mode (personal ↔ business)** — Journey #1. Multiple times daily for the freelancer/seller persona who logs personal expenses too. Fix NAV-H3: surface a one-tap mode toggle on Dashboard, kills 4-7 taps × multiple times daily.
3. **Find a past transaction (e.g. "my IKEA receipt")** — implicit in TransactionsList scroll. Fix NAV-H7 (search input). Replaces 10+ scroll-flicks with 1 tap + 5 keystrokes — lower frequency than #1/#2 but higher per-instance pain.

---

Critical: 4 · High: 7 · Medium: 9 · Low: 6
