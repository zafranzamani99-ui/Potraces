# App Store & Play Store — Submission Compliance Audit

**Date:** 2026-06-17 · **Scope:** what is *not permissible* to publish in Apple App Store / Google Play, with code evidence.
**Method:** 5 parallel auditors (iOS policy · Play policy · account+privacy lifecycle · data-egress+secrets · financial content). Findings deduplicated; severity = worst across stores. Cross-corroborated items noted.

> **VERDICT: NOT submittable as-is.** 6 hard blockers (most found by ≥2 independent auditors). None are deep — all are "remove/disable for v1.0" or "wire one edge function." Estimated path to submittable: ~1 focused day.

## Resolution status — 2026-06-17

**Fixed in code/site this pass** (tsc app-code clean; `expo config` introspect exit 0):
- **B2 account deletion** — new `supabase/functions/delete-account` (deletes all cloud rows + owned storage + the auth user) + `deleteAccountRemote()` + a real "Delete account" action in `AccountScreen` (signed-in) + 7 EN/MS keys. ⚠️ **must `supabase functions deploy delete-account`** for the button to work.
- **B4 exposed key** — removed `EXPO_PUBLIC_GEMINI_API_KEY` from `.env`, README, DEPLOYMENT_CHECKLIST. ⚠️ **rotate the key in Google Cloud** + confirm it's set as the `GEMINI_API_KEY` Supabase secret (it was on disk this session).
- **B5 OCR key** — deleted dead `ocrService.ts` + `RECEIPT_SCANNER_CONFIG`; no client-side Vision key path ships.
- **B6 unused-permission plugins** — removed `expo-calendar` + `expo-tracking-transparency` (plugins, deps, ATT call). Verified absent in introspect.
- **R1+R2 + conflict** — `site/privacy.html` now discloses voice-audio→Gemini + Google/Apple Sign-In; new `site/delete-account.html` web deletion page. **Conflict resolved:** `useVoiceInput.ts` DOES upload raw audio to Gemini (on-device is fallback). ⚠️ **publish site + declare the deletion URL in Play Console.**
- **R4 privacy manifest** — added UserDefaults (CA92.1) + SystemBootTime + DiskSpace required-reason APIs.
- **R5 disclaimer** — "not a bank / not financial advice" line added to Settings → About (EN/MS).

**Deferred by owner:** **B1** (premium/IAP) and **B3** (Tap to Pay entitlement) — to be done before the eventual submission that ships those features.

