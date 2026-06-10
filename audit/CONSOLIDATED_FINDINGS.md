# Consolidated Audit Findings

**Date**: 2026-05-28
**Sources**: 8 audit streams (Data Integrity, Security, Business Logic, State Lifecycle, External Services, Numbers Consistency, Offline Resilience, Production Readiness)
**Note**: EDGE_CASES_AUDIT.md does not exist; PRODUCTION_READINESS_AUDIT.md (seller-mode deep dive with ripple analysis) serves as the 8th stream. Many PRODUCTION_READINESS findings were verified as FIXED in its Section 13/14 -- only still-open items are included here.

---

## Summary

- **Total unique findings: 72** (74 catalogued, 2 confirmed FIXED in Production Readiness S14: CF-21, CF-22)
- CRITICAL: 11 | HIGH: 15 | MEDIUM: 27 | LOW: 19
- **Ship-blockers: 11** (all CRITICAL findings)
- Quick-fixes: 40 | Medium effort: 24 | Architectural: 8
- Contradictions between reports: 5
- Coverage gaps: 10

---

## SHIP-BLOCKER List (must fix before any public release)

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| CF-01 | Floating-point money arithmetic without rounding (systemic) | CRITICAL | Medium |
| CF-02 | Non-atomic cross-store mutations (transaction + wallet) | CRITICAL | Architectural |
| CF-03 | AI chat actions mutate stores without user confirmation | CRITICAL | Medium |
| CF-04 | personalSync pullTable does not paginate (>1000 rows = data loss) | CRITICAL | Medium |
| CF-05 | No offline indicator anywhere in the app | CRITICAL | Medium |
| CF-06 | API keys (Gemini, Anthropic, Google Vision) in client bundle | CRITICAL | Architectural |
| CF-07 | stallStore/businessStore/crmStore rehydration uses raw new Date() | CRITICAL | Quick-fix |
| CF-08 | Debt payment deletion does not reverse wallet balance (store level) | CRITICAL | Quick-fix |
| CF-09 | removeContribution does not refund wallet (store level) | CRITICAL | Quick-fix |
| CF-10 | personalSync wallet merge overwrites balance without reconciliation | CRITICAL | Architectural |
| CF-11 | Auth token refresh silent failure after ~1 week offline | CRITICAL | Medium |

---

## WEEK-1 List (fix in first week post-launch)

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| CF-12 | Wallet deletion orphans transaction/debt/goal references | HIGH | Medium |
| CF-13 | Wallet balance can go negative without limit (non-credit) | HIGH | Quick-fix |
| CF-14 | sellerSync has no sync mutex (concurrent syncs possible) | HIGH | Quick-fix |
| CF-15 | Multiple stall sessions possible (orphaned active) | HIGH | Quick-fix |
| CF-16 | Anthropic API calls have no timeout | HIGH | Quick-fix |
| CF-17 | Anthropic API calls have no rate limiting | HIGH | Quick-fix |
| CF-18 | delete_transaction fuzzy matching + deleteAll can wipe records | HIGH | Medium |
| CF-19 | Seller receipt scan has no offline queue | HIGH | Medium |
| CF-20 | Product/shop logo upload failure is silent | HIGH | Medium |
| CF-21 | Order link orders have no seasonId | HIGH | Quick-fix |
| CF-22 | Non-atomic order edit (two separate mutations) | HIGH | Medium |
| CF-23 | Receipt queue silently drops after 5 attempts | HIGH | Quick-fix |
| CF-24 | Dashboard archived debt discrepancy | HIGH | Quick-fix |
| CF-25 | Debt overpayment silently capped -- excess lost | HIGH | Quick-fix |
| CF-26 | Business Reports profit treats unset cost (0) as zero | HIGH | Quick-fix |
| CF-27 | Personal Reports date coercion missing | HIGH | Quick-fix |
| CF-28 | Budget progress mixes weekly/monthly/yearly periods | HIGH | Medium |

---

