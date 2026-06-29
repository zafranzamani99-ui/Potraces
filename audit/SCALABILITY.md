# Potraces — Scalability Audit
**Date:** 2026-06-20
**Stack:** RN 0.81.x, Expo SDK 54, Supabase, Gemini + Groq via ai-proxy Edge Function, EAS Update
**Auditor:** scalability-auditor

---

## 60-second read

The single biggest ceiling remains **cold-start hydration of 24 AsyncStorage-persisted Zustand stores**: at 3,000 personal transactions or 4,500 seller orders the JS thread blocks for 750 ms–1.5 s on a Redmi 9A before the first pixel paints. The second ceiling is **push tombstone reads**: every sync cycle fires 7 unbounded `select('local_id, updated_at')` queries with no `.range()` — PostgREST silently caps at 1,000 rows, so a Raya seller with 4,500 orders loses the rows 1,001–4,500 from the diff and the tombstone filter then mass-deletes them from remote. The third ceiling is **`pullAll()` doing a full 10-table dataset transfer on every cold start with no `updated_at` cursor** — even after the existing pagination fix (`pullPaged`), a seller with 4,500 orders still downloads ~13 MB of JSON over the network on every app open.

Compared to the May 2026 audit, several items have improved: `pullPaged` now paginates beyond 1,000 rows (fixing the pull-side truncation from SCALE-C2), `tombstoneStore` has 30-day TTL pruning, the RLS subquery migration (`20260520000000`) has been applied across seller and personal tables, and the order-link insert path is now hardened through the `place-order` Edge Function with a flood cap. New ceilings found in this pass focus on the push-side tombstone truncation, the missing `updated_at` cursor, O(n) post-pull recomputation, and two tables missed by the subquery migration.

---

## Scale assumptions used

- **MAU at v1 launch:** 1,000–10,000. Seller mode is Supabase-backed; personal mode is local-first (zero server load unless personal cloud sync is opted in, which is currently dormant/gated).
- **Power personal user:** 1,000–3,000 lifetime transactions, 5–10 wallets, 30 chat sends/day.
- **Power seller (Raya scenario):** 50 orders/day × 90 days = 4,500 orders. 100 active products. 5 archived seasons.
- **Stall vendor:** 50 sessions/year × 30 sales/session = 1,500 sales/year.
- **Concurrent seller logins:** 100–1,000 during Raya marketing peak.
- **Receipt scans:** 2–5/week typical, 10/day power user.
- **AI calls/user/day (power user):** ~226k tokens (modelled in SCALE-H6 from May audit).
- **Devices:** Redmi 9A (1.6 GB RAM, ARM Cortex-A53, ~250 ms/MB JSON.parse) is the floor; Pixel 4a is mid; Samsung Note 20 is ceiling.
- **Network:** 4G in KL urban (~10 Mbps); EDGE in rural Sabah/Sarawak (≤100 kbps).
- **AsyncStorage cap (Android):** 6 MiB practical default on unmodified builds.
- **PostgREST default page size:** 1,000 rows when `.range()` is omitted.

---

## Critical (will break in production at expected scale)

### SCALE-C1. AsyncStorage cold-start parse blocks JS thread for 24 stores
*(Carried from May 2026 audit — new detail on App.tsx hydration list)*

**Files:** `App.tsx:90-98` (7-store `Promise.all` wait); `src/store/personalStore.ts:532-560` (`onRehydrateStorage` deeply walks transactions, editLog, playbookLinks, subscriptions, goals, budgets); `src/store/sellerStore.ts:83-110` (orders array includes full `items` jsonb); all 24 stores in `src/store/*.ts`.

**What:** All 24 persisted stores serialize to single AsyncStorage TEXT rows and are `JSON.parse`'d synchronously on the JS thread at every cold start. `App.tsx` blocks render on 7 stores via `Promise.all([waitForStore(useSellerStore), …])`.

