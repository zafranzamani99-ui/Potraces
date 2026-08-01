# Offline Resilience Audit

**Date**: 2026-05-28
**Auditor**: Claude Opus 4.6
**Scope**: All services, stores, sync logic, and screens that touch the network
**Target users**: Malaysian street vendors and Grab riders in areas with unreliable connectivity

---

## Executive Summary

The app is **local-first by architecture** (Zustand + AsyncStorage persistence), so core data entry works fully offline. However, there are **significant gaps** in how the app communicates offline status to users, handles extended offline periods during sync, and recovers from partial sync failures. The biggest risk is the **tombstone-based sync** that can delete remote data if the pull phase fails silently after a long offline period.

**Severity scale**: CRITICAL (data loss risk), HIGH (broken workflow), MEDIUM (poor UX), LOW (minor)

---

## 1. Feature-by-Feature Offline Status

### Fully Offline (works without network)

| Feature | Notes |
|---|---|
| Add/edit/delete transactions | Zustand + AsyncStorage, instant persist |
| Add/edit/delete orders (seller) | Local-first, syncs later |
| Manage products, seasons, customers | Local-first, syncs later |
| Wallet management (add, transfer, balance) | Local-first |
| Budget planning | Local-first |
| Goal tracking + contributions | Local-first |
| Debt/split tracking + payments | Local-first |
| Savings tracker | Local-first |
| Subscription management | Local-first |
| Notes (NoteEditor) | Local-first; AI extraction requires network |
| Settings (theme, language, categories) | Local-first |
| Dashboard (all modes) | Reads from local stores |
| Cost management (seller) | Local-first; receipt image upload deferred |

### Partially Offline (degrades gracefully)

| Feature | Online Part | Offline Behavior | User Told? |
|---|---|---|---|
| Receipt scanning | Gemini AI API | **YES** - queued for later via `receiptQueue`. Alert shown: "no connection right now -- we've queued this receipt" | **YES** |
| FX rates | open.er-api.com | Falls back to hardcoded Jan 2026 rates. 24h cache in AsyncStorage | **NO** - silently uses stale/fallback rates |
| Seller cost receipt images | Supabase storage upload | Stored locally as `receiptLocalUri`; uploaded on next sync | **NO** - silent |
| Push notification registration | Supabase profile update | Silently skipped | N/A |

### Does NOT Work Offline (requires network)

| Feature | Failure Mode | User Told? | Severity |
|---|---|---|---|
| MoneyChat (AI assistant) | Gemini API call fails | Shows generic error ("Could not reach AI") | MEDIUM |
| Import from bank statement | Supabase edge function `parse-statement` | Returns `{ error: 'network' }` | MEDIUM |
| Sign in / Sign up / OTP verification | Supabase auth | Shows error from Supabase SDK | LOW |
| Shop logo upload | Supabase storage | Returns null silently | HIGH |
| Product image upload | Supabase storage | Returns null silently; **user thinks upload worked** | HIGH |
| Order link (public page) | Supabase REST API fetch | Shows skeleton loading forever or error state | MEDIUM |
| Note AI extraction | Gemini API | Shows error message | MEDIUM |
| Seller receipt scan (cost docs) | Gemini API | Shows error but does NOT queue for later (unlike personal receipt scan) | **HIGH** |

### CRITICAL: No Global Offline Indicator

**Finding**: The app has **NO** offline banner, badge, or any persistent UI indication that the device is offline. NetInfo is imported in only 2 files (ReceiptScanner, receiptQueue). The user has no way to know their data isn't syncing.

**Risk**: A vendor could add 50 orders over a weekend market, not realize they're offline, then lose data if they sign out or switch devices before syncing.

**Recommendation**: Add a subtle persistent banner (e.g., "Offline -- data saved locally") that appears whenever `NetInfo.isConnected === false`. Show it on Dashboard screens at minimum.

---

## 2. Offline Data Accumulation (3 Days, 200 Transactions, 50 Orders)

### Does sync push ALL records?

**YES** -- both `sellerSync.syncAll()` and `personalSync.syncPersonal()` push the **entire** local state on every sync cycle, not just changed records. There is no delta/changelog tracking -- it's a full-state upsert.