## TECH-DEBT List (prioritized by severity and effort)

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| CF-29 | Subscription payment ID uses Date.now() -- collision risk | MEDIUM | Quick-fix |
| CF-30 | undoSubscriptionPayment race condition (reads outside setter) | MEDIUM | Quick-fix |
| CF-31 | addDebt reads state outside setter for groupId | MEDIUM | Quick-fix |
| CF-32 | CRM addOrderPayment has no cap (paidAmount > totalAmount) | MEDIUM | Quick-fix |
| CF-33 | businessStore addSale can make stock negative | MEDIUM | Quick-fix |
| CF-34 | No upper bound on AI-parsed amounts | MEDIUM | Quick-fix |
| CF-35 | personalSync deleteMissing can delete data added during sync | MEDIUM | Quick-fix |
| CF-36 | personalSync debtFromRemote hardcodes contact.id to 'synced' | MEDIUM | Quick-fix |
| CF-37 | sellerSync pullAll uses setState bypassing store actions | MEDIUM | Medium |
| CF-38 | personalSync mergeById can resurrect locally-deleted items | MEDIUM | Medium |
| CF-39 | Tombstone arrays grow unbounded | MEDIUM | Quick-fix |
| CF-40 | No duplicate ID check in add* mutations | MEDIUM | Medium |
| CF-41 | No referenced-entity validation (productId, goalId) | MEDIUM | Medium |
| CF-42 | Transaction/budget/subscription with 0 or negative amount | MEDIUM | Quick-fix |
| CF-43 | No file size limit on CSV import | MEDIUM | Quick-fix |
| CF-44 | No timeout on statement import edge function | MEDIUM | Quick-fix |
| CF-45 | FX rates show no staleness indicator | MEDIUM | Medium |
| CF-46 | Receipt paymentMethod/category not validated against enum | MEDIUM | Quick-fix |
| CF-47 | No debounce on receipt scanner or chat send | MEDIUM | Quick-fix |
| CF-48 | Sync last-write-wins with no conflict notification | MEDIUM | Architectural |
| CF-49 | Statement import returns not validated client-side | MEDIUM | Quick-fix |
| CF-50 | No background sync (data only syncs on foreground) | MEDIUM | Architectural |
| CF-51 | Realtime subscription no catch-up after reconnect | MEDIUM | Medium |
| CF-52 | No sync progress indicator | MEDIUM | Medium |
| CF-53 | Personal data has no durable tombstones | MEDIUM | Architectural |
| CF-54 | Wallet transfers inflate monthly income/expense | MEDIUM | Medium |
| CF-55 | Upcoming bills uses 8-day vs 7-day window inconsistently | MEDIUM | Quick-fix |
| CF-56 | receipt-images bucket is public | LOW | Quick-fix |
| CF-57 | user_profiles public lookup leaks user_id | LOW | Quick-fix |
| CF-58 | personalSync console.warn not gated by __DEV__ | LOW | Quick-fix |
| CF-59 | Order spam protection is client-side only | LOW | Medium |
| CF-60 | Hardcoded "RM" in explainStallSession/History | LOW | Quick-fix |
| CF-61 | No thousand separators on money amounts | LOW | Medium |
| CF-62 | Spending mirror sums subscription amounts regardless of billing frequency | LOW | Quick-fix |
| CF-63 | AI narrative text not validated against ground truth | LOW | Architectural |
| CF-64 | Playbook plan items no total-vs-source validation | LOW | Quick-fix |
| CF-65 | FX fallback rates hardcoded to Jan 2026 | LOW | Quick-fix |
| CF-66 | AsyncStorage 6MB limit risk for active sellers | LOW | Architectural |
| CF-67 | OrderList period filter prefers deliveryDate over order date | LOW | Quick-fix |
| CF-68 | receiptLocalUri stale after OS cleanup before sync | LOW | Medium |
| CF-69 | Rounding display inconsistency (0 vs 2 decimals) | LOW | Quick-fix |
| CF-70 | Stall session: no discounted/complimentary items | LOW | Medium |
| CF-71 | Personal data not cleared on business sign-out (shared device) | LOW | Medium |
| CF-72 | Order code cross-device collision possible | LOW | Quick-fix |
| CF-73 | Wallet reconciliation assumes starting balance of 0 | LOW | Quick-fix |
| CF-74 | storageIntegrity does not offer cloud restore on corruption | LOW | Medium |

---

## Detailed Findings

### CRITICAL

### [CF-01] Floating-point money arithmetic without rounding (systemic)
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity), 4 (Business Logic), 5 (State Lifecycle), 7 (Numbers Consistency), 8 (Production Readiness)
- **Blast radius**: Every user, every financial total. Over hundreds of transactions, wallet balances drift by sen. Debt "remaining" shows RM 0.01 when fully paid. Season income disagrees by 1-3 sen across 6 different code paths. XLSX export may differ from Dashboard.
- **What**: Nearly every `.reduce()`, `+=`, and `- amount` on money operates on raw floats without `roundMoney()`. Only sellerStore uses it at storage boundaries (partially fixed).
- **Fix effort**: Medium (systemic -- must touch every store)
- **Fix**: Wrap every financial reduce/sum with `roundMoney()`. The utility exists in `src/utils/money.ts` but is only imported by sellerStore. Apply to personalStore, walletStore, debtStore, stallStore, crmStore, businessStore, and all derived getters.

### [CF-02] Non-atomic cross-store mutations (transaction + wallet balance)
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle), 8 (Production Readiness)
- **Blast radius**: Every user who edits or deletes transactions, contributes to goals, or undoes subscription payments. App crash between two `set()` calls leaves wallet balance permanently wrong. No reconciliation mechanism exists (except manual `reconcileWallet` tool).
- **What**: `updateTransaction`, `deleteTransaction`, `contributeToGoal`, `undoSubscriptionPayment` all perform 2-3 separate `set()` calls across stores (personalStore + walletStore). Crash between them = drift.
- **Fix effort**: Architectural
- **Fix**: Add a wallet reconciliation utility that recomputes balances from transaction history on app startup. Also move wallet operations into store methods so the gap is minimized. Consider a write-ahead log for cross-store mutations.

### [CF-03] AI chat actions mutate stores without user confirmation
- **Severity**: CRITICAL
- **Source streams**: 6 (External Services)
- **Blast radius**: Any user who uses MoneyChat. AI hallucination or prompt injection can add fake expenses, delete real transactions, transfer money, forgive debts, or wipe all transactions matching a short description.
- **What**: `chatActions.ts` parses `[ACTION]{...}[/ACTION]` blocks from AI responses and immediately executes store mutations. `delete_transaction` with `deleteAll: true` and fuzzy `.includes()` matching can wipe unrelated records. No confirmation gate.
- **Fix effort**: Medium
- **Fix**: Actions should require explicit user confirmation (tap-to-execute) before `executeAction()` is called. Current architecture parses AND executes in the same pass.