**Breakeven N + assumption:** 3,000 personal transactions × ~400 B = 1.2 MB; plus walletStore, debtStore, notesStore, receiptStore ≈ 2.5–3.5 MB total. Redmi 9A parse cost: 250 ms/MB → **625–875 ms blocked JS thread** just for `JSON.parse` + `onRehydrateStorage` walks. A Raya seller at 4,500 orders × ~1.5 KB (items jsonb) = **6.75 MB in `sellerStore` alone** — exceeds the 6 MiB Android default cap and causes a write failure on the next mutation; the entire store is lost silently.

**Symptom at N:** At 3,000 transactions: white splash screen for 750 ms+ before first render on Redmi 9A. At 4,500 seller orders: `AsyncStorage` write failure on next transaction → sellerStore reset to empty on subsequent launch → full re-pull from Supabase triggers tombstone logic → mass remote deletion (amplifies SCALE-C6).

**Scenario:** Mak Cik Siti runs her kuih stall for a full Raya season. By day 90 she has 4,500 orders. She opens the app on her Redmi 9A. `sellerStore` JSON blob is 6.75 MB — AsyncStorage write fails. On next cold start the store hydrates empty. `syncAll` runs with 0 local orders → tombstone diff sees all 4,500 remote orders as "not in local set" → `pushOrders` deletes all 4,500 orders from Supabase.

**Fix:**
1. Short-term (4 hrs): Add `partialize` to every store to exclude `editLog`, `productsSnapshot`, `extractions`, old archived-season orders. Cap persisted orders to the most-recent 500 using `_archivedSeasonIds` gate.
2. Medium-term (3–5 days): Migrate heavy arrays (`transactions`, `orders`, `ingredientCosts`) to `expo-sqlite` with indexed columns. Hydrate only current-month data on cold start; lazy-load history on scroll.
3. Workaround now (1 hr): Increase AsyncStorage DB size in `react-native-async-storage` config: set `AndroidConfig.asyncStorageDBSize = 25`.

**Effort:** partialize = 4 hrs; SQLite migration = 3–5 days.

---

### SCALE-C2. `sellerSync.pullAll()` does full 10-table dataset transfer on every cold start — no `updated_at` cursor
*(Carried and updated — `pullPaged` now paginates correctly, eliminating the silent 1,000-row truncation on PULL. The mass-deletion risk on pull is resolved. The ceiling is now purely the bandwidth and latency cost of a full dataset pull on every app open.)*

**File:** `src/services/sellerSync.ts:766-800` — `pullAll()` fires 10 parallel `Promise.all` queries each fetching `select('*')` from the respective table with `.range(from, to)` pagination but **no `gte('updated_at', lastSyncAt)` cursor**. Every cold start downloads the entire dataset.

**What:** No incremental sync. Every cold start = full re-download of all seller data.

**Breakeven N + assumption:** 4,500 orders × ~3 KB JSON per row = **13.5 MB network payload** on every app open. On 4G (KL, ~10 Mbps): ~11 s. On EDGE (rural Sabah, 100 kbps): **18 minutes**. 1,000 sellers each cold-starting once per morning = **13.5 GB data transfer/day** from Supabase egress (free tier: 2 GB/month; pro: 250 GB/month). At 1,000 sellers the pro tier egress cap is hit in 19 days of daily syncs.

**Symptom at N:** On 4G, seller sees "Syncing…" spinner for 11+ seconds before the order list is usable. On EDGE the app appears frozen. Pro plan egress overage costs $0.09/GB after cap.

**Scenario:** Ahmad runs a pre-order season from Sabah (EDGE rural coverage). He opens the app each morning to check orders. By month 3, his 3,000 orders take 12 minutes to sync on app open. He gives up and switches to WhatsApp.

**Fix:**
1. Add `lastSyncAt` timestamp per entity type, persisted in `sellerStore` or a dedicated `syncMetaStore`.
2. In `pullPaged`, add `.gte('updated_at', lastSyncAtIso)` before `.range(from, to)`.
3. After a successful sync, persist `lastSyncAt = new Date()` for each table.
4. Keep the full pull as a "force refresh" option (pull-to-refresh on OrderList).

