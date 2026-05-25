# Potraces -- Production Readiness Audit (Business Mode: Seller)

**Date:** 2026-05-25
**Scope:** Full seller mode data flows, seller-personal boundary, Supabase sync, auth, cross-mode consistency. All 9 audit dimensions.
**Predecessor:** `AUDIT.md` (2026-04-17) -- findings marked "FIXED" there are not repeated here. This audit covers NEW findings and unfixed items from the previous audit that remain relevant.

---

## 1. Executive Summary

Potraces seller mode has solid foundational architecture -- pull-before-push sync, safe date rehydration, tombstone-aware deletion, and proper wallet reconciliation for the personal-seller transfer bridge. However, **three categories of bugs can silently corrupt financial data**: (1) ~~recordPayment allows paidAmount to exceed totalAmount with no cap~~ FIXED, (2) ~~deleteSeason cascades orders without reversing product totalSold or personal-mode transfer income~~ FIXED, and (3) seller data persists in AsyncStorage across sign-out, meaning the next user who signs in on the same device sees the previous seller's orders, products, and customers.

The sync layer is functional but has structural weaknesses: PULL_LIMIT of 999 silently drops excess records, season/customer/cost comparison uses approximate timestamps (createdAt or date field instead of updatedAt), and there is no conflict detection beyond last-write-wins. The RLS policy `seller_products_public_read` was never dropped in the security hardening migration, meaning ANY authenticated or anonymous user can read ALL sellers' active product data including cost_per_unit and stock_quantity.

**Verdict:** Not safe for public release without fixing the remaining CRITICAL findings below plus the new findings in Section 11. The app will silently produce wrong financial numbers for active sellers within days of real use.

**Update (Section 11 added):** Deep audit of order screens uncovered 3 additional CRITICAL bugs (totalAmount/validItems mismatch, stale orderNumber read, order date lost on sync), 6 HIGH issues, and 8 MEDIUM/LOW issues. See Section 11.

---

## 2. Mode Boundary Analysis

### Where Seller Meets Personal

The seller-to-personal bridge operates through `reconcileTransferIncome()` (sellerStore.ts:18-31) and `addTransferIncome()` (personalStore.ts:277-300). When a batch of paid orders is "transferred to personal," a single income transaction with id `transfer-{transferId}` is created in personalStore, optionally linked to a wallet.

**What works well:**
- `deleteOrder` correctly calls `reconcileTransferIncome` with negative delta and `removeIfEmpty: true`
- `deleteOrders` (bulk) correctly aggregates deltas per transfer batch
- `updateOrderItems` correctly reconciles the price delta when items change
- `addTransferIncome` properly adds to wallet if walletId is provided
- `deleteTransaction` in personalStore properly reverses wallet effects

**What breaks:**
- ~~`deleteSeason` (line 397-407) cascades to remove all season orders but does NOT call `reconcileTransferIncome` for any transferred orders~~ FIXED -- lines 433-441 now reverse transfer income per batch
- ~~`recordPayment` can push paidAmount past totalAmount~~ FIXED -- line 346 now caps with `Math.min`

### Data Isolation

- Wallets are shared between modes (walletStore has no mode field) -- this is by design for the transfer bridge
- Transactions in personalStore have a `mode` field but the store does not filter by it
- Categories are properly separated: categoryStore has personal vs business expense/income categories with separate overrides and ordering

---

## 3. SHIP BLOCKERS (CRITICAL)

### CRIT-1. Seller data persists across sign-out -- next user sees previous user's data

**Severity:** CRITICAL
**File:** `src/screens/shared/Settings.tsx:814-821`, `App.tsx:223-229`
**What:** Sign-out only calls `authStore.reset()` and `clearProfileCache()`. The sellerStore (products, orders, seasons, customers, costs) is NOT cleared. AsyncStorage key `seller-storage` is NOT removed.
**Scenario:** Mak Cik Siti signs out of her kuih business on her daughter's phone. Daughter signs in with her own account. She sees Mak Cik's 200 orders, 15 products, and 3 seasons. The auto-sync fires and pushes Mak Cik's local data to the daughter's Supabase account, permanently duplicating the data.
**Fix:** In the sign-out handler in Settings.tsx and in the `SIGNED_OUT` event handler in App.tsx, add:
```typescript
useSellerStore.setState({
  products: [], orders: [], seasons: [], ingredientCosts: [],
  customUnits: [], sellerCustomers: [], seenOnlineOrderIds: [],
  costTemplates: [], recurringCosts: [], costCategories: DEFAULT_COST_CATEGORIES,
  costCategoriesSeeded: false, stockAdjustments: [], productOrder: [],
  _deletedProductIds: [], _deletedOrderIds: [], _deletedSeasonIds: [],
  _deletedCustomerIds: [], _deletedCostIds: [], _deletedCostCategoryIds: [],
});
await AsyncStorage.removeItem('seller-storage');
```
Also clear businessStore, stallStore, and other business-mode stores.

### CRIT-2. ~~recordPayment does NOT cap paidAmount at totalAmount~~ FIXED

**Status:** FIXED in current codebase. Line 346 now reads `Math.min(o.totalAmount, (o.paidAmount || 0) + amount)`.

### CRIT-3. ~~deleteSeason does NOT reverse product totalSold or transfer income~~ FIXED

**Status:** FIXED in current codebase. Lines 399-441 now reverse product totalSold, stock quantities, AND transfer income per batch via `reconcileTransferIncome`.

### CRIT-4. seller_products_public_read RLS policy was never dropped

**Severity:** CRITICAL
**File:** `supabase/migrations/20260307062816_seller_schema.sql:144-145`
**What:** The original policy `create policy "seller_products_public_read" on public.seller_products for select using (is_active = true)` was noted in AUDIT.md as SEC-M2 but only described as "competitor intel leak." The security hardening migration (20260417000000) dropped `seller_profiles_public_read` but NOT `seller_products_public_read`. Any anonymous user can query ALL sellers' products including `cost_per_unit` and `stock_quantity`.
**Scenario:** Competitor runs `GET /rest/v1/seller_products?select=name,price_per_unit,cost_per_unit,stock_quantity` with the anon key and gets every seller's product costs, margins, and inventory levels.
**Fix:** Either drop the policy and replace with a scoped view (like was done for profiles), or restrict it to only columns needed for the order page: `name, price_per_unit, unit, is_active, image_url`. Add `user_id` filter tied to seller_profiles join.

### CRIT-5. PULL_LIMIT of 999 silently drops records

**Severity:** CRITICAL
**File:** `src/services/sellerSync.ts:736` (and all pull queries using `.range(0, PULL_LIMIT)`)
**What:** Every pull query uses `.range(0, 999)`. If a seller has 1000+ orders (realistic for an active seller over 6 months), the 1000th+ orders are silently ignored during pull. Worse: the push tombstone logic then sees these as "missing locally" and DELETES them from Supabase (if `updated_at < syncStart`).
**Scenario:** Active kuih seller with 1200 orders across 4 seasons. Pull fetches only 999. Push tombstone logic deletes the oldest 201 orders from Supabase. Data is permanently lost.
**Fix:** Either paginate pulls (loop until `data.length < PULL_LIMIT`), or use Supabase's count to detect truncation and warn/abort. At minimum, increase limit to 10000 and add a check: `if (data.length >= PULL_LIMIT) console.warn('TRUNCATED')`.

### CRIT-6. ~~No double-submit protection on NewOrder handleSubmit~~ FIXED

**Status:** FIXED in current codebase. Lines 507-508 now use `submittingRef.current` guard, released when the confirmation modal closes (line 543-544).

### CRIT-7. deleteOrder reads state OUTSIDE Zustand setter (stale read race)

**Severity:** CRITICAL
**File:** `src/store/sellerStore.ts:234`
**What:** `deleteOrder` calls `const order = get().orders.find(...)` OUTSIDE the `set()` callback, then uses `order` inside `set()`. If another mutation fires between the `get()` and `set()` (e.g., auto-sync updating the same order, or a rapid second delete), the `order` reference is stale. The product quantity reversal uses stale item data.
**Scenario:** Two rapid deletes: delete order A (reads state at T0), delete order B (reads state at T0). Both proceed into `set()`. Order A's deletion runs, removes A, adjusts products. Order B's `set()` runs with stale state -- it still sees the pre-A-deletion product quantities, so the stock adjustment is wrong.
**Fix:** Move the `get().orders.find()` inside the `set()` callback: `set((state) => { const order = state.orders.find(...); ... })`. Same pattern needed for `deleteOrders` (line 262) and `updateOrderItems` (line 301).

---

## 4. Week-1 Fixes (HIGH)

### HIGH-1. Multiple active seasons possible -- no guard

**Severity:** HIGH
**File:** `src/store/sellerStore.ts:378-388`
**What:** `addSeason` creates a new season with `isActive: true` but never checks if another season is already active. `getActiveSeason` returns `.find(s => s.isActive)` which returns the first match -- additional active seasons are invisible.
**Scenario:** Seller creates "Raya Season," then from PastSeasons screen creates "New Season" from template (line 129 of PastSeasons.tsx calls `addSeason` with `isActive: true`). Now two seasons are active. New orders may go to one season while the dashboard shows the other's stats.
**Fix:** In `addSeason`, auto-end any currently active season: `seasons: state.seasons.map(s => s.isActive ? { ...s, isActive: false, endDate: new Date() } : s)`.

### HIGH-2. Season sync uses createdAt as update comparison -- always overwrites

**Severity:** HIGH
**File:** `src/services/sellerSync.ts:822-828`
**What:** Comment says "Seasons don't have updatedAt locally -- compare remote updated_at with local createdAt as best approximation." Since remote `updated_at` is set by the DB trigger on every update, it will ALWAYS be newer than local `createdAt`. This means remote always wins, and local edits to season name, budget, or target are silently overwritten on every sync.
**Scenario:** Seller edits season name from "Raya" to "Raya 2026" locally. Next sync pulls the old "Raya" name from Supabase (pushed before the edit) and overwrites the local change because remote `updated_at > local createdAt`.
**Fix:** Add `updatedAt` field to Season type and sellerStore mutations. Use it for comparison in pullAll.

### HIGH-3. Same issue for customers and ingredient costs

**Severity:** HIGH
**File:** `src/services/sellerSync.ts:867-868` (customers), `src/services/sellerSync.ts:980-981` (costs)
**What:** Customers compare `remote updated_at > local createdAt`. Ingredient costs compare `remote updated_at > local date`. Both have the same always-overwrite problem as seasons.
**Fix:** Add `updatedAt` to SellerCustomer and IngredientCost types.

### HIGH-4. Floating-point accumulation in financial calculations

**Severity:** HIGH
**File:** `src/hooks/useSeasonInsights.ts:48`, `src/store/sellerStore.ts:862-863`
**What:** All income/cost sums use raw `.reduce((s, o) => s + o.totalAmount, 0)` without rounding. JavaScript floating-point: `0.1 + 0.2 = 0.30000000000000004`. Over 1000 orders, accumulated error can reach several sen.
**Scenario:** Seller has 500 orders with prices like RM 3.50, RM 7.80, RM 12.30. The running sum accumulates floating-point drift. Dashboard shows "RM 4,532.10" but season summary (different code path) shows "RM 4,532.09" due to different accumulation order.
**Fix:** Round after each reduce: `Math.round(sum * 100) / 100`. Or use a helper: `const addRM = (a, b) => Math.round((a + b) * 100) / 100`.

### HIGH-5. Net connectivity sync uses stale snapshot

**Severity:** MEDIUM (downgraded)
**File:** `App.tsx:246-251`
**What:** The connectivity recovery handler captures store state at handler fire time, but `syncAll` re-reads after `pullAll()`. The re-read at line 1191 saves this, but the pattern is fragile.

