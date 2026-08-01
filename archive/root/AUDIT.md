# Potraces — Brutal Audit

**Date:** 2026-04-17
**Scope:** Full codebase — architecture, logic/correctness, security, UX.
**Auditors:** 3 specialized agents (security, logic, UX/architecture) + session observation.

---

## 60-Second Read

Working prototype with real features, but the plumbing is fragile and the product is drowning in scope.

**The foundation is shaky.** MEMORY.md documents multiple production scars already (Supabase content-type override, partial unique index incompatibility, store hydration race, Invalid Date crashes). That's honest, but it means you're constantly patching symptoms not fixing the model.

**The product is three apps pretending to be one.** Personal finance + seller (delivery/pre-order) + stall (live session) + freelancer + part-time + on-the-road + mixed — 75+ screens across 6 business-mode variants. The core "track my money" promise gets drowned.

**The most dangerous findings are not UX — they are integrity and security.** A single Supabase RPC lets any signed-up user take over any other shop. Deleting a transaction locally does not refund the wallet. A tombstone sync bug can nuke remote data on a reinstall race. These are financial/data-loss bugs in a financial app. Fix these before anything else.

**Counts:** 11 Critical · 15 High · 19 Medium · 12 Low

---

## Critical (security, data loss, broken core flows)

### SEC-C1. `claim_seller_profile` RPC = trivial hostile takeover ✅ FIXED
**File:** `supabase/migrations/20260309130000_claim_profile.sql:6-53`
**What:** `SECURITY DEFINER` function lets any authenticated user pass any slug and become the new `user_id` of that `seller_profiles` row. It reassigns all products/orders/seasons/customers. No ownership proof required.
**Impact:** Full shop takeover, 1 API call. Attacker signs up anonymously → calls `rpc('claim_seller_profile', { p_slug: 'victim-shop' })` → owns everything.
**Fix:** Require verified OTP to the target profile's phone before transferring ownership, or one-time owner-generated claim token. Minimum: `is_verified=true` AND a phone match between caller's last OTP and target.

### SEC-C2. OTP code is returned in the HTTP response body ⚠️ DEFERRED (requires full UX rework — see note)
**File:** `supabase/functions/request-otp/index.ts:112`
**What:** The OTP is generated server-side and sent back to the client. The "Telegram" channel is theater — anyone who observes the code (screenshot, log, compromised client) can redeem it from any Telegram account because the webhook looks up by code only.
**Impact:** The entire phone-verification trust anchor is broken.
**Fix:** Never return the code. Deliver via SMS or require user to start a Telegram DM with a deep-linked token that binds `chat_id` to the OTP row before the code flows. Bind redemption to that `chat_id`.

### SEC-C3. OTP is online-brute-forceable ✅ FIXED
**File:** `supabase/functions/telegram-webhook/index.ts:58-64`
**What:** 6-char alphanumeric codes, 15-min TTL, **no attempts counter, no lockout, no rate limit** on the public webhook. Multiple pending codes concurrent = shrunk effective keyspace.
**Fix:** Add `attempts int`, `max_attempts = 5`. Throttle per `chat_id`. Increase code length to 8 or require phone last-4 alongside the code.

### LOGIC-C1. `deleteTransaction` does NOT roll back wallet balance ✅ FIXED
**File:** `src/store/personalStore.ts:60-63`
**What:** Delete removes the transaction row but never refunds the wallet.
**Repro:** Log RM50 expense on Wallet A → delete → Wallet A balance stays at -50. User re-logs on Wallet B → now RM50 lost from A permanently.
**Fix:** Capture the tx first, then inverse the wallet mutation inside the reducer. Append rollback entry to `editLog`.

### LOGIC-C2. `updateTransaction` allows amount/wallet edit without wallet reconciliation ✅ FIXED
**File:** `src/store/personalStore.ts:31-56`
**What:** The store snapshots `editLog` when amount/type/wallet change (per MEMORY.md edit-audit pattern), but never actually adjusts wallet balances. Changing RM100 → RM20, or moving from Wallet A → Wallet B, leaves wallets untouched.
**Fix:** Compute `deltaAmount = newAmount - oldAmount` with sign based on type inside the reducer. Handle wallet switch as refund-old + deduct-new.