### [CF-04] personalSync pullTable does not paginate -- >1000 rows causes data loss
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity), 6 (External Services), 8 (Offline Resilience)
- **Blast radius**: Any power user with >1000 transactions (realistic after 6-12 months). Silent data loss: `deleteMissing` wipes the un-fetched rows from Supabase permanently.
- **What**: `pullTable` does `supabase.from(table).select('*').eq(...)` without `.range()` pagination. Supabase PostgREST returns max 1000 rows by default.
- **Fix effort**: Medium
- **Fix**: Use `pullPaged()` pattern (already exists in `sellerSync.ts`) or add `.range()` pagination loop.

### [CF-05] No offline indicator anywhere in the app
- **Severity**: CRITICAL
- **Source streams**: 8 (Offline Resilience)
- **Blast radius**: All users in low-connectivity areas (Malaysian street vendors, Grab riders). User has no idea data isn't syncing. Could add 50 orders offline and lose them if they sign out or switch devices before syncing.
- **What**: No offline banner, badge, or any persistent UI indication. NetInfo only imported in 2 files (ReceiptScanner, receiptQueue).
- **Fix effort**: Medium
- **Fix**: Add a subtle persistent banner ("Offline -- data saved locally") on Dashboard screens when `NetInfo.isConnected === false`.

### [CF-06] API keys (Gemini, Anthropic, Google Vision) in client bundle
- **Severity**: CRITICAL
- **Source streams**: 2 (Security), 6 (External Services)
- **Blast radius**: Financial -- anyone who decompiles the APK can extract keys and make unlimited API calls billed to the developer. Anthropic uses the explicit `anthropic-dangerous-direct-browser-access` header.
- **What**: `EXPO_PUBLIC_` prefix bundles keys into JS. Keys also appear in URL query parameters (network logs, crash reports).
- **Fix effort**: Architectural
- **Fix**: Proxy all AI/Vision API calls through Supabase Edge Functions. Remove `EXPO_PUBLIC_` prefix from sensitive keys.

### [CF-07] stallStore/businessStore/crmStore rehydration uses raw new Date() without sd() guard
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle)
- **Blast radius**: Any user with corrupted date data in these stores. `new Date(undefined)` produces `Invalid Date` which crashes `date-fns format()` in a crash loop. Other stores (personalStore, sellerStore, debtStore, savingsStore) already use safe `sd()` helper.
- **What**: `onRehydrateStorage` in stallStore, businessStore, crmStore uses raw `new Date(s.field)` without null/NaN guards.
- **Fix effort**: Quick-fix (copy `sd()` pattern from other stores)
- **Fix**: Replace all raw `new Date()` calls with the `sd()` helper in these 3 stores.

### [CF-08] Debt payment deletion does not reverse wallet balance (store level)
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity)
- **Blast radius**: Any user who deletes a debt payment from code other than DebtTracking.tsx screen. The wallet deduction from the original payment is never reversed. Money vanishes from tracked net worth.
- **What**: `debtStore.deletePayment` removes the payment and recalculates paidAmount/status but does NOT call `addToWallet` to refund. Wallet reversal only happens at the screen level.
- **Fix effort**: Quick-fix
- **Fix**: Move wallet reversal into the store method, or add a loud warning comment. Same pattern as CF-09.

### [CF-09] removeContribution does not refund wallet (store level)
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity)
- **Blast radius**: Any code path that calls `removeContribution` without manually handling wallet refund. Currently safe because `Goals.tsx` handles it, but any future caller would corrupt balances.
- **What**: `personalStore.removeContribution` subtracts from goal but does NOT call `addToWallet` to refund. The screen-level handler does this, but the store method is unsafe standalone.
- **Fix effort**: Quick-fix
- **Fix**: Move wallet refund logic into the store method.

### [CF-10] personalSync wallet merge overwrites balance without reconciliation
- **Severity**: CRITICAL
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle), 8 (Production Readiness)
- **Blast radius**: Any multi-device user. Device A records expense (wallet 1000 -> 950). Device B renames wallet (updatedAt newer). Sync takes B's wallet (balance 1000). RM 50 expense exists but wallet doesn't reflect it.
- **What**: `mergeById` for wallets uses last-write-wins on `updatedAt`. Wallet balance is a derived value that should be computed from transactions, not blindly synced.
- **Fix effort**: Architectural
- **Fix**: After pulling wallets and transactions, recalculate wallet balances from the merged transaction set. Treat synced wallet balances as hints, not authoritative.

### [CF-11] Auth token refresh silent failure after ~1 week offline
- **Severity**: CRITICAL
- **Source streams**: 8 (Offline Resilience)
- **Blast radius**: Any seller who goes offline for >1 week. Sync silently stops working. No user notification. User must sign out and back in but nothing tells them to do so.
- **What**: When refresh token expires (~1 week), `refreshSession()` fails. `getSession()` returns expired session as fallback. Sync attempts fail silently.
- **Fix effort**: Medium
- **Fix**: When `refreshSession()` fails, show a toast "Session expired -- please sign in again to sync". Don't auto-clear business data on token expiry.

---

### HIGH

### [CF-12] Wallet deletion orphans transaction/debt/goal references
- **Severity**: HIGH
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle)
- **Blast radius**: Any user who deletes a wallet with linked transactions. Future edits to those transactions try to adjust a nonexistent wallet -- silently fails, causing phantom money loss/gain.
- **What**: `deleteWallet` removes the wallet but does NOT nullify `walletId` references in transactions, debt payments, goal contributions, or subscriptions.
- **Fix effort**: Medium
- **Fix**: Either nullify all `walletId` references across stores, or soft-delete wallets so reversal can still find them.