**Pagination on pull**: `pullPaged()` in sellerSync correctly handles >1000 rows by paginating. personalSync's `pullTable()` does **NOT** paginate -- it does a single `.select('*')` which silently truncates at ~1000 rows via PostgREST default limit.

**CRITICAL Finding**: If a user accumulates >1000 personal transactions and syncs, `pullAll` will only fetch the first ~1000, then `deleteMissing` will tombstone-delete the rest from the server. **Data loss.**

### Queue or batch limit?

No queue system for data sync. No batch limits on upserts. Supabase PostgREST accepts large upserts, but there's no chunking -- a 200-row upsert goes as a single HTTP request. If the request times out or fails partway, **nothing is retried** for that entity type in the current cycle.

### How long does sync take? Does the app freeze?

Sync runs on the JS thread via `async/await`. It does NOT freeze the UI (JS event loop yields between awaits). However:

- **sellerSync**: Runs pull (9 paginated table fetches sequentially) then push (9 parallel upserts + tombstone deletes). With 200+ orders, this could take 10-30 seconds on slow connections.
- **personalSync**: Runs pull (11 parallel table fetches) then push (11 parallel upserts + 11 parallel tombstone deletes). Potentially 15-40 seconds.
- **No progress indicator**: User has zero visibility into sync progress. No spinner, no "syncing..." status.

### If sync fails partway, where does it resume?

**It doesn't.** There is no resume/checkpoint mechanism.

- `sellerSync.syncAll()`: Uses `Promise.allSettled` for pushes, so individual entity failures don't block others. But if `pullAll()` fails, the entire sync aborts (correct -- prevents tombstone wipe). On next trigger, it starts from scratch.
- `personalSync.syncPersonal()`: If pull fails, push is skipped entirely (correct). But the `inflight` promise guard means concurrent calls are coalesced -- if one fails, the next call runs fresh.
- **Tombstone IDs are only cleared on successful push**: Good -- if push fails for products, `_deletedProductIds` persist and retry next time.

### Can the user keep using the app during sync?

**YES** -- sync is fully async. The user can add/edit/delete records. However:

- **personalSync.pullAll** re-reads store state after fetch to avoid losing edits made during pull. Good.
- **sellerSync.pullAll** reads `useSellerStore.getState()` once at the start, then does NOT re-read after remote data is fetched. If user edits during pull, those edits are in the store but the `updatedProducts`/`updatedOrders` arrays were built from the stale snapshot. **Race condition**: local edits during pull could be overwritten by remote data if timestamps are close.

---

## 3. Auth Token Expiry Offline

### Can the user still use the app locally?

**YES**. Auth state (`useAuthStore`) is persisted via AsyncStorage. Even if the Supabase token expires, local state is fully accessible. The app never gates local features on token validity.

### When they reconnect, does token refresh happen automatically?

**YES, mostly.** Two mechanisms:

1. **Supabase client config**: `autoRefreshToken: true` in `supabase.ts`. The Supabase JS SDK automatically refreshes tokens on API calls.
2. **Manual proactive refresh**: Both `sellerSync.getSession()` and `personalSync.getSession()` check `expires_at` and call `refreshSession()` if within 60 seconds of expiry.

**Gap**: If the refresh token itself has expired (default 1 week for Supabase), `refreshSession()` fails. The `getSession()` helper returns the **expired** session as fallback (`return refreshed ?? session`). This means:

- The sync will attempt API calls with an expired token
- Supabase returns 401 errors
- `pullAll()` fails, sync aborts
- **No user notification** -- sync silently stops working

**CRITICAL Finding**: After ~1 week offline, sync silently breaks. The user must sign out and sign back in, but there's no prompt telling them to do so. The `onAuthStateChange` listener would fire `SIGNED_OUT` eventually (when the SDK detects the dead session), clearing business data -- but this is unpredictable timing.

### If refresh fails, what happens to unsaved data?

**Local data is safe** -- it's in AsyncStorage regardless of auth state. But it won't sync until the user re-authenticates. The risk is the user doesn't realize sync is broken and switches to a new device expecting their data to be there.

---

## 4. Conflict Resolution After Extended Offline

### Who wins? (Two devices editing the same records offline)

**Last-write-wins by `updatedAt` timestamp.**