### HIGH-6. Order link orders have no seasonId -- invisible in season views

**Severity:** HIGH
**File:** `src/store/sellerStore.ts:637` (`seasonId: undefined`)
**What:** Orders from the public order link are created with `seasonId: undefined`. They don't appear in any season's order list, season stats, or season summary. But they DO appear in the global order list.
**Scenario:** Customer places 5 orders via the order link during Raya season. Seller sees them in the order list but they don't count toward season income, kept, or target progress. Seller's dashboard hero number is wrong.
**Fix:** Either auto-assign the active season's ID when an order_link order arrives, or provide UI to assign season after the fact. At minimum, show a warning badge on unassigned orders.

### HIGH-7. costTemplates only add, never update from remote

**Severity:** HIGH
**File:** `src/services/sellerSync.ts:1063-1067`
**What:** Comment says "CostTemplate has no timestamps locally for comparison, so only add new ones." If a user edits a cost template on device A, it pushes to Supabase. Device B pulls but only adds new templates -- edits to existing templates are silently ignored.
**Scenario:** Seller updates "Sugar 1kg" cost from RM 3.50 to RM 4.00 on phone. Opens app on tablet -- still shows RM 3.50.
**Fix:** Add `updatedAt` to CostTemplate type and use it for merge comparison.

### HIGH-8. Auto-sync debounce fires with potentially stale store reference

**Status:** Not an issue upon re-review. The debounce is correctly designed -- re-read after pull means push always uses latest state.

---

## 5. Tech Debt (MEDIUM / LOW)

### MED-1. clearBusinessData does not clear seller tombstone IDs

**Severity:** MEDIUM
**File:** `src/store/settingsStore.ts:427-437`
**What:** `clearBusinessData` resets seller arrays to `[]` but does not explicitly reset `_deletedProductIds`, `_deletedOrderIds`, etc. When the next user signs in and syncs, the tombstone IDs from the previous user could cause deletion of the new user's remote data if IDs happen to collide.
**Fix:** Include all tombstone arrays in the setState call.

### MED-2. Order code collision theoretically possible

**Severity:** MEDIUM
**File:** `src/store/sellerStore.ts:44-59`
**What:** `generateOrderCode` uses 23 letters x 23 letters x 10 x 10 x 10 = 529,000 possible codes. With 100 attempts, collision check is local only. If orders are split across devices, two devices could generate the same code independently.
**Fix:** Include a device-specific prefix or use the first 5 chars of a UUID.

### MED-3. Product image URIs stale after OTA update or OS cleanup

**Severity:** MEDIUM
**File:** `src/store/sellerStore.ts` (imageUrl field on products)
**What:** Product images are stored as Supabase Storage public URLs with `?t=timestamp` cache-busters. These survive across devices. However, `receiptLocalUri` for ingredient costs is a local file path that becomes invalid after app reinstall or OS temp cleanup.
**Fix:** The sync already handles this -- `receiptLocalUri` is uploaded during sync and converted to `receiptUrl`. But if the local file is cleaned before sync runs, the upload fails silently and the receipt is permanently lost.

### MED-4. storageIntegrity missing stores

**Severity:** MEDIUM
**File:** `src/services/storageIntegrity.ts:17-34`
**What:** `PERSISTED_STORE_KEYS` lists 16 keys but the codebase has 22 stores. Missing: `freelancer-storage`, `parttime-storage`, `ontheroad-storage`, `mixed-storage`, `crm-storage`, `notes-storage`. Corrupted blobs in these stores would crash silently.
**Fix:** Add the missing keys to the list.

### MED-5. personalSync wallet merge does not preserve derived balance

**Severity:** MEDIUM
**File:** `src/services/personalSync.ts:545-548`
**What:** `mergeById` for wallets uses `updatedAt` comparison. If device A adds a transaction (wallet balance changes) and device B does a separate edit (wallet name change, newer updatedAt), the merge takes B's record -- including B's older balance, overwriting A's correct balance.
**Scenario:** Device A: logs RM 50 expense, wallet balance goes from 1000 to 950. Device B (offline): renames wallet, updatedAt is newer. Sync runs: B's wallet (balance 1000, newer updatedAt) wins. Balance silently reverts to 1000. RM 50 expense exists but wallet doesn't reflect it.
**Fix:** Wallet balance is a derived value and should be computed from transactions, not stored. Or: merge wallet balance separately using max(updatedAt) per field rather than whole-record replacement.

### MED-6. Debt payment does not integrate with seller mode

**Severity:** MEDIUM
**What:** If a customer owes the seller (tracked in debtStore), paying off that debt does not create a seller order or affect season income. Debt and seller are completely separate systems with no bridge.
**Fix:** Consider adding "link to seller order" option when recording debt payment from a customer.

### MED-7. AsyncStorage 6MB limit risk for active sellers

**Severity:** MEDIUM
**File:** `src/store/sellerStore.ts` (partialize, entire store persisted)
**What:** AsyncStorage has a ~6MB limit on Android. An active seller with 2000 orders, 50 products, 500 ingredient costs, and 20 stock adjustments could approach this limit. Each order includes items array (JSONB), deposits array, customer info. The `seller-storage` key serializes everything.
**Fix:** Add monitoring (log serialized size periodically). Consider archiving old seasons' data or using a more scalable storage solution.

### LOW-1. addIngredientCost uses Date.now().toString() as ID

**Severity:** LOW
**File:** `src/store/sellerStore.ts:496`
**What:** Rapid cost additions (e.g., bulk import from template) could generate identical IDs within the same millisecond.
**Fix:** Use `newId()` consistently (which uses randomUUID).

### LOW-2. recurringCost nextDue mutation modifies Date in place

**Severity:** LOW
**File:** `src/store/sellerStore.ts:811-816`
**What:** `let nextDue = new Date(recurring.nextDue); while (nextDue <= now) { nextDue.setDate(...)` -- this mutates the Date object in place. While it works, it's not idiomatic with Immer/immutable patterns.
**Fix:** Create new Date objects in the loop.

### LOW-3. Module-level caches not cleared on sign-out

**Severity:** LOW
**File:** `src/store/sellerStore.ts:65-67` (_seasonOrdersCache, _seasonCostsCache, _seasonStatsCache), `src/store/categoryStore.ts:16-18`
**What:** Module-level caches survive sign-out. The next user's first `getSeasonStats` call could return stale data if the cache key coincidentally matches (unlikely due to ID comparison, but possible if IDs are reused across users).
**Fix:** Export a `clearSellerCaches()` function called during sign-out.

### LOW-4. order_link order deposits not typed with DepositEntry id field

**Severity:** LOW  
**File:** `src/store/sellerStore.ts:629-634`
**What:** Deposit entries from order_link orders are mapped directly from the Supabase JSONB. If the web order page doesn't include an `id` field on deposits, the local deposit entries lack IDs, which could cause issues with deposit editing/removal (which uses index-based operations, so actually OK).

---

## 6. Detailed Findings by Dimension

### Dimension 1: Data Integrity and Financial Safety

**Money math:** All financial sums use raw JS addition without rounding (HIGH-4). The `useSeasonInsights` hook, `getSeasonStats`, and Dashboard all compute income/costs via `.reduce()` with no intermediate rounding. Over hundreds of transactions, floating-point drift will cause displayed totals to disagree by 1-2 sen between different views.

**Race conditions:** `deleteOrder` (CRIT-7) reads state outside setter. `updateOrderItems` (line 301) has the same pattern. `addDebt` (debtStore.ts:28) reads state outside setter to find groupId.

**Sync conflicts:** Last-write-wins everywhere. No vector clocks, no conflict UI. personalSync mergeById takes the record with the newer `updatedAt`. sellerSync pullAll takes remote if `remote.updated_at > local.updatedAt`. No mechanism for the user to resolve conflicts.

**Date rehydration:** All stores properly use the `sd()` helper pattern. This is well-implemented.

**Partial writes:** Adding a transaction and adjusting wallet are two separate store mutations (personalStore.addTransaction + walletStore.deductFromWallet). If the app crashes between them, the transaction exists but the wallet is unchanged (or vice versa). This is an inherent limitation of the multi-store architecture.

### Dimension 2: Data Lifecycle

**Delete cascade gaps:**
- ~~`deleteSeason`: Does NOT reverse product totalSold, stock, or transfer income~~ FIXED (CRIT-3)
- `deleteProduct`: Does NOT clean up orders referencing that product. Order items retain productId pointing to a deleted product. Render attempts to look up product name -- falls back to `item.productName` which is stored on the order item (safe).
- `deleteSellerCustomer`: Does NOT clean up orders referencing that customer by name/phone. Orders store customer name/phone inline (not by reference), so this is safe.
- `deleteWallet`: Does NOT clean up transactions referencing that walletId. Transaction detail views that try to look up the wallet name will show nothing or crash depending on implementation.

**Sign-out data lifecycle (CRIT-1):** Only authStore is cleared. sellerStore, businessStore, stallStore, and all their AsyncStorage keys persist. The auto-sync subscription (`_unsubAutoSync`) is not explicitly cleaned up on sign-out (only on component unmount).

**Transfer income lifecycle:** Well-implemented for individual order operations. ~~Broken for season deletion~~ FIXED (CRIT-3).

### Dimension 3: Security and Data Isolation

**RLS gaps:**
- `seller_products_public_read` (CRIT-4): Still active, exposes all active products to anyone
- `seller_orders_customer_insert`: Allows any anonymous user to insert orders with any `seller_id` -- no rate limit, no validation of seller_id existence (noted in previous AUDIT.md as SEC-H1, still unfixed)
- Personal sync tables: All properly scoped with `auth.uid() = user_id` and rewritten with subquery pattern in RLS migration

**Data isolation between users on same device:** Broken (CRIT-1).

**Data isolation between modes:** Personal transactions have a `mode` field but it's not consistently filtered. The `addTransferIncome` function correctly tags transfers as mode `personal` with category `from business`.

**API key exposure:** Supabase anon key is in env vars, not hardcoded in source. Service role key not found in client code.

**Order page security:** Public order page (docs/index.html) uses CSP restricting connections to Supabase domain. Customer data (name, phone, address) is transmitted to Supabase and stored in seller_orders. No encryption at rest beyond Supabase defaults.

### Dimension 4: Edge Cases and Crashes

**Empty states:** `getActiveSeason` returns null safely. `useSeasonInsights` returns null if no season. Dashboard handles null season. Most `.reduce()` calls start with 0 accumulator and handle empty arrays.

**Division by zero:** `useSeasonInsights.ts:113-114` -- `avgDailyIncome = daysWithIncome > 0 ? income / daysWithIncome : 0` -- properly guarded. `targetPct = season.revenueTarget > 0 ? ... : null` -- properly guarded. `keptRate` in Dashboard uses conditional to avoid divide-by-zero.

**Rapid taps:** ~~NewOrder has no double-submit protection~~ FIXED (CRIT-6). OrderList bulk operations (markOrdersPaid, deleteOrders) also lack protection but are less likely to be double-tapped.

**Store hydration ordering:** App.tsx waits for sellerStore, settingsStore, and authStore to hydrate before proceeding. personalStore and walletStore are NOT in the wait list -- they hydrate independently. If personal sync fires before personalStore hydrates, it could push empty state. Mitigated by personalSync checking `personalSyncEnabled` (which requires settings hydration, which IS awaited).

**Schema evolution:** `onRehydrateStorage` handlers backfill missing fields (costCategories, stockAdjustments, deposits, orderNumber, etc.). Well-implemented for known migration cases. But there is no version number in persisted state -- if a future change removes a field, there's no way to detect the old schema version.

### Dimension 5: Business Logic Correctness

**Paid vs unpaid in income:** `useSeasonInsights` correctly filters by `isPaid` for income calculation (line 43). `getSeasonStats` correctly filters by `isPaid` (line 862). Dashboard `totalIncome` also correctly filters. Consistent and correct.