### [CF-13] Wallet balance can go negative without limit (non-credit wallets)
- **Severity**: HIGH
- **Source streams**: 5 (State Lifecycle)
- **Blast radius**: Any user who over-deducts from a bank/e-wallet. Negative balance is nonsensical for non-credit wallets.
- **What**: `deductFromWallet` subtracts unconditionally. No overdraft guard for non-credit wallets.
- **Fix effort**: Quick-fix
- **Fix**: Add overdraft guard for non-credit wallets, or at minimum warn the user.

### [CF-14] sellerSync has no sync mutex
- **Severity**: HIGH
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle), 8 (Production Readiness)
- **Blast radius**: Any seller where sync fires from startup AND foreground simultaneously. Tombstone deletion is dangerous with overlapping syncs.
- **What**: `syncAll` can run concurrently. personalSync has an `inflight` guard; sellerSync does not.
- **Fix effort**: Quick-fix
- **Fix**: Add `inflight` promise guard matching personalSync pattern.

### [CF-15] Multiple stall sessions possible (orphaned active)
- **Severity**: HIGH
- **Source streams**: 5 (State Lifecycle)
- **Blast radius**: Stall users who double-tap start. Orphaned active session is invisible to `getLifetimeStats`.
- **What**: `startSession` sets `activeSessionId` but does NOT close the previous active session.
- **Fix effort**: Quick-fix
- **Fix**: Auto-close any existing active session before starting a new one.

### [CF-16] Anthropic API calls have no timeout
- **Severity**: HIGH
- **Source streams**: 6 (External Services)
- **Blast radius**: Any user of AI features backed by Anthropic. App hangs indefinitely on slow/dead server.
- **What**: `callAnthropic` uses bare `fetch()` with no `AbortController`.
- **Fix effort**: Quick-fix
- **Fix**: Add `AbortController` with 30s timeout, matching Gemini pattern.

### [CF-17] Anthropic API calls have no rate limiting
- **Severity**: HIGH
- **Source streams**: 6 (External Services)
- **Blast radius**: Cost explosion from rapid calls. No cooldown tracking unlike Gemini.
- **What**: No rate limiting, no retry logic, no cooldown in `callAnthropic`.
- **Fix effort**: Quick-fix
- **Fix**: Add rate limit tracking matching `geminiClient.ts` pattern.

### [CF-18] delete_transaction fuzzy matching + deleteAll can wipe records
- **Severity**: HIGH
- **Source streams**: 6 (External Services)
- **Blast radius**: Any MoneyChat user. AI can wipe ALL transactions matching a short description like `"a"` via bidirectional `.includes()`.
- **What**: `chatActions.ts` `delete_transaction` uses fuzzy matching and `deleteAll: true` with no confirmation.
- **Fix effort**: Medium
- **Fix**: Require exact match or stricter matching. Add confirmation gate for destructive actions.

### [CF-19] Seller receipt scan has no offline queue
- **Severity**: HIGH
- **Source streams**: 8 (Offline Resilience)
- **Blast radius**: Sellers at markets with bad connectivity. Personal receipt scan has offline queue but seller receipt scan does not.
- **What**: `scanSellerReceipt()` throws on failure. `CostManagement.tsx` shows error but does NOT enqueue for retry.
- **Fix effort**: Medium
- **Fix**: Reuse existing `receiptQueue` infrastructure for seller receipts.

### [CF-20] Product/shop logo upload failure is silent
- **Severity**: HIGH
- **Source streams**: 8 (Offline Resilience)
- **Blast radius**: Sellers uploading images offline. User thinks upload worked but image is lost.
- **What**: Upload returns null silently on failure. No error shown to user.
- **Fix effort**: Medium
- **Fix**: Show upload failure error or queue for retry.

### [CF-21] Order link orders have no seasonId (VERIFIED FIXED per Production Readiness S14)
- **Severity**: HIGH (was open in S13, fixed in S14)
- **Source streams**: 8 (Production Readiness)
- **Blast radius**: N/A -- fixed
- **What**: `addOrderLinkOrder` now sets `seasonId` to active season.
- **Fix effort**: N/A -- FIXED
- **Fix**: Already applied.

**NOTE**: CF-21 is confirmed FIXED per Production Readiness Section 14. Removing from active count.

### [CF-22] Non-atomic order edit (two separate mutations) (VERIFIED FIXED per Production Readiness S14)
- **Severity**: HIGH
- **Source streams**: 5 (State Lifecycle), 8 (Production Readiness)
- **Blast radius**: N/A -- fixed
- **What**: New atomic `updateOrderWithItems` replaces the old two-call path.
- **Fix effort**: N/A -- FIXED
- **Fix**: Already applied.

**NOTE**: CF-22 is confirmed FIXED per Production Readiness Section 14. Removing from active count.

### [CF-23] Receipt queue silently drops after 5 attempts with no notification
- **Severity**: HIGH
- **Source streams**: 8 (Offline Resilience)
- **Blast radius**: Users who scan receipts in bad connectivity areas. Receipt permanently lost with no notification.
- **What**: `recordAttemptFailure` filters out entries exceeding MAX_ATTEMPTS. No user notification.
- **Fix effort**: Quick-fix
- **Fix**: Show alert/toast when a receipt is permanently dropped.

### [CF-24] Dashboard includes archived debts, DebtTracking excludes them
- **Severity**: HIGH
- **Source streams**: 7 (Numbers Consistency)
- **Blast radius**: Any user who archives an unsettled debt. Dashboard shows "You owe RM 200" while DebtTracking shows "You owe RM 0". Trust-destroying discrepancy.
- **What**: Dashboard filters `d.status !== 'settled'` but does NOT check `d.isArchived`. DebtTracking explicitly excludes archived.
- **Fix effort**: Quick-fix
- **Fix**: Add `!d.isArchived` to Dashboard debt filter. One-line fix.