**Effort:** 1–2 days. Resolves the bandwidth ceiling entirely.

---

### SCALE-C3. `moneyChat.ts` rebuilds entire financial context per chat send
*(Carried from May 2026 audit — unchanged.)*

**File:** `src/services/moneyChat.ts:397-820`.

**Breakeven N:** At 10,000 transactions, context build time ~400 ms; output string ~100 KB. At 1,000 active sellers (business context) + 1,000 personal users each sending 30 messages/day = 60,000 context builds/day. Compounds with AI proxy budget.

**Fix:** Pre-compute monthly aggregates on write; cap raw-tx context to last 30 days. See May 2026 audit for full detail.

---

### SCALE-C4. Realtime subscription scope is unfiltered full-table `seller_orders` broadcast
*(Carried from May 2026 audit — `place-order` now uses service role so order-link inserts still trigger realtime. Filter still missing.)*

**File:** `supabase/migrations/20260307172000_enable_realtime.sql`.

**Breakeven N:** 500 concurrent sellers (Supabase Pro realtime connection limit) during Raya peak. See May 2026 audit for full detail.

---

### SCALE-C5. `RootNavigator.tsx` re-mounts all sub-mode stacks on mode/incomeType change
*(Carried from May 2026 audit — unchanged.)*

**File:** `src/navigation/RootNavigator.tsx:1-567`.

**Breakeven N:** 10+ mode toggles/session on Redmi 9A = 1.2 s accumulated dead time per session.

---

### SCALE-C6 (NEW). Push tombstone reads are unbounded — 7 sequential full-table selects with no `.range()` on every sync
**Files:** `src/services/sellerSync.ts:309-312` (products tombstone read); `:427-431` (orders); `:477-480` (seasons); `:523-525` (customers); `:570-573` (ingredient costs); `:615-618` (recurring costs); `:656-659` (cost templates). All 7 are `.select('local_id, updated_at').eq('user_id', ...)` with **no `.range()` and no PULL_PAGE pagination**.

**What:** The pull path (`pullPaged`) correctly paginates. The push tombstone reads do not. PostgREST silently caps at 1,000 rows when `.range()` is absent. For a seller with more than 1,000 orders (or 1,000 of any entity), the tombstone diff sees only the first 1,000 remote rows; the remaining rows are absent from `remote` → they pass the tombstone filter (`!localIds.has(r.local_id) && r.updated_at < syncStart`) → they are **hard-deleted from Supabase** on the next `pushOrders` call.

**Breakeven N + assumption:** PostgREST default page size = 1,000 rows. A seller with **1,001 app-originated orders** loses order number 1,001+ on the next sync. This is a lower threshold than C2's pull-side truncation (which is fixed) — the push tombstone reads are currently still unbounded.

**Symptom at N:** Silent permanent data loss. Orders beyond row 1,000 are deleted from remote with no warning. The seller's cloud backup is silently corrupted. If they reinstall the app, those orders do not return.

**Scenario:** Ramesh runs a pre-order kuih business for two Raya seasons. By season 2 he has 1,200 orders in total. On the next cold-start sync after adding order 1,001, the tombstone read on `seller_orders` fetches only 1,000 rows (PostgREST cap), misses orders 1,001–1,200, and `pushOrders` hard-deletes all 200 from Supabase. Ramesh's cloud records are permanently corrupted.

**Fix:** Apply the same `pullPaged` pattern to every tombstone read. Replace each bare `.select('local_id, updated_at').eq('user_id', ...)` with a paginated loop. Alternatively, switch tombstone logic to use the `_deletedXxxIds` arrays (already maintained in the store) as the primary deletion signal, eliminating the remote full-table read entirely.

**Effort:** 2–3 hours. High-leverage fix — apply before any seller reaches 1,000 orders.

---

## High (will break before the next major version)

### SCALE-H1. No FlatList `getItemLayout` on 25/26 long-list screens
*(Carried from May 2026 audit — unchanged.)*

**Breakeven N:** Visible jank at 200+ rows; 400 ms scroll-to-bottom freeze at 2,000 orders.

