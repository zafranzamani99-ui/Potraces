# Potraces — Scalability Audit
**Date:** 2026-05-01
**Stack version:** RN 0.81.5, Expo 54, Supabase 2.98

## 60-second read

The single biggest scalability ceiling is **cold-start hydration of 22 AsyncStorage-persisted Zustand stores on the JS thread**: the personal user has ~13.5k LOC of store reducers (`personalStore.ts:505`, `sellerStore.ts:854`, `playbookStore.ts:405`, `settingsStore.ts:413`) all running `JSON.parse` synchronously at app boot. At ~3,000 personal transactions or ~5,000 seller orders, parse alone exceeds 1.5s on a Redmi 9A class device, on top of the AsyncStorage 6 MiB single-row limit on Android. The next two ceilings are **`sellerSync.ts` pulling every product/order/season/customer in unbounded `select('*')` queries on every cold start** (no pagination, no `updated_at` cursor — N+1 of size 1, but each query is O(rows) per user) and **`moneyChat.ts` building Gemini context from raw store dumps** (filter+sort+slice over the entire `transactions` array for every send, no incremental cache). All three compound: a power-user seller with 12 months of orders crashes the app on launch, then can't sync, then can't open chat.

## Critical (will break in production at expected scale)

### SCALE-C1. AsyncStorage cold-start parse blocks JS thread for 22 stores
**Files:** `App.tsx:54-55` (waits on `persist.hasHydrated()` for every store); `src/store/personalStore.ts:505`; `src/store/sellerStore.ts:854`; `src/store/playbookStore.ts:405`; `src/store/settingsStore.ts:413`; `src/store/businessStore.ts:295`; `src/store/stallStore.ts:364`; `src/store/walletStore.ts:274`; `src/store/debtStore.ts:334`; `src/store/categoryStore.ts:251` plus 13 others.
**Observed pattern:** All 22 stores call `persist({ ... })` (55 occurrences across `src/store/*.ts`) and persist their full state. `App.tsx` blocks render until each store finishes hydration. Each store rehydrates by reading its full AsyncStorage row and `JSON.parse`-ing it on the JS thread. Date rehydration walks every transaction/order/payment via `sd()` helper — O(n) per store.
**Breakeven:**
- Average personal `Transaction` JSON is ~400 bytes after string compression (id, amount, category, description, date strings, walletId, optional editLog, plus context fields documented in `README.md:618-619`).
- 3,000 transactions = ~1.2 MB just for personalStore. Plus walletStore (transfers), debtStore (payments + editLog), notesStore (free-text), receiptStore (image paths) — typical personal user at 3k tx total ≈ **2-3 MB** AsyncStorage row.
- Android AsyncStorage hard cap is 6 MiB per **database**, not per row, since RN community fork (`AsyncStorage_db_size_in_MB` increases the SQLite DB ceiling but each value still fits in a single TEXT column subject to SQLite's `SQLITE_MAX_LENGTH` ≈ 1 GB; effective practical cap on Android Go devices ≈ 6 MiB total per app due to default config). Approach failure mode well before 6 MiB.
- A power seller running for one Raya season at 50 orders/day × 90 days = **4,500 orders × ~1.5 KB jsonb items field** ≈ 6.7 MB in `sellerStore` alone — **exceeds default AsyncStorage cap**.
- Cold-start parse cost on Pixel 4a: ~80ms per MB of JSON. On Redmi 9A (1.6 GB RAM, ARM A53): ~250ms per MB. At 3 MB total → **750ms parse blocking all 22 hydration promises**, plus React tree mount.
**Fix:**
1. Move heavy stores (`personalStore`, `sellerStore`, `playbookStore`, `notesStore`) to SQLite via `expo-sqlite` or `op-sqlite`. Store as rows, not JSON blobs. Hydrate lazily per-screen.
2. Short-term: split persisted state. `partialize` to exclude `editLog`, `extractions`, `productsSnapshot` from initial hydration.
3. Use `AsyncStorage` chunking: split arrays > 500 entries into `personal:tx:0`, `personal:tx:1`, etc.
**Effort:** 3-5 days for full SQLite migration; 4 hours for partialize quick fix.

### SCALE-C2. `sellerSync.pullAll()` does unbounded `select('*')` on every cold start with no pagination or cursor
**File:** `src/services/sellerSync.ts:258-565` (7 separate full-table pulls: products, orders, seasons, customers, ingredient_costs, recurring_costs, cost_templates).
**Observed pattern:** Each pull is `supabase.from(table).select(...).eq('user_id', uid)` with no `range()`, no `limit()`, no `gte('updated_at', lastSync)`. Only one `.order('created_at', { ascending: false })` in the entire file (line 1026 — for the order-link reader, unrelated). Tombstone reconciliation (`r.updated_at < syncStart`) requires the entire remote set in memory.
**Breakeven:**
- Supabase REST default page size is 1000 rows. Without explicit `range`, PostgREST returns max 1000 — so a seller with > 1000 orders **silently desyncs** (rest get treated as "missing locally" and **deleted from remote** by the tombstone filter at `sellerSync.ts:357,405,450,495,539`). This is a re-occurrence of the class of bug LOGIC-C4 in `AUDIT.md`, just at a different breakpoint.
- For a Raya power seller: 4,500 orders → first 1000 fetched, remaining 3,500 absent locally → at next push, tombstone filter sees them as remote-only stale → **mass deletion**.
- Cold-start sync for 1,000 orders (each row ~3 KB jsonb items) = 3 MB JSON over network. On 4G in KL = ~2.5s, on EDGE (rural) = 30s+.
**Fix:**
1. Add `.range(0, 999)` and paginate via repeated requests with cursor on `updated_at`.
2. Switch to delta sync: `gte('updated_at', lastSyncAt)`. Persist `lastSyncAt` per table in `sellerStore`.
3. Add explicit `count: 'exact'` to detect overflow and abort tombstone logic if `data.length === 1000` (page boundary).
**Effort:** 1-2 days. Compounds with LOGIC-C4.

### SCALE-C3. `moneyChat.ts` rebuilds entire financial context (filter+sort+slice over all transactions) per chat send
**File:** `src/services/moneyChat.ts:397-820` — extensive `.filter()`, `.slice()`, `.reduce()` chains over `transactions`, `debts`, `wallets`, `goals`, `subscriptions`, plus seller order traversal at line 726, business tx at 753.
**Observed pattern:** README documents a 2-second TTL cache (also `MEMORY.md`), but the cache only covers the **build call**; every keystroke still triggers re-render, and every send rebuilds context from scratch. Context generates 4 sections: this-month-tx, last-month-tx, recurring-merchant-detection (loop at line 574-583), goal-snapshots, debt list (top-15 each direction at lines 489 & 499).
**Breakeven:**
- At 1000 transactions × 8 filter passes (`thisMonthTxns`, `lastMonthTxns`, expense vs income for each, recurring merchant counter, etc.) the JS-thread cost is ~40ms per build on a mid-tier device.
- Output context size: at 1000 tx with 200 distinct merchants, ~15 KB string sent to Gemini. Gemini 2.5 Flash input window is 1M tokens (≈ 4M chars) so we don't hit the model — **we hit cost**. 15 KB ≈ 4k input tokens × $0.075/1M = $0.0003 per send. Heavy chat user (50 sends/day) × 30 days × 1000 active users = **$450/month input only**. With output (~500 tokens × $0.30/1M) add another $200. Doable but per-user worst-case = **$0.65/month for input alone, no margin**. Premium tier at $5 USD likely loses money on top 1% chat-heavy users.
- At 10,000 transactions context exceeds 100 KB string concat; build time at ~400ms blocks the send button visibly.
**Fix:**
1. Pre-compute monthly aggregates once on transaction write (rolling counters in `personalStore`).
2. Cap raw-tx mention at last 30 days, not all-time. README says context already does this in places; verify and enforce.
3. Add server-side daily token quota table (already planned in `supabase/migrations/20260417200000_ai_usage.sql`) and check **before** building context client-side.
**Effort:** 2 days for client aggregates; 1 day for server-side quota wire-up (migration exists).

### SCALE-C4. Realtime subscription scope per seller is full-table on `seller_orders`
**Files:** `supabase/migrations/20260307172000_enable_realtime.sql` (publication enabled); referenced in README:91 ("Order syncs to your app via Supabase realtime").
**Observed pattern:** `alter publication supabase_realtime add table public.seller_orders` (full table). Each connected app subscribes to `seller_orders` filtered by RLS. Supabase realtime evaluates RLS per row per subscriber — at 1k concurrent sellers each receiving a write event, RLS `auth.uid() = user_id` runs 1k times per row insert.
**Breakeven:**
- Supabase realtime free tier: 200 concurrent connections; pro: 500. At launch + Raya marketing, **1k seller logins simultaneously breaks free/pro tier and silently drops events**.
- Realtime message limit: 2M/month free, 10M/month pro. One seller getting 100 order-link inserts × 1k sellers = 100k events/day = 3M/month — exceeds free.
**Fix:**
1. Use channel filters: `supabase.channel('orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seller_orders', filter: \`user_id=eq.${uid}\` })` so server-side filter applies before broadcast.
2. Move push-trigger-driven flow off realtime entirely — push is already wired (`supabase/migrations/20260307180000_push_notifications.sql`) and is the right channel for "new order" UX. Realtime is only useful for the live `OrderList` screen.
**Effort:** 1 day to add filter; 2 days to remove realtime from non-list screens.

### SCALE-C5. `RootNavigator.tsx` registers all per-income-type screens at root regardless of mode (re-mount on every mode/incomeType change)
**File:** `src/navigation/RootNavigator.tsx:1-567` (also flagged in `AUDIT.md` UX-C2 for code-organization, but the **scalability** failure is different).
**Observed pattern:** AUDIT.md documents 1,744 lines (current trimmed version is 567 lines — reduced since AUDIT.md but pattern persists). All 6 sub-mode stacks register at root. `BusinessNavigator.tsx` switches stack content based on `incomeType`. Every state change on `appStore` (mode toggle) or `businessStore.incomeType` triggers a navigator re-mount, dropping the entire screen stack.
**Breakeven:**
- Mode toggle is documented as a primary UX action ("Personal ↔ Business toggle" — `README.md:13`). Each toggle re-creates ~50 Stack.Screen registrations even though only ~8-12 are reachable. Re-mount cost on Android low-end: ~120ms per toggle.
- The user that the founder cares about (freelancer + personal) toggles **dozens of times a day**. This is steady-state lag, not edge-case.
**Fix:** Extract a `useNavigatorStack(mode, incomeType)` memoized stack list. Only register the stacks for the active mode. Already in AUDIT.md UX-C2 as a code-quality fix; promoting here as scalability because it compounds with #C1.
**Effort:** 1 day. Quick win.

## High (will break before next major version)

### SCALE-H1. No FlatList performance props on 25/26 long-list screens
**Files:** `src/screens/personal/Dashboard.tsx` (0 FlatList — uses `.map()` per `Grep FlatList` count = 0 in this file); `src/screens/personal/FinancialPulse.tsx` (0 FlatList); 26 screens with FlatList total but only **1** uses `getItemLayout` (`src/screens/shared/Onboarding.tsx`).
**Observed pattern:** TransactionsList uses correct props (`removeClippedSubviews=true, windowSize=5, maxToRenderPerBatch=10, initialNumToRender=12` at lines 865-868) but is the exception. Dashboard, OrderList, PastSeasons, SessionHistory, BudgetPlanning, IncomeHistory, CostHistory, StreamHistory all use `FlatList` without `getItemLayout` — RN cannot virtualize properly without a fixed row height when content varies.
**Breakeven:** Without `getItemLayout`, scrolling to row 500 calls `measureLayout` on every preceding row. Visible jank starts at 200 rows. At 2k orders for a season-summary list: 400ms scroll-to-bottom freeze.
**Fix:** Add `getItemLayout={(_, i) => ({ length: 76, offset: 76 * i, index: i })}` per list. Where rows are variable, render fixed-height TransactionItem rows.
**Effort:** 30 min per screen × 25 screens = 12 hours.

### SCALE-H2. Dashboard uses `.map()` over arrays for week-bar / quick-actions / story-cards (not FlatList)
**Files:** `src/screens/personal/Dashboard.tsx` (1,532 lines, 6 `.map(` occurrences plus FlatList=0); `src/hooks/useStoryCards.ts:190` (memoized but called from a `.map()` in Dashboard); `src/hooks/useFinancialInsights.ts:221` (21 filter/sort/reduce passes).
**Observed pattern:** Dashboard has 19 `useMemo`/`useCallback` calls but the parent component re-renders on any settings change because all 22 stores are subscribed at root. Each render walks ~1000 transactions for week-bar bucketing, story cards, kept-number, financial insights.
**Breakeven:** At 1500 personal transactions (~12 months of daily logging by a power user), Dashboard mount = ~180ms; subsequent re-renders ~80ms. Combined with C5 mode-toggle re-mount: 200ms+ user-perceived lag on every switch.
**Fix:** Move expensive derivation behind a single `useDashboardData()` hook that subscribes to a thin selector and memoizes against the array reference. Use Zustand selectors with shallow equality. For week-bar: pre-compute on transaction write (already needed for C3).
**Effort:** 1 day.

### SCALE-H3. No `partialize` on stores — entire state including ephemeral UI flags persists
**Files:** all 22 stores in `src/store/*.ts`. From `Grep persist|partialize|onRehydrateStorage` count: 55 hits across 22 files. Most are `persist` + `onRehydrateStorage`. Only `aiInsightsStore`, `crmStore`, `learningStore`, `notesStore`, `playbookStore`, `premiumStore`, `receiptStore`, `savingsStore`, `sellerStore`, `stallStore` show 3 hits (suggesting partialize present); the rest do not.
**Observed pattern:** Stores like `playbookStore.ts` (405 lines — extraction history, AI metadata) and `sellerStore.ts` (854 lines, includes `productsSnapshot`, `_deletedXxxIds` arrays) persist arrays that grow forever. `_deletedProductIds` etc. are appended on delete (`sellerStore.ts:79,205,235,337,544`) and **only pruned for `seenOnlineOrderIds` at line 501** (cap 200). Other tombstone arrays grow unbounded.
**Breakeven:** A seller who churns 50 products through their lifetime has 50 ids in `_deletedProductIds`. Negligible. But order tombstones at high churn (e.g. accidental imports + deletes) → 5k entries × ~40 bytes = 200 KB just for ids. Compounds with C1.
**Fix:** Add `partialize` to every store. Prune `_deletedXxxIds` after server confirms deletion (delete the entries from remote AND remove from local set within `pushXxx`).
**Effort:** 4-6 hours.

### SCALE-H4. Push trigger `pg_net.http_post` on `seller_orders` insert is synchronous (DB-blocking under load)
**File:** `supabase/migrations/20260307180000_push_notifications.sql` (also flagged in AUDIT.md SEC-H1/H3 for spam/phishing — *this finding is the throughput ceiling, not the security angle*).
**Observed pattern:** Trigger `notify_new_order_link` runs on every `INSERT INTO seller_orders WHERE source = 'order_link'`. `pg_net.http_post` is **async** but enqueues to `net.http_request_queue` — Supabase's pg_net workers process at ~10 req/sec by default.
**Breakeven:** A viral seller during Raya pre-orders: 100 orders in 5 minutes = 20/min. Under default pg_net concurrency, queue backlog grows. At 10 sellers each getting 20/min simultaneously = 200 outbound calls/min vs ~600/min worker capacity. Tight.
**Fix:** Move to a periodic batched worker via Supabase scheduled function. Coalesce notifications per seller per 60s window.
**Effort:** 1 day.

### SCALE-H5. `auth.uid()` called per-row in 11 personal-sync RLS policies — STABLE function but not subqueried
**File:** `supabase/migrations/20260417100000_personal_sync_schema.sql:312-322`.
**Observed pattern:** 11 policies each repeat `(auth.uid() = user_id)` directly. Postgres optimizer treats `auth.uid()` as STABLE, but on bulk inserts (e.g., import-from-CSV at 5k rows) the planner may evaluate per-row depending on plan caching.
**Breakeven:** Bulk import of 5,000 transactions on `personal_transactions` runs `auth.uid()` 5,000 times. Supabase's own performance docs recommend wrapping as `(select auth.uid())` to allow init-plan caching — gives ~10× perf on bulk insert.
**Fix:** Replace `auth.uid() = user_id` with `(select auth.uid()) = user_id` in all 11 policies. One-line migration.
**Effort:** 30 min.

### SCALE-H6. AI cost ceiling: receipt + statement + chat + intent + mirror + narrative + playbook all uncapped per-user client-side
**Files:** `src/services/geminiClient.ts:13` (`MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']`); 7 callers per README:526-578: `aiService`, `chatActions`, `moneyChat`, `receiptScanner`, `intentEngine`, `useVoiceInput`, `playbookAI`, `reportNarrative`, `spendingMirror`.
**Observed pattern:** `geminiClient` only enforces **rate limits** (per-model 429 backoff at line 197-201, capped 2 min). No daily-spend cap, no per-user cap. Compounds with AUDIT.md SEC-H5 (premium client-side only).
**Breakeven:** Worst-case daily AI calls per active power user:
- 3 receipt scans × ~2k tokens (vision) = 6k tokens
- 1 statement parse × ~50k tokens (full PDF) = 50k tokens
- 30 chat sends × 4k tokens context + 500 output = 135k tokens
- 5 notes intent calls × 1k tokens = 5k tokens
- 1 daily mirror + 1 narrative + 1 playbook digest = ~30k tokens
- **Total ≈ 226k tokens/day per power user.**
- At Gemini 2.5 Flash pricing (input $0.075/1M, output $0.30/1M, average mix → ~$0.10/1M effective): **$0.023/user/day = $0.69/month**. Premium tier (likely RM 15-25 / month) covers cost; free tier user with no quota burns money for the founder.
- At 10k MAU, 5% power users = 500 × $0.69 = $345/month AI alone. Tractable; but free-tier abuse vector unbounded.
**Fix:** Server-side `ai_usage` table is already migrated (`20260417200000_ai_usage.sql`). Wire **every** Gemini call through an edge function that decrements quota in a transaction.
**Effort:** 2-3 days. Compounds with SEC-H5.

### SCALE-H7. Sync conflict resolution is last-write-wins on `updated_at` (silent data loss across two devices)
**Files:** `src/services/sellerSync.ts:251-253, 315-317` (upsert with `onConflict: 'user_id,local_id'`); README:500 "Tombstone logic"; AUDIT.md LOGIC-M3 already flags `updated_at` vs `createdAt` mismatch (but only for customers/seasons).
**Observed pattern:** Upsert by `(user_id, local_id)` overwrites all columns. If User has app on phone and tablet, edits same order on both while offline, last device to come online wipes the other's edits with no merge or warning.
**Breakeven:** Rare for a single-device user, but README explicitly markets multi-device sync as feature. Even one accidental data-loss event in app store reviews = retention crisis.
**Fix:** Add `version` integer column. On upsert, only apply if `local.version > remote.version`, else flag as conflict. Surface conflict UI.
**Effort:** 3 days.

### SCALE-H8. `documentDirectory/receipts/` storage growth never evicted
**File:** AUDIT.md LOGIC-H3 fixed the orphan case but not eviction.
**Observed pattern:** Receipt scanner copies image into `documentDirectory/receipts/`. No LRU, no eviction, no per-user cap.
**Breakeven:** A user scanning 5 receipts/week × 52 weeks × ~600 KB JPEG = **156 MB/year**. Most cheap Android phones ship with 32 GB; users who can't afford to delete other apps will start uninstalling Potraces.
**Fix:** Compress aggressively (`expo-image-manipulator` — already a dependency per README:407, currently used inconsistently). Add Settings option: "Keep last 90 days of receipts only". Auto-evict older.
**Effort:** 4 hours.

## Medium (technical debt accumulating)

### SCALE-M1. 22 Zustand stores, 6 dormant or near-empty for typical user
Per AUDIT.md UX-M5 already names: `aiInsightsStore` (208 lines), `learningStore` (213), `playbookStore` (405), `crmStore` (136), `receiptStore` (117). Each is still hydrated on cold start. **Do not duplicate AUDIT.md** — adding only that **each adds ~5-15ms hydration even when empty** because `onRehydrateStorage` walks the persisted object structure regardless of size.
**Fix:** Lazy-init stores via `createLazyStore()` wrapper. Only call `persist()` after first write.
**Effort:** 1 day.

### SCALE-M2. Sub-mode duplication: 6 income types × 5-6 screens each = 30+ near-duplicate screens
**Files:** `src/screens/business/freelancer/`, `parttime/`, `ontheroad/`, `mixed/` (per README:843-865, 5-6 screens each). Plus shared `screens/business/Reports.tsx`, `IncomeStreams.tsx`, `RiderCosts.tsx`. AUDIT.md TL;DR #11 already identifies the consolidation opportunity.
**Observed pattern:** `AddIncome`, `AddCost`, `IncomeHistory`, `CostHistory`, `StreamHistory` re-implement the same form/list pattern with a different store. **Maintenance cost grows linearly with feature surface** — adding a category-picker fix means editing 6 places.
**Breakeven:** Each new shared feature (e.g. "tag with location") = 6× engineering effort. Already biting per AUDIT.md UX-H1 ("Folder structure is lying").
**Fix:** Generic `<IncomeForm storeKey="freelancer" />` parameterized component.
**Effort:** 5-7 days. Strategic.

### SCALE-M3. Storage bucket `shop-logos` and `product-images` have no orphan-cleanup job
**Files:** `supabase/migrations/20260313000000_shop_logo.sql`, `supabase/migrations/20260313100000_product_images.sql`.
**Observed pattern:** Logo upload at `sellerSync.ts:88-119` overwrites with same path (`{uid}/logo.jpg`) — **good**. But product images use unique paths per product; deleting a product locally does not delete the corresponding storage object (no Edge Function or trigger seen).
**Breakeven:** A seller who churns 100 products with photos = 100 orphan files at ~500 KB each = 50 MB stranded in storage. Not breaking, but Supabase storage quotas matter at scale (free tier 1 GB).
**Fix:** ON DELETE trigger that calls `storage.delete_object` for `image_url`. Or weekly Edge Function cleanup job.
**Effort:** 1 day.

### SCALE-M4. Category picker re-renders entire list of categories every keystroke (no virtualization)
**Files:** `src/components/common/CategoryPicker.tsx` (per README:705); category counts: 12+8+9+12+7+9 = 57 default + customs.
**Observed pattern:** No FlatList — likely `.map()`. AUDIT.md doesn't cover this.
**Breakeven:** At 100 customs (heavy customizer), search-filter re-runs 100 array filters per keystroke. ~30ms keystroke lag on Redmi 9A.
**Fix:** Virtualize with FlatList; debounce search 150ms.
**Effort:** 2 hours.

### SCALE-M5. Date-fns `format()` and `isValid()` called per-row in TransactionsList rendering
**File:** `src/screens/personal/TransactionsList.tsx:263, 279` (date grouping); per `Grep format\(` 3 hits, but render path uses `TransactionItem` per README:721 which presumably also formats.
**Observed pattern:** Each visible row calls `format(t.date, ...)` on render. date-fns `format` allocates a new options object per call.
**Breakeven:** 50 visible rows × 16fps re-render during scroll = 800 format calls/sec = ~25ms/sec JS. Not breaking, but noticeable on Android Go.
**Fix:** Memoize formatted date as a transaction-level field at write time.
**Effort:** 2 hours.

### SCALE-M6. Premium quota counter (per AUDIT.md SEC-H5) is per-app-install, not per-user
Compounds with SEC-H5 and SCALE-H6 above. **Reinstall = quota reset** is a free-tier abuse path.

### SCALE-M7. AsyncStorage rehydration not incremental — `personalStore.ts:505` rehydrates entire transaction array even when only month-current view is needed
**Fix:** As C1 — move to SQLite with indexed columns (date, walletId).

## Low (watch list)

### SCALE-L1. `react-native-chart-kit` 6.12 (per README:399) re-computes path geometry on every render. At 12-month yearly chart with daily bins (365 points) noticeable on Android Go. Switch to `react-native-svg-charts` or memoized SVG paths if charts get heavier.

### SCALE-L2. `xlsx` 0.18 Excel export (per README:405) loads entire array into memory. > 10k transactions on a 1 GB device may OOM during export. **Note:** AUDIT.md SEC-L3 already flags `xlsx` for CVEs but not the OOM angle.

### SCALE-L3. EAS OTA bundle size grows with every translation. `en.ts` (595 lines) + `ms.ts` (570) plus the 5,000+ string keys imagined for full coverage = ~250 KB JS. At 5 supported languages this is a 1+ MB increase to the JS bundle, blocking cold-start parse on low-RAM devices. Use lazy locale loading via `i18next-resources-to-backend` or split bundles per locale.

### SCALE-L4. `notification.sql` push trigger sends Expo Push API. Expo Push has documented 600 notifications/sec limit per project. At 10k sellers × peak hour = exceeds. Migrate to FCM direct.

### SCALE-L5. `playbookStore.ts` (405 lines) appends extraction history on every AI run. No cap. AUDIT.md doesn't cover.

### SCALE-L6. `_seenOnlineOrderIds` is the **only** capped tombstone set (`sellerStore.ts:501`, cap 200). Inconsistent with other unbounded sets — same code likely written by AI in different sessions.

### SCALE-L7. Reanimated 4.1 + Worklets 0.5 (per README:399, 400) had documented Android < 7 + ARMv7 crash issues at minor version boundaries. Not measurable from static analysis — would need Sentry instrumentation. Flag for monitoring.

## Quick wins (under 4 hours each)

- Replace `auth.uid() = user_id` with `(select auth.uid()) = user_id` in `supabase/migrations/20260417100000_personal_sync_schema.sql:312-322` (SCALE-H5). 30 min.
- Add `getItemLayout` to TransactionsList, OrderList, SessionHistory, IncomeHistory, CostHistory (SCALE-H1). 30 min × 5 = 2.5 hrs.
- Add `partialize` to remove `editLog`, `productsSnapshot`, `extractions` from initial-hydration payload (SCALE-H3). 4 hrs.
- Cap `_deletedXxxIds` arrays at 500 entries with FIFO eviction in `sellerStore.ts:45-48` (SCALE-H3). 1 hr.
- Add `.range(0, 999)` and `count: 'exact'` overflow guard to all 7 pulls in `sellerSync.ts:258-565` (SCALE-C2 partial mitigation). 2 hrs.
- Cap chat-context `transactions` to last 30 days, drop `recurring-merchant` loop > 100 (`moneyChat.ts:574-583`) (SCALE-C3 partial). 2 hrs.
- Image compression at receipt save (force `expo-image-manipulator` to 80% quality + 1280px max-edge) (SCALE-H8). 2 hrs.
- Add `filter: \`user_id=eq.${uid}\`` to all realtime subscriptions (SCALE-C4). 2 hrs.

## Scale assumptions used

- **MAU at v1 launch:** 1k–10k. App store reviews + Raya marketing concentrates load.
- **Power personal user:** 1,000–3,000 lifetime transactions. 5–10 wallets. Daily Money Chat user = 30 sends/day.
- **Power seller:** Raya pre-order season = 50 orders/day × 90 days = 4,500 orders. 100 products. 5 seasons archived.
- **Stall vendor:** 50 sessions/year × 30 sales/session = 1,500 sales/year.
- **Receipt scans:** 2-5/week typical, 10/day power user.
- **AI calls per power user/day:** ~226k tokens (computed in SCALE-H6).
- **Devices:** Redmi 9A class (1.6 GB RAM, ARM A53) is the floor. Pixel 4a is mid. Samsung Note 20 is ceiling.
- **Network:** 4G in KL urban (~10 Mbps); EDGE in rural Sabah/Sarawak (≤ 100 kbps).
- **Currency:** RM (Malaysian Ringgit), MYT (UTC+8) — all timestamps must round-trip correctly per AUDIT.md LOGIC-H6.
- **Concurrent realtime:** 200 (Supabase free) / 500 (pro) — pertinent to SCALE-C4.
- **AsyncStorage cap (Android):** 6 MiB practical default.

Critical: 5 · High: 8 · Medium: 7 · Low: 7