### [CF-25] Debt overpayment silently capped -- excess money lost
- **Severity**: HIGH
- **Source streams**: 4 (Business Logic)
- **Blast radius**: Any user who adds a payment exceeding the remaining debt. Payment record shows RM 30 but only RM 20 credited. Audit trail doesn't add up.
- **What**: `addPayment` caps `newPaidAmount` at `totalAmount` via `Math.min`, but the individual payment's `.amount` is stored uncapped.
- **Fix effort**: Quick-fix
- **Fix**: Cap `payment.amount` to `remaining` before storing, OR warn the user and reject.

### [CF-26] Business Reports profit treats unset cost (0) as zero
- **Severity**: HIGH
- **Source streams**: 4 (Business Logic)
- **Blast radius**: Stall/business sellers who add products without setting costs. Shows 100% margin (misleading).
- **What**: `profit = (item.unitPrice - product.cost) * item.quantity`. If cost is 0 (not set), profit equals full selling price.
- **Fix effort**: Quick-fix
- **Fix**: Show "margin unknown" for products where `cost === 0`, or skip them from profit calculation.

### [CF-27] Personal Reports date coercion missing
- **Severity**: HIGH
- **Source streams**: 4 (Business Logic)
- **Blast radius**: Personal mode users if `t.date` is still a string after rehydration. `isWithinInterval` may silently fail.
- **What**: `Reports.tsx` passes `t.date` to `isWithinInterval` without Date coercion. Seller Dashboard does `d instanceof Date ? d : new Date(d)` but personal does not.
- **Fix effort**: Quick-fix
- **Fix**: Add `t.date instanceof Date ? t.date : new Date(t.date)` coercion.

### [CF-28] Budget progress mixes weekly/monthly/yearly periods on Dashboard
- **Severity**: HIGH
- **Source streams**: 7 (Numbers Consistency)
- **Blast radius**: Any user with budgets of mixed periods. Dashboard budget progress bar is meaningless. BreathingRoom uses different limits and different period filtering.
- **What**: Dashboard sums ALL budget allocations/spending regardless of period. A weekly RM 100 budget is added to a monthly RM 500 as if same period.
- **Fix effort**: Medium
- **Fix**: Remove legacy `budgetProgress` from Dashboard stats (BreathingRoom already replaced it), or compute period-normalized percentages.

---

### MEDIUM

### [CF-29] Subscription payment ID uses Date.now() -- collision risk
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: `pay-${Date.now()}` can collide on fast devices. `undoSubscriptionPayment` may undo wrong payment.
- **Fix effort**: Quick-fix
- **Fix**: Use `newId()`.

### [CF-30] undoSubscriptionPayment reads state outside setter
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: Reads `getState()` before `set()`. Rapid undos can corrupt billing dates.
- **Fix effort**: Quick-fix
- **Fix**: Move read inside `set()`.

### [CF-31] addDebt reads state outside setter for groupId
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: Two rapid adds for same contact may create different groupIds.
- **Fix effort**: Quick-fix
- **Fix**: Move groupId lookup inside `set()`.

### [CF-32] CRM addOrderPayment has no cap (paidAmount > totalAmount)
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle)
- **What**: `newPaidAmount = order.paidAmount + amount` with no `Math.min(order.totalAmount, ...)`.
- **Fix effort**: Quick-fix
- **Fix**: `Math.min(order.totalAmount, order.paidAmount + amount)`.

### [CF-33] businessStore addSale can make stock negative
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity), 5 (State Lifecycle)
- **What**: `stock: product.stock - saleItem.quantity` with no floor.
- **Fix effort**: Quick-fix
- **Fix**: `Math.max(0, product.stock - saleItem.quantity)`.

### [CF-34] No upper bound on AI-parsed amounts
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: AI can return `amount: 999999999` and it passes validation in receiptScanner, aiService, intentEngine, playbookAI.
- **Fix effort**: Quick-fix
- **Fix**: Add reasonable upper bound (e.g., RM 1,000,000) to all AI response validators.

### [CF-35] personalSync deleteMissing can delete data added during sync
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: Narrow window where items updated before sync but not yet pulled are at risk.
- **Fix effort**: Quick-fix
- **Fix**: Consider skipping `deleteMissing` when delta between `lastSync` and `syncStart` is small.

### [CF-36] personalSync debtFromRemote hardcodes contact.id to 'synced'
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: All synced debts share `contact.id: 'synced'`. Group-by-contact logic groups ALL synced debts together.
- **Fix effort**: Quick-fix
- **Fix**: Generate deterministic contact ID from `synced-${contactName}-${phone}`.

### [CF-37] sellerSync pullAll uses setState bypassing store actions
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: New orders pulled from remote don't trigger product `totalSold`/`stockQuantity` updates.
- **Fix effort**: Medium
- **Fix**: Apply stock/totalSold adjustments for newly-pulled orders.

### [CF-38] personalSync mergeById can resurrect locally-deleted items
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity), 8 (Offline Resilience)
- **What**: No durable tombstone table for personal data. Deleted items can reappear via multi-device sync race.
- **Fix effort**: Medium
- **Fix**: Extend durable tombstone pattern from seller sync to personal data.

### [CF-39] Tombstone arrays grow unbounded
- **Severity**: MEDIUM
- **Source streams**: 1 (Data Integrity)
- **What**: `_deleted*Ids` arrays never pruned. Can grow to thousands, slowing serialization.
- **Fix effort**: Quick-fix
- **Fix**: Cap at 500 entries or clear after successful sync acknowledgment.