### LOGIC-C3. QuickAddExpense stale closures in category/wallet callbacks ✅ FIXED
**File:** `src/components/common/QuickAddExpense.tsx:280-303, 306-374`
**What:** `handleCategorySelect` and `handleWalletSelect` were missing `saveTransaction` in their deps. `saveTransaction` itself has incomplete deps (`pbPromptScale`, `pbPromptOpacity` not listed). Fixed during this session but indicative of pattern drift.
**Fix:** Move `saveTransaction` declaration above its callers. Complete all `useCallback` deps or disable the lint rule consciously per file.

### LOGIC-C4. Sync tombstone can nuke remote data on transient failure or race ✅ FIXED
**File:** `src/services/sellerSync.ts:591-916`, push methods `L227-273`
**What:** `pullAll()` discards `error` on every Supabase select. If a pull fails silently, local store is empty → `pushProducts` treats empty local as source of truth and deletes all remote products via `updated_at < syncStart` tombstone logic.
**Repro:** Reinstall, sign in, kill before hydration completes (< 1s). Next launch: remote data wiped.
**Fix:** Abort `syncAll` if any pull errored. Guard: skip tombstone if local array is empty AND no deletion IDs queued.

### LOGIC-C5. debtStore payment validation is inconsistent ✅ FIXED
**File:** `src/store/debtStore.ts:64-95` vs `32-57`, `124-161`
**What:** `addPayment` silently no-ops on settled debt but returns a paymentId (caller thinks it succeeded). `updatePayment` has no cap — can edit a RM10 payment to RM999 on a RM50 debt. `updateDebt` caps paidAmount when totalAmount shrinks, inconsistent with updatePayment.
**Fix:** `addPayment` returns null or throws on settled. `updatePayment` enforces `sum(payments) <= totalAmount` or surfaces "overpaid" state.

### UX-C1. 5 different expense entry surfaces
**Files:** `QuickAddExpense.tsx` (883 lines), `ExpenseEntry.tsx` (697 lines, orphaned — not registered in any navigator), `MoneyChat.tsx`, `ReceiptScanner.tsx`, `NoteEditor.tsx` + `intentEngine.ts`.
**What:** Each has its own category picker, wallet picker, amount input, save logic. User has no trusted single path to "log RM5 teh tarik."
**Fix:** Pick ONE primary (MoneyChat — stated AI differentiator) + `QuickAddExpense` FAB modal as fallback. Delete `ExpenseEntry.tsx` entirely. Receipt scanner and notes intent engine land into `QuickAddExpense` pre-filled, not their own save flows.

### UX-C2. `RootNavigator.tsx` is a 1,744-line junk drawer
**File:** `src/navigation/RootNavigator.tsx`
**What:** ~50 `Stack.Screen` with identical 15-line `headerLeft` boilerplate copy-pasted 45×. Per-income-type screens (freelancer/mixed/ontheroad/parttime/seller/stall) all live in the root stack regardless of active mode — dead routes for 80% of users at runtime.
**Fix:** Extract `makeBackHeader(C, mode, title)` helper (collapses to ~400 lines). Nest per-income-type screens under `BusinessNavigator` dynamic stacks keyed on `incomeType`.

### UX-C3. Launch blockers for a finance app in 2026
**What:** No data export (CSV/PDF), no backup/restore for personal mode (AsyncStorage only — uninstall = total loss), no biometric lock, no transaction search input, wallet-to-wallet transfer unclear. Personal mode has NO Supabase sync even though the auth infra is built for seller.
**Fix (priority):** (1) Ship CSV export via `expo-sharing` (~2 hrs). (2) Biometric lock via `expo-local-authentication` (~2 hrs). (3) Supabase sync for personal mode reusing seller infra. (4) Wallet transfer with history.

---

## High (real bugs, broken UX, missing essentials)

### SEC-H1. Unauthenticated order insert = push-spam amplifier
**File:** `supabase/migrations/...seller_orders_customer_insert` policy + `docs/index.html:459`
**What:** Anon can POST to `seller_orders` with any `seller_id`, no captcha, no rate limit, no size cap. Combined with `notify_new_order_link` trigger, each insert fires `pg_net.http_post` to Expo. `customer_name` flows verbatim into push title/body — content-controlled phishing.
**Fix:** Turnstile/captcha on the order page OR short-lived HMAC token minted by `order-page` edge function. DB CHECK constraints on `total_amount`, `length(note)`, `jsonb_array_length(items)`. Per-seller rate limit via trigger.

