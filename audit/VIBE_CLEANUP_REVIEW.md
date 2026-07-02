# Potraces cleanup review

## Summary
Potraces is a mature, store-compliance-hardening release candidate on the `store-compliance` branch — a real Supabase backend (no mocks/stubs), Hermes + New Architecture defaults, deliberate wallet-reconciliation/edit-audit engineering, and near-zero TODO debt. Two confirmed CRITICAL issues block a clean ship: a silent money-corruption bug in wallet reconciliation that double-counts every wallet-linked debt payment and goal contribution, and an iOS Tap-to-Pay entitlement that ships unconditionally for a feature that is OFF at launch (App Review / code-signing risk). Fix REL-01 first — it silently understates real users' wallet balances on a "Recalculate" tap and on every personal sync.

## Context established
Stack is Expo SDK ~54 / RN 0.81.5 / React 19 (managed; both native projects EAS-prebuilt — only `ios/PotracesShareExtension` is committed, no `android/` folder), Hermes ON and New Architecture ON at SDK defaults (no overrides — correctly left alone), React Navigation 7, Zustand 4.5 + immer + AsyncStorage (~24 stores), RevenueCat IAP, Sentry, expo-updates OTA. Backend is REAL, not mocked: a genuine Supabase client (auth, RLS data, edge functions, server-side AI proxy so provider keys never touch the device). Seller/business mode is Supabase-backed with a mandatory auth gate and full pull-before-push sync; personal mode is local-first AsyncStorage with REAL but OPT-IN cloud sync (`personalSyncEnabled` defaults false). Lifecycle = TESTING→LIVE store-compliance pass, not a prototype.

- Deterministic stub scan: ~150 hits, but all meaningful ones are UI `placeholderText` false positives except one intentional env-gated DuitNow QR Phase-2 provider (honest fallback) — unusually clean of stubs/mocks/TODOs.
- Touch targets: raw heuristic flagged ~1034 `width/height<44` lines but these are overwhelmingly icons/dots/spacers inside padded Pressables (308 `hitSlop` usages app-wide); no systemic small-target problem at the investigation level.
- File-size risk: `src/screens/shared/DebtTracking.tsx` at 11,899 lines is the standout maintainability hazard and the locus of the perf + god-component findings below.
- Aging deps to watch: `xlsx` 0.18.5 (HIGH advisory, no npm patch), `react-native-chart-kit` (low maintenance), `@stripe/stripe-terminal-react-native` 0.0.1-beta.31 (pre-1.0 beta in a payments path).

---

## Blocking issues (fix before shipping)

These two are the ONLY confirmed CRITICALs. Everything below this section is non-blocking.

### Reliability / data integrity

**REL-01 — `reconcileWalletBalances` double-counts every wallet-linked personal debt payment AND goal contribution → silent wallet corruption**
`c:/Project/Potraces/src/utils/walletReconcile.ts:47-82` (debt loop 66-72, goal loop 74-82)

The single-ledger contract (`audit/MONEY_FIX_PLAN.md`, `WALLET_OWNERSHIP_DECISION.md`) says a personal-mode debt payment and a goal contribution never touch the wallet directly — their wallet effect rides on a LINKED personal transaction. But the reconcile replays both ledgers with no link/mode exclusion: the transactions loop deducts the linked transaction, and the debt/goal loops deduct the same payment/contribution a second time. It is user-reachable today via the "Recalculate from transactions" action (`WalletManagement.tsx:1035` → `setWalletBalance`) and fires automatically on every successful personal sync (`personalSync.ts:522 autoReconcileWallets()`). Net effect: wallet under-stated by the full sum of all wallet-linked debt payments + goal contributions. This is silent money corruption in a finance app — the same bug class already fixed for transfers (BUGHUNT[4]) but never extended to debt payments or goal contributions.