### [CF-40] No duplicate ID check in add* mutations
- **Severity**: MEDIUM
- **Source streams**: 5 (State Lifecycle)
- **What**: All `add*` mutations generate IDs but never verify uniqueness. `Date.now()` IDs can collide.
- **Fix effort**: Medium
- **Fix**: Check for existing ID before adding, or use `newId()` everywhere.

### [CF-41] No referenced-entity validation (productId, goalId)
- **Severity**: MEDIUM
- **Source streams**: 5 (State Lifecycle)
- **What**: `addOrder` does not check that `item.productId` refers to an existing product. `addSale` (stallStore) with nonexistent `productId` corrupts product snapshot.
- **Fix effort**: Medium
- **Fix**: Validate referenced entities exist before mutation.

### [CF-42] Transaction/budget/subscription with 0 or negative amount allowed
- **Severity**: MEDIUM
- **Source streams**: 5 (State Lifecycle)
- **What**: No `amount > 0` validation in `addTransaction`, `addSubscription`, `addBudget`. Zero-allocation budget causes division-by-zero downstream.
- **Fix effort**: Quick-fix
- **Fix**: Add `amount > 0` validation to all financial add mutations.

### [CF-43] No file size limit on CSV import
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: 1M-row CSV read entirely into memory. OOM crash on large files.
- **Fix effort**: Quick-fix
- **Fix**: Add file size check (e.g., 10MB max) before reading.

### [CF-44] No timeout on statement import edge function
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: `supabase.functions.invoke()` has no timeout. Large PDFs could hang indefinitely.
- **Fix effort**: Quick-fix
- **Fix**: Add timeout configuration.

### [CF-45] FX rates show no staleness indicator
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services), 8 (Offline Resilience)
- **What**: Stale/fallback FX rates used with no user indication. Hardcoded Jan 2026 fallback rates.
- **Fix effort**: Medium
- **Fix**: Show "(approximate)" next to converted amounts when using stale/fallback rates.

### [CF-46] Receipt paymentMethod and suggestedExpenseCategory not validated
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: AI-returned values accepted without validation against enum.
- **Fix effort**: Quick-fix
- **Fix**: Validate against known enums, fallback to 'other'.

### [CF-47] No debounce on receipt scanner or chat send
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: Rapid taps trigger multiple parallel API calls.
- **Fix effort**: Quick-fix
- **Fix**: Add in-flight guard or debounce.

### [CF-48] Sync last-write-wins with no conflict notification
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services), 8 (Offline Resilience)
- **What**: No field-level merging. Concurrent edits on different fields -- loser's changes silently lost. No conflict UI.
- **Fix effort**: Architectural
- **Fix**: At minimum detect concurrent edits and warn user. Full solution: field-level merge or CRDTs.

### [CF-49] Statement import returns not validated client-side
- **Severity**: MEDIUM
- **Source streams**: 6 (External Services)
- **What**: Edge function response trusted completely. No amount/date validation on returned transactions.
- **Fix effort**: Quick-fix
- **Fix**: Validate returned amounts and dates before storing.

### [CF-50] No background sync
- **Severity**: MEDIUM
- **Source streams**: 8 (Offline Resilience)
- **What**: Data only syncs on app foreground. Sellers with backgrounded app miss order-link orders until reopened.
- **Fix effort**: Architectural
- **Fix**: Consider `expo-background-fetch` for periodic sync every 15-30 min.

### [CF-51] Realtime subscription no catch-up after reconnect
- **Severity**: MEDIUM
- **Source streams**: 8 (Offline Resilience)
- **What**: Supabase Realtime does not replay missed events. Orders placed during WebSocket disconnect are missed until next foreground pull.
- **Fix effort**: Medium
- **Fix**: After channel reconnects (CHANNEL_STATES.joined), trigger `pullOrderLinkOrders()`.

### [CF-52] No sync progress indicator
- **Severity**: MEDIUM
- **Source streams**: 8 (Offline Resilience)
- **What**: No spinner, no "syncing..." status, no "last synced" indicator. User has zero visibility.
- **Fix effort**: Medium
- **Fix**: Show "Syncing..." / "Last synced 5m ago" / "Sync failed" in Dashboard or Settings.

### [CF-53] Personal data has no durable tombstones
- **Severity**: MEDIUM
- **Source streams**: 8 (Offline Resilience)
- **What**: `_deletedXxxIds` arrays cleared after push. Delete+sync races cause record resurrection ping-pong between devices.
- **Fix effort**: Architectural
- **Fix**: Implement durable tombstone table in Supabase for personal data (like `seller_deleted_cost_categories`).

### [CF-54] Wallet transfers inflate monthly income/expense
- **Severity**: MEDIUM
- **Source streams**: 7 (Numbers Consistency)
- **What**: RM 500 wallet transfer creates income + expense transactions. Dashboard income/expense inflated by RM 500 each. Kept number unaffected but individual totals misleading.
- **Fix effort**: Medium
- **Fix**: Tag transfer transactions with `isTransfer: true` and exclude from income/expense aggregations.

### [CF-55] Upcoming bills uses 8-day vs 7-day window inconsistently
- **Severity**: MEDIUM
- **Source streams**: 7 (Numbers Consistency)
- **What**: Dashboard Details uses `addDays(today, 8)`, Insight Strip and WalletManagement use 7 days. Bill due exactly 7-8 days out appears on one but not the other.
- **Fix effort**: Quick-fix
- **Fix**: Standardize on 7 days everywhere. Change Dashboard `stats.upcomingBills` from `addDays(today, 8)` to `addDays(today, 7)`.