### SEC-H2. `seller_profiles_public_read` leaks phone + push_token ✅ FIXED (push_token removed from anon view; phone retained for WhatsApp CTA)
**File:** `supabase/migrations/20260307062816_seller_schema.sql:136-137`
**What:** Policy is `for select using (slug is not null)` — RLS doesn't restrict columns, clients pick the column list. Attacker: `GET /rest/v1/seller_profiles?select=phone,push_token,user_id&slug=neq.null` dumps every seller's phone and Expo push token.
**Fix:** Create `seller_profiles_public` view with only public columns. Grant SELECT to anon on the view. REVOKE anon on the table. OR use PostgREST column-level GRANTs.

### SEC-H3. Push trigger spammable; phishing via `customer_name`
**File:** `supabase/migrations/20260307180000_push_notifications.sql:12-60`
**Fix:** Rate-limit pushes per seller_id via counter table. Cap `customer_name` to 40 safe chars in the trigger. Validate push_token shape.

### SEC-H4. Storage buckets accept any MIME, any size ✅ FIXED
**Files:** `shop_logo.sql:19-23`, `product_images.sql:19-23`
**What:** Authenticated user uploads `{uid}/phishing.html` → served from the same Supabase origin. Also 100MB file bombs.
**Fix:** `UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'], file_size_limit = 2097152 WHERE id IN ('shop-logos','product-images','web')`.

### SEC-H5. Premium gates are pure client-side ⚠️ DEFERRED (requires server-side tier + IAP receipt verification sprint)
**File:** `src/store/premiumStore.ts:21,73-123`
**What:** `tier: 'premium'` persisted in AsyncStorage. Trivially flipped with a rooted device or a forked client.
**Fix:** Move tier to `seller_profiles.tier`, set only via verified IAP receipt-validation edge function. Any paid-feature quota must check server-side limits via RLS/edge function.

### LOGIC-H1. Receipt scan counter decremented on failure ✅ FIXED
**File:** `src/screens/shared/ReceiptScanner.tsx:233-259`
**What:** `incrementScanCount()` runs before `scanReceipt()` resolves. Failed scan still consumes user's free tier quota.
**Fix:** Move `incrementScanCount()` to after `extracted` is validated (`if (extracted.total > 0)`).

### LOGIC-H2. Receipt save has no double-submit guard ✅ FIXED
**File:** `src/screens/shared/ReceiptScanner.tsx:308-411`
**What:** `setSaving(true)` + `disabled={saving}` only reflects after React re-renders. Fast double-tap fires twice → 2 transactions, 2 wallet deductions, 2 `addReceipt` calls. No catch on the try block → partial writes on throw.
**Fix:** `const lockRef = useRef(false); if (lockRef.current) return; lockRef.current = true;` — reset in finally. Wrap tx + wallet + receipt in try/catch that undoes `addTransaction` if `addReceipt` fails.

### LOGIC-H3. Cancel mid-upload orphans the image file ✅ FIXED
**File:** `src/screens/shared/ReceiptScanner.tsx:320-334`
**What:** Image copied to `documentDirectory/receipts/` BEFORE the transaction insert. App backgrounded between copy and insert → file on disk never referenced by any receipt record → storage leak.
**Fix:** Persist image only after all writes succeed, or cleanup in finally on failure.

### LOGIC-H4. `SellerOrders` navigated to 7 places but never registered ✅ VERIFIED — NOT A BUG

**Revised finding:** `SellerOrders` IS registered as a Tab.Screen inside `BusinessNavigator` (line 103). In-app calls reach the sibling tab. `App.tsx` uses `SellerOrderList` (the root stack registration) for notification deep-links. Both work. The real issue is **duplication** — same `OrderList` component is exposed as both a tab and a stack screen. Track as UX cleanup, not a crash bug.

(original audit claim below was incorrect)
**File:** `src/navigation/RootNavigator.tsx:65,1495` vs call sites in seller/Dashboard `L504,736,952,970,991`, OrderList `L1259`, Customers `L752`
**What:** Registered screen is `SellerOrderList`. Call sites say `SellerOrders`. This throws in production when a seller taps "online orders" pill.
**Fix:** Rename one side to match. (Same class of bug as the `ExpenseEntry` issue fixed earlier this session.)