**Unpaid orders in totals:** `unpaidAmount` is computed separately and not included in `income`. Correct.

**Target progress:** `targetPct` is not capped at 100% -- can show >100%. This is a design choice, not a bug. But if target is 0, `targetPct` is null (line 52-53). Negative target not guarded -- would show negative percentage.

**Break-even calculation:** Correct -- iterates daily series looking for first day where cumulative income >= cumulative costs (line 91-97). Only calculates if `totalCosts > 0`.

**Product revenue in insights vs product table:** `useSeasonInsights` computes product revenue from order items (`item.unitPrice * item.quantity`), not from the product table's `pricePerUnit`. This is correct -- it uses the actual sale price, not the current price.

### Dimension 6: State Machine and Lifecycle

**Multiple active seasons:** No guard (HIGH-1). `addSeason` blindly adds with `isActive: true`. `getActiveSeason` returns first match. Second active season is invisible to most of the app.

**Order with 0 items:** Not guarded in `addOrder`. An order with empty `items` array would have `totalAmount: 0` and appear in the order list as a RM 0 order.

**Negative amounts:** `recordPayment` guards `amount <= 0` (returns early). `addToWallet` and `deductFromWallet` guard `amount <= 0`. `addIngredientCost` has no amount guard. `addOrder` has no totalAmount guard.

**Concurrent syncs:** `syncAll` has no inflight guard. Two simultaneous calls (e.g., from foreground + connectivity handlers) could run in parallel, causing duplicate pushes or tombstone races. `personalSync` has an inflight guard (line 643-644). `sellerSync` does not.

### Dimension 7: Cross-Store Number Consistency

**Season income -- 3 code paths:**
1. `useSeasonInsights` (line 48): `paidOrders.reduce((s, o) => s + o.totalAmount, 0)`
2. `getSeasonStats` (line 862): `orders.filter(o => o.isPaid).reduce((s, o) => s + o.totalAmount, 0)`
3. Dashboard (inlined): `currentOrders.filter(o => o.isPaid).reduce((s, o) => s + o.totalAmount, 0)`

All three use the same formula. Consistent. But all three are vulnerable to floating-point drift (HIGH-4) and could disagree due to intermediate rounding differences.

**Product totalSold -- 2 sources of truth:**
1. Stored on `product.totalSold` (incremented by addOrder, decremented by deleteOrder)
2. Could be computed from orders: `orders.filter(o => o.items.find(i => i.productId === pid)).reduce(...)` 

The stored value can drift from reality if ID collisions cause double-increment or if order_link orders bypass increment (see ORD-HIGH-4 in Section 11).

**Wallet balance -- stored, not computed:**
Wallet balance is stored as a number and adjusted by individual mutations. It's not computed from transaction history. If any mutation fails to adjust the wallet (partial write, crash mid-operation), the balance drifts permanently. The personalSync mergeById can overwrite local balance with remote balance, causing further drift (MED-5).

### Dimension 8: AI and External Service Trust

**Receipt scan on ingredient costs:** Cost receipt images are uploaded via `uploadReceiptImage` with 1200px width, JPEG compression. No validation of the image content. The receipt URL is stored on the cost record. If the upload fails, `receiptLocalUri` is preserved for retry on next sync.

**Order link order validation:** `addOrderLinkOrder` (line 609-644) parses `totalAmount` with `parseFloat(String(row.total_amount)) || 0` -- safe against NaN (defaults to 0). But `items` is cast directly from JSONB with no validation of item structure. A malicious order page submission could include items with negative prices or quantities.

**No rate limiting on order link:** Confirmed still unfixed from previous audit. Any anonymous user can flood a seller with orders.

### Dimension 9: Offline Resilience

**Feature offline map:**
- Creating orders: Works offline (local state + AsyncStorage persistence)
- Editing orders: Works offline
- Deleting orders: Works offline (tombstone queued)
- Creating seasons: Works offline
- Managing products: Works offline
- Receiving order_link orders: Does NOT work offline (requires Supabase realtime)
- Sync: Requires network. Pull-before-push pattern prevents data loss on reconnect.
- Auth: Sign-in requires network. Existing session persisted in AsyncStorage.

**Extended offline:** All mutations persist to AsyncStorage immediately via Zustand persist middleware. Reconnect triggers sync via connectivity listener. No queue limit -- all mutations are the full store state, not a queue of operations. This means large offline usage won't cause queue overflow.

**Token expiry offline:** `getSession()` checks `expires_at` and refreshes if within 60s of expiry. If token expires during extended offline, the next sync will fail. The `withBackoff` wrapper will retry with exponential delay. Local data is safe -- only sync is affected.

**Crash + offline:** Zustand persist writes to AsyncStorage asynchronously after each state change. A crash immediately after a mutation but before AsyncStorage write could lose the last mutation. The write is triggered by the middleware, not explicitly -- there's no "write then confirm" pattern. In practice, AsyncStorage writes are fast enough that this window is tiny.

---

## 7. What's Working Well

1. **Safe date rehydration:** The `sd()` helper pattern is consistently applied across all stores. Invalid dates default to `new Date()` instead of crashing `date-fns`.
2. **Pull-before-push sync:** `syncAll` aborts push if pull fails (line 1186-1188). This prevents the empty-local-store tombstone wipe that was LOGIC-C4 in the previous audit.
3. **Transfer income reconciliation:** The `reconcileTransferIncome` function correctly handles order edits, deletes, AND season deletion.
4. **Deduplication on rehydration:** sellerStore's `onRehydrateStorage` deduplicates orders and products by ID (lines 938-956).
5. **Tombstone-aware sync:** Both seller and personal sync properly track deleted IDs and clear them only after successful push.
6. **Wallet operation guards:** `deductFromWallet` and `addToWallet` both validate `amount > 0` and `isFinite`.
7. **Debt store payment handling:** `addPayment` properly caps `newPaidAmount` at `totalAmount` (line 136). `deletePayment` recalculates correctly. `updatePayment` recalculates correctly. Edit audit trail is maintained.
8. **recordPayment now caps paidAmount:** The `Math.min` cap was added, matching `updateDeposit` behavior.
9. **Double-submit guard on NewOrder:** `submittingRef` prevents duplicate order creation.
10. **Order page client-side protections:** Rate limiting (3 orders per 5 min), cooldown (15s), honeypot field, input length caps (`maxlength`), `_submitting` lock, CSP headers.

---

## 8. What's Missing

1. **Seller sync inflight guard:** personalSync has one (line 643); sellerSync does not.
2. **Conflict resolution UI:** No way for users to see or resolve sync conflicts. Last-write-wins silently.
3. ~~**Data export for seller mode:** No CSV/PDF export of orders, season summaries, or cost records.~~ FIXED -- SeasonSummary now has XLSX export and clipboard report.
4. **Offline indicator:** No UI telling the user they're offline and changes will sync later.
5. **Store versioning:** No schema version in persisted state for future migrations.
6. **Seller data backup before clearBusinessData:** The operation is destructive with no undo.
7. **Season assignment for order_link orders:** No UI or automatic mechanism.
8. **Rate limiting on order_link inserts:** Still unfixed from previous audit.

---

## 9. Gaps -- Areas Not Fully Audited

1. **Stall mode:** Not audited in this pass. StallStore has its own session-based data model that was out of scope.
2. **Freelancer/PartTime/OnTheRoad/Mixed modes:** Not audited. These appear to be simpler wrappers around businessStore.
3. **All 75+ screen render paths:** Only key screens (Dashboard, NewOrder, SeasonSummary, OrderList, Settings) were traced for data consumption. Other screens may have stale props, missing null guards, or incorrect data paths.
4. **AI services (chatActions, moneyChat, intentEngine):** Not fully audited for seller mode interactions. These primarily serve personal mode.
5. **Push notification content injection:** Noted in previous audit (SEC-H3), not re-verified.
6. **Edge functions (request-otp, telegram-webhook):** Not in the local codebase -- deployed on Supabase. Cannot verify current state.

---

## 10. Fix Priority Queue

### Before ANY public release (this week)
1. CRIT-1: Clear seller data on sign-out
2. ~~CRIT-2: Cap recordPayment paidAmount~~ FIXED
3. ~~CRIT-3: Reverse product/transfer effects in deleteSeason~~ FIXED
4. CRIT-4: Drop or restrict seller_products_public_read RLS
5. CRIT-5: Fix PULL_LIMIT truncation
6. ~~CRIT-6: Add double-submit guard to NewOrder~~ FIXED
7. CRIT-7: Move get() inside set() for deleteOrder/deleteOrders/updateOrderItems
8. ORD-CRIT-1: Fix totalAmount/validItems mismatch in NewOrder (Section 11)
9. ORD-CRIT-2: Fix stale orderNumber read in NewOrder (Section 11)
10. ORD-CRIT-3: Push order date field in sellerSync (Section 11)

### First week post-launch
11. HIGH-1: Guard against multiple active seasons
12. HIGH-2/3: Add updatedAt to seasons, customers, costs for proper sync comparison
13. HIGH-4: Add financial rounding helper
14. HIGH-6: Auto-assign seasonId to order_link orders
15. HIGH-7: Add updatedAt to cost templates for sync
16. ORD-HIGH-1: Fix Dashboard vs OrderList unpaid count inconsistency (Section 11)
17. ORD-HIGH-2: Fix topProducts paid-vs-all inconsistency (Section 11)
18. ORD-HIGH-3: Make handleSaveEdit atomic (Section 11)
19. ORD-HIGH-4: Order link orders bypass product totalSold/stock (Section 11)
20. ORD-HIGH-5: Undo paid does not reverse product totalSold (Section 11)
21. ORD-HIGH-6: Order page total_amount client-side tampering (Section 11)

### First month
22. MED-1: Include tombstone arrays in clearBusinessData
23. MED-4: Add missing stores to storageIntegrity
24. MED-5: Fix wallet balance merge in personalSync
25. Add seller sync inflight guard
26. Add store schema versioning
27. ORD-MED-1 through ORD-MED-5 (Section 11)

---

## 11. Deep Dive: Seller Order Screens

**Date:** 2026-05-25
**Scope:** NewOrder.tsx, OrderList.tsx, Dashboard.tsx, SeasonSummary.tsx, Customers.tsx, sellerStore.ts (order mutations), sellerSync.ts (order push/pull), docs/index.html (order page), useSeasonInsights.ts.
**Focus:** Order creation, editing, deletion, payment, transfer, sync, and cross-screen consistency.

### 11.1 Executive Summary

The order system handles the core happy path well -- creating orders, managing lifecycle status, recording partial payments (deposits), and transferring paid income to personal mode. The double-submit guard and paidAmount cap have been fixed since the initial audit. However, **three new CRITICAL bugs** were found: (1) NewOrder passes `totalAmount` computed from ALL items but only sends `validItems` (filtered subset) to the store, causing silent totalAmount inflation; (2) after `addOrder`, the saved order number reads from a stale React selector instead of the just-created order; (3) pushOrders never pushes the order `date` field, and pullAll reconstructs it from `created_at`, meaning the actual order date is permanently lost after a sync round-trip.

Cross-screen consistency has significant gaps: Dashboard and OrderList use different definitions of "unpaid orders," SeasonSummary and useSeasonInsights use different data sets for top products (all orders vs paid-only), and the period filter on OrderList prefers deliveryDate over order date, creating confusing "this month" results.

### 11.2 Order Lifecycle Map