---

### LOW

### [CF-56] receipt-images bucket is public
- **Severity**: LOW
- **Source streams**: 2 (Security)
- **What**: Anyone who knows the URL pattern can view a seller's cost receipts.
- **Fix effort**: Quick-fix
- **Fix**: Make `receipt-images` a private bucket with authenticated reads.

### [CF-57] user_profiles public lookup leaks user_id
- **Severity**: LOW
- **Source streams**: 2 (Security)
- **What**: `user_profiles_public_code_lookup` policy exposes full row for profiles with referral codes.
- **Fix effort**: Quick-fix
- **Fix**: Restrict to only expose `referral_code` column.

### [CF-58] personalSync console.warn not gated by __DEV__
- **Severity**: LOW
- **Source streams**: 2 (Security)
- **What**: Production builds log sync errors to console (readable via USB debugging).
- **Fix effort**: Quick-fix
- **Fix**: Gate behind `__DEV__` to match sellerSync behavior.

### [CF-59] Order spam protection is client-side only
- **Severity**: LOW
- **Source streams**: 2 (Security)
- **What**: Rate limiting, honeypot, cooldown on order page are all client-side. Bypassed by direct API calls.
- **Fix effort**: Medium
- **Fix**: Add server-side rate limiting (pg trigger or edge function).

### [CF-60] Hardcoded "RM" in explainStallSession/History
- **Severity**: LOW
- **Source streams**: 4 (Business Logic)
- **What**: Stall insights hardcode "RM" instead of using currency setting. Every other screen uses dynamic currency.
- **Fix effort**: Quick-fix
- **Fix**: Pass `currency` parameter to these utility functions.

### [CF-61] No thousand separators on money amounts
- **Severity**: LOW
- **Source streams**: 4 (Business Logic)
- **What**: "RM 12500.00" instead of "RM 12,500.00". `formatters.ts` utility exists but rarely used.
- **Fix effort**: Medium
- **Fix**: Use `toLocaleString` or `formatters.ts` utility consistently.

### [CF-62] Spending mirror sums subscriptions regardless of billing frequency
- **Severity**: LOW
- **Source streams**: 4 (Business Logic)
- **What**: Yearly RM 120 summed with monthly RM 15. Total labeled ambiguously.
- **Fix effort**: Quick-fix
- **Fix**: Normalize to monthly amounts before summing.

### [CF-63] AI narrative text not validated against ground truth
- **Severity**: LOW
- **Source streams**: 6 (External Services)
- **What**: AI can hallucinate numbers (e.g., "you spent RM 500 on food" when real is RM 300). Users may make decisions based on wrong numbers.
- **Fix effort**: Architectural
- **Fix**: Cross-reference AI narrative numbers against store data before display.

### [CF-64] Playbook plan items no total-vs-source validation
- **Severity**: LOW
- **Source streams**: 6 (External Services)
- **What**: Plan item totals can exceed source income amount.
- **Fix effort**: Quick-fix
- **Fix**: Validate sum of plan items does not exceed source amount.

### [CF-65] FX fallback rates hardcoded to Jan 2026
- **Severity**: LOW
- **Source streams**: 6 (External Services)
- **What**: First-time user without internet gets 11-month-old rates with no warning.
- **Fix effort**: Quick-fix
- **Fix**: Update fallback rates at each release, or show warning when using them.

### [CF-66] AsyncStorage 6MB limit risk for active sellers
- **Severity**: LOW
- **Source streams**: 8 (Production Readiness)
- **What**: Active seller with 2000+ orders could approach Android's ~6MB limit. No monitoring.
- **Fix effort**: Architectural
- **Fix**: Add size monitoring. Consider archiving old seasons' data.

### [CF-67] OrderList period filter prefers deliveryDate over order date
- **Severity**: LOW
- **Source streams**: 8 (Production Readiness)
- **What**: "This month" shows orders by delivery date, not creation date. UX decision, not clear bug.
- **Fix effort**: Quick-fix (product decision)
- **Fix**: Add toggle "filter by: order date / delivery date", or use order date consistently.

### [CF-68] receiptLocalUri stale after OS cleanup before sync
- **Severity**: LOW
- **Source streams**: 8 (Production Readiness)
- **What**: Local file path becomes invalid after app reinstall or OS temp cleanup. Upload fails silently.
- **Fix effort**: Medium
- **Fix**: Upload on capture instead of deferring to sync.

### [CF-69] Rounding display inconsistency (0 vs 2 decimals)
- **Severity**: LOW
- **Source streams**: 7 (Numbers Consistency)
- **What**: Hero numbers use `.toFixed(0)`, detail views use `.toFixed(2)`. RM 1,234.56 shows as "RM 1,235" on Dashboard but "RM 1,234.56" in Reports.
- **Fix effort**: Quick-fix
- **Fix**: Document as intentional design decision. Only problematic if rounding crosses sign boundary.

### [CF-70] No discounted/complimentary items in stall sessions
- **Severity**: LOW
- **Source streams**: 4 (Business Logic)
- **What**: All sales at full price. Free samples or friend discounts can't be recorded accurately.
- **Fix effort**: Medium
- **Fix**: Add discount field or "comp" flag on stall sales.

### [CF-71] Personal data not cleared on business sign-out (shared device)
- **Severity**: LOW
- **Source streams**: 2 (Security)
- **What**: By design -- personal mode has no auth. Next user sees previous user's personal financial data on shared device.
- **Fix effort**: Medium
- **Fix**: Consider device-level biometric/PIN lock for personal mode.