```js
// INCORRECT — counts the linked tx AND the payment/contribution
for (const tx of transactions) { if (tx.walletId!==wallet.id) continue; /* deduct */ }
for (const debt of debts) for (const payment of debt.payments) {
  if (payment.walletId !== wallet.id) continue;
  computed = roundMoney(computed - payment.amount); // 2nd deduction
}
for (const goal of goals) for (const contrib of goal.contributions) {
  if (contrib.walletId !== wallet.id) continue;
  computed = roundMoney(computed - contrib.amount); // 2nd deduction
}
```
```js
// CORRECT — skip any payment/contribution already represented by a personal tx.
// NOTE (verifier): gating on linkedTransactionId presence alone also skips
// business-mode payments, which is fine here (their businessTransaction is not
// in personalStore.transactions and is never replayed by this reconcile). The
// safest personal-only filter resolves the linked record to a PERSONAL tx.
for (const debt of debts) for (const payment of debt.payments) {
  if (payment.walletId !== wallet.id) continue;
  if (payment.linkedTransactionId) continue; // tx loop already counted it
  computed = roundMoney(computed - payment.amount);
}
for (const goal of goals) for (const contrib of goal.contributions) {
  if (contrib.walletId !== wallet.id) continue;
  if (contrib.transactionId) continue; // tx loop already counted it
  computed = roundMoney(computed - contrib.amount);
}
```

### Platform parity / store compliance

**PARITY-1 — iOS Tap-to-Pay proximity-reader entitlement ships unconditionally for a feature that is OFF at launch**
`c:/Project/Potraces/app.json:59-62`

