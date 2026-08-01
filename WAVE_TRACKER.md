# WAVE TRACKER — launch gaps found beyond AUGUST.md

_Working checklist. Created 2026-07-30 from the gap audit (2026-07-29) that swept ~50 launch-relevant
docs and found ~20 open items **not** captured in AUGUST.md. We work **wave by wave**._

> **How we track (agreed with owner):**
> - This file is the **working index** so nothing is forgotten.
> - When an item is **done**, mark it `[x]` HERE **and** in its home file (the "→ file" on each line). _Update 2026-08-01: owner asked to also consolidate the 🟡 needs-you items into **AUGUST.md** (its "Owner actions" + "Post-launch" sections) — done._
> - **Edit only, never commit** (owner: "still working").
> - 🚨 = blocks launch. 🟢 = Claude does it (code) · 🟡 = needs owner (decision/account/device test) · 🔴 = bigger build (Claude).

---

## Wave 1 — Unblock the build (fast, Claude)
- [x] **1.** 🚨🟢 ~~Add the App Store encryption setting~~ **ALREADY DONE (verified 2026-07-30)** — `ITSAppUsesNonExemptEncryption: false` present in app.json:29. → `archive/root/PLAN.md` ✅
- [x] **2.** 🚨🟢 ~~Fix the CollectzJoin build error~~ **ALREADY DONE (verified 2026-07-30)** — i18n keys + `payByChip`/`payByChipText` styles all exist; `tsc --noEmit` passes 0 errors. → `archive/docs/handoffs/2026-07-27-session-handoff.md` ✅

## Wave 2 — Decisions from owner (verified in code 2026-07-30)
- **3.** 🚨 **Payment-accept — RESOLVED: ship via Fiuu DuitNow-QR; Stripe Tap-to-Pay stays OFF (post-launch).** Verified: "Tap-to-Pay" (Stripe card reader) and "Fiuu" (QR) are DIFFERENT features. Stripe needs Apple's proximity-reader entitlement (weeks) + a native `.entitlements` edit → not viable for 13 Aug. Fiuu code is complete + no-prebuild (JS/env only, OTA-able). Remaining = ops + external Fiuu unblock:
  - [ ] 🟡 **(external, CRITICAL PATH)** Unblock Fiuu provisioning — precreate returns errorCode 1011 "merchant account unauthorized"; owner emailed support@fiuu.com. Nothing ships ON until this returns statusCode 00. → `docs/plans/fiuu-qr-integration.md`
  - [ ] 🟡 Apply prod DB migration (`payment_events`, `processed_webhook_events`, `device_tokens`, `seller_orders.psp_transaction_id/payment_provider`) via `supabase db push`
  - [ ] 🟡 Deploy `qr-create-charge` + `qr-payment-webhook` to prod
  - [ ] 🟡 Set prod `FIUU_*` secrets + `FIUU_BASE_URL=https://opa.fiuu.com`; register webhook on PROD Fiuu portal
  - [ ] 🟡 Set `EXPO_PUBLIC_QR_PROVIDER=fiuu` in the prod build env (currently unset here)
  - [ ] 🟡 Device end-to-end verify (accept push is best-effort, not a hardware soundbox)
  - [ ] 🟢 Fix stale `docs/TAP_TO_PAY.md` (falsely claims the proximity-reader entitlement is in app.json — it is NOT)
  - _Fallback if Fiuu misses 13 Aug: ship the live static exact-amount QR + manual "Received" (no code needed)._ → `docs/TAP_TO_PAY.md`
  - _Owner plan (2026-07-30): "NOW = QR with Fiuu; LATER = Tap-to-Pay with Fiuu." So Stripe/Fiuu Tap-to-Pay is a **post-launch** item, wanted, likely via Fiuu's MY Tap-to-Pay partnership (one merchant onboarding could cover both)._
- **4.** 🚨 **Stall mode — RESOLVED: ships in v1.0 (still building).** Gate = **DECIDE LATER** (owner 2026-07-30); currently 100% free, zero tier lock (verified). Money bugs get fixed regardless → Wave 3 #6. → `docs/STALL_MODE_ROADMAP.md`
  - [ ] 🟡 (deferred) Decide: stall mode free, or behind a paywall/tier gate?