### SCALE-H2. Dashboard `.map()` over arrays without FlatList virtualization
*(Carried from May 2026 audit — unchanged.)*

**Breakeven N:** 1,500 personal transactions → 180 ms Dashboard mount on Redmi 9A.

### SCALE-H3. No `partialize` — entire state including ephemeral flags persists to AsyncStorage
*(Carried from May 2026 audit — unchanged. Note: `_deletedProductIds` now has a 500-entry cap via `.slice(-500)` at `sellerStore.ts:141`. Other tombstone arrays remain uncapped.)*

### SCALE-H4. Push trigger `pg_net.http_post` per `seller_orders` insert fires synchronously in DB transaction
*(Carried from May 2026 audit. Updated: now sends to ALL `device_tokens` rows in a `FOR ... LOOP`, so cost is `O(devices)` pg_net calls per order insert. A seller with 3 devices = 3 pg_net calls per order.)*

**File:** `supabase/migrations/20260616000000_order_push_device_tokens.sql:50-80`.

**Breakeven N:** 100 sellers × 20 orders/min peak = 2,000 pg_net calls/min × average 2 devices = 4,000 calls/min vs ~600/min pg_net worker capacity (Supabase default). Queue backs up → push delivery delayed by minutes, not seconds.

### SCALE-H5. `auth.uid()` called per-row in 11 personal-sync RLS policies — STABLE but not subqueried
*(Status: RESOLVED by `20260520000000_rls_subquery_auth_uid.sql` for seller + personal tables. Marking resolved. New finding SCALE-H10 covers the tables missed by that migration.)*

### SCALE-H6. AI cost ceiling: receipt + statement + chat + intent + mirror uncapped per-user
*(Carried from May 2026 audit. Updated: `ai-proxy` now enforces a 1,500,000 token/month cap and 3,000 call/month cap server-side via `ai_proxy_usage` table. This resolves the unbounded-cost path for the proxy. Remaining risk: the `parse-statement` edge function uses the older `ai_usage` table with a different enforcement path — verify it also routes through `ai-proxy` or has equivalent enforcement. See SCALE-H6 original for full cost model.)*

**Files:** `supabase/functions/ai-proxy/index.ts:50-56` (MONTHLY_TOKEN_CAP=1,500,000; MONTHLY_CALL_CAP=3,000); `supabase/migrations/20260417200000_ai_usage.sql` (separate `parse-statement` quota table).

### SCALE-H7. Sync conflict resolution is last-write-wins — silent multi-device data loss
*(Carried from May 2026 audit — unchanged.)*

### SCALE-H8. `documentDirectory/receipts/` storage growth never evicted (~156 MB/year)
*(Carried from May 2026 audit — unchanged.)*

---

### SCALE-H9 (NEW). `pullAll()` post-merge O(orders × items) `totalSold` recomputation runs on every sync
**File:** `src/services/sellerSync.ts:985-1007`.

**What:** After merging remote orders into local state, `pullAll()` iterates over `allOrders` (every order ever), then for each order iterates over `order.items`, to rebuild `totalSold` per product. This O(orders × items) computation runs on the JS thread inside `pullAll()` which already runs inside `syncAll()` on every cold start and every foreground transition.

**Breakeven N + assumption:** 4,500 orders × average 3 items each = 13,500 item iterations, plus a `.map()` over all products to patch `totalSold`. On Redmi 9A (single-core JS, ~50M simple ops/sec): ~5–10 ms. Acceptable alone, but this runs after 10 parallel network requests in `pullAll()` and before the render unblocks. At 10,000 orders (2+ seasons accumulated): ~25 ms on top of an already heavy cold-start sequence.

**Symptom at N:** Adds 10–25 ms of JS-thread stall to an already slow cold start. Not a hard crash but contributes to the perceptible freeze.

**Scenario:** Mak Cik Siti has archived 3 seasons and is in her 4th. Total orders across all seasons: 6,000. Every time she opens the app, `pullAll()` iterates all 6,000 orders to recompute `totalSold`. Combined with C1 hydration and C2 full pull, her cold start exceeds 3 seconds.

