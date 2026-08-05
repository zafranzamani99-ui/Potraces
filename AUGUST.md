# AUGUST — launch tracker 🎂 (target: 13 Aug 2026)

Living checklist for the v1.0.0 launch. Two buckets: **wait-before-launch** (must be
done to submit / go live) and **on-hold** (ships later, safe to launch without).
Built from the pre-EAS-build audit + decisions on 2026-07-28/29. Echo work tracked
separately (`audit/ECHO_UNFINISHED.md`).

> **`step2 July.md` + `step3 July.md` are now HISTORICAL — folded in here (2026-07-29).**
> Their money/sync fixes are done (money-logic audit verified fixed — see ✅ Done); the
> few non-blocking leftovers sit in ON HOLD → "Folded in from the July docs". **AUGUST.md
> is the single source of truth for launch.**
>
> **Recommended before-launch order:** (1) 🟡 the things only you can start — **RevenueCat
> account + the Google/Apple keys** (longest poles, everything billing waits on them);
> (2) in parallel, tell me to run the 🟢 code items + the four 🔴 bigger builds; (3) 🟡
> uploads (art, icons, screenshots, store forms) + confirm the website pages are live;
> (4) flip the **launch-day switch** + enable RevenueCat on 13 Aug. Detail below.

---

## 🎚️ Launch-day switch — DON'T FORGET
- [ ] In the admin Rewards tab, flip `premium_gate_on = true` **and** move
      `premium_gate_start` to **13 Aug** in the *same* action. It's currently seeded to
      **1 Sept** — if you flip the gate but leave that date, premium won't actually
      start until September. Enable RevenueCat at the same time.

---

## 🏦 Statement import → reconciliation (added 2026-08-05)

Source of truth: `docs/plans/import-reconciliation-design.md`. Phases 0–3
code-complete (tiered matcher, three-section review UI, batch undo, FX-exact pass,
reconcile horizon, multi-account grouping, monthly nudge). **Parser v2 DEPLOYED
2026-08-05** (`parse-statement` live; e-wallet top-ups as transfers, per-row
account/FX fields). Both migrations (`import_batch_fields`,
`wallet_reconciled_until`) confirmed applied on remote. Explore tile shipped the
same day: the inline dashboard backfill banner was removed (felt pushy) — statement
import now surfaces via the first quick action ("Explore" sheet in
`src/components/common/QuickActions.tsx`, 6 rows: statement / quick-log / CSV /
backup / Google sign-in / receipt scan). Quick-action defaults reordered; reports +
pulse now unpinned (See-All only).

**Remaining (must do before store):**
- [ ] **Device dogfood — day-15 test** (design doc §10): log ~2 weeks via manual /
      share / quick log on one wallet, import that account's statement → zero dupes
      auto-imported, ambiguous rows in Needs review, twins survive. Also: FX rows,
      multi-account PDF, password-protected PDF, reconcile offer.
- [ ] **Watch: e-wallet top-up over-flagging** — parser v2's TnG/GrabPay top-up →
      transfer detection is unverified against real statements.
- [ ] **§6 compliance** — Gemini paid-tier data terms confirmed in writing (record
      in `docs/legal/`) + privacy policy: statements uploaded for server-side AI
      processing, not stored, password never persisted, processor named.
- [ ] **§7 parser fixtures** — 1–2 anonymized statements per bank (Maybank, CIMB,
      Bank Islam, Hong Leong + TnG) + golden parse test. Gemini churn broke this
      pipeline twice; fixtures are the only ground truth.
- [ ] Full §11 production-readiness checklist before flag → 100%.

**Decisions pending:**
- [ ] **Force-reset saved quick-action layouts?** Existing users' saved
      `quickActionOrder` never shows the Explore tile (one-time layout-version
      migration vs leave custom layouts alone; only fresh installs get it pinned).
- [ ] Statement quota cap (6th import): currently friendly message → CSV path.
      Paywall/upsell is a product decision, later.

**Nice-to-haves (not scheduled):**
- Explore sheet: strict re-open (only on direct swipe-back, not any Home refocus);
  per-row "tried" dimming; remote-config rows.
- Tier-2 window tuning from instrumentation (design doc §8); force-include on
  Tier-1 rows (v2); month-range picker for 12-month statements; tombstones for
  deleted imports.
