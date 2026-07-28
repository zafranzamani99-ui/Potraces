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

### 💳 Payments (the long pole — needs your accounts)
- [ ] RevenueCat: create account + API keys + 5 products (App Store Connect + Play) +
      entitlements + native rebuild + sandbox purchase test.
- [ ] "Cancel subscription" must deep-link to Apple's manage-subscriptions page (today it
      only flips a local switch → Apple reject).
- [ ] Server-side entitlement check so a paid tier can't be flipped on-device.
- [ ] Make the dev "free unlock" impossible in a release build.

### 📟 Tap-to-Pay (decided: keep building)
- [ ] Finish Tap-to-Pay.
- [ ] Declare location use in the Play Data-Safety form + fix the privacy page (it
      currently says "no location", but card readers need it).

### 📄 Store paperwork & deploys
- [ ] App Store privacy "nutrition label" + Play Data-Safety forms (answer-sheet in `audit/STORE_DATA_DISCLOSURE.md`).
- [ ] delete-account function deployed + public deletion page live + URL in Play Console.
- [ ] Privacy Policy + Terms actually live on jejakbaki.my.
- [ ] `apple-app-site-association` + `assetlinks.json` live on jejakbaki.my (link verification).
- [ ] Apple reviewer demo account; store screenshots (all sizes); support email/URL in the listing.
- [ ] `eas.json` production submit profile + Google Play service-account key (only iOS TestFlight is set up).
- [ ] iOS Google client ID in prod EAS; Android release SHA-1 in `google-services.json` (or Google sign-in breaks on the store build).

### ☁️ Cloud backup (decision needed)
- [ ] Either turn it on (and confirm sync works) OR hide the toggle + "automatic backup" pitch. It's advertised but off → Apple reject.

### 👥 Collectz safety (Apple 1.2 — it shows other people's names/photos)
- [ ] Add Report + Block for users.
- [ ] EULA acceptance at sign-up + a zero-tolerance-for-objectionable-content clause.
- [ ] Server-side profanity/URL filter on Collectz free-text names.

### 🧹 Code cleanup (mostly me — quick)
- [x] Remove `AD_ID` + `NSUserTrackingUsageDescription`. ✅
- [x] Removed unused permissions `SYSTEM_ALERT_WINDOW` + `WRITE_CONTACTS`, and the unused `expo-audio` package. ✅
- [x] Removed "Google Docs sync" paywall line + hid the Playbook "coming soon" tab (App Store 2.1). ✅
- [ ] Public order double-tap protection (idempotency) so one tap ≠ two orders.
- [ ] `receipt-images` storage bucket → private.
- [ ] Verify in the live DB that the shop-takeover fix is active (strangers can't read customer name/phone).
- [ ] Add a splash-screen image (opens blank now) + fix the clipped Android adaptive icon.
- [ ] Malay paywall (English-only today).
- [ ] Visible bilingual "not financial advice" note on savings/projection screens.
- [ ] First-run privacy-consent tap + swap the 21 bank/e-wallet logo PNGs to a generic icon (IP risk).
- [ ] Sentry crash reporting wired before launch.
- [ ] Biometric app-lock.
- [ ] AI zero-retention DPAs (Anthropic/Google) + make AI opt-in.
- [ ] `console.log` cleanup + 5 hardcoded-string i18n fixes.
- [ ] On-device run-through: paywall + every limit gate (wallet/budget/goal/scan); confirm cold-open loaders don't stick.
- [ ] Set `BETA_IOS_URL` / `BETA_ANDROID_URL` (or download links show "coming soon").

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
