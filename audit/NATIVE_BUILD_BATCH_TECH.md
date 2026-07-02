# Native Build Batch — Build-Gated vs OTA Decision Table

**Context:** Expo SDK 54 / RN 0.81, managed workflow (CNG), EAS Build + EAS Update OTA.
**Goal:** batch every capability that REQUIRES a native rebuild into ONE dev build.
**Date:** 2026-06-17. Sources cited at the bottom of each item and in References.

---

## TL;DR rule

- **Rebuild required** when you change `app.json` `plugins` / `ios` / `android` / `permissions` / `entitlements` / `infoPlist` / `AndroidManifest` / icons / `expo-build-properties`, OR add/upgrade ANY package that ships native code (a config plugin, native module, or new Pod/Gradle dep).
- **OTA-updatable (NO rebuild)** when the change is pure JS/TS and uses only modules already in the installed native binary.

> Mechanical check: if `npx expo prebuild` would produce a different `ios/`/`android/` directory, you need a build. If not, ship it via `eas update`.

---

## Already in the binary (do NOT re-add — confirm config only)

These native modules are ALREADY installed/configured in `app.json` + `package.json`, so capabilities built on them are **OTA from here**:

- `expo-local-authentication` ~17.0.8 — **biometric gate already shippable**. (Biometric app-lock is JS wiring on top of an installed module → OTA, unless you add `NSFaceIDUsageDescription`, which it needs for Face ID copy — see SecureStore note.)
- `expo-notifications` ~0.32.16 (+ plugin, `aps-environment: production`) — push already native.
- `expo-store-review` ~9.0.9 — in-app rating prompt, OTA-ready.
- `expo-camera`, `expo-image-picker`, `expo-contacts`, `expo-audio`, `expo-speech-recognition`, `expo-document-scanner`, `expo-tracking-transparency`, `expo-apple-authentication`, `@react-native-google-signin`, `@stripe/stripe-terminal-react-native` — all native, already in the build.

**Implication:** the only "biometric app-lock" build risk is the missing `NSFaceIDUsageDescription` Face ID string. `expo-local-authentication` already requests it via its own plugin in recent versions, but verify the prebuilt Info.plist contains it; if you add `expo-secure-store` (below) its plugin also injects it.

---

## BUILD-GATED capabilities (MUST be in the build) — full table