**Fix:** Maintain `totalSold` as an incremental counter: increment on `addOrder`, decrement on `deleteOrder`/`markCancelled`. Only recompute from scratch on explicit "repair" action. The current recomputation is only needed when remote orders arrive that weren't reflected locally — scope it to `newOrders` only (the items added during this pull), not all orders.

**Effort:** 2–3 hours.

---

### SCALE-H10 (NEW). `device_tokens` and `payment_events` RLS policies use bare `auth.uid()` — missed by the subquery migration
**Files:**
- `supabase/migrations/20260611000000_qr_payments_push.sql:24-25` — `device_tokens_owner` policy: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- `supabase/migrations/20260611000000_qr_payments_push.sql:64` — `payment_events_owner_read`: `FOR SELECT USING (auth.uid() = user_id)`

**What:** The `20260520000000_rls_subquery_auth_uid.sql` migration wrapped `auth.uid()` in `(select auth.uid())` across seller and personal tables. The `device_tokens` and `payment_events` tables were created after that migration and use bare `auth.uid()`. On bulk operations (e.g. multiple concurrent device token registrations or a batch payment event read), Postgres evaluates `auth.uid()` per row rather than once per query.

**Breakeven N + assumption:** `device_tokens` is read/written on every app launch (push token registration). At 100 concurrent logins during peak: 100 SELECT + 100 UPSERT operations each evaluating `auth.uid()` per-row. Low absolute cost but inconsistent with the rest of the codebase and will bite on any bulk INSERT of payment events (e.g. webhook replay of 1,000 events).

**Symptom at N:** 10× slower bulk inserts on `device_tokens` and `payment_events` compared to other tables. Not user-visible at current scale but creates a maintenance inconsistency.

**Fix:** Add a migration that recreates both policies with `(select auth.uid())`:
```sql
drop policy if exists device_tokens_owner on public.device_tokens;
create policy device_tokens_owner on public.device_tokens
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists payment_events_owner_read on public.payment_events;
create policy payment_events_owner_read on public.payment_events
  for select using ((select auth.uid()) = user_id);
```

**Effort:** 30 minutes. Quick win.

---

### SCALE-H11 (NEW). `place-order` flood-cap query lacks a composite index — sequential scan at 1,000 sellers
**File:** `supabase/functions/place-order/index.ts:127-138` — queries `seller_orders` filtered by `seller_id + source='order_link' + created_at > longSince`.

**What:** The flood-cap check in `place-order` runs:
```sql
SELECT created_at FROM seller_orders
WHERE seller_id = $1 AND source = 'order_link' AND created_at > $2
ORDER BY created_at ASC
```
The existing index is `seller_orders_seller_id_idx ON seller_orders(seller_id)` (`20260307062816_seller_schema.sql:119`). There is no composite index covering `(seller_id, source, created_at)`. Postgres must scan all rows for the seller then filter on `source` and `created_at` in memory.

**Breakeven N + assumption:** This query executes on every public order page submission. At 1,000 sellers each with a shop link, a concurrent order rush (e.g. viral TikTok post for one seller) could generate 50 req/s on `place-order`. Each request does a sequential scan over that seller's order history. A seller with 4,500 orders: each flood-cap check reads 4,500 rows then filters to the last 10 minutes. At 50 req/s: 225,000 row reads/second on the `seller_orders` table.

**Symptom at N:** `place-order` response time degrades from <100 ms to 1–5 seconds at concurrent load. Flood-cap logic meant to protect the seller starts blocking legitimate customers. Supabase postgres CPU spikes.

**Scenario:** Nurul's laksa pre-order link goes viral. 200 customers try to order simultaneously. Each triggers a `place-order` call. Without the composite index, each call scans Nurul's 2,000 existing orders. The DB CPU spikes, latency climbs to 3–5 seconds, and customers see timeouts.