- **sellerSync pull**: `if (sd(rp.updated_at).getTime() > sd(local.updatedAt).getTime())` -- remote wins if newer.
- **personalSync pull**: `mergeById()` compares `updatedAt` -- higher timestamp wins.
- **sellerSync push**: `upsert(..., { onConflict: 'user_id,local_id' })` -- Supabase upsert overwrites the row.

**Problems with this approach:**

1. **No field-level merging**: If device A edits the order `note` and device B edits the `status`, whichever has the later `updatedAt` wins for ALL fields. The other device's changes are silently lost.
2. **Clock skew**: If device A's clock is 5 minutes ahead, its edits always win regardless of actual edit order.
3. **No conflict detection or notification**: The user is never told "this record was edited on another device." Changes just silently overwrite.
4. **Tombstone race**: If device A deletes an order and device B edits it, the delete wins (tombstone logic deletes any remote row not in the local set, guarded by `updated_at < syncStart`). But device B will re-push the order on its next sync, resurrecting it. This ping-pong continues until both devices sync while online simultaneously.

### personalSync-specific issue:

`deleteMissing()` deletes remote rows that don't exist locally AND have `updated_at < syncStart`. This is designed to clean up after deletions, but after extended offline on two devices:

- Device A deletes record X, syncs -> X deleted from server
- Device B still has record X locally, syncs -> X re-uploaded to server (upsert)
- Device A syncs again -> sees X on server, pulls it back (resurrected)

There's **no durable tombstone table** for personal data (unlike seller cost categories which use `seller_deleted_cost_categories`). The `_deletedXxxIds` arrays are cleared after successful push.

---

## 5. Background Sync

**There is NO background sync.** No `expo-background-fetch`, no `expo-task-manager`, no background processing registered.

Data only syncs when:
1. App is opened (initial sync in `App.tsx` `init()`)
2. App returns to foreground (`AppState` listener)
3. Network connectivity restores (NetInfo listener in `App.tsx`)
4. After local data mutations (debounced 1.5s auto-sync)

**Impact**: If a seller receives order-link orders while the app is in the background or closed, they won't see them until they open the app. Push notifications partially mitigate this (notification on new order), but the actual data pull happens only on app open.

**Recommendation**: Consider `expo-background-fetch` for periodic sync (every 15-30 min when online). This is especially important for sellers who may have the app backgrounded while serving customers.

---

## 6. Network State Detection

### Does the app check NetInfo?

**YES**, but minimally:

- `App.tsx`: NetInfo listener triggers sync on offline-to-online transition. Good.
- `receiptQueue.ts`: Checks NetInfo before draining queue. Good.
- `ReceiptScanner.tsx`: Checks NetInfo on scan failure to decide whether to queue. Good.

### Does it show an offline indicator?

**NO.** There is no offline banner, icon, or any visual indication anywhere in the app. The user has no way to know they're offline unless they try a network-dependent feature and it fails.

### Does it queue operations for when connectivity returns?

**Only for receipt scans** (`receiptQueue`). All other operations (sync, image uploads, AI calls) simply fail silently or show a one-time error. There is no general-purpose operation queue.

**Missing**: When a product image or shop logo upload fails due to no connectivity, the upload is silently lost. The user sees no error and the image is gone.

---

## 7. Receipt Scanning Offline

### Personal receipt scanning:

**GOOD implementation.** When scan fails and device is offline:
1. Image URI is queued via `enqueueReceipt()` to AsyncStorage (`receipt-scan-queue-v1`)
2. Alert shown to user: "no connection right now -- we've queued this receipt"
3. Queue persists across app restarts (AsyncStorage)
4. Queue drains automatically on:
   - App foreground (`runReceiptDrain()`)
   - Network restoration (NetInfo listener)
5. Max 5 retry attempts per receipt, then dropped
6. Toast notification on successful drain

**Gap**: After 5 failed attempts, the receipt is silently dropped from the queue. The user is NOT notified that their receipt was permanently lost.

### Seller receipt scanning (cost documents):

**NOT queued.** `scanSellerReceipt()` in `receiptScanner.ts` throws on failure. The `CostManagement.tsx` screen shows the error but does NOT enqueue for retry. The user must manually re-scan when online.