| # | Capability | Package / plugin | SDK 54 compat | Native config it adds | Effort | Store/policy risk |
|---|---|---|---|---|---|---|
| 1 | Crash/error/perf monitoring | `@sentry/react-native` (config plugin `@sentry/react-native/expo`) | ✅ Confirmed (ships `app.plugin.js`; works on SDK 54; SDK 56 is the one being newly tested) | iOS: dSYM upload build phase, Sentry pods. Android: Sentry Gradle plugin. Hermes symbolication. EAS env `SENTRY_AUTH_TOKEN`. | **S–M** | Low. Must disclose crash/diagnostic data in Play Data Safety + Apple Privacy Nutrition Label. PII scrubbing required for a finance app. |
| 2 | In-app purchases / subscriptions | `react-native-purchases` (RevenueCat) + `react-native-purchases-ui` | ✅ Works in Expo dev/CNG builds via config plugin (min RN 0.73; SDK 54 fine). NOT in Expo Go (mock mode only). | iOS: StoreKit, `In-App Purchase` capability. Android: `com.android.vending.BILLING` permission, Billing Library. | **M** | **High friction.** Apple: digital goods MUST use IAP (Guideline 3.1.1). Requires paid Apple Developer + App Store Connect products + Play Console products + RevenueCat dashboard. Review-gated. |
| 3 | Home-screen / long-press quick actions ("log expense") | `expo-quick-actions` (v6.0.0) | ✅ v6.0.0 pinned to SDK 54 | iOS: `UIApplicationShortcutItems` in Info.plist (max 4). Android: dynamic shortcuts (App Shortcuts). | **S** | Low. iOS shortcuts are app entry points only (cannot pin to home screen); Android can pin. |
| 4 | iOS App Intents / Siri + Apple Intelligence ("hey Siri, log expense") | Custom Swift App Intents via `@bacons/apple-targets` extension OR `@config-plugins/react-native-siri-shortcut` | ⚠️ NO first-party Expo support. `@bacons/apple-targets` requires SDK ≥53, Xcode 16, CocoaPods 1.16.2 — works on 54 but is **advanced/native Swift**. | iOS: AppIntents extension target, App Group (shared UserDefaults to pass data to/from JS), `NSUserActivityTypes`. | **L** | Medium. Native Swift you maintain by hand; brittle across Xcode/SDK bumps. Highest-effort item — only batch now if Siri is a near-term priority. |
| 5 | Home-screen widgets (iOS WidgetKit / Android) — glanceable balance/spend | `@bacons/apple-targets` (iOS WidgetKit) + native Android Glance/RemoteViews | ⚠️ iOS via `@bacons/apple-targets` (SDK ≥53, Xcode 16, Pods 1.16.2). Android has no first-party Expo widget API — custom native. | iOS: Widget extension target + App Group to share data. Android: `AppWidgetProvider` + manifest receiver + XML. | **L** | Medium. Two separate native implementations; App Group plumbing; data must be written to shared storage from JS. Don't batch unless widgets are committed. |
| 6 | Share extension ("Share receipt/screenshot to Potraces") | iOS: `expo-share-extension` (v5.0.0+). Android: `android.intentFilters` SEND with mimeTypes | ✅ `expo-share-extension` 5.0.0+ supports SDK 54 (requires wrapping `metro.config.js` with `withShareExtension`) | iOS: Share Extension target, App Group, `NSExtensionActivationRule` (images/text/url). Android: `<intent-filter>` `action.SEND` + `image/*` in manifest. | **M** | Low–Medium. High UX value for receipt capture. iOS extension is a separate target/bundle. |
| 7 | Universal Links (iOS) + Android App Links — open app from jejakbaki.my / shop / payment links | None — pure `app.json` config | ✅ Built-in to Expo config | iOS: `ios.associatedDomains` = `["applinks:jejakbaki.my", ...]` (Associated Domains entitlement) + host `apple-app-site-association` (AASA) file. Android: `android.intentFilters` with `autoVerify: true` + host `assetlinks.json`. | **S** (app) + **S** (host files) | Low. Requires serving AASA + assetlinks.json on jejakbaki.my (already on Vercel). No package, but **rebuild required** because it touches `ios`/`android`. |
| 8 | Sensitive-token storage (Keychain/Keystore) | `expo-secure-store` (~SDK 54) | ✅ SDK 54 | iOS: Keychain (`kSecClassGenericPassword`); plugin injects `NSFaceIDUsageDescription` (`faceIDPermission`). Optional `keychainAccessGroup`. `requireAuthentication` gates reads behind biometrics. | **S** | Low. Best practice for a finance app (Supabase tokens, future payment creds). Currently NOT installed. |
| 9 | Block screenshots of sensitive screens | `expo-screen-capture` (SDK 54) | ✅ SDK 54 | Android: `FLAG_SECURE` at runtime (no manifest change for prevention); screenshot/recording **detection** needs `android.permission.DETECT_SCREEN_CAPTURE` (Android 14+). iOS: detect only, no block. | **S** | Low. Strong fit for balance/QR screens. Note: prevention API is partly runtime; the DETECT permission is the build-gated part. |
| 10 | Bill / subscription due dates → device calendar | `expo-calendar` (SDK 54) | ✅ SDK 54 | iOS: `NSCalendarsUsageDescription` (+ `NSRemindersUsageDescription` if reminders). Android: `READ_CALENDAR` / `WRITE_CALENDAR`. | **S** | Low. Permission prompts only. |
| 11 | Recurring background processing / reminders | `expo-background-task` (SDK 54; **replaces deprecated `expo-background-fetch`**) + `expo-task-manager` | ✅ SDK 54 (the modern replacement; background-fetch is deprecated and being removed) | iOS: `UIBackgroundModes` (`processing`) + `BGTaskSchedulerPermittedIdentifiers`. Android: WorkManager. | **S–M** | Low. iOS background scheduling is best-effort (OS decides timing) — set expectations. |

---

## Per-item build notes (the load-bearing details)

**1. Sentry** — Use the modern `@sentry/react-native` path; `sentry-expo` was deprecated at SDK 50. The plugin wires dSYM/Hermes symbolication into the native build, so it MUST be in the build; DSN/release can change OTA. Scrub PII (amounts, phone, contacts) before send — finance app.

**2. RevenueCat** — Mocks in Expo Go, so it LOOKS like it works without a build; it does not — needs the dev build. This is the single most review-friction item (Apple 3.1.1 forces IAP for digital tiers; you also need products configured in both stores). Batch the native module now; the paywall UI is OTA afterward.