**Fix:** Add a single migration:
```sql
create index if not exists seller_orders_flood_cap_idx
  on public.seller_orders(seller_id, source, created_at desc)
  where source = 'order_link';
```
This makes the flood-cap query an index-only scan returning only the relevant rows.

**Effort:** 15 minutes. Highest leverage quick win in this audit.

---

### SCALE-H12 (NEW). `ai-proxy` creates a new `createClient()` on every HTTP request — no connection pooling
**File:** `supabase/functions/ai-proxy/index.ts:92-94`.

**What:** Every POST to `ai-proxy` calls `createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })` inside `Deno.serve()`. The Supabase JS client establishes a new HTTP connection to the Supabase REST API on each instantiation (for the budget check and usage upsert at minimum 2 DB calls). Deno Edge Functions do not share module-level state across invocations in the same isolate consistently, but within a single warm invocation the client is re-created unconditionally.

**Breakeven N + assumption:** At 100 concurrent AI calls (100 sellers × 1 chat send): 100 `createClient()` instantiations, each with 2 DB round-trips (budget check + usage upsert) = 200 Supabase REST calls, each needing a TCP connection. Supabase free tier connection pool: 60 connections; pro: 200. At 100 concurrent proxy calls: 200 connection attempts against a 60-connection pool → connection queuing → latency spikes on budget checks → budget check times out → `catch {}` silently skips the check → users are served despite potential over-budget.

**Symptom at N:** At 100+ concurrent AI calls, budget enforcement degrades silently (the `catch {}` on the budget check at `index.ts:142` fails open, allowing over-budget calls through). Cost overruns occur without triggering the 403 BUDGET_EXCEEDED response.

**Fix:** Hoist `createClient()` to module level (outside `Deno.serve()`):
```ts
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```
Deno Edge Function isolates re-use module-level state within the same warm isolate, amortizing the connection cost across requests.

**Effort:** 5 minutes. One-line move.

---

## Medium (technical debt accumulating)

### SCALE-M1. 24 Zustand stores, 6+ dormant yet hydrated on cold start
*(Carried from May 2026 audit. Note: `tombstoneStore` added as a 24th store since May audit; it has 30-day TTL pruning which is good, but still hydrates on cold start.)*

### SCALE-M2. 6 income-type sub-modes: copy-paste duplication
*(Carried from May 2026 audit — unchanged.)*

### SCALE-M3. `shop-logos` and `product-images` buckets have no orphan-cleanup job
*(Carried from May 2026 audit — unchanged.)*

### SCALE-M4. Category picker re-renders entire list per keystroke (no virtualization)
*(Carried from May 2026 audit — unchanged.)*

### SCALE-M5. `date-fns format()` called per-row in TransactionsList render
*(Carried from May 2026 audit — unchanged.)*

### SCALE-M6. Premium quota counter is per-app-install, not per-user
*(Carried from May 2026 audit. Note: `ai-proxy` now has server-side enforcement by `identity`, which is `dev:<device-id>` for unauthenticated users — reinstall rotates device-id and resets the budget. Premium AI quota remains bypassable via reinstall.)*

### SCALE-M7. `personalStore` rehydration walks deeply nested structures per transaction
*(Carried from May 2026 audit.)*

---

### SCALE-M8 (NEW). `pushOrders` sends all orders (every season, every status) in a single upsert on every sync — no dirty flag
**File:** `src/services/sellerSync.ts:339-371` — `pushOrders` maps `appOrders` (all non-order_link orders) into rows and upserts them unconditionally. `syncAll` calls `pushOrders(store.orders, profileId)` passing the full `store.orders` array.

**What:** Every sync cycle upserts every order regardless of whether it changed since the last sync. A seller with 4,500 orders sends a 4,500-row upsert batch to Supabase on every cold start, foreground transition, and debounced auto-sync (triggered 1.5 s after any mutation).

