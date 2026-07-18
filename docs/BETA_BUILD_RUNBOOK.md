# Potraces — Beta Build & Distribution Runbook

_How to turn the committed source into installable apps and shareable links for beta testers.
Written 2026-07-19. App identity: owner `zafranzamani`, EAS projectId `48e7d14d-4320-467b-a02a-72d41a4d33d9`, slug `potraces`, bundle/package `com.potraces.app`, version `1.0.0`._

> **Reality check:** pushing to GitHub does not create an app. You must **build** the binaries with EAS and (for iOS) **upload** to TestFlight. These steps need YOUR Expo + Apple/Google logins and 2FA — they can't be automated from a code assistant.

---

## 0. Prerequisites (one-time)

| Need | For | How |
|---|---|---|
| Expo account (`zafranzamani`) | both | already the project owner |
| `eas-cli` | both | `npm i -g eas-cli` then `eas login` |
| Apple Developer Program ($99/yr) | iOS/TestFlight | you have this ✅ |
| Google Play Console ($25 one-time) | Android *Play track only* | **not needed** for the APK-link path below |

Sanity-check the project is linked:
```bash
eas whoami          # → zafranzamani
eas build:configure # only if it complains config is missing (it isn't — eas.json is set)
```

---

## 1. 🤖 Android — the "share with everyone" link (easiest, do this first)

The `preview` profile builds a standalone **APK**. No Play account, no review, no per-tester setup.

```bash
eas build --platform android --profile preview
```
- Runs on EAS cloud (~10–20 min). EAS auto-generates a keystore the first time (say **yes** to "generate a new keystore").
- When done you get a URL like `https://expo.dev/artifacts/eas/…​.apk` **and** a build page at `https://expo.dev/accounts/zafranzamani/projects/potraces/builds/<id>`.
- **Share the build-page link** with anyone. On an Android phone: open it → Download → Install (they may need to allow "install unknown apps" once).

That link IS your Android beta. Re-run the command for a new build; send the new link.

---

## 2. 🍎 iOS — TestFlight (iOS can't sideload; TestFlight is the only way)

### 2a. First-time Apple setup (once)
1. In **App Store Connect** → **Apps** → **＋** → create the app record for `com.potraces.app` (name, primary language, SKU). You can also let `eas submit` create it for you the first time.
2. Make sure your Apple ID has **Admin/App Manager** role in App Store Connect.

### 2b. Build (uses the new `testflight` profile — store distribution + auto-incrementing build number)
```bash
eas build --platform ios --profile testflight
```
- EAS manages signing: say **yes** to let it create the Distribution certificate + provisioning profile (log in with your Apple ID + 2FA when prompted).
- `autoIncrement` + `appVersionSource: "remote"` (set in `eas.json`) means EAS owns the build number and bumps it every build — so you never hit TestFlight's "this build number already exists" rejection. Marketing version (`1.0.0`) still comes from `app.json`.

### 2c. Submit to TestFlight
```bash
eas submit --platform ios --profile testflight
```
- Prompts for your Apple ID the first time and **caches** credentials. Pick the build you just made (or it takes the latest).
- Processing in App Store Connect takes ~5–15 min after upload.

### 2d. Invite testers
In **App Store Connect → TestFlight**:
- **Internal testers** (≤100, must be on your team): add by email → **available immediately, NO review.** Best for you + close testers to smoke-test.
- **External testers / public link** ("share with everyone", ≤10,000):
  1. Create an external group, add the build.
  2. Submit for **Beta App Review** (first build only; ~24h, lighter than App Store review).
  3. Once approved, enable **Public Link** → share that URL with anyone. They install the **TestFlight app**, open your link, install Potraces.

---

## 3. Versioning — already handled, don't hand-edit
`eas.json` sets `cli.appVersionSource = "remote"` and `autoIncrement: true` on `testflight` + `production`. EAS stores and increments the iOS **build number** and Android **versionCode** remotely.
- Bump the **marketing version** (`expo.version` in `app.json`, e.g. `1.0.1`) only for a user-visible release; the build number takes care of itself.
- `ITSAppUsesNonExemptEncryption = false` is already set → no export-compliance prompt stalls the build.

---

## 4. Before you widen distribution — read this
- **Smoke-test on your own phone FIRST.** Nothing has run on a device this cycle (only typecheck + tests). Install the first build yourself, walk the money flows (add/edit txn, wallets, the Reports "the math" sheet, Echo answers, the paywall gates in light **and** dark), then hand out the link. A launch crash hits *all* testers at once otherwise.
- **The paywall is a LOCAL unlock** — RevenueCat billing is dormant (`EXPO_PUBLIC_RC_*` keys unset). Tapping "Continue" grants the tier for free; no one is charged. Fine for a functional beta — just know it isn't real billing yet. Wiring RevenueCat (keys + 5 products + entitlements) is the next milestone.
- **Cloud backup / multi-device sync ships OFF** (`personalSyncEnabled` default false) and its DB migrations are **not applied**. Do NOT apply migrations for the beta — if a tester enables backup, the schema preflight auto-disables it (safe). Apply migrations on a **staging** Supabase project first, only when you turn cloud backup on for real:
  ```bash
  brew install supabase/tap/supabase
  supabase migration list      # shows the 2 newest unapplied: receipt_soft_delete_and_image, personal_notes
  supabase db push             # ⚠️ point at STAGING first, never prod on the first run
  ```

---

## 4b. Known gaps / footguns for this build
- **⚠️ Do NOT run `expo prebuild`.** `ios/`/`android/` are hand-ported and committed; regenerating would inject the Tap-to-Pay entitlement (`com.apple.developer.proximity-reader.payment.acceptance` — needs Apple approval → **signing failure**) and disturb the hand-edited plist. Patch native files directly if you must.
- **Share-into-Potraces extension is absent in this build.** It's declared in `app.json` but not wired into the committed Xcode project/Podfile, so it won't compile into the `.ipa`. Fine for the beta (the app still builds); wire the target in later if you want that feature. (Bonus: with no second bundle, you avoid the classic app-extension version-mismatch rejection.)
- **Universal links (`applinks:jejakbaki.my`) won't resolve** — the associated-domains entitlement is missing from the committed native entitlements. Non-blocking; add it (with the App ID capability + AASA file on your domain) before relying on universal links.

## 5. Pushing an OTA update to an existing beta (optional)
For JS-only changes (no native change), you can update installed builds without a rebuild:
```bash
eas update --branch testflight --message "fix: …"   # matches the testflight build channel
```
Native changes (new permission, new native module, version bump) always need a fresh `eas build`.

---

## Quick reference
| Goal | Command |
|---|---|
| Android APK link (everyone) | `eas build -p android --profile preview` |
| iOS TestFlight build | `eas build -p ios --profile testflight` |
| Upload to TestFlight | `eas submit -p ios --profile testflight` |
| OTA JS update to beta | `eas update --branch testflight -m "…"` |
| Local dev client | `eas build --profile development` |