## Wave 3 — Big data-safety fixes (Claude)
- [~] **5.** 🔴 Seller "data-loss under load" — VERIFIED IN CODE 2026-08-01: the **CATASTROPHIC headline is STALE / already prevented** → **NOT launch-blocking.** Guards found: push early-returns when orders+deletedIds are empty (`sellerSync.ts:386`); syncAll pulls-before-push and aborts push if pull fails (`:1301`); pull is fully paginated (`pullPaged` `:801-844`); a failed write does NOT wipe the store. (Note: seller sync is ALWAYS-ON at launch, no gate — but the wipe path can't fire.) Real-but-lesser residuals remain, and they live in **delicate, UNTESTED multi-device sync code — do NOT edit blind; schedule post-launch/v1.1 WITH real 2-device testing:**
  - [ ] (post-launch, perf) Unbounded single-key AsyncStorage persist of seller `orders` → cold-start lag + local-availability gap for very heavy sellers (thousands of orders); **no remote loss.** Fix: back `orders` with expo-sqlite/MMKV or chunk (`sellerStore.ts:1060-1075`).
  - [ ] (v1.1 multi-device) Deletes are absence-driven, not tombstone-driven, for all entities except cost categories → narrow 2-device divergence/resurrection race (audit's B1). Fix: copy the existing `seller_deleted_cost_categories` tombstone pattern to orders/products/etc.
  - [ ] (correctness) 7 unpaginated push-side reads cap at 1000 → UNDER-deletion / deleted-order can resurrect (NOT loss). Cheap interim: wrap in `pullPaged` — but still sync code, test first.
  _The old `audit/SCALABILITY.md` (SCALE-C1/C6) overstated both; the newer `audit/LOAD_READINESS.md` already refutes them and the code agrees with the newer doc._ → `audit/LOAD_READINESS.md`
- [x] **6.** 🔴 Fix Stall-mode money bugs — DONE 2026-07-30 (all sub-items below fixed; only physical-device verify remains) → `docs/STALL_MODE_STATUS.md`
  - [x] **6b** MUST: `removeSale` omits `totalCard` → deleting a card sale corrupts totals — FIXED 2026-07-30 (`stallStore.ts` removeSale now subtracts totalCard); tsc clean ✅
  - [x] **6c** MUST: expected cash ignores cash expenses → false "short" — FIXED 2026-07-30 (`stallStore.ts` getSessionEconomics + `CloseSession.tsx` both now `float + cash − expenses`); tsc clean ✅
  - [x] **6d** SHOULD: custom/add-on carry 0 cost → FIXED 2026-07-30 (owner chose "label kept ≈ approximate", no new inputs; `getSessionEconomics.keptIsApprox` + "~"/note in SessionSummary & CloseSession); tsc clean ✅
  - [x] **6f** EASY: paused session can still sell → FIXED 2026-07-30 (owner chose "block + prompt"; store guards in addSale/addCustomSale + `promptResumeIfPaused` Alert in SellScreen tile/checkout/custom paths); tsc clean ✅
  - [x] **6v** VERIFY ON DEVICE: bugs a (transfer credits wallet) + e (suggests kept) — confirmed still-correct in code; still needs a physical-device run ⏳
  - [x] **6-docs** Updated `docs/STALL_MODE_STATUS.md` with a dated resolution banner ✅
- [x] **6s.** 🔴 NEW → FIXED 2026-07-30 (owner: fix now): `createTransfer` now takes an optional `walletId`; SeasonSummary + CostManagement resolve the default wallet + add a `WalletPicker` and credit it via `addTransferIncome`. Seller "transfer to personal" now actually moves money. tsc clean ✅ → `docs/STALL_MODE_STATUS.md`

### Post-launch stall polish (found 2026-07-30, not blockers)
- [ ] Loyalty rewards can't be claimed (no redeem action) · pre-orders never link to a regular from the create screen · provider QR is honor-system/manual when Fiuu unconfigured.

## Wave 4 — More quick wins (Claude)
_Verified against current code 2026-08-01 — real state below._
- [x] **7.** 🟢 Privacy manifest — **FIXED 2026-08-01.** Filled `NSPrivacyCollectedDataTypes` in `ios/Potraces/PrivacyInfo.xcprivacy` with the 9 types from `audit/STORE_DATA_DISCLOSURE.md` (Other Financial Info, Contacts, Photos/Videos, Audio, Other User Content, Name, Email, Phone, User ID) — each Linked=Yes, Tracking=No, purpose=App Functionality. `plutil -lint` OK. (The required-reason `NSPrivacyAccessedAPITypes` was already correct.) **Owner: these must MATCH the App Store Connect App-Privacy form (same sheet), and this native change needs an EAS rebuild.** Correctly NOT declared (dormant): Diagnostics/Sentry, Payment info/Tap-to-Pay — add when they go live. → `audit/APP_STORE_REJECTION_AUDIT.md`
- [x] **8.** 🟢 Offline indicator — **ALREADY DONE.** `OfflineBanner` (`src/components/common/OfflineBanner.tsx`) is wired on personal/seller/stall Dashboards; NetInfo used app-wide. _(The deeper "refresh-token expiry after ~1wk offline silently kills sync" edge is separate — personalSync/sellerSync do call `refreshSession()`; verify failure-handling later, not the headline gap.)_
- [x] **9.** 🟡 Screen-capture blocking — **SKIPPED by owner decision 2026-08-01.** It's a nice-to-have that mostly annoys users (blocks sharing your own payment QR, screenshotting your balance); not worth it. (`expo-screen-capture` stays installed but unused — harmless.)
- [x] **10.** 🟢 App-link handlers — **ALREADY DONE.** `App.tsx:707-711` has `Linking.getInitialURL()` + `Linking.addEventListener('url', handleUrl)`; `associatedDomains` (applinks:jejakbaki.my) already in app.json. Audit claim was stale. _(Optional: confirm `handleUrl` covers every applink path.)_
- [x] **11.** 🟡 privacy.html false claim — **FIXED 2026-08-01.** Verified in code: the receipt scanner sends the whole image as-is to Gemini (`receiptScanner.ts:228-230,382`), zero redaction — so "we strip card numbers" was false. Corrected the sentence honestly in BOTH EN (`site/privacy.html:134`) and Malay (`:201`). Owner still needs to re-upload the page to jejakbaki.my. _(Still open, minor: add Google Maps as a processor if/when maps ship; add Sentry/RevenueCat when those go live.)_ → `audit/APP_STORE_REJECTION_AUDIT.md`

## Wave 5 — Security / speed / money bugs — VERIFIED IN CODE 2026-08-01 (mostly already fixed)
- [x] **12.** 🔴 Referral-code RLS leak — **STALE / already fixed.** Migration `20260528000000_receipt_bucket_private_referral_policy.sql` dropped the over-broad `user_profiles_public_code_lookup` policy and replaced it with a `lookup_referral_code(code)` function returning ONLY the referral_code column. → `archive/audit/SECURITY_AUDIT.md`
- [~] **13.** 🔴 Seller order page — `customer_name` cap is **already there** (validateBody rejects >100 chars, `place-order/index.ts:290`; address 300 / note 500 / body 64KB too). **Report/Block** is a real post-launch feature (separate UGC surface, pairs with AUGUST's Collectz Report/Block). → `archive/audit/BACKLOG.md`
- [~] **14.** 🔴 Speed/cost — flood-cap composite index **WRITTEN** (`supabase/migrations/20260801010000_seller_orders_floodcap_index.sql`, `(seller_id, source, created_at)`; needs `db push` → AUGUST). ai-proxy "fails open" is **intentional & fine** (`ai-proxy/index.ts:189` fails open only on a DB read error so a hiccup doesn't block paying users; normal cap enforcement works `:186-188`). → `audit/SCALABILITY.md`
- [x] **15.** 🔴 Wrong-money bugs — **STALE / already fixed:** business Reports skips products with no cost (`Reports.tsx:53,119` `product.cost > 0`) + `hasAnyCost` margin guard (`:127`) → no 100% margin; Dashboard filters `!d.isArchived` (`Dashboard.tsx:324,327`). _(Not re-verified this pass: the separate "wallet transfers still inflate income/expense LINE ITEMS + Reports trend" partial-gap — check independently if pursuing.)_ → `archive/audit/NUMBERS_CONSISTENCY_AUDIT.md`

## Wave 6 — Owner's turn (accounts / keys / real-phone tests)
- [ ] **16.** 🚨🟡 Run the real EAS build — and do **NOT** run `expo prebuild` (breaks signing) → `audit/NATIVE_BUILD_BATCH_TECH.md`
- [ ] **17.** 🟡 Turn on the captcha (set `TURNSTILE_SECRET`) → `audit/APP_STORE_REJECTION_AUDIT.md`
- [ ] **18.** 🟡 Confirm prod server + AI plan limits + run one load test → `audit/LOAD_READINESS.md`
- [ ] **19.** 🟡 Real-phone tests: DuitNow QR, backup/restore, Quick-Add/Back-Tap, Sign in with Apple → `FINAL_BEFORE_DEPLOY_v1.0.0.md`
- [ ] **20.** 🟡 Re-upload the corrected privacy webpage to jejakbaki.my — text is **already fixed in-repo** (#11, EN+MS); owner just deploys `site/` to Vercel (review the other site WIP first so you don't push half-done pages). → `audit/APP_STORE_REJECTION_AUDIT.md`
- [ ] **21.** 🟡 Decide: sell Premium (RM25) yet? Its features are all deferred → `docs/MONETIZATION_AND_PRICING.md`

---

## ✅ Ignore — already fixed (verified in the audit, no action)
On-device crisis card · personalSync pagination + deleteMissing removal · paywall gate-on seatbelt · TRIAL_DAYS · 4-tier premiumStore · `sd()` date-guards.

## 🔎 New observations (2026-07-30)
- ~~**`npm test` is currently RED on `test:tiermigration`**~~ **RESOLVED (verified 2026-08-01):** full `npm test` is now GREEN (exit 0); `test:tiermigration` passes 70 checks and `tiers.ts` matches HEAD, so the caps/test mismatch is gone. (Left here for history.)
- The working tree already carries **large pre-existing WIP** across ~70 files from prior sessions (business/seller/personal screens, budget services, sampleData, echoCards). Keep the "don't commit yet" stance until the owner reviews.

## 🧪 Self-review of Wave 3 fixes (2026-08-01) — 8 findings, all handled
Ran a 4-dimension adversarial review + verify pass over this session's diff. 0 false positives. Outcome:
- [x] **BLOCKER** — Card/QR checkout charged the customer BEFORE the paused guard → money taken, sale dropped. FIXED: `promptResumeIfPaused()` now runs at the top of `openCardCheckout`, `openQrCheckout`, `handleConfirmCustom` (before any charge).
- [x] **HIGH** — `openCustom` had the guard in its deps but not its body (custom sales unblocked while paused). FIXED: guard added; `finishCustomSale` now `return`s on `!id` (no false success / spurious product / phantom visit).
- [x] **MEDIUM** — my new store guards made `collectPreOrder` mark a pre-order collected while paused but record no money/stock. FIXED: `collectPreOrder` returns false when paused; `PreOrders.handleCollect` shows a "resume to collect" toast (`preOrderPausedToast`, en+ms).
- [x] **LOW** — `keptIsApprox` misses uncosted add-on revenue on *costed* products. LEFT AS-IS: the reviewer's suggested fix (`total − cost·qty`) was itself wrong (flags every profitable sale). Bounded by the add-on delta; acceptable. Documented.
- [ ] **LOW / owner decision** — 6c flip-side: a *non-cash* expense (rare; app has no such concept) now reads a false "over". Proper fix needs a payment-method field on `StallExpense` (schema+UI). Deferred — flag to owner.
- [x] **LOW** — pre-existing sibling money-ghost in `LogIncome` → FIXED 2026-08-01. Credits the default wallet (no picker — it's a 3s auto-dismiss nudge, not a settlement screen). All 3 `createTransfer` callers (SeasonSummary, CostManagement, LogIncome) now pass a walletId. tsc clean ✅
- Re-verified: `tsc` 0 errors; wallet/txinvariant/paymentdedupe/goal/budget/syncmerge/fiuu tests all pass.
- **NEW regression test (2026-08-01):** `scripts/test-stall-money.ts` (`npm run test:stallmoney`, wired into the `npm test` chain right after `test:txinvariant` so it runs before the pre-existing tiermigration break). 14 assertions drive the REAL `useStallStore` through 6b (removeSale card totals), 6c (expectedCash − expenses), 6d (keptIsApprox both directions), 6f (addSale/addCustomSale/collectPreOrder are no-ops while paused + positive control). **All pass.** The stall money math is now regression-guarded; only the pure-UI bits (prompt visibility, picker/≈ label rendering) still want a device build eventually. _(Sim note: DerivedData binaries are incomplete/uninstallable → a UI run needs a full `expo run:ios` build; the unit test covers the money-correctness core without it.)_

## 🗂️ Session extras (2026-08-01) — beyond the numbered waves
- [x] **Owner tasks consolidated into AUGUST.md** (owner asked). Every 🟡 needs-you item — privacy re-upload, App-Privacy form + EAS rebuild, tiermigration reconcile, flood-cap `db push`, seller order-link Report/Block, stall non-cash expense, seller sync v1.1, neu design-consistency — now lives in AUGUST.md's "Owner actions" + "Post-launch" sections.
- [x] **Doc folder cleanup** — moved ~52 obsolete build-era docs + 4 dead folders into a new top-level `archive/` (via `git mv`, history preserved, reversible). Root 16→10 `.md`, `audit/` 46→16, `docs/` 35→25. Verified: nothing in code reads a `.md`, tsc clean, no dangling `→` pointers (updated the links that now point into `archive/`). See `archive/README.md`.
- [x] **Neu design coverage** — 58/102 screens use the neu kit. **Seller (11/11) + stall (12/12) are now 100% neu** (converted the last holdout `seller/ProductsReport.tsx` this session — tsc clean, needs a device eyeball). Remaining ~44 flat screens (other business income-types + auth + AccountOverview/Import/Settings/BackupRestore/ManageCategories) = cosmetic, post-launch → tracked in AUGUST.

## ⚠️ Verify-before-fixing
Items **15** and parts of Wave 5 come from April–May-dated audits (`AUDIT`/`DATA_INTEGRITY`/`EDGE_CASES`/`CONSOLIDATED` are least trustworthy). Confirm the bug is still in current code before changing anything.