`app.json` hardcodes `com.apple.developer.proximity-reader.payment.acceptance: true`. This is an Apple-restricted, per-app-allowlisted entitlement that must be granted on the App ID and present on the provisioning profile, or EAS managed credentials hard-fail code-signing/upload with "provisioning profile doesn't include … entitlement". The feature is build-time dead in the shipping config: `tapToPay.ts:29` gates on `EXPO_PUBLIC_TAP_TO_PAY_ENABLED === 'true'`, `TapToPayProvider.tsx:19` only mounts when enabled, and the shipping `.env` contains no Tap-to-Pay flag and no Stripe Terminal location id. `app.json` is fully static (no `app.config.js` exists), so the entitlement cannot be conditioned on the flag. Result: production iOS build either fails to sign (if Apple hasn't allowlisted the App ID) or uploads and a reviewer flags a payment-acceptance capability with no reachable feature.

```jsonc
// INCORRECT
"entitlements": {
  "com.apple.developer.proximity-reader.payment.acceptance": true,
  "aps-environment": "production"
}
```
```jsonc
// CORRECT — strip the entitlement (and the Stripe Terminal NSLocationWhenInUse
// string at app.json:144-146) for launch. When the pilot ships, move both into
// an app.config.js that adds them only when EXPO_PUBLIC_TAP_TO_PAY_ENABLED==='true'.
"entitlements": {
  "aps-environment": "production"
}
```

---

## High-impact improvements

Real wins; the app can ship without them. None are in `audit/BACKLOG.md` as tracked findings.

### Security

**SEC-A1 — Supabase session JWTs (access + refresh) stored in plaintext AsyncStorage; `expo-secure-store` installed but never wired**
`c:/Project/Potraces/src/services/supabase.ts:7-14`

The client persists the session via `storage: AsyncStorage` (unencrypted on disk). On a rooted/jailbroken device, an unencrypted backup, or via co-resident malware in the same data dir, the long-lived refresh token is recoverable, unlocking RLS-scoped financial data and PII (incl. `customer_phone`/`customer_address`). `expo-secure-store` (~15.0.8) is in `package.json` and `app.json` plugins but `SecureStore` appears nowhere in `src/`. HIGH (not CRITICAL): exploitation requires device compromise, not a remote vector. The same pattern likely applies to any Google-auth/personal-sync Supabase client — fix all client instances, not just this file.

```ts
// INCORRECT
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storage: AsyncStorage },
});
```
```ts
// CORRECT — SecureStore caps values ~2KB and a Supabase session exceeds it, so chunk.
import * as SecureStore from 'expo-secure-store';
const SecureStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),   // returns null for missing key (safe)
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, storage: SecureStorage },
});
```

### Reliability / data integrity

**REL-02 — `ErrorBoundary` component exists but is never mounted → any render throw is a white screen**
`c:/Project/Potraces/src/components/common/ErrorBoundary.tsx:22` (never referenced as `<ErrorBoundary>` anywhere)

A correct class boundary (`getDerivedStateFromError` + fallback UI) is built but wrapped around nothing. `App.tsx`'s render tree (`RootSiblingParent > SafeAreaProvider > … > RootNavigator`) has no boundary; its `if (error)` block is a plain init-time string `useState`, not a render-error catcher. A single render-time throw below `RootNavigator` (e.g. an unguarded date/number in a money screen) unwinds the whole tree to a blank screen. HIGH, trivial fix (component already exists). Best practice: mount at root AND per-navigator, and wire `componentDidCatch` to Sentry (currently only `__DEV__` console.error).

```tsx
// INCORRECT — App.tsx has no ErrorBoundary
return (<GestureHandlerRootView><NavigationContainer>{/* ... */}</NavigationContainer></GestureHandlerRootView>);
```
```tsx
// CORRECT
import ErrorBoundary from './src/components/common/ErrorBoundary';
return (<ErrorBoundary><GestureHandlerRootView><NavigationContainer>{/* ... */}</NavigationContainer></GestureHandlerRootView></ErrorBoundary>);
```

### Performance

**PERF-01 — `DebtTracking` renders the debt & split lists with `.map()` inside one `ScrollView` (no virtualization)**
`c:/Project/Potraces/src/screens/shared/DebtTracking.tsx:3692` (ScrollView), `3936` (groupedDebts.map), `4288` (filteredSplits.map)

The primary debt and split lists are `.map()`-rendered inside the single vertical `ScrollView`, not `FlatList` — violating the project's own MANDATORY "never ScrollView + .map() for lists that can grow" rule. The lists ARE tab-gated (only the active tab's list mounts) and the array compute (`groupedDebts`/`filteredSplits`) IS memoized, so the worst case is narrower than first reported — but the per-ROW work inside each map body (filter/reduce/`differenceInDays` date math + inline style objects) re-runs for every visible row on every store-driven re-render. Downgraded CRITICAL→HIGH by the verifier: real mount-cost/scroll-jank on the power-user long tail, not an app-breaking crash. Distinct from backlog SCALE-H2 (Dashboard `.map`) and SCALE-H1 (FlatList props).

```jsx
// INCORRECT
<ScrollView ref={mainScrollRef} ...>
  {groupedDebts.map((group) => { /* heavy per-row compute */ })}
  {filteredSplits.map((split, idx) => { /* heavy per-row compute */ })}
</ScrollView>
```
```jsx
// CORRECT — keep tab gating; one FlatList per active tab, hero+segmented control
// in ListHeaderComponent, per-row subtitle/amounts precomputed in the existing
// useMemos, row wrapped in React.memo with a useCallback renderItem.
<FlatList
  data={groupedDebts}
  keyExtractor={(g) => g.contactId}
  renderItem={renderDebtGroup}
  removeClippedSubviews maxToRenderPerBatch={10} windowSize={5} initialNumToRender={10}
  ListHeaderComponent={DebtHeader}
/>
```

### Code quality

**CQ-02 — `DebtTracking.tsx` is an 11.9k-line single `React.FC` god-component (112 `useState`) — top maintainability hazard**
`c:/Project/Potraces/src/screens/shared/DebtTracking.tsx:121-11898`