**4 & 5 (App Intents + Widgets)** — Both ride `@bacons/apple-targets`, which adds Apple extension targets + App Groups. These are the heaviest, most fragile items (hand-maintained Swift, Xcode-version-sensitive). RECOMMENDATION: only batch into THIS build if Siri/widgets are a committed near-term feature; otherwise they bloat review surface and risk. They cannot be added later via OTA, but a single later build can add them once the JS feature is designed.

**7. Universal/App Links** — Zero new packages, but it is build-gated because `associatedDomains`/`intentFilters` are baked into the native project. Pair with hosting AASA (no `.json` extension, `application/json`, no redirects) + `/.well-known/assetlinks.json` on jejakbaki.my.

**8. SecureStore** — Adding it also guarantees `NSFaceIDUsageDescription` is present, which the biometric app-lock (already-installed `expo-local-authentication`) needs for Face ID. Cheap, high-value, finance-appropriate.

---

## OTA-updatable (do NOT spend the build on these)

All pure-JS work shippable via `eas update` with NO rebuild, because it uses already-installed native modules:

- New screens / flows / navigation routes (React Navigation already native).
- Echo prompt/logic, AI service changes, parsing/Manglish logic.
- i18n strings (`en.ts`/`ms.ts`), copy, microcopy.
- Almost all UI: components, styles, dark mode, palette tokens, animations (Reanimated/worklets already native), haptics (`expo-haptics` installed).
- Business logic, Zustand stores, reconciliation rules, money math, validation.
- Biometric app-lock LOGIC, store-review prompt timing, notification scheduling content — all on installed modules.
- Charts, QR rendering, view-shot/export, clipboard, sharing (`expo-sharing`), print — installed.

> Caveat: bumping `runtimeVersion` (currently `policy: appVersion`) cuts off old binaries from new OTA payloads. Keep `appVersion` stable while OTA-ing, bump it with each native build.

---

## POLICY LANDMINES — flag, do NOT recommend blindly

**Android SMS reading (`READ_SMS`/`RECEIVE_SMS`) for transaction auto-capture — AVOID.**
- Google Play treats SMS/Call-Log as the **SMS/Call Log permission group**: an app may declare it ONLY if it is the user-selected **default SMS/Phone/Assistant handler** AND it is core functionality. A budgeting app is not a default handler → **declaration is disallowed → guaranteed rejection / removal**.
- Play's personal-loans / financial-app rules explicitly bar budgeting apps from accessing or exfiltrating SMS history (anti-spyware). The May 2025 personal-loan policy tightened this.
- **Malaysia regulatory overlay:** reading bank SMS = processing financial + personal data → PDPA 2024 exposure; auto-capture of transactions is a regulated Open-Finance capability (see `memory/auto-capture-strategy.md`: MY Open Finance ~2027), not an app permission to grab. Do NOT ship.

**`NotificationListenerService` for reading bank notifications — AVOID.**
- Not available in managed Expo (needs a custom native service + `BIND_NOTIFICATION_LISTENER_SERVICE`). Play classifies notification-content access as sensitive; reading financial notifications triggers the same spyware/Data-Safety scrutiny and is regulatory-sensitive in MY. Same verdict: do not recommend.

> Sanctioned alternative already in the roadmap: App Intent / quick-add (`expo-quick-actions`) + email parsing. Build those instead.

---

## References

- Sentry + Expo: https://docs.expo.dev/guides/using-sentry/ ; plugin clarification https://github.com/getsentry/sentry-react-native/issues/5859
- RevenueCat Expo: https://www.revenuecat.com/docs/getting-started/installation/expo ; https://github.com/RevenueCat/react-native-purchases ; Expo IAP guide https://docs.expo.dev/guides/in-app-purchases/
- expo-quick-actions: https://github.com/EvanBacon/expo-quick-actions
- @bacons/apple-targets (widgets/App Intents): https://github.com/EvanBacon/expo-apple-targets ; https://www.npmjs.com/package/@bacons/apple-targets
- App Intents/Siri in Expo: https://dev.to/cross19xx/ios-app-intents-in-an-expo-app-38od ; https://www.npmjs.com/package/@config-plugins/react-native-siri-shortcut
- expo-share-extension: https://github.com/MaxAst/expo-share-extension
- Universal Links / App Links: https://docs.expo.dev/linking/ios-universal-links/ ; https://docs.expo.dev/linking/android-app-links/ ; https://docs.expo.dev/linking/overview/
- expo-secure-store (SDK 54): https://docs.expo.dev/versions/latest/sdk/securestore/
- expo-screen-capture: https://docs.expo.dev/versions/latest/sdk/screen-capture/
- expo-calendar: https://docs.expo.dev/versions/latest/sdk/calendar/
- expo-background-task (replaces background-fetch): https://expo.dev/blog/goodbye-background-fetch-hello-expo-background-task ; SDK 54 changelog https://expo.dev/changelog/sdk-54
- Google Play SMS/Call-Log policy: https://support.google.com/googleplay/android-developer/answer/10208820 ; sensitive permissions https://support.google.com/googleplay/android-developer/answer/16558241
- Apple IAP (Guideline 3.1.1): https://developer.apple.com/app-store/review/guidelines/#in-app-purchase
- Expo SDK 54 changelog: https://expo.dev/changelog/sdk-54
- MY regulatory context: repo `memory/auto-capture-strategy.md`, `docs/research/legal-regulatory-risk-malaysia.md`