**Inconsistency**: Personal receipts get offline queuing, but seller receipts (arguably more critical for business users in markets with bad connectivity) do not.

---

## 8. Supabase Realtime Offline

### Subscription setup:

`subscribeToOrderLinkOrders()` creates a single Postgres Changes channel filtering on `seller_id=eq.{profileId}` for INSERT events on `seller_orders`.

### When offline:

- The WebSocket connection drops
- Supabase JS v2 SDK has built-in reconnection with exponential backoff
- The channel will auto-reconnect when network returns

### Are missed events replayed?

**NO.** Supabase Realtime does NOT replay missed events. If an order-link order is placed while the seller is offline:

1. The INSERT event fires on the channel -- nobody listening
2. When the app reconnects, the channel resumes but past events are gone
3. **Mitigation**: `pullOrderLinkOrders()` runs on app startup and foreground, fetching all order_link orders. This catches missed realtime events.

**Gap**: If the app is open but the WebSocket is temporarily disconnected (e.g., walking between cell towers), a new order placed during the gap is not pulled until the next foreground cycle or manual refresh. There's no explicit "catch up on missed events" after reconnection.

**Recommendation**: After the channel reconnects (listen for `CHANNEL_STATES.joined`), trigger `pullOrderLinkOrders()` to catch any orders missed during the disconnect.

---

## 9. Data Integrity After Crash + Offline

### Persistence model:

All Zustand stores use `persist` middleware with `createJSONStorage(() => AsyncStorage)`. AsyncStorage is an async key-value store -- writes are batched and flushed to disk asynchronously.

### When does data persist?

Zustand `persist` middleware writes to AsyncStorage on **every state change**. So:
- User adds a transaction -> state updates -> AsyncStorage write queued immediately
- If app crashes between state update and AsyncStorage flush: **data lost**

**Risk window**: The gap between `setState()` and the AsyncStorage write completing. This is typically <100ms but could be longer under memory pressure on low-end Android devices.

### Storage integrity checks:

**GOOD**: `storageIntegrity.ts` runs on startup, checks all 21 persisted store keys for JSON parse errors. Corrupted blobs are cleared so stores can hydrate cleanly.

**Gap**: The integrity check clears corrupted stores but doesn't attempt recovery. The TODO comment says "surface a UI prompt that offers cloud restore once personal sync ships" -- personal sync has shipped, but this recovery path hasn't been implemented.

### immer middleware:

The stores use `immer` middleware, which means mutations are atomic within a single `set()` call. A crash mid-mutation (before `set` resolves) won't produce a half-written state -- either the old state persists or the new state does.

---

## 10. Order Link / Public Page Offline

The public order page (`docs/index.html`, hosted on Vercel at `jejakbaki.my`) is a **static HTML page** that fetches data from Supabase REST API client-side.

### Customer opens with bad network:

1. HTML loads (cached by Vercel CDN -- fast)
2. JavaScript fetches products from Supabase REST API
3. If fetch fails: **shows skeleton loader indefinitely** (no timeout, no error state visible from the HTML structure read)

**Gap**: No explicit offline handling in the order page. No "check your connection" message. No retry button visible. Customer sees an animated skeleton forever.

**Recommendation**:
- Add a fetch timeout (10s) with a user-friendly error: "Couldn't load the menu. Check your connection and try again."
- Add a retry button
- Consider caching the last-fetched product list in `localStorage` for instant display on revisit

---

## Critical Findings Summary