**Breakeven N + assumption:** 4,500 orders × ~1.5 KB JSON per order = **6.75 MB upsert payload** per sync cycle. The debounced auto-sync fires 1.5 s after every mutation (e.g. every time an order status is updated): a seller processing 50 orders at a market generates 50 sync events, each uploading 4,500 rows. On 4G: 50 × ~2 s upload = **100 seconds of upload traffic** in one session. Supabase rate limits REST at 1,000 requests/minute per project on free tier; 9 push functions × 50 syncs = 450 requests — close to the limit with only one heavy seller.

**Symptom at N:** Persistent "Syncing…" overlay during active order processing. Background sync competes with foreground rendering. Mobile data usage is excessive (6.75 MB per sync for a heavy seller = 200+ MB/day of background uploads on a busy market day).

**Scenario:** Farah manages a market stall during a weekend bazaar. She processes 50 orders over 4 hours, triggering 50 auto-sync cycles. Each cycle uploads all 3,000 historical orders plus the 50 new ones. Her phone's mobile data limit (1 GB/day on a cheap prepaid plan) is exhausted by mid-afternoon.

**Fix:** Add a `_dirtyOrderIds: Set<string>` flag to `sellerStore`. Mark an order dirty on `addOrder`, `updateOrder`, `updateOrderStatus`, `markOrderPaid`. In `pushOrders`, filter `appOrders` to dirty ones only; clear the dirty set on successful upsert. For full-sync scenarios (first sync after install), keep a `_fullSyncRequired` flag that bypasses the dirty check once.

**Effort:** 1 day.

---

### SCALE-M9 (NEW). `personalStore.onRehydrateStorage` is an O(n × m) nested walk on every cold start
**File:** `src/store/personalStore.ts:532-575` — `onRehydrateStorage` maps over `state.transactions` walking `editLog`, `playbookLinks`; over `state.subscriptions` walking `paymentHistory`; over `state.goals` walking `contributions` and `milestones`; over `state.budgets`.

**What:** The rehydration hook reconstructs Date objects from ISO strings across multiple nested arrays for every stored entity. This is necessary for correctness but the traversal depth (transaction → editLog[] → each edit; goal → contributions[] → each contribution) means the JS work scales as O(transactions + sum(editLog lengths) + sum(contributions lengths)).

**Breakeven N + assumption:** At 3,000 transactions, each with an average 0.3 edit log entries = 900 editLog entries. Goals: 10 goals × 12 contributions = 120. Total nested items traversed: ~4,200. Each `.map()` call allocates a new object. On Redmi 9A (1.6 GB, A53): ~15–25 ms additional cost over raw `JSON.parse`. Not catastrophic alone, but adds to the cold-start block after C1's parse.

**Symptom at N:** 15–25 ms additional JS thread block during `onRehydrateStorage` beyond the `JSON.parse` cost. Adds to the cold-start freeze users feel before first render.

**Fix:** Pre-convert Date objects at write time (store as ISO strings in the state, convert to Date at the selector level with `useMemo`). Or use `superjson` as the AsyncStorage serializer (handles Date ↔ string automatically without a manual walk). Short-term: batch the `onRehydrateStorage` walk in a `requestIdleCallback` equivalent after the loading state is cleared.

**Effort:** 4–8 hours.

---

## Low (watch list)

### SCALE-L1. `react-native-chart-kit` re-computes path geometry on every render
*(Carried from May 2026 audit — unchanged.)*

### SCALE-L2. `xlsx` 0.18 Excel export may OOM at 10k+ transactions on 1 GB devices
*(Carried from May 2026 audit — unchanged.)*

### SCALE-L3. EAS OTA bundle size grows with translation coverage
*(Carried from May 2026 audit — unchanged.)*

### SCALE-L4. Expo Push API throughput ceiling at 600 notifications/sec
*(Carried from May 2026 audit — unchanged.)*

### SCALE-L5. `playbookStore` appends extraction history on every AI run with no cap
*(Carried from May 2026 audit — unchanged.)*

### SCALE-L6. `_seenOnlineOrderIds` is the only capped tombstone set (cap 200); `_deletedOrderIds`, `_deletedSeasonIds`, `_deletedCustomerIds`, `_deletedCostIds` are uncapped (except `_deletedProductIds` which now has `.slice(-500)`)
*(Carried from May 2026 audit. Partially improved: `_deletedProductIds` now has a 500-entry cap.)*

