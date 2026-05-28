# Edge Cases Audit

Audited: 2026-05-28
Auditor: QA crash-testing pass (fat-finger, bad network, 3 years of data)

---

## CRITICAL

### EC-01: DebtTracking split equal division by zero when contacts list is empty
- **File:Line**: `src/screens/shared/DebtTracking.tsx:2222`
- **What**: Equal split divides by `splitContacts.length` without checking for zero.
- **How it breaks**: User opens split form, enters an amount, selects "equal" method, but removes all contacts before tapping save. `Math.floor((total / 0) * 100)` produces `Infinity`, corrupting all downstream participant amounts. The `splitContacts[0]?.id` on line 2224 also returns `undefined`, so `payerId` becomes `undefined` and the remainder adjustment silently fails.
- **Fix**: Add guard at top of save handler: `if (splitContacts.length === 0) { showToast('add at least one person', 'error'); return; }` before the division on line 2222.

### EC-02: SeasonSummary crashes when season is not found (deleted or stale route param)
- **File:Line**: `src/screens/seller/SeasonSummary.tsx:118-121`
- **What**: `season` can be `undefined` if the seasonId from route params refers to a deleted season. The component continues rendering and accesses `season.id`, `season.name`, etc.
- **How it breaks**: User navigates to SeasonSummary via deep link or back-stack after deleting the season. `stats` returns `null` (line 148 guard), but the render body accesses `season.name`, `season.emoji`, `season.isActive` directly without null checks, causing a white screen crash.
- **Fix**: Add early return after line 121: `if (!season) return <EmptyState ... />;` or navigate back with a toast.

### EC-03: SubscriptionList division by zero in totalMonthly
- **File:Line**: `src/screens/personal/SubscriptionList.tsx:587`
- **What**: `totalDueByEnd / totalMonthly` divides without guarding `totalMonthly > 0` for this specific branch. The outer `if (totalMonthly > 0)` on line 586 does guard it, but `totalMonthly` could be very small (e.g. 0.001 from a rounding artifact) producing an absurdly large `pctOfMonthly`.
- **Severity downgrade**: Actually guarded. **Reclassify as LOW**.

### EC-04: NewOrder freshOrders[0] crash on empty store
- **File:Line**: `src/screens/seller/NewOrder.tsx:531-532`
- **What**: After `addOrder()`, code reads `useSellerStore.getState().orders[0]?.orderNumber`. If `addOrder` fails silently or the store hasn't flushed, `orders[0]` could be undefined.
- **How it breaks**: Extremely unlikely with Zustand synchronous updates, but if `addOrder` throws internally (e.g., immer error on malformed data), `orders` remains empty and `orders[0]?.orderNumber` returns `undefined`. The `?.` operator prevents a crash here, but `savedOrderNumber` becomes `''` silently.
- **Fix**: Already guarded with `?.` and `|| ''`. **Reclassify as LOW**.

---

## HIGH

### EC-05: Seller Dashboard `inRange` passes non-Date to `isWithinInterval`
- **File:Line**: `src/screens/seller/Dashboard.tsx:63-64`
- **What**: `inRange` coerces `d` via `d instanceof Date ? d : new Date(d)`, but if `d` is `null`, `undefined`, or the string `"null"`, `new Date(d)` returns `Invalid Date`. `isWithinInterval` from date-fns throws `RangeError: Invalid time value` on Invalid Date.
- **How it breaks**: A rehydrated order/cost with a corrupted `date` field (e.g., stored as `null` string from a Supabase pull edge case) crashes the entire Dashboard on load -- white screen.
- **Fix**: Add `isValid` guard: `const parsed = d instanceof Date ? d : new Date(d); if (!isValid(parsed)) return false; return isWithinInterval(parsed, { start, end });`

### EC-06: WalletManagement runway calculation uses hardcoded divisor
- **File:Line**: `src/screens/personal/WalletManagement.tsx:423`
- **What**: `const months = totalBalance / Math.max(1500, 1)` -- the `Math.max(1500, 1)` is always 1500, making it a hardcoded assumption rather than a real expense calculation. This is a logic bug, not a crash.
- **How it breaks**: User with RM 300 monthly expenses sees "0.2 months runway" when they actually have 1+ month. Misleading financial advice.
- **Fix**: Replace `1500` with actual average monthly expenses from the last 3 months, or remove the specific number claim and use a qualitative statement.