---

## BUILD STATUS — 2026-06-17 (all 4 bundles wired into the build)

User chose ALL FOUR bundles. Native layer wired + validated via `expo config --type introspect` (all plugins resolve, share-extension target generated, entitlements/permissions present) and `tsc --noEmit` clean. **NOT EAS-built yet** — Pods/Gradle compile + the share-extension JS bundle are only proven by the actual dev build.

Installed: `expo-secure-store@15.0.8`, `expo-screen-capture@8.0.9`, `@sentry/react-native@7.2.0`, `expo-quick-actions@6.0.2`, `expo-share-extension@5.0.6`, `react-native-purchases@10.3.0` + `-ui`.

app.json: iOS `associatedDomains` (jejakbaki.my, www) + Android `intentFilters` (autoVerify) → deep-link reach; `NSFaceIDUsageDescription` via secure-store plugin; share-extension plugin (image/file/text/url activation rules, excludes dev-client+splash); `privacyManifests` file-timestamp reason for image sharing. RevenueCat autolinks (no plugin; Play BILLING merges at build).

Entry-point change (required by expo-share-extension): `package.json main` → `index.js`; new `index.js` (`registerRootComponent(App)`), `index.share.js` (registers `shareExtension`), `ShareExtension.tsx` (thin: forwards shared content to the main app via `potraces://share?payload=…`, then closes), `metro.config.js` (`withShareExtension`).

### Follow-ups (mostly OTA / external — do NOT need another build)
- **Sentry**: set `EXPO_PUBLIC_SENTRY_DSN` + add `Sentry.init` in the app entry (JS/OTA); scrub PII before send.
- **RevenueCat**: create RC project + store products in App Store Connect / Play Console; `Purchases.configure` + paywall UI (JS/OTA).
- **Universal/App Links**: host `apple-app-site-association` (no extension, `application/json`, no redirect) + `/.well-known/assetlinks.json` on jejakbaki.my; add the `potraces://share` + applinks route handlers (JS/OTA).
- **Quick actions**: `QuickActions.setItems([...])` at runtime (JS/OTA).
- **Biometric lock UX**, **screen-capture** `preventScreenCaptureAsync` on balance/QR screens (JS/OTA).
- **Share extension is the exception**: its bundle is NOT OTA-updatable — changes to `ShareExtension.tsx` require a rebuild. Verify it on the first EAS build.

### Addendum — future-proofing insurance (2026-06-17)

Principle applied: pre-bake **permission-free native modules** (zero cost to carry dormant, available to future JS with no rebuild); do NOT pre-declare **unused permissions/capabilities** (App/Play review reject "why do you need this?" + privacy/Data-Safety smell) — those earn their own rebuild when the feature is real.

- **Added** `expo-calendar` (goal deadlines / bill reminders → device calendar; `NSCalendarsUsageDescription` + READ/WRITE_CALENDAR, validated via introspect).
- **Added permission-free insurance**: `expo-localization` (currency/region), `expo-network` (online/offline for sync+collab), `expo-application` (version/force-update; matches beta `app_version`), `expo-web-browser` (OAuth/in-app links), `expo-linking` (deep-link parse for invites/share), `expo-mail-composer` (email invites/support).
- **Already present** (free, no rebuild): `expo-device`, `expo-crypto`, `expo-haptics`, `expo-clipboard`, `expo-updates`.
- **Deliberately NOT pre-added** (let them rebuild when real): `expo-location` (heavy permission), NFC, `expo-background-task` (declares scrutinized `UIBackgroundModes`), home-screen widgets / App Intents (`@bacons/apple-targets` — heavy hand-Swift + own App Group), sensors/health.
- **Shared/collaborative finance** (future): confirmed needs NOTHING beyond the above — its whole core is Supabase + JS (OTA). See `audit/SHARED_FINANCE_PLAN.md`.