```
                  PUBLIC ORDER PAGE                    APP (NewOrder.tsx)
                  ┌─────────────┐                      ┌──────────────┐
                  │ Customer     │                      │ Seller       │
                  │ picks items  │                      │ picks items  │
                  │ fills name   │                      │ fills name   │
                  └──────┬───────┘                      └──────┬───────┘
                         │                                     │
                  confirmSubmit()                       handleSubmit()
                  POST to Supabase                      addOrder() in store
                         │                                     │
                         │                              ┌──────┴───────┐
                  ┌──────┴───────┐                      │ Order in     │
                  │ Realtime     │──addOrderLinkOrder──>│ local store  │
                  │ subscription │                      │ seasonId:    │
                  │ OR pullAll   │                      │ from active  │
                  └──────────────┘                      │ (app) or     │
                                                        │ undefined    │
                                                        │ (order_link) │
                                                        └──────┬───────┘
                                                               │
                         ┌─────────────────────────────────────┤
                         ▼                                     ▼
                  Status Lifecycle                      Payment Lifecycle
                  pending ─> confirmed                  recordPayment()
                    ─> ready ─> delivered                  deposits array
                    ─> completed                        markOrderPaid()
                                                        updateDeposit()
                                                        removeDeposit()
                                                               │
                                                        ┌──────┴───────┐
                                                        │ isPaid=true  │
                                                        │ Transfer to  │
                                                        │ personal via │
                                                        │ SeasonSummary│
                                                        └──────────────┘
```

### 11.3 Findings

#### ORD-CRIT-1. NewOrder totalAmount includes invalid items

**Severity:** CRITICAL
**File:** `src/screens/seller/NewOrder.tsx:197` (total), `src/screens/seller/NewOrder.tsx:496-515` (handleSubmit)
**What:** The `total` variable (line 197) is computed from ALL `items` via `items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)`. In `handleSubmit`, `validItems` is a filtered subset excluding items with empty `productId` (line 496). But `addOrder` is called with `totalAmount: total` (line 515), which includes the amounts from the EXCLUDED invalid items. The order is saved with inflated totalAmount that doesn't match its items.
**Scenario:** Seller uses WhatsApp parser which adds 3 items. One item fails to match a product, getting `productId: ''` and `unitPrice: 0`. The valid 2 items total RM 25. `total` includes the zero-price invalid item so it stays RM 25 -- harmless in this case. But if the AI parser assigns a non-zero `unitPrice` to a non-matched product (e.g., from the message text), and the item has an empty `productId`, it gets filtered from `validItems` but its price is still in `total`. Order shows RM 35 but items only sum to RM 25. Season income inflated by RM 10 per such order.
**Fix:** Compute total from validItems, not from all items:
```typescript
const validItems = items.filter(i => i.productId && i.productId.trim() !== '');
const actualTotal = validItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
addOrder({ ...rest, items: validItems, totalAmount: actualTotal });
```

#### ORD-CRIT-2. Stale orderNumber read after addOrder

**Severity:** CRITICAL
**File:** `src/screens/seller/NewOrder.tsx:526`
**What:** After `addOrder()`, line 526 reads `orders[0]?.orderNumber` to set `savedOrderNumber`. But `orders` is a React selector subscribed via `useSellerStore((s) => s.orders)`. Zustand's `set()` is synchronous, updating the store immediately -- but React's selector re-render hasn't fired yet. The `orders` array in the component's closure is the PREVIOUS render's value. So `orders[0]` points to the PREVIOUS first order, not the just-created one.
**Scenario:** Seller creates order. The confirmation modal shows the PREVIOUS order's order number (e.g., "KH-723" instead of "ML-481"). Seller copies the wrong order number to share with the customer. Customer references wrong order. Confusion and potential payment applied to wrong order.
**Fix:** Read directly from the store after mutation:
```typescript
addOrder({ ... });
const freshOrders = useSellerStore.getState().orders;
setSavedOrderNumber(freshOrders[0]?.orderNumber || '');
```

#### ORD-CRIT-3. Order date lost on sync round-trip

**Severity:** CRITICAL
**File:** `src/services/sellerSync.ts:352-372` (pushOrders), `src/services/sellerSync.ts:908` (pullAll)
**What:** `pushOrders` maps order fields to the Supabase row but does NOT include the order's `date` field. The `seller_orders` table has no `date` or `order_date` column -- only the auto-generated `created_at`. When `pullAll` reconstructs the order, it maps `date: sd(ro.created_at)` (line 908). Since `created_at` is when the Supabase record was created (during push), not when the order was originally placed, orders that were created offline and synced later will show the sync date instead of the original date.
**Scenario:** Seller takes 10 orders at a Saturday morning market (offline). On Monday, she connects to WiFi and sync runs. All 10 orders get `created_at` = Monday. She opens the app on her tablet -- pullAll maps all orders to Monday's date. The Saturday orders are now dated Monday. Daily breakdown, "today's came in," and delivery scheduling are all wrong. On the original phone, the local `date` is correct until the next pullAll overwrites it.
**Fix:** (a) Add a `date` / `order_date` column to `seller_orders` table. (b) Push `o.date` in the upsert row: `date: toIso(o.date)`. (c) Pull with `date: sd(ro.date || ro.created_at)`.

#### ORD-HIGH-1. Dashboard vs OrderList unpaid count inconsistency