### EC-07: DebtTracking `splitItems` division by zero in item-based split
- **File:Line**: `src/screens/shared/DebtTracking.tsx:2254`
- **What**: `item.amount / (item.assignedTo.length || 1)` -- the `|| 1` guard prevents div-by-zero, but line 2246-2249 already validates `assignedTo.length > 0` and returns early. However, if `item.amount` is `NaN` (user typed non-numeric), the share becomes `NaN` and propagates to all participant amounts silently.
- **How it breaks**: User types "abc" in item amount field, the parseFloat produces NaN, NaN / N = NaN, all participant amounts become NaN, debt records are corrupted.
- **Fix**: Validate `parseFloat(item.amount)` is a finite number before computing shares.

### EC-08: OrderList edit items reduce could produce NaN total
- **File:Line**: `src/screens/seller/OrderList.tsx:1337`
- **What**: `newTotal = editItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)` -- if any `unitPrice` or `quantity` is `undefined` or `NaN` (from a corrupted rehydrated order), the entire total becomes `NaN`.
- **How it breaks**: Old order from before a schema migration has `unitPrice: undefined`. User edits that order. Total shows "RM NaN". Saving persists the NaN total.
- **Fix**: Use `(i.unitPrice || 0) * (i.quantity || 0)` in the reduce.

### EC-09: Products.tsx ScrollView with `.map()` in product picker modal
- **File:Line**: `src/screens/seller/Products.tsx:1341-1448` (inside add/edit modal)
- **What**: The product picker inside the modal uses `<ScrollView>` with `filteredSortedProducts.map()` instead of FlatList.
- **How it breaks**: Seller with 200+ products opens the picker modal -- all 200 product rows render at once, causing a multi-second freeze on low-end Android devices.
- **Fix**: Replace `ScrollView + .map()` with `FlatList` with `removeClippedSubviews`, `windowSize={5}`, `maxToRenderPerBatch={10}`.

### EC-10: Dashboard multiple simultaneous modals can stack
- **File:Line**: `src/screens/seller/Dashboard.tsx:1304-1542`
- **What**: `showShopModal`, `showSlugConfirm`, `showItemsModal`, `qrModalVisible`, `showStartSheet`, and `previewLogoVisible` are independent boolean states. There is no mutex preventing two from being true simultaneously.
- **How it breaks**: Fast user taps shop link button, then immediately taps QR button. Both modals open. On iOS, stacked native Modal layers cause touch passthrough issues -- the bottom modal captures all gestures, and the top modal becomes unresponsive. User is stuck.
- **Fix**: Use a single `activeModal` enum state instead of individual booleans, or add a `closeAllModals()` call before opening any new one.

### EC-11: Customers screen `smartDateLabel` crashes on invalid date
- **File:Line**: `src/screens/seller/Customers.tsx:25-30`
- **What**: `smartDateLabel` does `new Date(date)` but doesn't check `isValid()` before calling `format()`. An invalid date string (e.g., `"null"`) causes `format()` to throw `RangeError`.
- **How it breaks**: A customer's `lastOrderDate` is rehydrated as an invalid date string. Opening the Customers tab crashes.
- **Fix**: Add `if (!isValid(d)) return '---';` after the Date construction. (Note: OrderList.tsx:148 has this guard, but Customers.tsx does not.)

---

## MEDIUM

### EC-12: BudgetPlanning defaults to possibly-nonexistent category
- **File:Line**: `src/screens/personal/BudgetPlanning.tsx:295`
- **What**: `useState(expenseCategories[0]?.id || 'food')` -- if user has deleted all expense categories and never had a 'food' category, the budget form pre-selects a non-existent category ID.
- **How it breaks**: Budget is created with `category: 'food'` but no matching category exists. The budget row shows a blank/missing category name. No crash, but confusing UI.
- **Fix**: Default to `''` and validate on submit that a real category is selected.

### EC-13: NewOrder reorder uses stale product prices without notification
- **File:Line**: `src/screens/seller/NewOrder.tsx:292-298`
- **What**: `handleReorder` looks up `currentProduct` by ID to get the latest price. If the product was deleted, `currentProduct` is `undefined`, and `item.unitPrice` from the old order is used.
- **How it breaks**: User reorders from 6 months ago. Product "Kuih Lapis" was RM 5, now costs RM 8. The reorder silently uses RM 8 (correct). But if the product was deleted, it uses the old RM 5 price with no product match. The item has `productId` pointing to a deleted product. On submit, `validItems` filter (line 497) may exclude it if `productId` is empty string, but if it's a valid-looking deleted ID, it passes through. The order saves with a ghost product reference.
- **Fix**: Show a toast when any reorder item's product is no longer found: "some items are no longer available".