One component owns debt + split + shared-subscription data, edit-audit logic, wallet reconciliation calls, and all rendering, with 112 `useState`, 76 `useCallback`, 32 `useMemo`, 15 `useEffect`, and 8 `react-hooks/exhaustive-deps` suppressions — the surface where stale-closure money bugs hide. (Verifier note: the original report's "23 suppressions" and "no extracted sub-components" were overstated — there are 8 suppressions and the shared-sub sheets ARE extracted; the I-Owe/They-Owe tabs and most form/detail sheets remain inline.) HIGH, not CRITICAL: it ships and works; no live runtime defect demonstrated. Highest-value refactor target in `src`.

```tsx
// CORRECT direction — data/effects into hooks, tabs into components
// hooks/useDebtTracking.ts, hooks/useSharedSubs.ts
// components/debt/IOweTab.tsx, TheyOweTab.tsx, DebtDetailSheet.tsx
const DebtTracking: React.FC = () => { const debt = useDebtTracking(); return <DebtTabs {...debt} />; };
```

---

## Optional suggestions

MEDIUM findings — polish and preference, trust less (not adversarially verified unless noted). Each has a file:line.

**Downgraded from HIGH by the verifier (keep, but lower priority):**

- **CQ-01 — No ESLint/Prettier config and no `lint`/`typecheck` npm script** (`package.json` + repo root). No `.eslintrc*`/`eslint.config.*`/`.prettierrc*` anywhere, no eslint/prettier in devDeps; the 23 `eslint-disable` pragmas across the codebase are inert, and 309 `as any` casts ship unchecked despite `strict:true` (nothing runs `tsc`). A custom `lint:i18n` exists but is manual-only (no `.husky`/`.github` CI). Add `eslint.config.js` (eslint-config-expo + react-hooks) + `.prettierrc` + `lint`/`typecheck`/`format` scripts, ideally wired to a pre-commit hook/CI. Maintainability gate gap, not a runtime bug.
- **PERF-02 — ~50 screens subscribe to the WHOLE Zustand store (no selector)** (`src/screens/personal/Reports.tsx:24` + `*Reports.tsx`, `FinancialPulse.tsx:60`, `BudgetPlanning.tsx:123`). Re-renders chart screens on any unrelated store write. Verifier: chart DATA is `useMemo`'d so it's bounded render jank (not recompute), only while the screen is mounted — hence MEDIUM. Fix with atomic selectors (`usePersonalStore((s) => s.transactions)`, the Dashboard already does this) and wrap the charts in `React.memo` with hoisted `chartConfig`.
- **PERF-03 — Android release build ships with R8 minification + resource shrinking OFF** (`app.json:148-155`). The `expo-build-properties` android block sets only `minSdkVersion: 26`. Verifier corrections to the fix: use `enableMinifyInReleaseBuilds: true` (NOT the deprecated `enableProguardInReleaseBuilds`), and `enableShrinkResourcesInReleaseBuilds: true` THROWS at config time unless minify is also enabled — set both together. Build-size/cold-start optimization (Hermes bytecode isn't ProGuard-shrunk, so real gains are native/resources). Must validate on a real EAS production AAB + smoke test (reanimated/Stripe/mlkit use reflection/JNI — may need keep rules).

**Original MEDIUMs (file:line present, plausible):**

- **CQ-03 — personalSync merge erases all types with blanket `as any` into 6 money-bearing stores** (`src/services/personalSync.ts:298-349`). Every merge call site casts remote arrays, mergeFns, results, and setState to `as any`, defeating `strict:true` on the opt-in sync write path — a `personalSyncMappers` field-drift would compile silently and corrupt synced money/debt records. Type the remote arrays (mappers already return store-shaped rows).
- **CQ-04 — 14 orphaned component files never imported** (`src/components/common/` + `business/` — incl. the unused `ErrorBoundary` from REL-02 and a superseded `StoryCard`). Each name returns 0 external references. Delete the genuinely-dead ones (git history preserves them); for `ErrorBoundary`, mount it (REL-02) rather than delete. Partial overlap with backlog DESIGN-H2/H5 (different files/lens).
- **CQ-05 — `CRM.tsx` reimplements currency formatting inline (no thousands separators)** (`src/screens/business/CRM.tsx:456-458`). Local `formatCurrency` produces `RM 1234.50` vs the canonical `formatAmount` (`utils/formatters.ts:13`) `RM 1,234.50`, so business CRM money renders inconsistently. Drop the local helper, import `formatAmount`.
- **REL-03 — money stores guard `amount<=0` but not `isFinite`** (`src/store/personalStore.ts:30` addTransaction / `362-391` contributeToGoal; `debtStore.ts:126` addPayment). `NaN <= 0` is false, so a NaN amount can persist and poison reconcile (`computed - NaN` → wallet NaN, unrecoverable). Defense-in-depth at the persistence boundary; most callers currently use the `!amount` idiom that happens to catch NaN. Use `!Number.isFinite(x) || x <= 0`.
- **SEC-A2 — `xlsx` 0.18.5 HIGH advisory (prototype pollution + ReDoS), no npm patch** (`src/screens/seller/SeasonSummary.tsx:18`). Practically reduced: the only usage is export-only (`aoa_to_sheet`/`book_new`/write); no `XLSX.read`/`readFile` anywhere, so the attacker-controlled-parse trigger is unreachable today — but becomes live the moment any spreadsheet IMPORT is added. Pin to the patched SheetJS CDN build (0.20.x) or migrate to exceljs/write-excel-file.
- **PERF-04 — Contacts-import FlatList rebuilds its filtered data every render + O(rows×customers) per row** (`src/screens/seller/Customers.tsx:1545-1565`). Inline `.filter()` changes array identity each render; inline `renderItem` runs `derivedCustomers.some(...).toLowerCase()` per visible row. Only inside the on-demand import modal. Memoize a `Set` of existing names + the filtered list. (Main Customers list at 1195 is already correct.)
- **PARITY-2 — 3 modals use RN `KeyboardAvoidingView` instead of the mandated `react-native-keyboard-controller`** (`src/screens/seller/OrderList.tsx:2190`, `shared/Settings.tsx:1922`, `seller/Dashboard.tsx:1265`). RN's KAV is unreliable under SDK54 edge-to-edge on Android; `softwareKeyboardLayoutMode:"resize"` is a partial net. `FloatingModal.tsx:151-163` is the correct reference. Swap the import.
- **PARITY-3 — Push-permission prompt fires at seller-session startup with no rationale** (`App.tsx:194` → `pushNotifications.ts:32-35`). Cold OS prompt at login before the user has a reason — acceptance-rate killer. Gate behind a one-line in-app rationale or trigger after the first order.
- **PARITY-4 — Android adaptive icon uses the full-bleed iOS icon as foreground → launcher mask crops edges** (`app.json:65-68`, confidence medium). `foregroundImage` points at `./assets/icon.png`; only the inner ~66% is safe. Provide a padded foreground + a monochrome layer (Android 13+ themed icons).
- **PARITY-5 — Personal-mode local notifications schedule with no Android channel** (`src/services/pushNotifications.ts:49-56`, confidence medium). The only channel (`'orders'`) is created in the seller-only push path; personal local notifs (spendingAlerts/subscriptionNotifications/qrPaymentReminder) fall onto the auto-generated default channel with inconsistent importance/sound. Register channels for all notification types at startup and pass explicit `channelId`.
- **PARITY-6 — No splash-screen image configured → blank colored launch screen on both platforms** (`app.json:10-16`). `splash` defines only `resizeMode` + background colors, no `image` key, and no `SplashScreen.preventAutoHideAsync/hideAsync` calls. Symmetric (not a divergence) but a launch-quality item next to a polished icon. Add `splash.image` (+ dark variant).

---

## What I changed
Applied in a verified fix sweep (2026-06-20). Every change was gated by `tsc --noEmit` (src/ held at **0 errors**, `repairRounds: 0`), the new `scripts/test-wallet-reconcile.ts` (**PASS** — single-count 850, not 700), and `npm run test:sync` (**PASS — 11/11 round-trip**). Lockfile re-validated with `npm@10 ci --dry-run`.

**Confirmed blocker + HIGH:**
- **REL-01** `src/utils/walletReconcile.ts` — skip wallet-linked debt payments (`linkedTransactionId`) and goal contributions (`transactionId`) already replayed by the transactions loop → double-count gone. New regression test `scripts/test-wallet-reconcile.ts`.
- **SEC-A1** `src/services/supabase.ts` — session moved to a chunked `expo-secure-store` adapter + one-time AsyncStorage→SecureStore migration (no forced logout). ⚠️ device-test sign-in/persist before ship.
- **REL-02** `App.tsx` + `ErrorBoundary.tsx` — ErrorBoundary mounted at root; `componentDidCatch` now reports to Sentry.
- **PERF-01** `src/screens/shared/DebtTracking.tsx` — debt/split list virtualization + row memoization. ⚠️ device-test scroll.

**MEDIUM:**
- **REL-03** `personalStore.ts`, `debtStore.ts` — `!Number.isFinite()` guards so NaN amounts can't persist and poison reconcile.
- **CQ-03** `src/services/personalSync.ts` — removed blanket `as any` on the sync merge path (types-only; 2 narrow justified casts kept).
- **CQ-05** `src/screens/business/CRM.tsx` — canonical `formatAmount` (thousands separators).
- **PERF-02** atomic Zustand selectors + memoized charts across 8 report/pulse/budget screens.
- **PERF-03** `app.json` — Android release R8 minify + resource shrinking on. ⚠️ validate on a real AAB (reanimated/Stripe/mlkit keep rules).
- **PERF-04** `src/screens/seller/Customers.tsx` — import-modal O(1) Set lookup + memoized list.
- **PARITY-2** `OrderList.tsx`, `Settings.tsx`, `seller/Dashboard.tsx` — `react-native-keyboard-controller`. ⚠️ device-test keyboard.
- **PARITY-3 / PARITY-5** `App.tsx`, `pushNotifications.ts` — deferred the cold push-permission prompt; registered Android channels for all personal notification types.
- **CQ-04** deleted genuinely-dead `StoryCard.tsx` + `WhyCategoryChip.tsx`; **restored** `TapToPayProvider.tsx` + `PersonalSyncManager.tsx` (flag-gated dormant features, not dead).
- **CQ-01** added `eslint.config.js`, `.prettierrc`, `typecheck`/`lint`/`format`/`test:wallet` scripts, excluded `docs`/`supabase` from app typecheck (now 0 errors); lockfile regenerated with npm@10 (EAS-valid).

**CQ-02 (DONE, separate verified effort)** — decomposed `src/screens/shared/DebtTracking.tsx` from **11,899 → 10,734 lines** (−1,165) across 21 behavior-preserving, `tsc`+wallet+sync-gated steps (plan: `audit/DEBTTRACKING_REFACTOR_PLAN.md`). Extracted: pure helpers/derives → `src/utils/debtTracking.ts`; 4 hooks (`useKeyboardVisible`, `useDebtDerived`, `useDebtFilters`, `useDebtAutoArchive`); 13 prop-driven components → `src/components/debt/` (`DebtRow`, `SplitRow`, `DebtScreenHeader`, `DebtSegmentedControl`, `SplitTabHeader`, `SelectionActionBar`, `DebtSortFilterMenu`, `DebtViewSettingsModal`, `ScanningOverlay`, `DebtHowItWorksModal`, `FabChoiceModal`, `SplitChoiceModal`, `CommitmentPickerModal`). Wallet-reconciliation surface untouched. ⚠️ device-smoke the debt/split tabs, modals, selection, sort/filter before ship.

**Deferred (NOT applied):** PARITY-1 (Tap-to-Pay entitlement — user's call), SEC-A2 (xlsx — unreachable advisory, lockfile-churn risk), PARITY-4/6 (need design assets). See the matching sections above for each item's unblock path.

### Already tracked in audit/BACKLOG.md (excluded from headline blocker count)
None of the confirmed CRITICAL/HIGH findings above are tracked in `BACKLOG.md`. Closest references are intentionally distinct: LOGIC-C1/C2 (delete/update wallet rollback, marked FIXED) are a different bug class from REL-01; SCALE-H1/H2 (FlatList props / Dashboard `.map`) are distinct from PERF-01; SCALE-H3 (no `partialize`, what persists) is distinct from PERF-02 (subscription breadth); UX-C3 ("no biometric lock", app-lock UX) is distinct from SEC-A1 (token-at-rest). DESIGN-C2 references only a narrow banned-vocab ESLint guard, not the general lint gate in CQ-01. So all headline blockers are net-new.

---

## How to verify

**REL-01 (CRITICAL — wallet double-count):** Write a unit test for `reconcileWalletBalances`: seed one wallet, one personal debt payment with `{ walletId, linkedTransactionId }` + its linked transaction, and one goal contribution with `{ walletId, transactionId }` + its linked savings tx. Assert `computed === expected` (NOT `expected - payment - contrib`). Then in-app: create a wallet-linked debt payment + goal contribution, note the balance, tap "Recalculate from transactions" in the wallet sheet — balance must be unchanged. Repeat with `personalSyncEnabled` on and trigger a sync (`autoReconcileWallets`). `npm run test:sync` for the round-trip path.

**PARITY-1 (CRITICAL — entitlement):** Remove the entitlement, then `eas build --profile production --platform ios` and confirm it code-signs and uploads to App Store Connect without a "provisioning profile doesn't include … entitlement" error. Confirm `Grep` for `proximity-reader` returns no match in the shipped `app.json`. When Tap-to-Pay later ships, verify the entitlement only appears when `EXPO_PUBLIC_TAP_TO_PAY_ENABLED=true` is set via `app.config.js`.

**SEC-A1:** After wiring `SecureStorage`, sign in, force-quit, reopen — session must persist (proves chunked SecureStore round-trips a >2KB session). On a rooted emulator, dump the app's AsyncStorage file and `Grep` for `refresh_token`/`access_token` — must be absent. Confirm `Grep` for `SecureStore` now matches `src/services/supabase.ts`.

**REL-02:** Mount `<ErrorBoundary>`, then temporarily `throw new Error('test')` in a screen's render and confirm the fallback UI shows instead of a blank screen; confirm `componentDidCatch` reports to Sentry. Remove the throw.

**PERF-01 / PERF-02:** Build a release/profiling APK, open Perfetto/React DevTools Profiler. PERF-01: scroll the debt/split tab with 100+ items and confirm constant memory + 60fps (vs. all-rows-mounted before). PERF-02: open `Reports`, trigger an unrelated `personalStore` write (e.g. edit a budget elsewhere) and confirm the chart no longer re-renders (React DevTools "Highlight updates").

**PERF-03:** After setting `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`, `eas build --profile production --platform android`, compare AAB size, and smoke-test reanimated animations, Stripe Terminal init, and MLKit OCR for runtime `ClassNotFound` (add ProGuard keep rules if any appear).

**SEC-A2 (xlsx):** `npm audit --omit=dev` should show xlsx clean after pinning to the CDN 0.20.x build; smoke-test the SeasonSummary export still opens in Excel.

**CQ-01:** Add the configs/scripts, then `npm run lint && npm run typecheck` must run and (initially) report the real backlog of issues — proving the gate now exists.