### LOGIC-H5. Auth effect has wrong deps + OTP can be re-spammed ✅ FIXED
**File:** `src/navigation/RootNavigator.tsx:91-100, 103-122`
**What:** First effect has `[]` deps but reads `isAuthenticated`/`isVerified` — never re-runs on state change. Second effect re-fires OTP requests whenever `otpCode` becomes null (every back-navigation from OTP screen). No cooldown.
**Fix:** Correct deps. Add `lastOtpAtRef` 30s cooldown.

### LOGIC-H6. Every `new Date()` is device-local ⚠️ PARTIAL

`src/utils/datetime.ts` now provides `nowMYT()`. Applied to `QuickAddExpense.saveTransaction` (the on-the-go logging path). Full rollout across all stores and receipt edit flow is follow-up work — mass-replace too risky for one session.
**Files:** pervasive — `personalStore.ts:22,215,219`, `debtStore.ts:14,74`, `ReceiptScanner.tsx:71,375`
**What:** Malaysian user who logs a midnight expense while traveling outside UTC+8 will see it bucketed to the wrong day in MY monthly reports.
**Fix:** Normalize to Asia/Kuala_Lumpur at write time via `date-fns-tz` `zonedTimeToUtc`. Minimum: document "buckets are device local" in settings.

### LOGIC-H7. `_quickAddOpenRef` assigned in render body ✅ FIXED
**File:** `src/components/common/QuickAddExpense.tsx:42-45, 190`
**What:** Module-level mutable assigned on every render. StrictMode double-render plus any navigator re-mount orphans closures.
**Fix:** Move to `useEffect(() => { _quickAddOpenRef = handleOpen; return () => { _quickAddOpenRef = null; }; }, [handleOpen]);`.

### UX-H1. Folder structure is lying
**What:** `screens/seller/` and `screens/stall/` are peers of `screens/business/`, but `freelancer/mixed/ontheroad/parttime/` are children of `business/`. No consistent rule. Legacy `business/CRM.tsx`, `POS.tsx`, `Inventory.tsx`, `ClientList.tsx`, `SupplierList.tsx` look like stubs from an earlier pivot.
**Fix:** Move `seller/` and `stall/` under `screens/business/`. Verify and delete the legacy stubs via import graph.

### UX-H2. `components/common/` is a 33-file dumping ground
**What:** Mixes primitives, composed widgets, feature-specific (QuickAddExpense — 883 lines of feature code in a "common" folder), dev scaffolding, and AI-generated one-offs (BreathingRoom, StoryCard, GlassCard, HeroCard).
**Fix:** Split into `primitives/`, `pickers/`, `feature/`. Move `QuickAddExpense` to `screens/personal/` or `components/feature/`. Delete GlassCard/HeroCard/StoryCard/BreathingRoom/FreshStart if < 2 usages.

### UX-H3. Three competing onboarding surfaces on Dashboard
**What:** First-time user sees GettingStarted checklist + ScreenGuide tooltip + empty insight strip + FreshStart + FeatureHint — a wall of guidance, none of it coherent.
**Fix:** Keep ONE teaching modality per screen. GettingStarted for Dashboard first-run. Delete FreshStart and FeatureHint unless >3 usages.

### UX-H4. i18n coverage is ~24%
**What:** Only 18 of 75+ screens call `useT()`. `en.ts` is 595 lines, `ms.ts` is 570 — 25-line gap. Hardcoded English in most screens despite stated Malay-first market.
**Fix:** Audit ms.ts parity via diff. Add pre-commit grep for common hardcoded strings in JSX. Translate the 5 highest-traffic screens first.

### UX-H5. Dark mode broken on 6 screens
**Files:** `personal/BudgetPlanning.tsx`, `personal/Dashboard.tsx`, `seller/OrderList.tsx`, `stall/SessionHistory.tsx`, `business/CRM.tsx`, `business/IncomeStreams.tsx`
**What:** 20 direct `CALM.` references. Will show light colors in dark mode.
**Fix:** Replace with `const C = useCalm()` + `C.` per MEMORY.md pattern.

---

## Medium (design debt, inconsistencies, friction)