**Still console-side (can't be done in code):** **R3** — declare Financial Info, Photos, Contacts, audio + the Google AI processor in the Apple Nutrition Label and Play Data Safety form. **A copy-paste-ready answer sheet is prepared in [STORE_DATA_DISCLOSURE.md](STORE_DATA_DISCLOSURE.md)** — just transcribe it into the two consoles. Plus: publish `site/privacy.html` + `site/delete-account.html`, and an EAS rebuild (native config changed) before submission.

---

## 🔴 BLOCKERS — guaranteed rejection / cannot ship

| # | Issue | Store | Evidence | Fix for v1.0 |
|---|---|---|---|---|
| **B1** | **Premium sells digital features with NO StoreKit/Play Billing.** "Subscribe — RM10/mo" button just flips tier locally. RevenueCat (`react-native-purchases`) is installed but **zero usage** in `src/`. *(found by 3 agents)* | Both | `src/store/premiumStore.ts:19-23` (`subscribe → set tier:'premium'`); `src/components/common/PaywallModal.tsx:91-94`; `src/screens/shared/Settings.tsx:1587-1602`. Unlocks AI/wallets/budgets/scans (`constants/premium.ts:16-25`) | **Simplest:** remove all price/"Subscribe" UI, make premium free for v1. **Or:** wire RevenueCat → StoreKit/Play Billing so tier only flips on a confirmed store purchase. |
| **B2** | **No real account deletion.** "Delete Account" only calls `clearPersonalData()`; the Supabase **auth user, session, and business data are left intact** (per the inline comment). The only `auth.admin.deleteUser` is gated to business mode. Personal users can never delete their account. *(found by 3 agents)* | Both (Apple 5.1.1(v) + Play) | `src/screens/shared/Settings.tsx:763-803`; `src/store/settingsStore.ts:278-282` ("auth user are left intact"); `src/services/supabase.ts:108-128`; real deletion only at `supabase/functions/clear-business-data/index.ts:69` | Add a personal-mode edge function (mirror `clear-business-data`) that purges `personal_*` rows + receipt storage **and** calls `auth.admin.deleteUser(userId)`, then `authStore.reset()`. Surface in AccountScreen when signed in. |
| **B3** | **Tap to Pay entitlement ships unconditionally.** `com.apple.developer.proximity-reader.payment.acceptance:true` is hard-coded, but the feature is flag-gated OFF. This entitlement requires explicit Apple grant + an **Organization** (not Individual) account; `chargeCard` does real card acquiring. *(agents 1 + 5)* | iOS | `app.json:42` (entitlement) + `app.json:126` (Stripe plugin); feature off by default `src/services/tapToPay.ts:29`; real charge path `tapToPay.ts:195-251` | Remove the `proximity-reader` entitlement **and** the `@stripe/stripe-terminal-react-native` plugin from `app.json` for v1.0 (code already no-ops when flag is off). Re-add only after Apple grants the entitlement. |
| **B4** | **Live Gemini API key sits on disk in `.env` with `EXPO_PUBLIC_` prefix** → any value present at build time is bundled into the client JS. (Not git-tracked — good — but a real key is present.) | Security blocker | `.env:1` `EXPO_PUBLIC_GEMINI_API_KEY=<live value>`; no `src/` code reads it (Gemini is fully proxied). Also referenced in `README:944`, `DEPLOYMENT_CHECKLIST.md:11` | **Rotate the key**, delete the `EXPO_PUBLIC_GEMINI_API_KEY` line, keep it only as a Supabase secret. It is dead in code, so removal is safe. |
| **B5** | **Google Vision OCR key is client-side and called device→Google directly.** `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` is extractable from the IPA/APK → anyone can bill your quota. (Currently unset so OCR is inert, but the code path ships.) | Security / both | `src/services/ocrService.ts:4,21` (`fetch(\`${URL}?key=${API_KEY}\`)`); `src/constants/index.ts:410` | Route OCR through the existing `ai-proxy`/an edge function; never ship the Vision key client-side. |
| **B6** | **Declared permissions with NO feature.** (a) `expo-calendar` (READ/WRITE_CALENDAR + `NSCalendarsUsageDescription`) — calendar APIs unused. (b) `expo-tracking-transparency` pulls `AD_ID` + prompts ATT — **no tracking SDK is even initialized** (Sentry installed but never `init()`'d). *(agents 1 + 2)* | Both (Apple 5.1.1/2.5.1; Play AD_ID + Data Safety) | calendar: `app.json:183-188`, no usage in `src/`. ATT/AD_ID: `app.json:117`, ATT call `App.tsx:182-191`, no tracker; Sentry only a comment at `ErrorBoundary.tsx:43` | Remove `expo-calendar` and `expo-tracking-transparency` plugins (+ deps) for v1.0. Calendar feature and tracking don't exist yet; pre-declaring them = rejection. |

---

## 🟡 RISKS — likely flagged in review; fix in the same pass

| # | Issue | Store | Evidence | Fix |
|---|---|---|---|---|
| **R1** | **No public web account-deletion URL.** Play's Data Safety form requires a reachable URL (works even after uninstall). Only an in-app instruction + generic `mailto` exist. *(agents 2 + 3)* | Play | `site/privacy.html:86,100`; no `delete-account.html` | Publish a deletion-request page on jejakbaki.my; declare it in the Data Safety form. |
| **R2** | **Privacy policy materially incomplete.** Missing: (a) **voice/microphone audio path**, (b) **Google/Apple Sign-In** as identity providers. ⚠️ **CONFLICT TO RESOLVE:** one auditor says raw audio is uploaded to Gemini (`useVoiceInput.ts:280-291`); another says only transcribed text leaves the device. The known hybrid architecture uploads the recording to Gemini (on-device is fallback) → **assume audio egresses until you confirm in `useVoiceInput.ts`.** This changes the disclosure. | Both | `site/privacy.html` §6 ("text or image" only), §3 (provider list omits Google/Apple); `useVoiceInput.ts` stopAndTranscribe Gemini pass | Confirm the audio path, then add voice/mic→Gemini + Google/Apple Sign-In to the policy and align Apple Nutrition Label + Play Data Safety. |
| **R3** | **Privacy labels under-declare collection.** Financial info, photos (receipts), and contacts all reach Gemini/Supabase + a 3rd-party AI processor — easy to under-declare. | Both | `moneyChat.ts:870,884-887` (financial context + receipt image → Gemini); `supabase.ts:150-168` (customer phone/address) | Declare Financial Info, Photos, Contacts as collected + shared-with-processor (Google) in both consoles. |
| **R4** | **Incomplete iOS privacy manifest.** Only `FileTimestamp` declared; AsyncStorage (used app-wide) is NSUserDefaults-backed and needs `NSPrivacyAccessedAPICategoryUserDefaults` (CA92.1); SDK 54 deps often also need SystemBootTime / DiskSpace. Triggers ITMS upload warnings/rejection. | iOS | `app.json:31-39`; AsyncStorage across `authStore`/`appStore`/`aiInsightsStore` | Add UserDefaults (CA92.1) to `privacyManifests`; add BootTime/DiskSpace if flagged at upload. |
| **R5** | **No user-facing "not a bank / not financial advice" disclaimer.** Advice guardrail exists only inside AI prompts; nothing on-screen. Echo answers "what can I afford" + shows portfolio return %. | Both (+ MY legal) | `aiService.ts:57-60` `ADVICE_GUARD` (prompt-only); zero on-screen disclaimer in `src/`; `moneyChat.ts:219,700-722` | Add a one-line bilingual disclaimer in onboarding/About + near Echo: "Potraces tracks your money — it doesn't hold or move it, and gives general info, not financial advice." |
| **R6** | **If a paid tier ships:** no Restore Purchases, no auto-renew/terms disclosure, no Terms/Privacy link beside purchase (Apple 3.1.2 / Play). *(Moot if B1 is fixed by removing the paid tier.)* | Both | `PaywallModal.tsx:157-162`; i18n has only `subscribeButton` (`en.ts:301-302`) | Only relevant if you keep IAP — then add restore + terms + period disclosure. |
| **R7** | **PII scrubbing gap:** `pii.ts` masks card PAN + IC in *text/OCR* only — NOT the base64 **receipt image** (may show card/IC/name) nor financial figures sent to Gemini. | Both (disclosure) | `pii.ts`; applied at `moneyChat.ts:878,883`, `ocrService.ts:45`; image sent raw | Acceptable if disclosed; consider on-device redaction or explicit consent before image upload. |

---

## 🟢 CLEAN / confirmed compliant (no action)

- **Sign in with Apple** correctly paired with Google on iOS (Guideline 4.8 satisfied) — `AuthScreen.tsx:346-385`, `AccountScreen.tsx:299-342`.
- **DuitNow QR is display-only** (re-encodes the seller's own static EMVCo QR; buyer settles in their bank app; PSP path dormant, default `'none'`) and **debt/installments are peer tracking only** (no APR, no lending). No money-movement licensing triggered — `emvQr.ts:1-26`, `qrProvider.ts:33-44`, `DebtTracking.tsx`.
- **Secrets posture (besides B4/B5):** Gemini/Anthropic correctly proxied; only the Supabase **anon** key is client-side (correct); **no service-role key** anywhere; Stripe/PSP secrets server-side.
- **Encryption flag** `ITSAppUsesNonExemptEncryption:false` is the correct standard exemption (HTTPS + expo-crypto + secure-store only).
- **targetSdk 35** (Expo SDK 54 default) meets Play's new-app requirement; **expo-updates OTA** is JS-only with `appVersion` runtime policy (permitted).
- **Core permissions justified:** camera/photos (ReceiptScanner), mic + speech (useVoiceInput), contacts (ContactPicker for splits), FaceID/secure-store, notifications.
- **Data export** present (`storageBackup.ts`); **children**: policy states not directed at under-13.
- **Sentry** installed but never initialized → no telemetry egress today (drop the unused dep, or wire it later **with** `beforeSend` PII scrubbing).

---

## Pre-submission fix order (shortest path to submittable)

1. **B1** — remove paywall price/"Subscribe" UI; make premium free for v1 (fastest) — JS, OTA-able.
2. **B6 + B3** — delete `expo-calendar`, `expo-tracking-transparency`, the `proximity-reader` entitlement, and the Stripe Terminal plugin from `app.json`; remove ATT call. **Requires a rebuild** (native config) — do this before cutting the submission build.
3. **B4 + B5** — rotate Gemini key, strip `EXPO_PUBLIC_GEMINI_API_KEY` from `.env`/docs; move Vision OCR server-side.
4. **B2 + R1** — add personal-mode account-deletion edge function + in-app button; publish web deletion page.
5. **R2–R5** — update privacy policy (confirm the audio path first), fill the iOS privacy manifest, declare all data categories in both consoles, add the on-screen "not a bank / not advice" disclaimer.

*Note:* items touching `app.json`/native config (step 2) gate the next EAS build; everything else is JS/server and can ride OTA or backend deploys.