### EC-14: Rapid double-tap on "confirm order" in review modal
- **File:Line**: `src/screens/seller/NewOrder.tsx:1242`
- **What**: Review modal's confirm button calls `setShowReviewModal(false); setTimeout(handleSubmit, 50)`. The `submittingRef` guard (line 511) prevents duplicate orders, but the 50ms setTimeout means there's a window where the review modal is closing and the user could tap again.
- **How it breaks**: Very fast double-tap creates the order, then `submittingRef` blocks the second. Not a data corruption issue, but the confirmation modal animation could glitch. The guard works correctly.
- **Severity**: LOW (guard works, cosmetic only).

### EC-15: Products.tsx DraggableFlatList with empty `productOrder` and filter active
- **File:Line**: `src/screens/seller/Products.tsx:1472`
- **What**: `data={reorderMode ? sortedProducts : (products.length === 0 ? products : filteredProducts)}` -- when `reorderMode` is true, it uses `sortedProducts` which ignores the current search filter. User could reorder while searching, then exit reorder mode and see unexpected order.
- **How it breaks**: User searches "kuih", enables reorder, drags items. The drag reorders the FULL product list (not filtered). New order is saved. User clears search and sees all products in the new order, but the positions of non-matching products may have shifted unpredictably.
- **Fix**: Disable reorder mode button when search is active, or use filtered list in reorder mode too.

### EC-16: FinancialPulse divides by `dayOfMonth` which could be 0 on day 1
- **File:Line**: `src/screens/personal/FinancialPulse.tsx:164`
- **What**: `Math.min(uniqueDays / Math.max(dayOfMonth, 1), 1)` -- this IS guarded with `Math.max(dayOfMonth, 1)`. Safe.
- **Severity**: Already handled. **No issue.**

### EC-17: OrderList deposit reduce could see undefined deposits array
- **File:Line**: `src/screens/seller/OrderList.tsx:3048`
- **What**: `deps.reduce((s, dep) => s + dep.amount, 0)` -- `deps` comes from a local variable that is always initialized as an array. Safe.
- **How it breaks**: If `order.deposits` is undefined (old schema), the code that builds `deps` would need to handle it. Checking the pattern at line 2054: `orders.filter((o) => bulkPayIds.includes(o.id)).reduce(...)` -- this is safe because `reduce` on empty array returns 0.
- **Severity**: LOW.

### EC-18: WalletManagement `sortedByBalance[0]` without length check
- **File:Line**: `src/screens/personal/WalletManagement.tsx:401-403`
- **What**: `sortedByBalance[0].balance / totalBalance` -- guarded by `totalBalance > 0 && sortedByBalance.length > 0` on line 402. Safe.
- **Severity**: Already handled. **No issue.**

### EC-19: PersonalDashboard `walletMap` uses `wallets[0]` type annotation only
- **File:Line**: `src/screens/personal/Dashboard.tsx:120`
- **What**: `new Map<string, typeof wallets[0]>()` -- this is a TypeScript type annotation, not a runtime access. Safe.
- **Severity**: **No issue.**

### EC-20: Multiple stores hydrate independently -- no ordering guarantee
- **File:Line**: `src/store/*.ts` (all persist configs)
- **What**: All Zustand stores use independent `persist()` middleware with `AsyncStorage`. There is no guarantee that `walletStore` hydrates before `personalStore` or vice versa. If a screen reads from both stores on mount, one may still have default/empty values.
- **How it breaks**: User opens app, Dashboard reads `transactions` (empty -- not yet hydrated) and `wallets` (hydrated). Shows "no transactions" flash before the real data appears. On slow devices, this can last 1-2 seconds, causing the user to tap "add first transaction" which then conflicts with the hydrated data.
- **Fix**: The app already handles this via skeleton loaders on the Dashboard. Acceptable behavior. **Reclassify as LOW**.

### EC-21: SeasonSummary maxQty guard prevents div-by-zero but not NaN
- **File:Line**: `src/screens/seller/SeasonSummary.tsx:179-180`
- **What**: `maxQty` defaults to 1 when `topProducts.length === 0`. However, if any `item.quantity` is `NaN` (corrupted data), `Math.max(...NaN, 1)` returns `NaN`.
- **How it breaks**: A corrupted order item with `quantity: NaN` causes the bar chart height calculations to produce NaN, resulting in invisible/broken bars.
- **Fix**: Filter out NaN values before `Math.max`: `Math.max(...topProducts.map((p) => p.qty).filter(isFinite), 1)`.

---

## LOW