| # | Severity | Finding | File(s) |
|---|---|---|---|
| 1 | **CRITICAL** | personalSync `pullTable` does not paginate; >1000 rows causes `deleteMissing` to wipe server data | `personalSync.ts:409` |
| 2 | **CRITICAL** | No offline indicator anywhere in the app; user has no idea data isn't syncing | App-wide |
| 3 | **CRITICAL** | After ~1 week offline, auth token refresh silently fails; sync stops with no user notification | `sellerSync.ts:14-24`, `personalSync.ts:44-53` |
| 4 | **HIGH** | sellerSync `pullAll` reads store state once at start; user edits during long pull can be overwritten | `sellerSync.ts:755-756` |
| 5 | **HIGH** | Product image / shop logo upload failure is silent; user thinks upload worked | `sellerSync.ts:89-159` |
| 6 | **HIGH** | Seller receipt scan has no offline queue (unlike personal receipt scan) | `receiptScanner.ts`, `CostManagement.tsx` |
| 7 | **HIGH** | No field-level merge; last-write-wins on entire record silently drops concurrent edits | `sellerSync.ts`, `personalSync.ts` |
| 8 | **HIGH** | Receipt queue silently drops receipts after 5 failed attempts with no user notification | `receiptQueue.ts:77` |
| 9 | **MEDIUM** | No background sync; data only syncs when app is foregrounded | `App.tsx` |
| 10 | **MEDIUM** | Realtime subscription doesn't catch up on missed events after reconnect | `sellerSync.ts:1323-1349` |
| 11 | **MEDIUM** | FX rates silently fall back to stale Jan 2026 rates with no indicator | `fxRates.ts:19-32` |
| 12 | **MEDIUM** | Public order page shows infinite skeleton on network failure; no timeout or error | `docs/index.html` |
| 13 | **MEDIUM** | No sync progress indicator; user can't tell if sync is running, succeeded, or failed | App-wide |
| 14 | **MEDIUM** | Personal data has no durable tombstones; delete+sync races cause record resurrection | `personalSync.ts:419-435` |
| 15 | **LOW** | Storage integrity check clears corrupted stores but doesn't offer cloud restore (TODO still open) | `storageIntegrity.ts`, `App.tsx:66-71` |
| 16 | **LOW** | syncBackoff state is in-memory only; app restart clears backoff (by design, acceptable) | `syncBackoff.ts` |

---

## Recommended Fix Priority

### P0 -- Fix immediately (data loss risk)

1. **Add pagination to personalSync `pullTable`** -- mirror the `pullPaged` pattern from `sellerSync.ts`. Without this, any user with >1000 personal records will lose data on sync.

2. **Add global offline indicator** -- a small banner on Dashboard screens showing "Offline -- your data is saved locally" when NetInfo reports no connection. Use existing NetInfo dependency.

3. **Handle expired refresh tokens gracefully** -- when `refreshSession()` fails, show a toast "Session expired -- please sign in again to sync" instead of silently failing. Don't auto-clear business data on token expiry; wait for explicit sign-out.

### P1 -- Fix soon (broken workflows)

4. **Add offline queue for seller receipt scans** -- reuse the existing `receiptQueue` infrastructure.

5. **Show upload failure for images** -- return a user-visible error or queue for retry when product image / logo upload fails offline.

6. **Pull order-link orders after realtime reconnect** -- listen for channel rejoin and trigger `pullOrderLinkOrders()`.

7. **Notify user when queued receipts are permanently dropped** -- show a toast or alert when a receipt exceeds max attempts.

### P2 -- Improve (UX and robustness)

8. **Add sync status indicator** -- show "Syncing..." / "Last synced 5m ago" / "Sync failed" somewhere accessible (Settings or Dashboard).

9. **Re-read store after sellerSync pull** -- in `pullAll()`, re-snapshot state after each entity pull to avoid overwriting concurrent local edits.

10. **Add timeout and error state to public order page** -- prevent infinite skeleton on bad network.

11. **Show stale rate indicator for FX** -- when using fallback/stale FX rates, show "(approximate)" next to converted amounts.

### P3 -- Consider for future

12. **Background sync via expo-background-fetch** -- periodic sync every 15-30 min for sellers.

13. **Durable tombstone tables for personal data** -- prevent delete/resurrect ping-pong on multi-device.

14. **Field-level merge or conflict notification** -- at minimum, detect concurrent edits and warn the user.

15. **Cloud restore from corrupted storage** -- implement the TODO in storageIntegrity to offer "Restore from cloud" when corruption is detected and sync is available.

---

## Architecture Assessment

The app's **local-first Zustand + AsyncStorage architecture is fundamentally sound** for offline use. The core data entry loop (transactions, orders, products) works perfectly offline with immediate persistence. The sync layer is well-structured with pull-before-push to prevent accidental data deletion.

The main gaps are in **communication** (the user never knows they're offline or that sync failed) and **edge cases at scale** (pagination, token expiry, conflict resolution). For the target demographic of street vendors and Grab riders who regularly move through dead zones, these gaps represent real data loss risks that should be addressed before the next release.