### SEC
- **M1.** `phoneToEmail` maps phones → `{phone}@potraces.app`. Phone enumeration via differential errors on `signInWithPassword`. Fix: random per-account UUID mapping server-side.
- **M2.** `seller_products_public_read` exposes `cost_per_unit`, `stock_quantity` to anon. Competitor intel leak. Fix: column-level GRANT on the public-facing set.
- **M3.** No DB-level length/shape validation on order_link inputs (`customer_name`, `customer_phone`, `note`, `items`). Excel export formula-injection via `xlsx`. Fix: CHECK constraints + sanitize Excel cells beginning with `=+-@`.
- **M4.** ✅ FIXED — XSS via `currency` field in `order-page` edge function. Values interpolated as bare JS strings inside `<script>` (L251-255). Attacker-seller sets `currency = '; fetch(...)//`. Fix: `JSON.stringify` every value OR pass via data-attribute. Add CSP header. Validate `currency` shape `/^[A-Z]{2,5}$/` at DB level.
- **M5.** `clear-business-data` has no re-auth. Stolen JWT wipes shop + deletes auth user. Fix: require re-enter password or fresh OTP within 5 min.
- **M6.** `AuthGatedBusiness` trusts persisted `isAuthenticated`/`isVerified` booleans (`authStore.ts:17-41`). Editable in AsyncStorage on rooted device. Fix: derive freshly from `supabase.auth.getSession()` on every mount.

### LOGIC
- **M1.** ✅ FIXED — ID collision possible — `Date.now() + Math.random().toString(36).slice(2,6)` = only 4 random chars. Bulk import bugs. Fix: `expo-crypto` `randomUUID()`.
- **M2.** ✅ FIXED — Onboarding not atomic — `handleComplete` can set `hasCompletedOnboarding=true` without calling `handleWelcomeDone`. User skips slide 1, loses name/language.
- **M3.** Sync compares remote `updated_at` against local `createdAt` for customers/seasons (sellerSync.ts:680,723,828). Hack acknowledged in comments. Any remote update overwrites local edits silently.
- **M4.** ✅ FIXED — `_cachedProfileId` in sellerSync is module-level, never invalidated on sign-out. User A signs out, User B signs in → writes go to A's rows.
- **M5.** FAB position not re-clamped on rotation or keyboard resize. Can end up off-screen.
- **M6.** `handleSplitBill` (ReceiptScanner) navigates away without save lock and uses a 50ms setTimeout that MEMORY.md already says is unreliable on iOS.
- **M7.** ✅ FIXED — OTP back handler fires `signOut().catch(() => {})` — if offline signOut fails, local state resets but server session persists. User is "signed in" on next launch with no local state.

### UX
- **M1.** `DebtTracking.tsx` lives in `screens/shared/` but is personal-mode-only. Move to `screens/personal/`.
- **M2.** `CollapsibleSection` — per MEMORY.md user preference "NEVER use dropdowns/collapsibles" — delete it. Inline the Dashboard "Details" content.
- **M3.** `WalletPicker`, `CategoryPicker`, `ContactPicker` — 4+ inline re-implementations across expense surfaces. Not honestly reusable. Consolidate or remove the wrapper.
- **M4.** `PersonalNavigator` has 5 tabs; `BudgetPlanning` as a whole tab is heavy (opened monthly, not daily). `Notes` as a top-level tab conflicts with "track my money" framing. Demote Budget to a Dashboard card. Rename or relocate Notes.
- **M5.** 11 Zustand stores. Several likely underused (`aiInsightsStore`, `learningStore`, `playbookStore`, `crmStore`, `receiptStore`). Each is a rehydration race risk. Merge where possible.
- **M6.** Mode-switching between personal and business is punishing (Settings → ModeToggle → navigate → re-auth if business). Freelancer logging a client payment then buying teh tarik = 4+ taps. Unify entry with "tag as business" on any expense.
- **M7.** Dashboard is 1,532 lines. Doing the work of 4 screens. Trim to 3 sections max on empty state.

---

## Low (polish, nits)