### SCALE-L7. Reanimated 4.x + Worklets on older Android — crash risk on ARMv7
*(Carried from May 2026 audit — unchanged.)*

---

### SCALE-L8 (NEW). `place-order` flood cap uses in-memory time arithmetic from DB timestamps — no server-side clock pinning
**File:** `supabase/functions/place-order/index.ts:130-158`.

**What:** The flood cap computes `now = Date.now()` in the Deno runtime then passes `new Date(now - FLOOD_WINDOW_LONG_MS).toISOString()` as a filter to the DB. If the Deno runtime clock drifts or if the Supabase DB clock differs from the Edge Function clock, the window boundaries shift. This is a low-severity watch-list item: Deno and Postgres both sync to NTP, so drift is typically <1 s. At the current flood limits (10/min, 60/10min), 1 s of drift doesn't matter.

**Fix:** Use `now()` in a server-side RPC instead of client-side time. Low priority.

---

## Quick wins (under 4 hours each)

1. **SCALE-H11 (NEW)** — Add composite index `(seller_id, source, created_at desc)` on `seller_orders`. One migration, 15 minutes. Eliminates sequential scan on every public order submission.
2. **SCALE-H10 (NEW)** — Wrap `auth.uid()` in `(select auth.uid())` in `device_tokens` and `payment_events` policies. One migration, 30 minutes.
3. **SCALE-H12 (NEW)** — Hoist `createClient()` to module level in `ai-proxy/index.ts`. One-line move, 5 minutes.
4. **SCALE-C6 (NEW)** — Apply `pullPaged` to all 7 tombstone reads in `sellerSync.ts`. 2–3 hours. Prevents mass-deletion above 1,000 orders.
5. **SCALE-H9 (NEW)** — Scope `totalSold` recomputation to newly-merged orders only, not all orders. 2–3 hours.
6. **SCALE-H1** — Add `getItemLayout` to TransactionsList, OrderList, SessionHistory, IncomeHistory, CostHistory. 30 min × 5 = 2.5 hrs.
7. **SCALE-H3** — Add `partialize` to remove `editLog`, `productsSnapshot`, `extractions` from initial-hydration payload across 24 stores. 4 hrs.
8. **SCALE-H5** — Already resolved by `20260520000000_rls_subquery_auth_uid.sql`.
9. **SCALE-C2 partial** — Add `gte('updated_at', lastSyncAt)` cursor to `pullPaged` calls in `sellerSync.ts`. 1–2 days, eliminates full-dataset download on every cold start.

---

## Compounds-with (cross-references to existing backlog items)

- **SCALE-C6 amplifies SCALE-C1**: If sellerStore's persisted JSON exceeds the AsyncStorage cap (6 MB), the store resets to empty on next launch, triggering `syncAll` with 0 local orders, which then causes the C6 tombstone to delete all remote orders.
- **SCALE-C6 amplifies LOGIC-C4** (BACKLOG): C6 is a new occurrence of the same tombstone-deletion class at a different breakpoint (push reads, not pull truncation).
- **SCALE-C2 amplifies SCALE-H4**: Each full-pull cycle on foreground transitions multiplies with the push notification trigger — a foreground transition pulls + pushes, triggering `pg_net.http_post` for each modified order row.
- **SCALE-H6 amplifies SEC-H5** (BACKLOG): `ai-proxy` device-id identity means reinstall resets the token budget; server-side enforcement is only as strong as device-id stability.
- **SCALE-M8 amplifies SCALE-C2**: The dirty-flag absence means every sync uploads the full order set AND downloads the full order set — double the traffic on every sync cycle.
- **SCALE-H12 amplifies SCALE-H6**: If budget checks time out due to connection pool exhaustion, the `catch {}` fail-open lets over-budget calls through, negating the 1.5M token cap.

---

Critical: 6 · High: 12 · Medium: 9 · Low: 8