- Leftover from backup plan: Account-screen sync-status rows; incremental-sync
  flag rollout (`EXPO_PUBLIC_SYNC_INCREMENTAL`, stages 3–5 built); cloud-backup
  flag unlock at launch.

---

## 🛠️ Pending deploy — dev AI-cap bypass (NOT launch-blocking)
- [ ] **Deploy `ai-proxy` + set the dev-unlimited secret** (project `jngmanwvhbpkpkeklfiv`).
      Why: heavy Echo testing hits the proxy's monthly cap (`MONTHLY_TOKEN_CAP` 1.5M /
      `MONTHLY_CALL_CAP` 3000) → `403 {"error":"BUDGET_EXCEEDED"}` → Gemini 403s → MoneyChat
      falls back. Local code now adds `DEV_UNLIMITED_IDENTITIES` (env allowlist) that skips the
      cap for listed identities — **default-off, so prod stays capped**. Metering still runs.
      Finish it:
      ```
      npx supabase functions deploy ai-proxy --project-ref jngmanwvhbpkpkeklfiv
      npx supabase secrets set DEV_UNLIMITED_IDENTITIES=<your-user-uid> --project-ref jngmanwvhbpkpkeklfiv
      ```
      `<your-user-uid>` = Dashboard → Authentication → Users → zafranzamani99@gmail.com → User UID.
      Use the signed-in id (server-verified); a `dev:<device-id>` entry is spoofable.
- Quick unblock **without** deploying — reset this month's counter in the SQL editor (fine
      pre-launch, resets everyone; don't run with real paying users):
      `delete from ai_proxy_usage where period = to_char(now() at time zone 'utc','YYYY-MM');`

---

## 🧾 Owner actions from the punch-list work (2026-08-01)
_Surfaced while working `WAVE_TRACKER.md` (the found-gaps list). Code side is handled; these need **you** (accounts / uploads / consoles). Full detail + code status in `WAVE_TRACKER.md`._

**Before / around launch:**
- [ ] **Re-upload the corrected privacy page** to jejakbaki.my. `site/privacy.html` had a false "we strip card numbers from receipts" claim (verified untrue in code) — now corrected in-repo (EN + Malay). Deploy `site/` to Vercel so the LIVE page matches. ⚠️ The `site/` folder also carries other unfinished WIP — review before deploying so you don't push half-done pages live.
- [ ] **App-Privacy form must match the new privacy manifest.** `ios/Potraces/PrivacyInfo.xcprivacy` now declares the 9 collected-data types from `audit/STORE_DATA_DISCLOSURE.md`; enter the SAME answers in App Store Connect → App Privacy. This native change also needs an **EAS rebuild** to ship.
- [x] ~~**Reconcile `test:tiermigration`.**~~ **RESOLVED (verified 2026-08-01):** `npm test` is now GREEN (exit 0) and `test:tiermigration` passes 70 checks; `tiers.ts` matches HEAD, so the earlier caps/test mismatch is gone. No action needed.

**Post-launch / v1.1 (not blocking 13 Aug):**
- [ ] **Neu design-consistency — remaining screens.** Verified 2026-08-01: **seller (11/11) and stall (12/12) modes are now 100% neu** (last holdout `seller/ProductsReport.tsx` converted this session — needs a device eyeball, tsc-clean). Still on the OLDER flat style (~44 screens): the whole **business-mode cluster** (freelancer / mixed / on-the-road / part-time + core CRM/POS/Inventory/IncomeStreams/business Dashboard+Reports), **auth** (login/OTP), and **AccountOverview, ImportFromCsv/Statement, Settings, BackupRestore, ManageCategories**. They work fine — cosmetic. Convert post-launch per the CLAUDE.md neu recipes.
- [ ] **Deploy the flood-cap index** — `supabase db push` picks up `supabase/migrations/20260801010000_seller_orders_floodcap_index.sql` (speeds the place-order flood check under a viral order rush; additive/idempotent, safe to bundle with any other pending push). Load-only insurance, low priority.
- [ ] **Seller order-link Report/Block** — the public order page has no way for a seller to report/block an abusive buyer (name is length-capped, but content isn't moderated). A real post-launch feature; pairs with the 🔴 Collectz Report/Block item above.
- [ ] **Stall non-cash expense** — a card-paid expense reads a false "over" at cash close; proper fix needs a payment-method field on stall expenses. Low priority.
- [ ] **Seller sync hardening (multi-device)** — back seller `orders` with SQLite/MMKV (heavy-seller perf), switch deletes to durable tombstones (2-device race), paginate push-side reads (delete-resurrection). **None cause remote data loss today** (catastrophic audit headline verified STALE); do WITH real 2-device testing.

---

## ✅ Done (checked & decided this session)
- [x] **Money-logic audit (the step3 July "related findings") — all 4 VERIFIED FIXED (2026-07-29):**
      (1) Dashboard "Kept" card now excludes transfers + goal-moves so it matches the Reports
      "You kept" math (`useKeptNumber.ts`); (2) goal contributions are no longer counted as
      spending in Reports/Pulse (`insights.ts` `isGoalMove`); (3) note-driven debt payment is
      capped to the balance *before* the wallet is deducted — no more invisible cash
      (`useIntentEngine.ts`); (4) Goals' Echo is now tier-gated (no monetization bypass,
      `Goals.tsx`). Earlier multi-device sync fixes **M1/M2/M3/A2** are also in (custom-category
      sync, budget-profile sync, cloud soft-delete, schema-cache poisoning).
