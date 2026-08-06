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

## 🎯 Pulled into launch scope (owner, 2026-08-06) — from v1.2
_Owner wants these before the Apple submit. Scoped to what's realistically doable in 1–2 days; the rest
stays in v1.2 (see the bottom of this block). NOTE: adding a new capture feature this close to launch is
extra risk on a money app — keep it minimal, make it pass the 5 rules, and real-phone test before submit._

**📏 Final pre-submit check — the 5 Trust rules (do these LAST, right before you hit Submit):**
- [ ] 🟡 **Fast** — logging a payment is ≤2s, no typing, no choosing.
- [ ] 🟡 **Never wrong-but-sure** — auto-log only when sure; if unsure, ASK.
- [ ] 🟡 **Always tell you** — every auto-log shows a card/notification + one-tap undo.
- [ ] 🟡 **Never double** — the same payment is logged once, even if caught two ways.
- [ ] 🟡 **Prove it's right** — statement reconcile shows a "verified ✓" for the month.
  _(These are check-before-submit rules, not new builds. If a capture path can't meet all 5, hide it for v1.0.)_

**💰 Pricing (numbers only — the streak is NOT in launch, see below):**
- [x] 🟡 Set tiers to **Basic RM3.99 · Pro RM9.99 · Premium RM20** (Premium = seller/business). ✅ 2026-08-06 — `PaywallModal.TIERS` updated (+MONETIZATION doc, docx data.json, paywall test fixture). Yearly (owner call, keep legacy discounts): **Pro RM86/yr (RM7.17/mo, −28%) · Premium RM160/yr (RM13.33/mo, −33%)**; Basic stays monthly-only; every struck "was" = real 12× monthly. **Store consoles (App Store Connect / Play / RevenueCat) must list matching prices when billing is wired.**
- [x] 🚨 **Docx-sync (LOCKED):** ✅ regenerated `Potraces_Subscription_and_Echo_Guide.docx` (repo root) from `scripts/subscription_docx/data.json` in the same change — verified zero old-price strings inside + the new Earn Pro entry included. (Stale duplicate remains at `DOCS 22 JULY/` — Jul 23 snapshot, left as archive.)

**📸 Capture — ONLY the screenshot sweep is realistic in 1–2 days (reuses the reader you already have + rides the rebuild):**
- [ ] 🔴 **Screenshot sweep (minimal):** add `expo-media-library` (rides the launch rebuild) → on app-open, scan NEW screenshots since last check → feed each to the existing `recognizeRows` → `parsePaymentScreenshot` → show a "caught N payments — confirm?" card → `logQuickExpense`. Reuses `src/services/shareToLog.ts` (`logTextFromShare`) + `localReceiptOcr.ts`. Opt-in photo permission (`NSPhotoLibraryUsageDescription` already present), handle iOS limited-access, only NEW screenshots, small batches. Must pass the 5 rules above. Real-phone test before submit.

**🚫 NOT in launch (can't make today/tomorrow — stays in `v1.2.md`):**
- **Android notification reading** — Android-only (not for the Apple submit) + ~2 weeks (new native service + battery-killer handling).
- **WhatsApp number** — needs Meta Business API approval (external, weeks).
- **Merge-by-tap dedup** — the "spot the same payment twice" logic is the hardest part; do it properly post-launch.
- **The streak system** (14-day "close your day" + freeze + entitlements) — real engineering; launch the new prices WITHOUT it.

---

## 🧹 Reconciliation adds (2026-08-06) — found stranded in old docs, not tracked here
_From a sweep of every planning `.md` against AUGUST/WAVE/v1.2. These 4 are real, launch-relevant,
and were written **nowhere** in the 3 canonical docs. All belong to the feedback + voice features
already built — if the other session already did any, just tick it._
- [ ] 🟡 **Replace the Discord placeholder** with the real invite — `DISCORD_URL` (`src/constants/index.ts:168`)
      is still `https://discord.gg/potraces` (`TODO(zafran)`); the "Join our Discord" row dead-ends until
      fixed (or hide the row). → `docs/COMMUNITY_FEEDBACK_PLAN.md`
- [ ] 🟡 **Apply the pending feedback migrations to prod** — `supabase db push` picks up
      `20260804000000_beta_feedback_ratelimit.sql` + `20260805000000_beta_feedback_screenshots_multi.sql`
      (spam-protection + multi-screenshot on a public-writable table). Confirm applied on prod. → `docs/COMMUNITY_FEEDBACK_PLAN.md`
- [ ] 🟡 **Real-phone test the in-app feedback form** — draft survives a Google sign-in that backgrounds the
      app · screenshot pick+upload works · a submitted report shows on `site/admin.html` and can be marked
      Done. (Simulator can't prove the OAuth-kill/draft path.) → `docs/COMMUNITY_FEEDBACK_PLAN.md`
- [ ] 🟡 **Real-phone test voice / mic** — tap the mic on Echo / a note / LogIncome → listens, transcribes,
      cancels, **no crash on first tap** (iOS mic-permission string actually lands). Native module wired live
      into 3 shipping screens, code-complete but never runtime-verified. (If voice is hidden for v1.0, skip.)
      → `audit/ECHO_VOICE_V1_PLAN.md` (its backend was since rewritten to `expo-speech-recognition`)

_Not added: quick-log Back-Tap deploy / shortcut-publish — that's the **other session's** shortcut work
(the app already points to a live `https://jejakbaki.my/shortcut`); confirm there, don't duplicate._

---

## ✅ Settled so far (updated 2026-08-06)

- **🚀 Launch bigger-builds wave (2026-08-06, 4 parallel builds — all code done, deploys pending):**
  new pricing (Basic RM3.99 · Pro RM9.99 · Premium RM20; yearly RM86/RM160) + docx
  regenerated · Collectz Report/Block + server name filter + EULA clause (Apple 1.2) ·
  "Earn Pro" hub + Share-&-Earn engine with admin review queue · server-side
  entitlement lock (server wins, gated on `premium_gate_on`) · cancel-subscription
  store deep link. Full `npm test` green. Deploy queue: 3 migrations + 4 edge
  functions (see each 🔴 item's DEPLOYED note).
- **☁️ Cloud backup 🟢 trio (2026-08-05):** Google-connect consent popup · backup
  failure telemetry (`backup_telemetry`) · "Backup not working?" FAQ in both
  backup modals. Code green (tsc / lint:i18n / tests).
- **🤖 AI opt-in toggle (2026-08-06):** master switch in Personal + Business
  Settings, default OFF, consent prompt on first AI use (Echo / receipt scan /
  statement import). With AI off, nothing leaves the device for AI.
- **🔏 Anthropic purged + DPA question resolved (2026-08-06):** app is
  Gemini-only; wording cleaned from ops site, privacy draft, breach runbook,
  ai-proxy. No DPA signature exists for the Gemini API — paid-tier terms apply
  automatically; **billing CONFIRMED linked** (Potraces project, "Paid 1").
  Record: `docs/legal/ai-data-terms.md`.
- **🧾 Statement parser smoke detector (2026-08-05):** synthetic fixtures for
  all 5 banks + golden test (`GEMINI_API_KEY=... npm run test:statementparser`).
  Real anonymized statements from you swap in later (deferred — see §7 below).
- Earlier sessions: money-logic audit fixes (4/4 verified), redeem/referral
  rewards live, ad-tracking removed, statement-import phases 0–3 + parser v2
  deployed, backup-restore engine ALL PHASES complete.

All session work verified green (tsc · lint:i18n · full `npm test`) and left
**uncommitted** in the working tree for review.

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
- [~] **§6 compliance** — Gemini paid-tier data terms ✅ CONFIRMED in writing
      2026-08-06: `docs/legal/ai-data-terms.md` (owner verified billing linked on
      the Potraces project, "Paid 1" — no-training paid-services terms cover ALL
      Gemini usage incl. free quota). **Remaining:** privacy policy line —
      statements uploaded for server-side AI processing, not stored, password
      never persisted, processor named.
- [~] **§7 parser fixtures** — golden parse test BUILT 2026-08-05:
      `supabase/functions/parse-statement/fixtures/` (synthetic statements for
      Maybank 2-page + USD FX / CIMB / Bank Islam own-name transfer / HLB + SGD FX /
      TnG reloads, each with a hand-written oracle), `parserConfig.ts` shares the
      exact prompt/model/normalization between the edge function and
      `scripts/test-statement-parser.ts` (hard checks: count/totals/rows/is_transfer/
      FX; warns on description/category; `--write-expected` to accept reviewed
      output). Run `GEMINI_API_KEY=... npm run test:statementparser` before any
      model/prompt change (not in `npm test` — needs the key). **Still needs you
      (deferred — do whenever convenient):** 1–2 REAL anonymized statements per
      bank (Maybank, CIMB, Bank Islam, Hong Leong + TnG) to replace the
      synthetics — same filenames, then run the test once with `--write-expected`
      and eyeball the diff.
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

## ☁️ Cloud backup (Google Drive/Sheets + iCloud) — 2026-08-05

Plan: `docs/plans/cloud-backup-sync-plan.md` (Phases 1–3 code now complete).
Code committed in `0c1af41` (bundled with the other session's feedback/shortcut work).

**✅ Code done (verified tsc + lint:i18n + tests green):**
- [x] Phase 1+2 (earlier sessions): durable backup queue, Google Drive receipt
      backup, Sheets sync, AccountScreen UI, unit tests.
- [x] Phase 3 iCloud — `react-native-cloud-storage` v3 + config plugin
      (`iCloud.com.potraces.app`), `icloudBackup.ts` (+ logic + `npm run test:icloud`),
      `icloud-file` drain in `cloudBackupRunner` with per-provider preflights (dead
      Google session no longer blocks iCloud jobs, and vice versa), settings keys,
      manifest (`Potraces/manifest.json`), restore (merge = missing files only /
      replace = re-download all; **not paywall-gated**).
- [x] Account page de-cluttered — Google/iCloud collapsed into compact rows under
      "Backup apps"; full controls open in a floating modal (no inline dropdowns).

**🟡 Needs you (consoles / clicks):**
- [ ] **Google Cloud Console — publish OAuth consent screen Testing → Production.**
      #1 blocker: Testing status kills refresh tokens after 7 days + caps 100 users.
      Keep scope = `drive.file` ONLY (adding `spreadsheets` triggers weeks of review).
- [ ] **Apple Developer portal** — iCloud capability + container
      `iCloud.com.potraces.app` (must exist before the EAS build).
- [ ] **Privacy policy update** (site/) — disclose Google user-data handling (app
      touches only files it creates; how to revoke) + iCloud clause (files go to the
      user's own iCloud, we never see them). Google requires this for consent approval.
- [ ] **Confirm pricing gate** — plan default: backup features = premium
      (`hasCloudBackup()`). Restore stays free (recovery must not be paywalled).
- [ ] **Store declarations at launch** — App Store privacy label + Play data-safety:
      declare User Content transmitted with consent. iCloud-only adds nothing.

**🟢 Claude can do (code — say go):**
- [x] In-app consent copy before first Google connect (what happens, where files go,
      how to stop). ✅ 2026-08-05 — one-time Alert before the first connect in
      `AccountScreen.handleGoogleConnect`, persisted via `googleBackupConsentSeen`
      (settingsStore); EN+BM (`t.settings.googleBackup.consent*`).
- [x] Failure telemetry — one Supabase row per PERMANENT backup failure (silent
      failures in the wild are invisible without this; plan §5.4, reuse beta_feedback
      pattern). ✅ 2026-08-05 — `newlyFailedJobs` (cloudBackupLogic) detects jobs the
      drain just parked in the failed list; runner aggregates per kind →
      `reportCloudBackupFailure` (`backupTelemetry.ts`, kinds `drive/sheets/icloud-
      backup-failed`, once per kind per launch, no session = silent no-op). Existing
      `backup_telemetry` table reused (no migration; `kind` is unconstrained text).
- [x] FAQ/help entry — "backup not working?" recovery steps (Reconnect Google, retry
      failed, Full re-sync, Restore). ✅ 2026-08-05 — expandable "Backup not working?"
      block at the bottom of both provider modals: step copy + a working "Retry
      failed backups" row (`handleRetryFailed` → retryFailedBackupJobs + drain;
      failedCount polled with pendingCount). EN+BM (`t.settings.backupHelp.*`).

**🧪 Test plan (in order):**
1. **Now (current dev build):** modal UI · Google connect → Drive toggle → scan
   receipt → file in Drive "Potraces/Receipts" · Sheets toggle → transaction row
   appears, no dupes · airplane-mode queue → drain on reconnect.
2. **EAS build (last step):** `eas build --profile development --platform ios`
   (needs the Apple iCloud container above + `EXPO_PUBLIC_CLOUD_BACKUP=1` in build env).
3. **After install:** iCloud toggle → receipt lands in Files app "Potraces" folder →
   delete app → reinstall → sign in → Restore (Merge) → photos reappear.
4. Pre-launch full checklist: plan §5.7 (token after 7+ days, folder-delete
   re-provision, revoke→reconnect, paywall gate, telemetry rows).

**⏸️ Deferred (documented, not this build):** true OS-background sync (foreground-first
by design), resumable uploads >5 MB, per-year sheet tabs, legacy Android Google
Sign-In SDK migration (watch item before Google EOLs it).

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
- [x] "Make AI opt-in" toggle (the DPAs are yours). ✅ 2026-08-05 — master
      `aiOptInEnabled` flag (default OFF; decision: ask on first AI use). Transport
      gate in `geminiClient.isGeminiAvailable()` (via `services/aiOptIn.ts` checker
      — tsx-safe) degrades ALL AI to existing fallbacks; `parseStatement` returns
      `ai_off`. Consent dialog (`services/aiConsent.requestAiAccess`) wired at Echo
      send, receipt scan, statement import; toggle rows in Personal + Business
      Settings (`t.settings.aiFeatures*`). Google-only copy (Anthropic retired —
      wording purged from ops site, privacy draft, breach runbook, proxy headers).
      DPA/terms record + billing checklist: `docs/legal/ai-data-terms.md` (needs
      your one click: confirm billing on the Gemini API project).
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
- [x] ~~AI zero-retention DPAs~~ **RESOLVED 2026-08-06 (Google-only):** the
      Anthropic path was retired — no user data goes anywhere but Gemini. And for
      the Gemini API there is no separate DPA to sign: the paid-tier terms +
      Google's Data Processing Addendum apply automatically once billing is
      active. Billing CONFIRMED linked on the Potraces project ("Paid 1") —
      record in `docs/legal/ai-data-terms.md`. Anthropic wording purged from the
      ops site, privacy-notice draft, breach runbook, and ai-proxy comments.
- [ ] **Tap-to-Pay:** finish it + declare location in Play Data-Safety + fix the privacy page (says "no location", card readers need it).
- [ ] On-device run-through: paywall + every limit gate (wallet/budget/goal/scan); confirm cold-open loaders don't stick + seller receipts show.
- [ ] Set `BETA_IOS_URL` / `BETA_ANDROID_URL` (or download links show "coming soon").

### 🔴 Bigger builds (Claude can do, but real features)
- [x] **Collectz Report + Block** for users (Apple 1.2) + server-side profanity/URL filter on free-text names + EULA / objectionable-content tick at sign-up. ✅ CODE 2026-08-06 — `content_reports` + `user_blocks` (migration `20260806100000`), public `report-content` edge function (flood-capped), server-side name filter in `collectz-join` (`name_blocked`), reason-picker report UI (join/detail/web join page), one-way block enforcement, EULA tick in AuthScreen sign-up (prior session) + terms.html new Cl. 10 "Objectionable content & conduct" (EN+BM). 44/44 filter tests incl. client/server parity. **DEPLOYED 2026-08-06 (`db push` + functions `report-content`, `collectz-join`).** Notes: `collectz_reports` (20260802) now orphaned (all reports → `content_reports`); organizer create path still client-filter-only (needs edge/trigger later).
- [x] "Cancel subscription" → deep-link to Apple's manage-subscriptions page. ✅ 2026-08-06 — "Manage / cancel subscription" row in `SubscriptionCard` (paid tiers only): iOS → apps.apple.com/account/subscriptions, Android → play.google.com/store/account/subscriptions (`t.settings.manageSubscription*`). **TODO at RevenueCat time: retire/repoint the old local "Cancel" (`premiumStore.unsubscribe()`) — kept for now as the dev-unlock kill switch; once real billing exists it must not silently clear local state while the store keeps billing.**
- [x] Server-side entitlement check so a paid tier can't be flipped on-device. ✅ CODE 2026-08-06 — `get-entitlements` edge function + `entitlement_state(p_uid)` RPC (migration `20260806120000`), `entitlementPolicy.ts` merge (server wins BOTH directions for signed-in users once `premium_gate_on`; fail-open cache + 7d grace offline; signed-out + gate-off unchanged; dev unlock intact), 34-check `test-entitlement-merge`. **DEPLOYED 2026-08-06 (`db push` + function `get-entitlements`). ⚠️ Do NOT flip `premium_gate_on` with billing live until the RevenueCat seam (`fetchPurchaseCandidate`) returns `source='purchase'` — else server-wins hides real purchases.**
- [x] **"Earn Pro" hub + Share & Earn Pro reward (NEW — decided 2026-07-29; launch-blocking, full build).**
      ✅ CODE 2026-08-06 (both halves, spec below fully built):
      - **(a) Hub:** `src/screens/shared/EarnPro.tsx` with segmented Neu pills `Invite · Share ·
        Redeem` (panes lazy-mounted, kept alive); Invite/Redeem panes carry the old screens' exact
        content (clipboard read fires only on the Redeem tab); old stack screens deleted, legacy
        route names redirect via `initialParams`. One "Earn Pro" row in Personal + Business
        Settings replaces the two old rows (`t.settings.earnPro*`).
      - **(b) Engine:** Share pane (6 platforms, URL + optional proof screenshot → private
        `share-reward-proofs` bucket) → `share-reward-submit` edge function (JWT, age ≥7d,
        year-cap early-out, DB-unique normalized URL = one grant per post globally) → admin
        Rewards tab review queue (`site/admin.html`: pending list, proof lightbox, approve
        1 month / 1 year / Forever, reject) → `admin_review_share_reward` grants via the SAME
        ledger (`grant_premium`, `source='share_reward'`) so RewardModal pops next launch.
        Rules in `src/utils/shareRewardRules.ts` (48-check `test:sharereward`).
      - **Open calls settled:** manual review (reviewer picks tier; likes recorded for audit) ·
        "forever" = 3650d (ledger max; `days<=3700` CHECK kept global) · share year-cap 12/365d
        INDEPENDENT of the referral cap · account-age 7d.
      - **Doc-sync ✅** — subscription docx regenerated with the Earn Pro entry (done in the
        pricing change above).
      - **DEPLOYED 2026-08-06 (`db push` migration `20260806110000` + function
        `share-reward-submit`; admin.html rides Vercel on merge).** Post-deploy smoke: submit
        from a test account → approve month in admin → grant row → RewardModal next launch.
      - Notes for owner: someone must actually review the queue; privacy page may want one line
        re: stored post URL + proof screenshot; "forever" approval reads "3650 days" in the
        reward modal (plain but honest); pull-to-refresh on-hold item is moot (standalone
        InviteFriends screen no longer exists).

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
