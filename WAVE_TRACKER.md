# WAVE TRACKER — launch gaps found beyond AUGUST.md

_Working checklist. Created 2026-07-30 from the gap audit (2026-07-29) that swept ~50 launch-relevant
docs and found ~20 open items **not** captured in AUGUST.md. We work **wave by wave**._

> **How we track (agreed with owner):**
> - This file is the **working index** so nothing is forgotten.
> - When an item is **done**, mark it `[x]` HERE **and** mark it done **in its home file** (the "→ file" on each line). We do **not** fold these into AUGUST.md.
> - **Edit only, never commit** (owner: "still working").
> - 🚨 = blocks launch. 🟢 = Claude does it (code) · 🟡 = needs owner (decision/account/device test) · 🔴 = bigger build (Claude).

---

## Wave 1 — Unblock the build (fast, Claude)
- [x] **1.** 🚨🟢 ~~Add the App Store encryption setting~~ **ALREADY DONE (verified 2026-07-30)** — `ITSAppUsesNonExemptEncryption: false` present in app.json:29. → `PLAN.md` ✅
- [x] **2.** 🚨🟢 ~~Fix the CollectzJoin build error~~ **ALREADY DONE (verified 2026-07-30)** — i18n keys + `payByChip`/`payByChipText` styles all exist; `tsc --noEmit` passes 0 errors. → `docs/handoffs/2026-07-27-session-handoff.md` ✅

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
- [ ] **5.** 🚨🔴 Fix seller data-loss under load (AsyncStorage 6MB overflow + tombstone-delete wipes orders) → `audit/LOAD_READINESS.md`
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
- [ ] **7.** 🟢 Fill in the empty privacy manifest (`PrivacyInfo.xcprivacy` collected-data types) → `audit/APP_STORE_REJECTION_AUDIT.md`
- [ ] **8.** 🟢 Add offline indicator + fix sync silently dying after ~1 week offline (refresh-token expiry) → `audit/OFFLINE_RESILIENCE_AUDIT.md`
- [ ] **9.** 🟢 Turn on screen-capture blocking on balance/QR screens → `audit/NATIVE_BUILD_BATCH_TECH.md`
- [ ] **10.** 🟢 Add app-link route handlers so tapped universal/app links open the app → `docs/BETA_BUILD_RUNBOOK.md`
- [ ] **11.** 🟢 Draft corrected `privacy.html` text (omits Sentry/RevenueCat/Maps; false "we strip card numbers" claim) — owner uploads → `audit/APP_STORE_REJECTION_AUDIT.md`

## Wave 5 — Security / speed / money bugs (Claude)
- [ ] **12.** 🔴 Fix referral-code security leak (`user_profiles` RLS exposes full row) → `audit/SECURITY_AUDIT.md`
- [ ] **13.** 🔴 Seller order page: Report/Block + cap the `customer_name` field (abuse/phishing) → `audit/BACKLOG.md`
- [ ] **14.** 🔴 Speed/cost: place-order flood-cap index + ai-proxy budget check fails open → `audit/SCALABILITY.md`
- [ ] **15.** 🔴 Wrong-money-number bugs (Dashboard vs debt screen; business 100% margin; transfers inflate income) — **verify still real first** → `audit/NUMBERS_CONSISTENCY_AUDIT.md`

## Wave 6 — Owner's turn (accounts / keys / real-phone tests)
- [ ] **16.** 🚨🟡 Run the real EAS build — and do **NOT** run `expo prebuild` (breaks signing) → `audit/NATIVE_BUILD_BATCH_TECH.md`
- [ ] **17.** 🟡 Turn on the captcha (set `TURNSTILE_SECRET`) → `audit/APP_STORE_REJECTION_AUDIT.md`
- [ ] **18.** 🟡 Confirm prod server + AI plan limits + run one load test → `audit/LOAD_READINESS.md`
- [ ] **19.** 🟡 Real-phone tests: DuitNow QR, backup/restore, Quick-Add/Back-Tap, Sign in with Apple → `FINAL_BEFORE_DEPLOY_v1.0.0.md`
- [ ] **20.** 🟡 Fix wrong text on live privacy webpage (after #11 draft) → `audit/APP_STORE_REJECTION_AUDIT.md`
- [ ] **21.** 🟡 Decide: sell Premium (RM25) yet? Its features are all deferred → `docs/MONETIZATION_AND_PRICING.md`

---

## ✅ Ignore — already fixed (verified in the audit, no action)
On-device crisis card · personalSync pagination + deleteMissing removal · paywall gate-on seatbelt · TRIAL_DAYS · 4-tier premiumStore · `sd()` date-guards.

## 🔎 New observations (2026-07-30)
- **`npm test` is currently RED on `test:tiermigration`** — but NOT from our stall/seller work (verified: stashing all `src/` changes → test passes 70 checks). It's caused by other **uncommitted WIP** that lowered the free tier caps in `src/constants/tiers.ts` without reconciling the migration test. Ties to the "lowered free caps + existing-user changelog" item. Someone should reconcile `scripts/test-tier-migration.ts` (or the caps) before CI/build. Not launch-blocking on its own, but a red suite will.
- The working tree already carries **large pre-existing WIP** across ~70 files from prior sessions (business/seller/personal screens, budget services, sampleData, echoCards). Keep the "don't commit yet" stance until the owner reviews.

## ⚠️ Verify-before-fixing
Items **15** and parts of Wave 5 come from April–May-dated audits (`AUDIT`/`DATA_INTEGRITY`/`EDGE_CASES`/`CONSOLIDATED` are least trustworthy). Confirm the bug is still in current code before changing anything.
