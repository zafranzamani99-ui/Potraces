# AUGUST — launch tracker 🎂 (target: 13 Aug 2026)

Living checklist for the v1.0.0 launch. Two buckets: **wait-before-launch** (must be
done to submit / go live) and **on-hold** (ships later, safe to launch without).
Built from the pre-EAS-build audit + decisions on 2026-07-28/29. Echo work tracked
separately (`audit/ECHO_UNFINISHED.md`).

---

## 🎚️ Launch-day switch — DON'T FORGET
- [ ] In the admin Rewards tab, flip `premium_gate_on = true` **and** move
      `premium_gate_start` to **13 Aug** in the *same* action. It's currently seeded to
      **1 Sept** — if you flip the gate but leave that date, premium won't actually
      start until September. Enable RevenueCat at the same time.

---

## ✅ Done (checked & decided this session)
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
- [ ] Biometric app-lock.
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
- [ ] Multi-device sync edge cases; shared household wallet (v1.1).
- [ ] Contact-sync salted-hash rewrite (before personal sign-in ships widely).
- [ ] Pre-monetize legal: PSP "referrer not acquirer" letter, SST decision, DPAs/DPO around ~10k users.
- [ ] Fiuu DuitNow-QR accept (code-complete, blocked on Fiuu provisioning — retest when they finish).
- [ ] Collectz join-approval deploy (code done; needs `db push` + `functions deploy` + smoke).
- [ ] **Cheaper Echo** (Bucket 3 #6) — trim the ~5k-token rulebook + wire prompt caching to cut cost per message. Quick edit but changes Echo's behaviour → needs a careful test pass. Not urgent (~RM0.005/msg today). Notes: `ECHO_MEMORY_COST_SAFETY.md` (open decision #1).
- [ ] **Flagship "Kept" install-hook** (Bucket 3 #7) — the cross-book "you kept RMx" number is on Reports; the growth wiring isn't: a Dashboard hero + a Collectz join-page "track your own money" nudge (acquisition funnel for people who pay a share). Growth call, not core Echo. Spec: `MAKIN_KENAL.md` §6.
- [ ] **Echo learns from everyone — LIVE opt-in pipeline** (Bucket 3 #5, decided scope = "categorization defaults only"). The *value* shipped now as a curated static dictionary (`merchantCategoryGuess.ts`, enriched 2026-07-29, now also feeds Echo chat). The LIVE version is parked here because it's a server + PDPA feature that adds a data-safety-disclosure line right at launch. Safe design when ready: opt-in (default OFF) contribute only anonymized keyword→category mappings (mamak→food) via a new edge function that STRIPS identity → a `community_category_hints` table → aggregate (≥N distinct contributors) into `community_category_defaults` → sync down to seed `builtInMerchantCategory`. NO amounts, NO chat text, NO identity. Needs: migration + edge function + client consent toggle + `db push`/`functions deploy`. Ties to the "DPAs/DPO around ~10k users" item above. Notes: `ECHO_MEMORY_COST_SAFETY.md` (decision #3).