- [x] **Redeem codes + invite/referral rewards + clipboard auto-attribution** — built,
      deployed to prod, smoke test passed. Live values: welcome **15d** / Collectz
      milestone **5** joins / friend qualifies at account age **3d**.
- [x] `redeem_code` now says "already redeemed" before "code used up" (smoke-caught bug).
- [x] **Removed leftover ad-tracking** — `AD_ID` permission + `NSUserTrackingUsageDescription`.
      App does no ads/cross-app tracking; this stops Google's auto-reject.
- [x] **Decision — Tap-to-Pay stays** (still building) → its launch tasks are below.
- [x] **Decision — no ad tracking / no ATT prompt** (finance app, first-party data only).

---

## 🔴 WAIT — before launch (must do before 13 Aug)

Grouped by who does it: **🟢 Claude can do · 🟡 needs you · 🔴 bigger build (Claude, but a real feature).**

### 🟢 Claude can do (code — just say go)
- [x] Order double-tap protection — fail-open dedup in place-order (deployed); identical order within 45s returns the same order, no duplicate. ✅
- [x] Malay paywall — already fully translated in `ms.ts` (tiers/features/roadmap/legal); audit finding was stale. ✅
- [x] Bilingual "not financial advice" note — added under SavingsTracker's coaching/projections. ✅ *(Goals/Pulse can get it too if wanted)*
- [x] Biometric app-lock — already built (`BiometricGate`, wired in App.tsx, fail-open, settings toggle). ✅ *(lock-screen strings are hardcoded EN — minor i18n polish if wanted)*
- [ ] Sentry crash reporting — actually **needs your Sentry DSN key** (🟡, not green).
- [x] 5 hardcoded-string i18n fixes — already clean, lint passes. ✅ · `console.log` cleanup deferred (53 hits, mostly test/dev files — harmless in RN).
- [x] `eas.json` production submit profile added. ✅
- [ ] "Make AI opt-in" toggle (the DPAs are yours).
- [x] Shop-takeover fix verified LIVE — anon denied on `seller_orders`/`seller_profiles` (customer PII safe). ✅

### 🟡 Needs you (accounts / uploads / decisions)
- [ ] **RevenueCat** — account + API keys + 5 products (App Store Connect + Play) + entitlements + native rebuild + sandbox test. *(the payment system — longest pole; enable it on launch day)*
- [ ] App Store privacy "nutrition label" + Play Data-Safety forms (answer-sheet: `audit/STORE_DATA_DISCLOSURE.md`).
- [ ] Confirm LIVE on jejakbaki.my: account-deletion page, Privacy Policy + Terms, and `apple-app-site-association` + `assetlinks.json`; delete-account function deployed + URL in Play Console.
- [ ] Apple reviewer demo login + store screenshots (all sizes) + support email/URL in the listing.
- [ ] iOS Google client ID in prod EAS + Android release SHA-1 in `google-services.json` (or Google sign-in breaks) + Google Play service-account key.
- [ ] Splash logo art → send it, I wire it (+ fix the clipped Android adaptive icon).
- [ ] Generic bank/e-wallet icon → send it, I swap the 21 logo PNGs (IP risk).
- [ ] **Cloud backup:** decide — turn it on (confirm sync works) OR hide the toggle + "automatic backup" pitch.
- [ ] AI zero-retention DPAs (Anthropic / Google).
- [ ] **Tap-to-Pay:** finish it + declare location in Play Data-Safety + fix the privacy page (says "no location", card readers need it).
- [ ] On-device run-through: paywall + every limit gate (wallet/budget/goal/scan); confirm cold-open loaders don't stick + seller receipts show.
- [ ] Set `BETA_IOS_URL` / `BETA_ANDROID_URL` (or download links show "coming soon").