### [CF-72] Order code cross-device collision possible
- **Severity**: LOW
- **Source streams**: 8 (Production Readiness)
- **What**: 529K possible codes, local-only collision check. Two devices can generate same code independently.
- **Fix effort**: Quick-fix
- **Fix**: Include device-specific prefix or use UUID-based codes.

### [CF-73] Wallet reconciliation assumes starting balance of 0
- **Severity**: LOW
- **Source streams**: 7 (Numbers Consistency)
- **What**: User-initiated reconciliation computes from transactions only. Initial deposits not tracked.
- **Fix effort**: Quick-fix (already has user warning in Alert text)
- **Fix**: Document and warn. Already adequate for manual use.

### [CF-74] storageIntegrity does not offer cloud restore on corruption
- **Severity**: LOW
- **Source streams**: 8 (Offline Resilience)
- **What**: Corrupted stores are cleared but no "Restore from cloud" option. TODO exists in code.
- **Fix effort**: Medium
- **Fix**: Implement cloud restore prompt when corruption is detected and sync is available.

---

## Findings by Fix Effort (active only, excluding FIXED CF-21/CF-22)

### Quick-fix (< 1 hour) -- 40 findings
CF-07, CF-08, CF-09, CF-13, CF-14, CF-15, CF-16, CF-17, CF-23, CF-24, CF-25, CF-26, CF-27, CF-29, CF-30, CF-31, CF-32, CF-33, CF-34, CF-35, CF-36, CF-39, CF-42, CF-43, CF-44, CF-46, CF-47, CF-49, CF-55, CF-56, CF-57, CF-58, CF-60, CF-62, CF-64, CF-65, CF-67, CF-69, CF-72, CF-73

### Medium (1-4 hours) -- 24 findings
CF-01, CF-03, CF-04, CF-05, CF-11, CF-12, CF-18, CF-19, CF-20, CF-28, CF-37, CF-38, CF-40, CF-41, CF-45, CF-51, CF-52, CF-54, CF-59, CF-61, CF-68, CF-70, CF-71, CF-74

### Architectural (1+ days) -- 8 findings
CF-02, CF-06, CF-10, CF-48, CF-50, CF-53, CF-63, CF-66

---

## Contradictions Between Reports

1. **stallStore rehydration safety**: Data Integrity (CRIT-5,6,7) rates these as CRITICAL crash-loop risks. State Lifecycle (RH-1,2,3) rates the same findings as MEDIUM. **Resolution**: CRITICAL is correct -- `Invalid Date` in `date-fns format()` causes an unrecoverable crash loop that requires clearing app data.

2. **CRM addOrderPayment cap**: Data Integrity (HIGH-5) calls this HIGH. State Lifecycle (IS-6) calls it MEDIUM. **Resolution**: HIGH is appropriate -- negative outstanding amounts shown to users actively mislead financial decisions.

3. **personalSync pagination**: Data Integrity (HIGH-14) rates this HIGH. External Services (M2) rates it MEDIUM. Offline Resilience rates it CRITICAL. **Resolution**: CRITICAL is correct -- it causes permanent, irreversible data loss for power users.

4. **Floating-point rounding**: Production Readiness (HIGH-4) says it's PARTIALLY FIXED (storage boundaries rounded). Data Integrity (CRIT-1) and Numbers Consistency say it's still broken (display-level reduces still drift). **Resolution**: Both are correct -- storage boundaries are improved but display-level sums still produce inconsistencies across screens.

5. **undoSubscriptionPayment wallet handling**: Data Integrity (HIGH-11) initially says the wallet is double-deducted, then on closer analysis says it "should cover it" but is "fragile." **Resolution**: The wallet handling is technically correct in the current flow but fragile because it bypasses `deleteTransaction()`. Rated MEDIUM -- fix by using `deleteTransaction()`.

---

## Coverage Gaps (areas none of the 8 streams adequately covered)

1. **Accessibility (a11y)**: No stream audited screen reader support, font scaling, touch target sizes, color contrast ratios, or VoiceOver/TalkBack compatibility. For a finance app targeting Malaysian street vendors (many older users), this is a significant gap.

2. **i18n consistency**: No stream audited whether all user-facing strings are in the translation files (`en.ts`, `ms.ts`). MEMORY.md notes "other screens remain English -- translate incrementally" but no audit verified completeness or found untranslated strings.

3. **Performance profiling**: No stream measured render times, JS thread blocking during sync, memory usage under load, or FlatList scroll performance with large datasets. The AsyncStorage 6MB limit (CF-66) was noted but not measured empirically.

4. **Tablet layout**: MEMORY.md mandates tablet handling but no audit verified tablet-specific layouts, modal max-widths, or landscape orientation behavior.

5. **Deep linking / URL scheme security**: Security audit notes "no deep linking configured" but does not verify that future deep link additions won't bypass auth gates.

6. **Push notification content**: Security audit flags this as server-dependent but no audit verified what the server actually sends in notification payloads (PII on lock screen risk).

7. **Edge function security**: The `request-otp` and `telegram-webhook` edge functions are deployed on Supabase but not in the local codebase. No audit could verify their current security posture.

8. **Automated testing**: No stream audited test coverage. The Production Readiness audit notes "no automated test suite exists." This is a significant production readiness gap.

9. **Error boundary coverage**: No stream verified that `ErrorBoundary` catches all critical render paths or that it reports errors for debugging.

10. **Migration rollback**: No stream audited whether Supabase migrations can be safely rolled back if a deployment fails.