### EC-22: Dashboard `momDelta` useEffect dependency is boolean-coerced
- **File:Line**: `src/screens/seller/Dashboard.tsx:447`
- **What**: `useEffect` depends on `[momDelta !== null]` -- a boolean. This means the effect only re-runs when momDelta transitions between null and non-null, not when the value changes. The spring animation won't re-trigger if momDelta changes from +10% to -5% within the same render cycle.
- **How it breaks**: No crash, but animation may not update correctly when navigating between months. Cosmetic only.
- **Fix**: Depend on `momDelta` directly.

### EC-23: NewOrder `editingQtyProductId` can reference removed item
- **File:Line**: `src/screens/seller/NewOrder.tsx:158-159`
- **What**: If the user is editing a quantity inline and the product is removed (qty goes to 0), `editingQtyProductId` still holds the old product ID. The edit input disappears because the item is filtered out, but the state is stale.
- **How it breaks**: No crash. Stale state is cleared on next interaction. Cosmetic only.

### EC-24: Customers derived data re-scans all orders on every render
- **File:Line**: `src/screens/seller/Customers.tsx` (DerivedCustomer computation)
- **What**: The customer derivation iterates all orders to build the customer list. With 3000+ orders, this is O(n) on every render.
- **How it breaks**: No crash, but noticeable lag (200-500ms) on the Customers tab with large order history.
- **Fix**: The computation is already inside `useMemo` with `[orders, sellerCustomers]` deps. Acceptable for current scale.

### EC-25: Products.tsx AnimatedProductCard runs animation on every re-render
- **File:Line**: `src/screens/seller/Products.tsx:61-90`
- **What**: `AnimatedProductCard` runs a fade-in animation on mount via `useEffect(() => { ... }, [])`. Since it's inside a `DraggableFlatList` with `removeClippedSubviews`, cards that scroll off-screen and back will re-mount and re-animate.
- **How it breaks**: No crash. Cards flicker/fade-in when scrolling back up. Cosmetic only.

### EC-26: RootNavigator dark theme detection uses hardcoded hex
- **File:Line**: `src/navigation/RootNavigator.tsx:237`
- **What**: `C.background === '#121212'` -- dark mode detection uses a hardcoded hex comparison instead of the `useIsDark()` hook.
- **How it breaks**: If `CALM_DARK.background` is ever changed from `#121212`, the navigation theme won't switch to dark mode, causing white navigation bars in dark mode.
- **Fix**: Use `useIsDark()` hook instead of hex comparison.

### EC-27: OrderList `getAvatarColor` could crash on empty name
- **File:Line**: `src/screens/seller/OrderList.tsx:274`
- **What**: `name.split('').reduce(...)` -- if `name` is empty string, `split('')` returns `[]`, reduce returns `0`, `Math.abs(0) % AVATAR_COLORS.length` = `0`. Safe, returns first color.
- **Severity**: **No issue.**

### EC-28: Dashboard `seasonBreathAnim` loop depends on `!!activeSeason`
- **File:Line**: `src/screens/seller/Dashboard.tsx:92`
- **What**: `useEffect` dep is `[!!activeSeason]`. If `activeSeason` object reference changes but remains truthy, the animation loop won't restart. This is intentional (avoid restart on every order).
- **Severity**: **No issue.**

### EC-29: Schema evolution -- old AsyncStorage missing new fields
- **File:Line**: `src/store/sellerStore.ts`, `src/store/debtStore.ts` (onRehydrateStorage)
- **What**: Stores have `onRehydrateStorage` callbacks that use `sd()` helper for date safety. However, new fields added after initial release (e.g., `deposits`, `editLog`, `source`) are not explicitly defaulted in rehydration.
- **How it breaks**: Old data loads without `deposits` field. Code that does `order.deposits.reduce(...)` would crash. However, most access patterns use `(order.deposits || [])`, e.g., line OrderList.tsx `(order.deposits || []).reduce(...)`.
- **Fix**: The `|| []` pattern is consistently applied. Acceptable.

---

## Summary

| Severity | Count | Action Required |
|----------|-------|-----------------|
| CRITICAL | 2     | Fix before next release |
| HIGH     | 7     | Fix in current sprint |
| MEDIUM   | 5     | Schedule for next sprint |
| LOW      | 8     | Track, fix opportunistically |

### Top 3 Crash Risks (fix immediately)

1. **EC-01**: DebtTracking equal split div-by-zero -- user removes all contacts then saves
2. **EC-05**: Dashboard `inRange` with Invalid Date crashes entire seller Dashboard
3. **EC-11**: Customers `smartDateLabel` throws on invalid date -- crashes Customers tab

### Top 3 Data Corruption Risks

1. **EC-07**: Split item NaN amount propagates to all debt records
2. **EC-08**: OrderList edit with corrupted unitPrice saves NaN total
3. **EC-13**: Reorder with deleted product saves ghost product reference