### 🔴 Bigger builds (Claude can do, but real features)
- [ ] **Collectz Report + Block** for users (Apple 1.2) + server-side profanity/URL filter on free-text names + EULA / objectionable-content tick at sign-up.
- [ ] "Cancel subscription" → deep-link to Apple's manage-subscriptions page. *(pairs with RevenueCat)*
- [ ] Server-side entitlement check so a paid tier can't be flipped on-device. *(pairs with RevenueCat)*
- [ ] **"Earn Pro" hub + Share & Earn Pro reward (NEW — decided 2026-07-29; launch-blocking, full build).**
      Two parts, one feature:
      - **(a) Merge into one "Earn Pro" hub — segmented Neu Pills `Invite · Share · Redeem`.**
        Collapses today's TWO separate settings rows + TWO stack screens into one screen.
        **Invite** pane = current `src/screens/shared/InviteFriends.tsx` (code / copy / share /
        progress / friend-code box). **Redeem** pane = current `src/screens/shared/RedeemCode.tsx`
        (gift-code entry + the clipboard-token read). **Share** pane = NEW (below). Collapse the
        two `SettingRow`s in `PersonalSettings.tsx` (~L378–390) **and** `BusinessSettings.tsx` into
        one "Earn Pro" row; register one hub screen in `RootNavigator.tsx` (keep or redirect the
        old `InviteFriends`/`RedeemCode` route names). Onyx/Neu-compliant, `PageScrollView` per
        pane. **This half is cheap — a pure UI merge of screens that already exist.**
      - **(b) Share & Earn Pro — the reward engine (the real work).** Post about the app **with a
        screenshot** on **Instagram · 小红书 (RED) · Reddit · Facebook · X · Threads**; the reward
        scales with the post's likes:
        - **30+ likes → 1 month Pro**
        - **100+ likes → 1 year Pro**
        - **viral → Pro forever**
        Build needs: **(1)** submit flow — user picks a platform, pastes their post URL (+ optional
        screenshot upload); **(2)** a `share_reward_submissions` table + edge function to record it;
        **(3) verification** — MVP = team reviews the like count and approves a tier in the admin
        Rewards tab (same place redeem/referral codes are managed); **(4) grant** — reuse the
        existing premium-grant path (`docs/plans/premium-grants-and-rewards.md`, `entitlements.ts`)
        so share-earned Pro is a **server-granted** entitlement exactly like redeem/referral (rides
        the same server-side entitlement check above, plays with RevenueCat); **(5) abuse controls**
        — dedupe by post URL, one grant per post, per-user/year cap (mirror the referral cap),
        account-age gate, reject bought-likes / edited screenshots on review; **(6)** EN+BM copy
        (new `t.shareEarn.*`) + push on approval (reuse `RewardModal.tsx`).
      - **Open calls to settle before/while building:** manual review vs honour-system vs a
        platform API for like counts; is "forever" a true permanent grant or a long-dated one;
        how the share year-cap interacts with the referral year-cap.
      - **Doc-sync:** this adds a new way to earn Pro → when built you MUST update
        `Potraces_Subscription_and_Echo_Guide.docx` (CLAUDE.md rule).

### ✅ Cleared this session
Redeem/rewards/invite + clipboard auto-attribution · `redeem_code` message fix · ad-tracking removed (`AD_ID` + ATT string) · `SYSTEM_ALERT_WINDOW` + `WRITE_CONTACTS` + `expo-audio` removed · Google Docs sync line + Playbook tab hidden · dev free-unlock seatbelt · `receipt-images` confirmed private · seller receipt images fixed · contacts search bug · docs synced.

---