**Severity:** HIGH
**File:** `src/screens/seller/Dashboard.tsx:112-114`, `src/screens/seller/OrderList.tsx:905-906`
**What:** Dashboard computes `unpaidOrders` by filtering `!o.isPaid && o.status !== 'pending' && o.status !== 'confirmed'` -- excluding pending and confirmed orders from the unpaid count. OrderList's `paymentFilter === 'unpaid'` simply filters `!o.isPaid` -- including ALL unpaid orders regardless of status. When Dashboard shows "3 unpaid" and navigates to OrderList with `initialFilter: 'unpaid'`, the list may show 7 orders (including 4 pending/confirmed ones).
**Scenario:** Seller sees "3 unpaid" on Dashboard, taps it, and OrderList shows 7 unpaid orders. Seller thinks the numbers are wrong and loses trust in the app. Or worse: seller thinks only 3 orders need payment collection when actually 7 do.
**Fix:** Either align the filters (Dashboard should count all `!isPaid`, or OrderList should match Dashboard's exclusion), or add a visual distinction in OrderList showing which unpaid orders are still pending/confirmed vs ready/delivered.

#### ORD-HIGH-2. SeasonSummary topProducts uses ALL orders, useSeasonInsights uses only paid

**Severity:** HIGH
**File:** `src/screens/seller/SeasonSummary.tsx:158` (iterates `seasonOrders` -- all orders), `src/hooks/useSeasonInsights.ts:119` (iterates `paidOrders` only)
**What:** SeasonSummary's `stats.topProducts` counts revenue from ALL season orders (paid + unpaid) at line 158: `for (const order of seasonOrders)`. But `useSeasonInsights`'s `topProducts` at line 119 only counts paid orders: `for (const o of paidOrders)`. These are shown on different screens (SeasonSummary vs Dashboard insights panel). The numbers will disagree whenever there are unpaid orders.
**Scenario:** Season has 20 paid orders and 5 unpaid orders. SeasonSummary shows "Kuih Lapis - RM 800, 50 units" (including unpaid). Dashboard insights shows "Kuih Lapis - RM 650, 40 units" (paid only). Seller sees different "top product" numbers on two screens and thinks the data is corrupted.
**Fix:** Align both to use the same filter. Recommendation: use paid-only for both (since unpaid revenue hasn't actually been received), and add a note "(from paid orders)" to the label.

#### ORD-HIGH-3. handleSaveEdit is non-atomic -- two separate store mutations

**Severity:** HIGH
**File:** `src/screens/seller/OrderList.tsx:1366-1371`
**What:** When editing an order, `handleSaveEdit` calls `updateOrderItems(id, editItems)` (line 1367) then `updateOrder(id, updates)` (line 1371) as two separate store mutations. `updateOrderItems` recalculates `totalAmount` and adjusts product quantities. `updateOrder` applies metadata changes. If the component unmounts or an error occurs between the two calls, the order has new items/total but old metadata (or vice versa). Also, each mutation triggers a separate AsyncStorage write and a separate sync debounce.
**Scenario:** Seller edits order items AND marks delivery date. `updateOrderItems` succeeds, adjusting product stock. App crashes before `updateOrder`. On relaunch, the order has new items but no delivery date. More critically: the auto-sync fires between the two mutations, pushing the partially-updated order to Supabase.
**Fix:** Merge both operations into a single store mutation: `updateOrderWithItems(id, { items, ...otherUpdates })` that atomically applies items, recalculates total, adjusts products, and applies metadata.

#### ORD-HIGH-4. Order link orders do NOT increment product totalSold or adjust stock

**Severity:** HIGH
**File:** `src/store/sellerStore.ts:644-679` (`addOrderLinkOrder`)
**What:** `addOrderLinkOrder` creates the order object and prepends it to `orders`, but it does NOT update `products` array. Compare with `addOrder` (line 130-161) which increments `totalSold` and decrements `stockQuantity` for each order item's matching product. This means online orders don't affect product sales counts or stock tracking.
**Scenario:** Seller has "Kuih Seri Muka" with stock=50. Customer orders 10 via order link. Stock still shows 50. Seller takes another in-person order for 45. Stock goes to 5. But actual remaining stock is -5 (oversold by 10). Product's `totalSold` also understates actual sales.
**Fix:** In `addOrderLinkOrder`, add product updates matching `addOrder` logic:
```typescript
const updatedProducts = state.products.map((p) => {
  const item = newOrder.items.find((i) => i.productId === p.id);
  if (item) {
    const updates = { ...p, totalSold: p.totalSold + item.quantity, updatedAt: new Date() };
    if (p.trackStock && p.stockQuantity != null) {
      updates.stockQuantity = Math.max(0, p.stockQuantity - item.quantity);
    }
    return updates;
  }
  return p;
});
return { orders: [newOrder, ...state.orders], products: updatedProducts };
```

#### ORD-HIGH-5. "Undo paid" does not reverse any product effects

**Severity:** HIGH
**File:** `src/screens/seller/OrderList.tsx:1383-1401`
**What:** `handleUndoPaid` calls `updateOrder(order.id, { isPaid: false, _resetPayments: true })`. This resets `isPaid`, `deposits`, and `paidAmount` but does NOT touch product `totalSold` or `stockQuantity`. The original `addOrder` already incremented `totalSold` when the order was created -- undoing payment doesn't undo the creation. This is actually CORRECT behavior (undo paid != undo order creation).
**Revised:** On re-analysis, this is NOT a bug. Product effects are tied to order creation/deletion, not payment status. "Undo paid" correctly only resets payment fields. The `isPaid` filter in income calculations correctly excludes this order from income totals after undo.

**Status:** NOT A BUG -- removing from findings.

#### ORD-HIGH-6. Order page total_amount computed client-side, can be tampered

**Severity:** HIGH
**File:** `docs/index.html:791` (`total_amount:t`)
**What:** The order page's `confirmSubmit()` sends `total_amount: t` where `t` is computed client-side as `total()`. A malicious actor can modify the JavaScript variable or intercept the request to send a different total. The seller app trusts this value -- `addOrderLinkOrder` uses `parseFloat(String(row.total_amount)) || 0` with no server-side validation against the items.
**Scenario:** Attacker orders 10 kuih at RM 5 each (RM 50 total) but modifies the POST to send `total_amount: 5`. Seller sees the order with "RM 5" and 10 items. If she doesn't check the math, she marks it paid for RM 5. Season income is understated by RM 45.
**Fix:** Either: (a) server-side Edge Function that validates `total_amount = sum(items[].quantity * price_per_unit)` by looking up current prices, or (b) the seller app's `addOrderLinkOrder` should recompute total from items: `totalAmount: items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)` and flag discrepancies.

#### ORD-MED-1. Period filter prefers deliveryDate over order date

**Severity:** MEDIUM
**File:** `src/screens/seller/OrderList.tsx:912`
**What:** The period filter uses `const raw = o.deliveryDate || o.date` -- preferring deliveryDate when present. This means "this month" shows orders by delivery date, not creation date. An order created in April with a May delivery date appears in May's filter, not April's.
**Scenario:** Seller created 5 orders in April for May delivery. In May, she taps "this month" expecting to see May orders. She sees April's orders (because their delivery is in May). She can't easily find orders she actually created this month.
**Fix:** Either: (a) use order date consistently for period filter (deliveryDate for a separate "delivery this month" filter), or (b) add a toggle "filter by: order date / delivery date" to make the behavior explicit.

#### ORD-MED-2. deleteOrderFromSupabase failure silently ignored

**Severity:** MEDIUM
**File:** `src/screens/seller/OrderList.tsx:1148`
**What:** `deleteOrderFromSupabase(order.supabaseId).catch(() => {})` -- the error is silently swallowed. If the Supabase delete fails (network error, RLS denial), the order is deleted locally but persists remotely. On next pullAll, the remote order will be re-added to local state, appearing to "come back from the dead."
**Scenario:** Seller deletes an order_link order while briefly offline. Local delete succeeds. The `.catch(() => {})` swallows the network error. On reconnect, pullAll fetches the still-existing remote order and adds it back. Seller deletes it again. Same thing happens. Order is effectively undeletable until the seller has stable network.
**Fix:** Queue the delete and retry on next sync, or at minimum warn the user: `.catch(() => showToast('will retry delete on next sync', 'warning'))`.

#### ORD-MED-3. Customers screen derives totalSpent from ALL orders, not paid-only

**Severity:** MEDIUM
**File:** `src/screens/seller/Customers.tsx:36` (DerivedCustomer type)
**What:** The Customers screen computes `totalSpent` as the sum of all order amounts for a customer (paid + unpaid). This means a customer with RM 500 in orders but only RM 200 paid shows "RM 500 spent" which is misleading -- they haven't actually spent RM 500 yet. (Note: the computation is in the parent component that builds DerivedCustomer objects, not shown in the visible code, but the type includes `totalSpent: number` and `unpaidAmount: number` as separate fields.)
**Fix:** Rename `totalSpent` to `totalOrdered` and add a separate `totalPaid` field, or filter to paid-only for `totalSpent`.

#### ORD-MED-4. SeasonSummary topProducts groups by productName, not productId

**Severity:** MEDIUM
**File:** `src/screens/seller/SeasonSummary.tsx:160`
**What:** `productCounts[item.productName]` uses product name as the grouping key. If a seller renames a product (e.g., "Kuih Lapis" to "Kuih Lapis Pandan"), orders before and after the rename are counted as separate products in the top products list. Compare with `useSeasonInsights.ts:121` which uses `item.productId || item.productName` -- correctly grouping by ID.
**Scenario:** Seller renames "Kuih Sago" to "Sago Gula Melaka" mid-season. SeasonSummary shows both as separate entries with split quantities and revenue, making neither appear as a "top product." useSeasonInsights correctly groups them under the same productId.
**Fix:** Use `item.productId || item.productName` as the key, matching useSeasonInsights.

#### ORD-MED-5. Order page stores Supabase anon key in client-side JavaScript

**Severity:** MEDIUM
**File:** `docs/index.html:459`
**What:** `var SB_KEY='eyJhbG...'` -- the Supabase anon key is embedded directly in the public HTML. While anon keys are designed to be public (RLS provides the security boundary), this key combined with the permissive `seller_orders_customer_insert` RLS policy allows unlimited anonymous order insertion without authentication. The key also grants read access to all tables via `seller_products_public_read`.
**Scenario:** Attacker extracts the key and writes a script to insert thousands of orders for any seller_id, flooding sellers with spam orders. Combined with CRIT-4 (products publicly readable), attacker can enumerate all sellers and target them.
**Fix:** The anon key itself is fine, but: (a) fix CRIT-4 to restrict product reads, (b) add server-side rate limiting on order inserts per IP/seller_id, (c) consider requiring a CAPTCHA or proof-of-work for order submission.

#### ORD-LOW-1. AnimatedKeptAmount displays with toFixed(0) -- no decimal places

**Severity:** LOW
**File:** `src/screens/seller/SeasonSummary.tsx:92`
**What:** `setDisplayText(`${currency} ${v.toFixed(0)}`)` -- the animated "kept" amount on SeasonSummary shows whole numbers only (e.g., "RM 4532"). Other screens show "RM 4,532.10" with 2dp. Minor inconsistency. The animation is cosmetic and the final resting value matches the non-animated display.
**Fix:** Use `toFixed(2)` for consistency, or keep `toFixed(0)` and document it as intentional "hero number" styling.

#### ORD-LOW-2. Order page "Order Again" resets all fields but keeps local history

**Severity:** LOW
**File:** `docs/index.html:853-866`
**What:** `orderAgain()` resets cart and form fields but the name/phone/address are not pre-filled from the previous order. The customer has to re-enter their details. History is saved in `localStorage` (max 20 entries) but the history items don't include phone/address -- only items, total, name, and time.
**Fix:** Consider pre-filling name from the last order in history: `document.getElementById('cname').value = getHistory()[0]?.name || ''`.

#### ORD-LOW-3. Order page does not validate customer phone format

**Severity:** LOW
**File:** `docs/index.html:771`
**What:** Customer phone is sent raw to Supabase with only `slice(0, 20)` length cap. No validation of Malaysian phone format. The seller app's WhatsApp integration (OrderList.tsx:1239-1241) normalizes `0` prefix to `60`, but if the customer enters `+60123456789` or `60-123-456789`, the normalization may not handle all formats.
**Fix:** Add client-side normalization: strip non-digits, validate starts with `01` or `60`, reject obviously invalid lengths.

### 11.4 What's Working Well (Order-Specific)

1. **Deposit system is robust:** `updateDeposit` caps paidAmount at totalAmount (line 187). `removeDeposit` correctly recalculates totals. `markOrderPaid` correctly handles remaining balance after deposits. Edit history is maintained.
2. **Order deduplication:** `addOrderLinkOrder` checks `state.orders.some((o) => o.supabaseId === id)` before adding. Realtime and pull-based ingestion both use this guard.
3. **Transfer bridge correctness:** `updateOrderItems` correctly reconciles transfer income when items change (line 334). `deleteOrder` correctly reverses transfer income (line 256-258). `deleteOrders` correctly aggregates per transfer batch (line 291-297).
4. **Product quantity tracking on delete:** Both `deleteOrder` and `deleteOrders` correctly reverse `totalSold` and `stockQuantity` for each item.
5. **Settled order edit warning:** `handleStartEdit` (line 1300) warns before editing a paid+delivered order, preventing accidental modification of settled records.
6. **Order page rate limiting:** Client-side rate limit of 3 orders per 5 minutes with 15-second cooldown between submissions. Honeypot field for basic bot detection.
7. **XSS prevention on order page:** `escH()` (textContent-based) and `escA()` (attribute escaping) used consistently for all user-supplied data in innerHTML. CSP header restricts script sources.
8. **XLSX export:** SeasonSummary includes a comprehensive export with summary sheet and detailed orders sheet, with proper date formatting and file sharing.

### 11.5 What's Broken

1. **totalAmount/validItems mismatch** (ORD-CRIT-1): Orders can have totalAmount that doesn't match item sum.
2. **Stale orderNumber read** (ORD-CRIT-2): Confirmation modal shows wrong order number.
3. **Order date lost on sync** (ORD-CRIT-3): Offline orders get wrong dates after sync.
4. **Unpaid count disagrees** (ORD-HIGH-1): Dashboard and OrderList show different unpaid counts.
5. **Top products disagrees** (ORD-HIGH-2): SeasonSummary and Dashboard use different data sets.
6. **Non-atomic order edit** (ORD-HIGH-3): Two mutations can diverge if interrupted.
7. **Order link bypasses stock** (ORD-HIGH-4): Online orders don't update product metrics.
8. **Client-side total tampering** (ORD-HIGH-6): Malicious customer can set any total.

### 11.6 What's Missing

1. **Order date column in Supabase:** No dedicated `date`/`order_date` column -- must be added (ORD-CRIT-3).
2. **Atomic multi-field order update:** No single mutation for items + metadata changes.
3. **Server-side order total validation:** No Edge Function to verify total_amount against item prices.
4. **Order edit history:** Unlike debt payments, order edits do NOT maintain an edit audit trail. A seller who changes an order's items or customer info has no record of what changed.
5. **Bulk season assignment for order_link orders:** No UI to assign existing unassigned orders to a season.
6. **Customer phone normalization:** Inconsistent handling of Malaysian phone formats across screens and the order page.
7. **Delivery date on order page:** The web order page has no delivery date field -- all scheduling must be done manually after order receipt.

---

## 12. Cross-System Ripple Analysis

**Date:** 2026-05-25
**Scope:** Second-pass audit tracing how each order bug from Section 11 propagates through every screen, store, sync layer, and cross-mode boundary in the app.

### 12.1 Executive Summary

The order system is the financial spine of seller mode. Every order bug amplifies through at least 5 downstream consumers. The worst finding: **ORD-CRIT-1 (inflated totalAmount) propagates silently into 11 different displays, the transfer bridge to personal mode, the XLSX export, the clipboard report, and the sync layer -- meaning the wrong number reaches the seller's accountant, her personal dashboard, her husband's phone (via sync), AND tax records.** No single screen catches or flags the discrepancy because every consumer trusts `order.totalAmount` as the source of truth.

Combined blast radius across all 12 traced bugs: **19 screens or components show wrong numbers, 4 cross-mode data flows carry corrupted values, 2 sync paths propagate corruption to other devices, and 1 public export (XLSX) bakes wrong numbers into a file the seller may share with LHDN (Malaysian tax authority).**

The sign-out data persistence bug (CRIT-1) acts as a **corruption amplifier** -- any data bug affecting User A's session is inherited by User B and then pushed to User B's Supabase account, permanently contaminating a second user's data.

### 12.2 Ripple Maps

#### 12.2.1 ORD-CRIT-1: totalAmount Inflated (doesn't match item sum)

**Source:** `NewOrder.tsx:197,515` -- `total` computed from ALL items, `validItems` is a filtered subset, but `addOrder` receives `totalAmount: total`.

**Upstream amplifiers:**
- AI WhatsApp parser assigning non-zero unitPrice to unmatched products (productId='') makes this more likely
- No server-side validation on the order page (ORD-HIGH-6) means order_link orders could also have mismatched totals from a different vector

**Downstream victims (11 consumers of `order.totalAmount`):**

| # | Consumer | File:Line | What's wrong | Silent? |
|---|----------|-----------|-------------|---------|
| 1 | Dashboard hero "kept" | Dashboard.tsx:107-109 | totalIncome inflated -> kept inflated | YES - no cross-check |
| 2 | Dashboard "came in" breakdown | Dashboard.tsx:1256 | Shows inflated income | YES |
| 3 | Dashboard unpaid total | Dashboard.tsx:121 | If order is unpaid, unpaidTotal inflated | YES |
| 4 | Dashboard MoM delta | Dashboard.tsx:306-309 | Compared against previous month -- delta wrong | YES |
| 5 | Dashboard collection rate | Dashboard.tsx:316 | totalOrderValue inflated -> collection rate wrong | YES |
| 6 | useSeasonInsights income | useSeasonInsights.ts:48 | `paidOrders.reduce(s + o.totalAmount)` -- season income wrong | YES |
| 7 | useSeasonInsights target % | useSeasonInsights.ts:52-53 | Target progress overstated | YES |
| 8 | useSeasonInsights break-even | useSeasonInsights.ts:89-97 | Break-even reached too early | YES |
| 9 | getSeasonStats income | sellerStore.ts:897 | Cached stats wrong -- used by PastSeasons cards | YES |
| 10 | SeasonSummary kept/income | SeasonSummary.tsx:151 | `paidOrders.reduce(s + o.totalAmount)` wrong | YES |
| 11 | SeasonSummary XLSX export | SeasonSummary.tsx:391 | `o.totalAmount` baked into spreadsheet -- shared with accountant | YES -- in a FILE |
| 12 | SeasonSummary clipboard report | SeasonSummary.tsx:329 | `stats.totalIncome.toFixed(2)` wrong | YES -- in COPIED TEXT |
| 13 | Customers screen totalSpent | Customers.tsx:576 | `entry.totalSpent += order.totalAmount` (paid) -- customer value inflated | YES |
| 14 | Customers screen unpaidAmount | Customers.tsx:579 | `entry.unpaidAmount += order.totalAmount` (unpaid) -- outstanding inflated | YES |
| 15 | explainSellerMonth | explainSellerMonth.ts:14 | totalIncome wrong -> cost ratio wrong -> wrong observation text | YES |
| 16 | Transfer to personal | SeasonSummary.tsx:268-291 | `untransferredAmount` inflated -> personal income transaction inflated | YES -- CROSSES MODE BOUNDARY |
| 17 | Sync to Supabase | sellerSync.ts:360 | `total_amount: o.totalAmount` pushed wrong -> all devices get wrong value | YES -- CROSSES DEVICE BOUNDARY |

**Cross-mode contamination:** When the seller transfers paid income to personal mode, `untransferredOrders.reduce(s + o.totalAmount)` includes the inflated total. The personal mode `addTransferIncome` creates a transaction with the inflated amount. This transaction then appears on the personal Dashboard as income, inflates the personal monthly total, and if the seller has a budget, incorrectly increases the "income this month" figure. If personal sync is enabled, the inflated transaction is also pushed to Supabase personal tables.

**Severity upgrade:** CRITICAL remains CRITICAL -- but blast radius is 10x wider than initially assessed.

---

#### 12.2.2 ORD-CRIT-2: Stale orderNumber in Confirmation

**Source:** `NewOrder.tsx:526` -- reads `orders[0]?.orderNumber` from stale React closure.

**Downstream victims:**
- Confirmation modal shows wrong order number
- If seller copies the confirmation text to send to customer (line 547-549), customer has wrong order reference
- Customer calls about "order KH-723" but it is actually ML-481 -- seller searches wrong order, applies payment to wrong order
- If seller uses the order number to communicate delivery info, wrong customer receives delivery details

**Cross-system:** Limited to UX confusion. No data corruption beyond the wrong order being referenced in conversation.

**Severity:** Stays CRITICAL -- customer-facing wrong information in a financial transaction.

---

#### 12.2.3 ORD-CRIT-3: Order Date Lost on Sync

**Source:** `sellerSync.ts:352-372` (pushOrders omits `date` field), `sellerSync.ts:908` (pullAll maps `date: sd(ro.created_at)`).

**Upstream amplifiers:**
- Extended offline use (3 days at pasar) makes this MUCH worse -- all orders get the reconnection date
- CRIT-5 (PULL_LIMIT 999) can cause orders to be re-pulled after tombstone deletion, getting fresh `created_at` timestamps each time

**Downstream victims (every date-based filter and display):**

| # | Consumer | File:Line | What's wrong |
|---|----------|-----------|-------------|
| 1 | Dashboard "this month" filter | Dashboard.tsx:93-94 | `inRange(o.date, monthStart, monthEnd)` -- Saturday orders appear in Monday's month if sync happened across month boundary |
| 2 | Dashboard "today's came in" | Dashboard.tsx:214-221 | `isToday(o.date)` -- Saturday orders show as "today" on Monday after sync |
| 3 | Dashboard 7-day sparkline | Dashboard.tsx:321-332 | `isSameDay(od, d)` -- orders clumped on sync day instead of spread across actual days |
| 4 | Dashboard delivery urgency | Dashboard.tsx:167-192 | deliveryDate is separate and survives, but if `date` is used for aging (line 202-203), aging is wrong |
| 5 | Dashboard unpaid aging | Dashboard.tsx:195-209 | `differenceInDays(today, startOfDay(d))` -- aging bins wrong. A 7-day-old unpaid order shows as "today" |
| 6 | useSeasonInsights daily series | useSeasonInsights.ts:57-69 | `format(o.date, 'yyyy-MM-dd')` -- all offline orders land on same day in the daily chart |
| 7 | useSeasonInsights bestDay | useSeasonInsights.ts:99-105 | Best day is the sync day (artificially high), not the actual best sales day |
| 8 | useSeasonInsights vsAverage | useSeasonInsights.ts:112-116 | avgDailyIncome skewed -- all income concentrated on sync day |
| 9 | OrderList period filter | OrderList.tsx:912 | `o.deliveryDate OR o.date` -- if no deliveryDate, uses the wrong sync date |
| 10 | SeasonSummary order list sort | SeasonSummary.tsx:124-130 | Orders sorted by date -- all offline orders clustered together instead of chronological |
| 11 | XLSX export date column | SeasonSummary.tsx:386 | `format(o.date, 'dd/MM/yyyy')` -- exported dates are wrong |
| 12 | Customers lastOrderDate | Customers.tsx:582-585 | `if (orderDate > entry.lastOrderDate)` -- last order date is sync date, not real date |
| 13 | explainSellerMonth | explainSellerMonth.ts:7-11 | Receives date-filtered orders -- wrong orders included/excluded |
| 14 | Season weekly sparkline | Dashboard.tsx:136-146 | `isSameDay(o.date, d)` for season orders -- same clustering problem |
| 15 | Top customer "this month" | Dashboard.tsx:342-353 | `currentOrders` based on wrong dates -- wrong customer shown |

**Cross-mode contamination:** The transfer income transaction in personalStore uses `transfer.date = new Date()` (from `createTransfer` in `transferBridge.ts:18`), so the personal-side date is correct (it is the transfer date, not the order date). However, if the seller checks "when did this income come in" on the personal side, it shows the transfer date (correct), but if she cross-references with the seller side's order dates, they disagree.

**Compound with CRIT-5:** If PULL_LIMIT drops some orders, and on next sync those orders are tombstone-deleted from Supabase, and then re-created via a third-device sync -- the orders get BRAND NEW `created_at` values. The dates are now completely fictional.

**Severity upgrade:** CRITICAL -> **CRITICAL+** -- this is arguably the highest-impact bug because it silently corrupts the TIME DIMENSION of ALL financial data.

---

#### 12.2.4 ORD-HIGH-1: Dashboard vs OrderList Unpaid Count Disagree

**Source:** Dashboard.tsx:112-114 excludes `pending` and `confirmed` from unpaid count. OrderList uses `!o.isPaid` for all.

**Downstream victims:**
- Dashboard "3 unpaid" card navigates to OrderList showing 7 -- user confusion
- Dashboard unpaid AMOUNT (`unpaidTotal` at line 121) also excludes pending/confirmed orders, so it is lower than the true outstanding
- `explainSellerMonth.ts:17` uses `orders.filter(o => !o.isPaid)` (no status exclusion) -- observation text says "7 orders still unpaid" while Dashboard says 3

**Cross-system:** The Customers screen's `unpaidAmount` (Customers.tsx:578-579) counts ALL unpaid regardless of status, matching OrderList but NOT Dashboard. Three screens, two different definitions of "unpaid."

**New finding (RIPPLE-NEW-1):** The `unpaidAging` computation on Dashboard (line 196) uses `orders.filter(o => !o.isPaid)` -- ALL unpaid, not the filtered subset. So the aging breakdown at the bottom of Dashboard counts 7 orders, but the hero card above it says 3. **The same screen contradicts itself.**

---

#### 12.2.5 ORD-HIGH-2: SeasonSummary vs useSeasonInsights topProducts

**Source:** SeasonSummary.tsx:157 uses ALL orders. useSeasonInsights.ts:119 uses paid-only.

**Additional inconsistency found:** SeasonSummary groups by `item.productName` (line 160), useSeasonInsights groups by `item.productId || item.productName` (line 121). If a product is renamed mid-season, SeasonSummary splits it into two entries while useSeasonInsights correctly groups them.

**Downstream:** SeasonSummary's `topProducts` drives the clipboard report (line 334) and XLSX export (line 378). So the exported/shared data uses the wrong (all-orders, name-grouped) numbers.

---

#### 12.2.6 ORD-HIGH-3: Non-Atomic Order Edit

**Source:** `OrderList.tsx:1366-1371` -- two separate mutations for items + metadata.

**Downstream:** Auto-sync debounce fires between the two mutations. The partially-updated order (new items, old metadata OR old items, new metadata) is pushed to Supabase. On the seller's other device, pullAll retrieves this partial state and overwrites the local copy. Even if the first device eventually pushes the complete update, a brief window exists where Device B has inconsistent data.

**Compound with HIGH-4 (floating-point):** If `updateOrderItems` recomputes totalAmount with floating-point drift, and then `updateOrder` pushes metadata, the order on Supabase has drifted totalAmount but the metadata push does not touch totalAmount -- so the drift persists.

---

#### 12.2.7 ORD-HIGH-4: Order Link Orders Don't Update Product Stock/totalSold

**Source:** `sellerStore.ts:644-679` -- `addOrderLinkOrder` does not touch `products` array.

**Downstream victims:**

| # | Consumer | What's wrong |
|---|----------|-------------|
| 1 | Products screen stock display | Stock shows higher than actual (online sales not deducted) |
| 2 | Products screen totalSold | Understated -- misses all online sales |
| 3 | Low stock warnings | Never trigger for online-only demand |
| 4 | Season template price lookup | `useSeasonTemplate` (sellerStore.ts:509-526) looks at order items for last-used price, but product.totalSold used elsewhere does not reflect online orders |
| 5 | Stock adjustment math | `addStockAdjustment` reads `product.stockQuantity` which is too high, so adjustments are based on wrong baseline |

**Compound with CRIT-5 (PULL_LIMIT):** If online orders are the ones dropped by the 999 limit (they are fetched separately but still count toward the seller's total), the product stock is NEVER adjusted for those orders. When tombstone deletion removes them from Supabase, those orders are permanently lost AND the stock was never corrected.

**Compound with CRIT-3 (deleteSeason):** `deleteSeason` reverses `totalSold` for all orders in the season. But order_link orders have `seasonId: undefined` -- they are NOT in any season. So deleting a season never touches their (non-existent) stock impact. This is "correct" in that online orders never affected stock, but it means the reversal is asymmetric: app orders affect stock on create AND on season delete; online orders affect stock NEVER.

---

#### 12.2.8 ORD-HIGH-6: Client-Side Total Tamperable

**Source:** `docs/index.html:791` -- total_amount sent from client JavaScript.

**Downstream:** The tampered total flows into `addOrderLinkOrder` -> `order.totalAmount`. From there, it hits ALL 17 consumers listed in 12.2.1. The attack surface is: anyone with the shop URL can inject an order with an arbitrary total that silently corrupts the seller's financial records.

**Compound with ORD-CRIT-1:** Even if the seller creates the order via the app (not order_link), the totalAmount can STILL be wrong due to the validItems bug. These are two independent vectors producing the same corruption.

---

#### 12.2.9 CRIT-1: Seller Data Persists Across Sign-Out

**Source:** `Settings.tsx:814-821` -- only resets authStore, not sellerStore.

**The amplifier effect:** CRIT-1 is not just a bug -- it is a **corruption multiplier**. Every other bug in this list becomes worse because:

1. User A has ORD-CRIT-1 (inflated totals) in their data
2. User A signs out -- data persists in AsyncStorage
3. User B signs in on the same device
4. User B's sellerSync fires, pushing User A's corrupted data to User B's Supabase account
5. User B now has User A's corrupted orders, products, customers, and seasons -- permanently
6. If User B also uses a second device, the corrupted data syncs there too

**What clearBusinessData does right (but handleSignOut does NOT call it):** The `clearBusinessLocalData()` function in `settingsStore.ts:40-80` properly resets ALL seller stores and removes ALL business AsyncStorage keys. But `handleSignOut` at Settings.tsx:806-825 never calls it. It only calls `authStore.reset()` and `clearProfileCache()`.

**Fix confirmation:** The fix in CRIT-1 (Section 3) is correct -- call `clearBusinessLocalData()` in the sign-out handler. This alone eliminates the amplifier effect.

---

#### 12.2.10 CRIT-5: PULL_LIMIT 999 Silently Drops Records

**Source:** `sellerSync.ts:736` and all `.range(0, PULL_LIMIT)` calls.

**Downstream:** The dropped records are not just invisible -- the tombstone logic in push functions actively DELETES them from Supabase:

pushOrders:407-427: "delete remote app orders removed locally, only if older than sync start"

Records missing from local state (because they were dropped by the 999 limit) are treated as "deleted locally" and removed from Supabase. This is permanent, irreversible data loss.

**Affected entity counts (all use `.range(0, PULL_LIMIT)`):**
- Orders (line 887)
- Ingredient costs (line 950)
- Recurring costs (line 999)
- Cost templates (line 1044)
- Stock adjustments (line 1072 approx)
- Cost categories (line 1122)
- Products, seasons, customers (earlier in pullAll)

**Compound scenarios:**
- CRIT-5 + ORD-CRIT-3: Dropped orders get tombstone-deleted. If re-added from a third device, they get new `created_at` -> wrong dates forever.
- CRIT-5 + transfer bridge: If a transferred order is dropped and tombstone-deleted, the personal-mode income transaction still exists but the seller-side order is gone. The transfer is orphaned -- `reconcileTransferIncome` can never reverse it because the order no longer exists.
- CRIT-5 + Customers screen: Dropped orders mean customer totalSpent/totalOrders are understated. Customer rankings and "outstanding" amounts are wrong.

---

#### 12.2.11 HIGH-4: Floating-Point Drift

**Source:** All `.reduce((s, o) => s + o.totalAmount, 0)` without rounding.

**Why this matters more than it seems:** The same set of orders is summed in 6 different code paths. JavaScript floating-point addition is NOT commutative over different orderings. If different subsets are summed or if a `.sort()` before reduce changes iteration order, the rounding error differs. This means:

| Code path | Sum method | Can differ by |
|-----------|-----------|---------------|
| Dashboard income | `currentOrders.filter(isPaid).reduce()` | Accumulates L-to-R through month's paid orders |
| useSeasonInsights income | `paidOrders.reduce()` | Same orders but filtered by seasonId first |
| getSeasonStats income | `orders.filter(seasonId).filter(isPaid).reduce()` | Same orders, same direction -- should match |
| SeasonSummary income | `seasonOrders.filter(isPaid).reduce()` | seasonOrders is sorted by date desc -- DIFFERENT ORDER than getSeasonStats |
| explainSellerMonth | `orders.filter(isPaid).reduce()` | Filtered by month, not season -- different subset |
| Transfer amount | `untransferredOrders.reduce(s + o.totalAmount)` | Subset of paid, untransferred -- yet another accumulation path |

Over 500 orders with prices like RM 3.50, RM 7.80, RM 12.30, the accumulated drift between paths can reach 1-3 sen. This means Dashboard shows "RM 4,532.10", SeasonSummary shows "RM 4,532.09", and the XLSX export (which uses SeasonSummary's stats) shows yet another number. The seller sees three different "total income" numbers on three different screens and loses trust in the app.

---

### 12.3 Compound Scenarios (The Really Scary Ones)

#### COMPOUND-1: Inflated Total + Transfer to Personal + Personal Sync (CRITICAL)

**Bug chain:** ORD-CRIT-1 -> transfer bridge -> personalStore -> personalSync -> Supabase personal tables

**Scenario:** AI parser creates order with 1 unmatched item (RM 10 unitPrice, productId: ''). validItems excludes it, but `total = RM 60` (should be RM 50). Order marked paid. Seller transfers to personal. personalStore gets `transfer-{id}` transaction for RM 60. Personal Dashboard shows RM 60 income from business. If personalSync is enabled, RM 60 pushed to personal Supabase. Seller's personal records now show RM 10 more income than actually received. Over a season with 20 such orders, could be RM 200 phantom income.

**Who notices:** Nobody. The personal side trusts the transfer amount. The seller side shows RM 60 as order total. Both agree. Both are wrong.

#### COMPOUND-2: Date Loss + Month Boundary + Period Filters (CRITICAL)

**Bug chain:** ORD-CRIT-3 -> all date-based filters -> wrong month attribution

**Scenario:** Seller takes 15 orders offline during last week of April (28-30 April). Syncs on May 2. All 15 orders get `date = May 2` after pullAll on second device. April's "came in" drops by the total of those 15 orders. May's "came in" inflates by the same. MoM delta says "May is amazing, +40% vs April!" when actually May is quiet. Budget planning for June based on May's inflated number leads to overspending on ingredients.

#### COMPOUND-3: PULL_LIMIT + Tombstone + Transfer Orphan (CRITICAL)

**Bug chain:** CRIT-5 -> tombstone delete -> orphaned personal transfer

**Scenario:** Seller has 1200 orders over 6 months. pullAll fetches 999. The 201 oldest orders include 50 that were transferred to personal (RM 8,500 total across 3 transfer batches). Push tombstone deletes those 201 from Supabase. The 3 personal-mode transfer income transactions (RM 8,500 total) still exist in personalStore. Those transactions can never be reconciled or reversed because the seller-side orders are gone. The seller's personal mode permanently shows RM 8,500 more income than the seller mode shows was transferred.

#### COMPOUND-4: Sign-Out Persistence + Data Bug + New User (CRITICAL)

**Bug chain:** CRIT-1 -> any data bug -> User B inherits corrupted data

**Scenario:** Mak Cik Siti has 500 orders with some inflated totals (ORD-CRIT-1) and wrong dates (ORD-CRIT-3). She signs out on the shared tablet. Her daughter Aishah signs in. sellerSync fires and pushes Mak Cik's 500 corrupted orders to Aishah's Supabase account. Aishah now has her mother's orders mixed with her own future orders. There is NO way to distinguish or separate them. Aishah's financial records are permanently contaminated.

#### COMPOUND-5: Online Order Stock Bypass + Overselling (HIGH)

**Bug chain:** ORD-HIGH-4 -> stock not decremented -> overselling

**Scenario:** Seller has "Kuih Lapis" stock = 30. Receives 25 via order_link (stock stays 30). Takes in-person order for 20 (stock goes to 10). Actual remaining: -15 (oversold). Seller makes 10 more kuih lapis thinking she has capacity, delivers 20 to in-person customer. Online customers' 25 cannot be fulfilled. Seller discovers the problem when making deliveries, not when taking orders.

#### COMPOUND-6: Floating-Point + Export + Tax Filing (HIGH)

**Bug chain:** HIGH-4 -> SeasonSummary export -> accountant -> tax return

**Scenario:** XLSX export shows RM 45,320.09 income (with drift). Dashboard shows RM 45,320.10. Seller gives XLSX to accountant. Accountant questions the 1-sen discrepancy with what seller verbally reports. Minor, but erodes professional credibility. Over a year with multiple seasons, accumulated discrepancies across exports could reach RM 1-5.

---

### 12.4 The Mak Cik Test

#### Mak Cik Siti's Saturday at Pasar Malam

Mak Cik Siti sells kuih at the Saturday pasar malam in Sungai Buloh. She has been using Potraces for 3 months. Here is her Saturday:

**6:00 AM -- Prep (offline, no WiFi at the pasar):**
Siti opens the app to check her production list. She has 8 pre-orders from WhatsApp (entered via AI parser on Friday night). Two of those orders had items the parser could not match to products -- it assigned RM 5.00 unitPrice from the message text but empty productId. The `validItems` filter will exclude those items, but `total` already includes them. Each of those 2 orders is inflated by RM 5. **(ORD-CRIT-1: RM 10 total inflation, silent)**

**7:00 AM -- Morning rush:**
Siti takes 12 walk-up orders on her phone. Each gets `date: new Date()` -- correct, 7 AM Saturday. She is offline the whole time. Meanwhile, 3 customers order via her shop link. Those orders hit Supabase but do not reach her phone (no connectivity). Her stock counter does not decrement for those 3 online orders. **(ORD-HIGH-4: stock is 3 orders too high)**

**11:00 AM -- Break:**
Siti checks her Dashboard. "Kuih Seri Muka -- stock: 15" but she actually has 6 left (9 sold online that she does not know about yet). She takes 3 more walk-up orders for Seri Muka (stock goes to 12 on screen). She will discover at delivery time that she is oversold by 6. **(COMPOUND-5)**

**2:00 PM -- Home, WiFi:**
Siti connects to WiFi. sellerSync fires. pullAll brings the 3 online orders into her local store (good). But pushOrders sends her 12 morning orders to Supabase WITHOUT the `date` field (ORD-CRIT-3). The `created_at` on Supabase is now 2:00 PM Saturday, not 7:00 AM.

**Sunday morning:**
Siti opens the app on her tablet (second device). pullAll fetches all orders. The 12 morning orders have `date: sd(ro.created_at)` = 2:00 PM Saturday. Her daily breakdown shows zero orders before 2 PM and 15 orders after 2 PM. Her "best time to sell" insight is wrong. **(ORD-CRIT-3 downstream)**

**Monday:**
Siti marks 18 orders as paid and transfers RM 1,200 to personal mode. The 2 inflated orders contribute RM 10 extra. Personal mode now shows RM 1,210 income from business. The RM 10 is permanent phantom income. **(COMPOUND-1)**

**End of Raya season:**
Siti exports her XLSX report to share with her husband who does their taxes. The export shows:
- Income: RM 12,450.09 (floating-point drift from 400 orders, should be RM 12,450.10 as shown on Dashboard) **(HIGH-4)**
- The 2 inflated orders contributed RM 10 extra **(ORD-CRIT-1)**
- Top products show "Kuih Lapis" and "Kuih Lapis Pandan" separately because she renamed it mid-season **(ORD-MED-4)**
- Order dates for 40 offline orders are all on sync days, not actual order days **(ORD-CRIT-3)**

Her husband asks: "Why does the app say RM 12,450.09 but the report says RM 12,450.10?" Siti has no answer.

#### Aishah Inherits Mom's Data

Mak Cik Siti signs out on the family tablet so her daughter Aishah can use it for her own bubble tea business. Siti taps "sign out" in Settings. authStore resets, profile cache clears. But sellerStore still has Siti's 500 orders, 30 products, 3 seasons.

Aishah signs in. Auto-sync fires. pushProducts sends Siti's 30 kuih products to Aishah's Supabase. pushOrders sends 500 kuih orders. pushSeasons sends 3 kuih seasons. Aishah's Supabase account now has Mak Cik's entire kuih business mixed with nothing yet, because Aishah just started.

Aishah adds her first bubble tea product. Her Products screen shows 31 products (30 kuih + 1 bubble tea). She creates an order. Her season stats show 501 orders and RM 12,460 income -- all from Mak Cik's kuih.

There is NO "clear imported data" function. Aishah would have to manually delete 500 orders, 30 products, and 3 seasons. Or use "Clear Business Data" which would also delete her one legitimate order.

**(CRIT-1 + COMPOUND-4: complete data contamination)**

---

### 12.5 New Cross-System Findings

#### RIPPLE-NEW-1: Dashboard Unpaid Aging Contradicts Unpaid Hero Card

**Severity:** HIGH
**File:** `src/screens/seller/Dashboard.tsx:112-114` vs `Dashboard.tsx:196`
**What:** Hero "unpaid" card filters `!o.isPaid && status !== 'pending' && status !== 'confirmed'`, showing e.g. 3. The `unpaidAging` computation immediately below uses `orders.filter(o => !o.isPaid)`, showing e.g. 7 in the aging breakdown. Same screen, two conflicting numbers for "unpaid."
**Scenario:** Seller sees "3 unpaid" in the action card, scrolls down, sees "7 unpaid" in the aging breakdown (4 pending + 3 ready/delivered). She thinks the app is broken.
**Fix:** Either align both to the same definition, or label the aging section "all orders awaiting payment (including pending)" to explain the difference.

#### RIPPLE-NEW-2: explainSellerMonth Hardcodes "RM" Currency

**Severity:** MEDIUM
**File:** `src/utils/explainSellerMonth.ts:24,59`
**What:** The insight text uses hardcoded `RM` instead of the user's currency setting: `RM ${unpaidTotal.toFixed(0)}` and `RM ${kept.toFixed(0)}`.
**Scenario:** User who set currency to "MYR" or "$" sees insight text with "RM" while all other values on Dashboard use their chosen currency.
**Fix:** Pass `currency` as a parameter to `explainSellerMonth()` and use it in template strings.

#### RIPPLE-NEW-3: Transfer Amount Not Rounded -- Can Create Sub-Sen Transfer

**Severity:** MEDIUM
**File:** `src/screens/seller/SeasonSummary.tsx:269`
**What:** `parseFloat(transferAmount)` takes raw user input. If user types "100.505", the transfer creates a personal income transaction for RM 100.505 which displays as RM 100.51 (toFixed(2)) on some screens and RM 100.505 (raw) in calculations. The `addTransferIncome` in personalStore does not round.
**Scenario:** Over many transfers, sub-sen amounts accumulate. Personal wallet balance may show RM 5,000.015 which renders differently depending on the screen's formatting.
**Fix:** Round `amount` to 2dp before creating the transfer: `const amount = Math.round(parseFloat(transferAmount) * 100) / 100`.

#### RIPPLE-NEW-4: Season Compare Stats Don't Filter by isPaid Consistently

**Severity:** MEDIUM
**File:** `src/screens/seller/SeasonSummary.tsx:244-260`
**What:** `compareStats` computes `totalIncome` from `cPaid.reduce()` (paid-only, correct). But `totalOrders: cOrders.length` counts ALL orders (paid + unpaid). When comparing two seasons side-by-side, "Orders" includes unpaid but "Income" excludes them, which is misleading if the seasons have different payment ratios.
**Scenario:** Season A: 50 orders (40 paid), Season B: 50 orders (50 paid). Compare shows "same order count" but Season B income is 25% higher. Seller thinks Season B had higher prices when actually it just had better collection.
**Fix:** Add `paidOrders` and `unpaidOrders` counts to compareStats so the comparison is transparent.

#### RIPPLE-NEW-5: deleteSeason Reads State Outside Setter (Same Pattern as CRIT-7)

**Severity:** HIGH
**File:** `src/store/sellerStore.ts:400`
**What:** `const seasonOrders = get().orders.filter(...)` is called OUTSIDE `set()`. The `seasonOrders` array is used both inside `set()` (for product reversal) and after `set()` (for transfer reconciliation). If another mutation fires between `get()` and `set()`, the stale `seasonOrders` could reference orders that no longer exist or have changed amounts.
**Scenario:** User deletes season while auto-sync is updating order amounts in the background. Product stock reversal uses stale item quantities. Transfer reconciliation uses stale totalAmount values.
**Fix:** Move the `get().orders.filter()` inside the `set()` callback, and capture the needed data for post-set reconciliation before `set()` returns. Same pattern as CRIT-7 fix but for `deleteSeason`.

#### RIPPLE-NEW-6: Customers Screen totalSpent Includes ALL Paid Orders, Not Just Current Season

**Severity:** LOW
**File:** `src/screens/seller/Customers.tsx:552-629`
**What:** `derivedCustomers` iterates ALL `orders` (not filtered by season). `totalSpent` accumulates across ALL seasons. This is actually intentional for a lifetime customer view, but there is no season filter toggle. A seller cannot see "how much did this customer spend THIS season."
**Scenario:** Customer ordered RM 500 in Raya season and RM 50 in CNY. Customers screen shows "RM 550 spent." Seller thinks this customer is high-value for CNY when actually they were barely active.
**Fix:** Add a season filter toggle to the Customers screen, or show per-season breakdown in the customer detail modal.

#### RIPPLE-NEW-7: Module-Level Caches Not Invalidated on Sign-Out

**Severity:** MEDIUM
**File:** `src/store/sellerStore.ts:66-68`
**What:** `_seasonOrdersCache`, `_seasonCostsCache`, `_seasonStatsCache` are module-level variables. When User A signs out and User B signs in, these caches still hold User A's data. If User B happens to view a season with the same ID structure (unlikely but possible with Date.now()-based IDs on the same device), the cache returns stale data.
**Scenario:** Unlikely ID collision, but the cache also survives `clearBusinessLocalData()` which resets the store but NOT the module-level caches. First `getSeasonStats()` call after clear could return cached results from the deleted data.
**Fix:** Export a `clearSellerCaches()` function and call it from `clearBusinessLocalData()`.

---

### 12.6 Cross-Mode Data Flow Diagram

```
SELLER MODE                          PERSONAL MODE
============                         ==============

[NewOrder.tsx]
    |
    v
[sellerStore.addOrder]
    |  totalAmount (possibly inflated via ORD-CRIT-1)
    |  date (correct locally)
    |
    +-----> [products.totalSold++]
    |       [products.stockQty--]
    |       (SKIPPED for order_link -- ORD-HIGH-4)
    |
    v
[sellerStore.orders]
    |
    +-----> [Dashboard.tsx]
    |       - hero kept (income - costs)
    |       - this month filter (date-dependent)
    |       - sparkline (date-dependent)
    |       - unpaid count (filtered differently)
    |       - unpaid aging (filtered differently again)
    |       - top customer (date-dependent)
    |       - explainSellerMonth (date + amount dependent)
    |
    +-----> [useSeasonInsights.ts]
    |       - season income (paid only)
    |       - daily series (date-dependent)
    |       - break-even (date + amount)
    |       - target % (amount)
    |       - top products (paid only, by productId)
    |
    +-----> [SeasonSummary.tsx]
    |       - stats (all orders for topProducts)  <-- DISAGREES with insights
    |       - transfer bridge
    |       - XLSX export
    |       - clipboard report
    |
    +-----> [Customers.tsx]
    |       - totalSpent (paid, all seasons)
    |       - unpaidAmount (all unpaid)
    |       - lastOrderDate (date-dependent)
    |
    +-----> [OrderList.tsx]
    |       - unpaid filter (different from Dashboard)
    |       - period filter (prefers deliveryDate)
    |
    +-----> [PastSeasons.tsx]
    |       - getSeasonStats (cached, paid only)
    |
    v
[SeasonSummary: Transfer Bridge]
    |
    |  handleTransferToPersonal()
    |  amount = untransferredOrders
    |           .reduce(totalAmount)  <-- carries ORD-CRIT-1 inflation
    |
    v
[businessStore.addTransfer]           [personalStore.addTransferIncome]
    |                                     |
    |  Transfer record                    |  Transaction: id=transfer-{id}
    |  (used for reconciliation)          |  amount = transfer.amount
    |                                     |  category = 'from business'
    |                                     |
    |                                     +---> [walletStore.addToWallet]
    |                                     |     (if walletId provided)
    |                                     |
    |                                     +---> [Personal Dashboard]
    |                                     |     income this month
    |                                     |
    |                                     +---> [Personal Reports]
    |                                     |     income breakdown
    |                                     |
    |                                     +---> [personalSync -> Supabase]
    |                                           personal_transactions table
    |
    v
[sellerSync.pushOrders]
    |  total_amount pushed
    |  date NOT pushed (ORD-CRIT-3)
    |  .range(0, 999) limit (CRIT-5)
    |
    v
[Supabase seller_orders]
    |
    v
[sellerSync.pullAll] (other device)
    |  date = sd(ro.created_at)       <-- WRONG DATE
    |  totalAmount preserved          <-- carries inflation
    |
    v
[Other device's sellerStore]
    |  All downstream consumers
    |  show wrong dates + amounts
```

---

### 12.7 Updated Fix Priority (Re-Ranked by Ripple Impact)

Considering blast radius, the priority order changes significantly from Section 10:

#### MUST FIX BEFORE ANY USER TOUCHES THE APP

| Priority | Bug | Original | New | Reason |
|----------|-----|----------|-----|--------|
| 1 | CRIT-1 | CRITICAL | **CRITICAL+** | Corruption amplifier -- every other bug becomes permanent and cross-user |
| 2 | ORD-CRIT-3 | CRITICAL | **CRITICAL+** | 15 downstream consumers, corrupts time dimension of ALL data, compounds with CRIT-5 |
| 3 | ORD-CRIT-1 | CRITICAL | **CRITICAL** | 17 downstream consumers including transfer bridge, export, sync |
| 4 | CRIT-5 | CRITICAL | **CRITICAL** | Permanent data loss + orphaned transfers |
| 5 | CRIT-7 | CRITICAL | **CRITICAL** | Race condition in delete affects product stock integrity |

#### MUST FIX WITHIN FIRST WEEK

| Priority | Bug | Original | New | Reason |
|----------|-----|----------|-----|--------|
| 6 | ORD-HIGH-4 | HIGH | **CRITICAL** (upgraded) | Stock bypass leads to real-world overselling; compounds with CRIT-5 |
| 7 | ORD-HIGH-6 | HIGH | **HIGH** | Attack vector that produces ORD-CRIT-1-equivalent corruption remotely |
| 8 | ORD-HIGH-1 | HIGH | **HIGH** | Same screen contradicts itself (RIPPLE-NEW-1) |
| 9 | RIPPLE-NEW-5 | NEW | **HIGH** | Same stale-read pattern as CRIT-7, in deleteSeason |
| 10 | HIGH-4 | HIGH | **HIGH** | 6 different sum paths can disagree; affects exports |
| 11 | ORD-HIGH-2 | HIGH | **HIGH** | Export uses wrong data set |
| 12 | ORD-HIGH-3 | HIGH | **HIGH** | Sync can push partial state |
| 13 | CRIT-4 | CRITICAL | **CRITICAL** | RLS gap -- unchanged, still needs fix |
| 14 | HIGH-1 | HIGH | **HIGH** | Multiple active seasons -- unchanged |

#### FIRST MONTH

| Priority | Bug | Severity | Note |
|----------|-----|----------|------|
| 15 | RIPPLE-NEW-1 | HIGH | Dashboard self-contradiction |
| 16 | RIPPLE-NEW-2 | MEDIUM | Hardcoded RM in insight text |
| 17 | RIPPLE-NEW-3 | MEDIUM | Sub-sen transfer amounts |
| 18 | RIPPLE-NEW-4 | MEDIUM | Compare stats inconsistency |
| 19 | RIPPLE-NEW-7 | MEDIUM | Module cache survives sign-out |
| 20 | ORD-CRIT-2 | CRITICAL | Stale order number -- severity unchanged but lower blast radius than data corruption bugs |
| 21 | HIGH-2/3 | HIGH | Sync timestamp comparison issues |

**Key insight from re-ranking:** ORD-HIGH-4 (order_link stock bypass) was rated HIGH but should be **CRITICAL** because it causes real-world overselling -- a seller promises kuih she cannot deliver. This is not a screen-display bug; it is a broken-promise-to-customer bug.