- **SEC-L1.** No CSP on `order-page` edge function. Low impact; it sets `X-Content-Type-Options: nosniff` but nothing else.
- **SEC-L2.** `.env` gitignored, no secrets in repo. **Positive finding.**
- **SEC-L3.** `xlsx@0.18.5` has known CVEs (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g60-rfqr ReDoS). Replace with `exceljs` or pin to SheetJS CDN tarball.
- **SEC-L4.** `react-native-document-scanner-plugin@2.0.4` — niche, low download count, supply chain risk. Consider `expo-image-picker` + server-side OCR.
- **SEC-L5.** `request-otp` doesn't validate phone format. Fix: `/^\+?[0-9]{8,15}$/`.
- **SEC-L6.** `push_token` format not validated before Expo POST.
- **LOGIC-L1.** 17 silent catches across 9 files (RootNavigator, chatActions, aiService ×2, Settings ×2, DebtTracking ×2, Customers, QuickAddExpense ×3, NewOrder, OrderList ×4). Audit each; at minimum log under `__DEV__`.
- **LOGIC-L2.** `parseReceiptDate` fallback `new Date("12")` returns 2012-01-01 silently. Add year range check.
- **LOGIC-L3.** Onboarding dot accent off-by-one for welcome slide (`PAGES[-1]` → `undefined` → falls back to `C.accent` by luck).
- **LOGIC-L4.** Settings sign-out: in-flight `pullOrderLinkOrders` continues writing to seller store under the previous user's data. Add a sync generation counter.
- **LOGIC-L5.** `PersonalNavigator` uses static `COLORS.personal` — tab indicator doesn't shift in dark mode.
- **LOGIC-L6.** `deleteContact` patches `name` to "(deleted)" but `phone`/`email` remain. Privacy concern if contacts re-exported.

---

## The Critic's Cut (what Product Hunt will say)

**Top negative comment:**
> "Beautiful but confusing. I opened it, saw 5 tabs, 4 ways to add an expense, something about 'seasons' and 'stalls' and 'playbooks,' and couldn't figure out where to just type 'coffee RM5.' Also — what happens to my data if I delete the app? The 'Financial Pulse' screen told me my 'savings velocity' is 73%. I don't know what that means and neither does the app."

**3 obviously-AI-generated patterns:**
1. **Chip-pill-gradient overuse** — every screen has horizontal scrolling chip strips with fade edges (the fact that this is a *mandatory rule* in MEMORY.md is itself a tell that design compensates for unclear hierarchy with visual noise).
2. **Mindfulness-finance vocabulary no human writes** — "Financial Pulse," "Money Chat," "Echo" (tab!?), "Breathing Room" (literal component), "Savings Velocity," "Playbook." A Malaysian says *duit masuk / duit keluar* and moves on.
3. **Six distinct semantic debt colors** with elaborate meanings (terracotta/mauve/bronze/sky/gold/olive). No user will memorize this. A real app uses 2 colors: "you owe" / "they owe."

**Bonus tell:** 11 Zustand stores + 16 services (aiService, chatActions, geminiClient, intentEngine, manglishParser, moneyChat, queryEngine, spendingMirror, reportNarrative…) + a `notes-first-plan.md` memory document. This is an app designed feature-first by prompting, not built by sitting with 3 real Malaysian users and watching them fail to log *nasi lemak*.

---

## TL;DR — Fix Priority Queue

### This week (integrity + security)
1. **Fix `deleteTransaction`/`updateTransaction`** — wallet reconciliation (LOGIC-C1, C2).
2. **Kill `claim_seller_profile`** as-is (SEC-C1). Replace with OTP-gated claim.
3. **Stop returning OTP code to client** (SEC-C2). Add brute-force guard (SEC-C3).
4. **Patch the sync tombstone race** (LOGIC-C4).
5. **Restrict `seller_profiles_public_read` columns** (SEC-H2).

### This month (launch-readiness)
6. **Ship CSV export + biometric lock + personal-mode backup** (UX-C3).
7. **Kill 3 of 5 expense entry surfaces.** Pick MoneyChat + QuickAddExpense (UX-C1).
8. **Refactor RootNavigator** — extract `makeBackHeader`, nest per-income-type screens (UX-C2).
9. **Fix `SellerOrders` vs `SellerOrderList` mismatch** (LOGIC-H4).
10. **Move `tier` server-side** (SEC-H5).

### Before calling this v1
11. **Collapse 4 side-hustle income types** into one generic SideHustle flow (UX bloat).
12. **Close i18n + dark-mode gaps** (UX-H4, H5).
13. **Rename "Echo" / "Financial Pulse" / "Breathing Room"** or delete them.
14. **Onboarding ends on MoneyChat** with a pre-filled "try: lunch 12" — not on an empty Dashboard.

### Always
15. Replace `Date.now() + 4-char random` IDs with `randomUUID()` (LOGIC-M1).
16. Timezone-normalize financial writes to Asia/Kuala_Lumpur (LOGIC-H6).
17. Audit and label every silent catch (LOGIC-L1).