## ⏸️ ON HOLD — after launch (safe to ship without)
- [ ] Seller storefront, business AI insights, storefront analytics, QR-accept / phone-soundbox.
- [ ] Playbooks feature (slated v1.2).
- [ ] HitPay QR provider (stub) — using manual "received" QR for now.
- [ ] Voice / speech-to-text minute metering.
- [ ] Referral extras: Android Play install-referrer, IAP-webhook grants, waitlist→app code bridge, `ip_hash` fraud signal, beta-installer free-month batch.
- [ ] Restore Purchases (dormant — test once billing is live).
- [ ] Statement / CSV import tiers (everyone shares the flat free cap for now).
- [ ] Multi-device sync edge cases; shared household wallet (v1.1). *(Includes step3's **A1** — LWW trusts the device clock, architectural, needs a server edit-time — and **A3** — poison-row quarantine, low/defense-in-depth. Both accepted for now.)*
- [ ] Contact-sync salted-hash rewrite (before personal sign-in ships widely).
- [ ] Pre-monetize legal: PSP "referrer not acquirer" letter, SST decision, DPAs/DPO around ~10k users.
- [ ] Fiuu DuitNow-QR accept (code-complete, blocked on Fiuu provisioning — retest when they finish).
- [ ] Collectz join-approval deploy (code done; needs `db push` + `functions deploy` + smoke).
- [ ] **Pull-to-refresh — 2 skipped screens.** Branded `PullRefresh` was rolled out to 44 screens (2026-07-30); these two were skipped because a plain wrap would break them and each needs a tailored approach:
      - **`seller/Products.tsx`** — it's a `DraggableFlatList`; PullRefresh's Android pan fights the drag/reorder gesture. Needs a gesture-coexistence fix (e.g. iOS-only wrap, or gate the pull off while `reorderMode`).
      - **`shared/InviteFriends.tsx`** — uses `PageScrollView` (KeyboardAwareScrollView form scroller) + has a text input; wrapping breaks caret-follow. **Decide this as part of the "Earn Pro" hub build (🔴 above)** — InviteFriends folds into that hub, so wire pull-to-refresh there rather than patching the standalone screen.
- [ ] **Cheaper Echo** (Bucket 3 #6) — trim the ~5k-token rulebook + wire prompt caching to cut cost per message. Quick edit but changes Echo's behaviour → needs a careful test pass. Not urgent (~RM0.005/msg today). Notes: `ECHO_MEMORY_COST_SAFETY.md` (open decision #1).
- [ ] **Flagship "Kept" install-hook** (Bucket 3 #7) — the cross-book "you kept RMx" number is on Reports; the growth wiring isn't: a Dashboard hero + a Collectz join-page "track your own money" nudge (acquisition funnel for people who pay a share). Growth call, not core Echo. Spec: `MAKIN_KENAL.md` §6.
- [ ] **Echo learns from everyone — LIVE opt-in pipeline** (Bucket 3 #5, decided scope = "categorization defaults only"). The *value* shipped now as a curated static dictionary (`merchantCategoryGuess.ts`, enriched 2026-07-29, now also feeds Echo chat). The LIVE version is parked here because it's a server + PDPA feature that adds a data-safety-disclosure line right at launch. Safe design when ready: opt-in (default OFF) contribute only anonymized keyword→category mappings (mamak→food) via a new edge function that STRIPS identity → a `community_category_hints` table → aggregate (≥N distinct contributors) into `community_category_defaults` → sync down to seed `builtInMerchantCategory`. NO amounts, NO chat text, NO identity. Needs: migration + edge function + client consent toggle + `db push`/`functions deploy`. Ties to the "DPAs/DPO around ~10k users" item above. Notes: `ECHO_MEMORY_COST_SAFETY.md` (decision #3).

### Folded in from `archive/root/step2 July.md` / `archive/root/step3 July.md` (non-blocking polish — Claude can do anytime)
- [ ] **Import → category name→id mapping** — imported txns store the category *name*, so they don't attach to budgets. Resolve to a category id (reuse the category/learning store). Data-quality, **not** launch-blocking. *(the only real code orphan from the July docs)*
- [ ] **Neu redesign — 3 screens left:** `AccountOverview`, `ImportFromCsv`, `ImportFromStatement`. Cosmetic.
- [ ] **Existing-user changelog note** for the lowered free caps — a one-time in-app note; optional soft-landing (nothing breaks without it; users keep what they have, just can't add past the new cap).
