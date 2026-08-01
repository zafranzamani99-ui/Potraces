# Native-Requiring Capabilities — Product Analysis & Beta→Launch Roadmap

**Date:** 2026-06-17
**Author:** Product strategy pass (fintech consumer)
**Scope:** Native-OS capabilities that require a fresh dev build (config plugins / entitlements / native modules), batched for the upcoming Potraces build.
**Context:** Potraces is a Malaysian personal-finance app entering serious beta. Live today: Echo AI expense chat + **voice capture**, receipt OCR, multi-wallet, debt tracking, subscription tracker, DuitNow QR, cloud sync, Google/Apple sign-in, premium tiers, beta-feedback/admin.

---

## Why this matters now

The app's *content* features are mature; the gap is **native OS surface area** — the things that build trust, kill capture friction, and convert money. These all need entitlements/native modules baked into a dev build, so they must be **batched**, not shipped one-by-one over-the-air. This doc grounds each in what the strongest finance apps actually ship and ranks them for THIS app.

Key external signals used below:
- Hard paywalls convert ~5x better than freemium (10.7% vs 2.1% download→paid by day 35) with near-identical retention — RevenueCat State of Subscription Apps 2025.
- Apps that send notifications in the first 90 days see up to 3x higher retention; rich/actionable notifications give a ~56% engagement uplift but only ~8% of apps use them.
- Biometric app lock is now standard across YNAB, Monarch, and every major MY e-wallet (TNG uses biometric login + MFA).
- Copilot (the design benchmark for Apple users) leans on widgets, Siri Shortcuts, Apple Watch, and Apple Card/Wallet account tracking.
- Interactive widgets (iOS 17) + App Intents let users log an expense or tap a category *without opening the app* — the exact friction Echo is trying to remove.

---

## Capability-by-capability

Frame: **capability → who ships it → lift it creates → table-stakes vs differentiator (MY) → priority for THIS app.**

### 1. Biometric / app-lock (Face ID, fingerprint, app PIN)
- **Who:** YNAB (Touch/Face ID + Android App Lock), Monarch (reduced over-prompting), every MY e-wallet (TNG biometric + MFA), Copilot.
- **Lift:** **Trust.** A money app with no lock screen reads as a toy. Removes the #1 objection a beta tester voices when they see balances + debts on a borrowed/shared phone.
- **MY context:** **Table-stakes.** Users are trained by TNG/banking apps to expect biometric on anything with money in it.
- **Native need:** `expo-local-authentication` (LAContext / BiometricPrompt) + a lock gate on app foreground. Requires build (native module + Face ID usage string).
- **Priority for Potraces:** **P0 — ship in beta build.** Cheapest credibility win; blocks "is my data safe on my phone" feedback.

### 2. Home-screen widgets (balance, today's spend, budget left, goal/debt progress)
- **Who:** Copilot (native widgets), Budget Flow, Finny, Money Lover.
- **Lift:** **Retention + glanceability.** A widget is a daily free impression; finance apps retain ~10% at 30 days, and a glance surface fights that. Interactive (iOS 17) widgets also double as a capture entry point.
- **MY context:** **Differentiator.** Few MY money apps ship good widgets; pairing "budget left this month" with the CALM aesthetic is a wow moment.
- **Native need:** WidgetKit (iOS) + Glance/App Widget (Android), App Group shared storage to expose data to the widget extension, `@bacons/apple-targets` or a custom config plugin in Expo. Requires build.
- **Priority:** **P1 — beta if time, else first post-beta.** Start read-only (today's spend / budget left); add interactive "+ log" later.

### 3. Siri Shortcuts / App Intents / Google Assistant + home-screen quick actions
- **Who:** Copilot (Siri shortcuts), Finny (App Intent "Tap to Track"), Actual Budget client (App Intents + Summary widget).
- **Lift:** **Capture-friction reduction — the core thesis.** "Hey Siri, log RM10 lunch" or a long-press app-icon "Quick add" routes straight into Echo's existing parse path. This is Potraces' differentiated AI capture, surfaced at zero friction. Also future-proofs for Apple Intelligence.
- **MY context:** **Differentiator** — voice + Manglish parse via Siri/Assistant is genuinely novel locally. Note: a `potraces://add` deep-link + Shortcut was already prototyped (per project memory) but is blocked on Apple Developer enrollment / dev build — this batch unblocks it.
- **Native need:** App Intents (iOS 16+) exposing a `LogExpenseIntent` that calls the same parser Echo uses; Android `App Actions`/shortcuts + home-screen quick actions (`expo-quick-actions`). Requires build.
- **Priority:** **P0/P1 — beta build.** Highest strategic fit: it's the native expression of the app's one true wedge (frictionless AI capture). Ship at minimum the **home-screen long-press quick action** + **Siri shortcut to Echo**.

### 4. Share extension (receipt / payment screenshot → Echo)
- **Who:** Finny (share extension imports email receipts, order confirmations, bank statement screenshots), generic budget apps via share sheet.
- **Lift:** **Capture-friction reduction.** Malaysians live in WhatsApp/banking-app screenshots and TNG/DuitNow receipts. "Share → Potraces" pushes any screenshot into OCR/Echo without re-photographing. Massive synergy with existing OCR.
- **MY context:** **Strong differentiator.** Payment confirmations here are overwhelmingly screenshots; this matches real behavior better than camera-only OCR.
- **Native need:** iOS Share Extension target (own bundle + App Group to hand the image to the main app) + Android `ACTION_SEND` intent filter. Requires build + a config plugin (`@bacons/apple-targets` or custom).
- **Priority:** **P1 — beta build if the OCR/Echo handoff is clean.** Reuses OCR investment; pairs naturally with #3.

### 5. In-app purchase / subscription monetization (StoreKit / Play Billing)
- **Who:** Mandatory for every paid app (YNAB, Copilot, Monarch all bill in-app); RevenueCat is the standard infra layer.
- **Lift:** **Revenue — table-stakes for sustainability.** Premium tiers already exist in the app but cannot be *charged* without native billing. Hard-paywall data (10.7% vs 2.1%) argues for a real paywall, not a soft toggle.
- **MY context:** **Table-stakes**, with a wrinkle: App/Play billing supports MYR and FPX/local cards via the stores, so this is the compliant path (avoids the e-money/payments regulatory line flagged in the legal-risk memo — you're selling software, not moving funds).
- **Native need:** `react-native-purchases` (RevenueCat) or `expo-in-app-purchases` + store product config + entitlement. Requires build.
- **Priority:** **P0 — beta build.** Without it the premium tier is decorative. Wire RevenueCat now so beta can test the purchase flow (sandbox) before launch.

### 6. Push notification actions / rich notifications
- **Who:** Best-practice across fintech (per multiple 2026 guides); rich + actionable = ~56% engagement uplift, used by <8% of apps = whitespace.
- **Lift:** **Re-engagement + capture.** Actionable buttons ("Log this", "Snooze", "Mark paid") on a debt due / subscription renewal / budget-threshold push turn a passive alert into a one-tap action. First-90-day pushes = up to 3x retention.
- **MY context:** **Table-stakes for the alert, differentiator for the action.** The DuitNow soundbox-push pipeline already in the codebase is a natural home for actionable categories.
- **Native need:** iOS Notification Service/Content extension for actions + categories, Android notification actions; push token plumbing already exists for DuitNow. Requires build for the extension/categories.
- **Priority:** **P1 — beta build (basic actions), rich content post-beta.** Start with actionable categories on debt/subscription reminders; defer media-rich layouts.

### 7. Live Activities / Dynamic Island, Apple Wallet passes, NFC — assess
- **Live Activities / Dynamic Island:** Used by budget apps for *trip budget / weekly goal / bill countdown*. **Verdict: niche, post-launch.** Genuine fit only for a bounded, time-boxed event (e.g. a "no-spend week" or trip budget) — not core daily flow. Differentiator if done, but high build cost for narrow use.
- **Apple Wallet passes:** Mainly for loyalty/boarding/tickets. **Verdict: cut/skip for now** — no natural pass object in a personal-finance tracker. (Only revisit if DuitNow QR ever becomes a *storable* merchant standee pass.)
- **NFC:** Finny's "Tap to Track" uses an NFC tag → Shortcut → App Intent to log. **Verdict: gimmick for this app** — clever but a tiny audience; App Intents (#3) already deliver the frictionless-log value without asking users to buy NFC stickers.
- **Priority:** **Later / cut.** See cut recommendation below.

---

## Prioritized roadmap

### Batch into the BETA dev build (must be native, must be now)
| # | Capability | Why in beta | Effort |
|---|-----------|-------------|--------|
| 1 | **Biometric / app-lock** | Trust table-stakes; blocks safety feedback | Low |
| 2 | **IAP / subscription (RevenueCat)** | Premium tier is uncharged without it; test in sandbox during beta | Med |
| 3 | **App Intents + home-screen quick action + Siri shortcut → Echo** | Native expression of the core wedge (frictionless AI capture); unblocks the already-prototyped deep-link | Med |
| 4 | **Share extension (screenshot/receipt → OCR/Echo)** | Matches real MY screenshot behavior; reuses OCR | Med |

> Rationale for batching all four: each needs an entitlement/native target, so they share one EAS dev build cycle. 1 and 2 are non-negotiable for a "serious" money app; 3 and 4 are where Potraces *differentiates* and should not be deferred past beta because they prove the capture thesis to testers.

### First post-beta build (high value, slightly heavier)
| # | Capability | Why later |
|---|-----------|-----------|
| 5 | **Home-screen widgets** (read-only → interactive) | High retention value but needs App Group plumbing + design polish; ship read-only first |
| 6 | **Rich/actionable push** (debt due / sub renewal / budget threshold) | Basic actions can ride the existing DuitNow push token; media-rich layouts later |

### Later / explicitly deprioritized
- **Live Activities / Dynamic Island** — only if a time-boxed budget event ships (trip / no-spend week).
- **Apple Watch complication** — nice glance surface; revisit after widgets prove the glance pattern.

### Cut (not worth it for this app)
- **Apple Wallet passes** — no natural pass object in a personal-finance tracker; effort with no clear lift.
- **NFC "tap to track"** — App Intents already deliver frictionless logging; NFC adds hardware dependency for a tiny audience.

---

## Sources
- [Copilot Money Review 2026 — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/)
- [YNAB vs Monarch vs Copilot 2026 — WalletHub](https://wallethub.com/edu/b/ynab-vs-monarch-vs-copilot-vs-wallethub/150687)
- [How to Enable Biometric / App Lock in YNAB — YNAB Support](https://support.ynab.com/en_us/how-to-enable-and-disable-touch-id-face-id-and-app-lock-SyjrFNtR5)
- [Is Monarch Money Safe? — Wall Street Survivor](https://www.wallstreetsurvivor.com/is-monarch-money-safe/)
- [Touch 'n Go eWallet — Wikipedia (biometric login, MFA, 24M+ users)](https://en.wikipedia.org/wiki/Touch_%27n_Go_eWallet)
- [Best e-Wallets in Malaysia 2026 — Wise](https://wise.com/my/blog/best-e-wallet-malaysia)
- [App Intents for the Apple ecosystem — DEV Community](https://dev.to/arshtechpro/app-intents-for-apple-ecosystem-3nek)
- [Explore new advances in App Intents — WWDC25, Apple Developer](https://developer.apple.com/videos/play/wwdc2025/275/)
- [Best iOS Budget Apps 2026 (widgets, share extension, complications, Live Activities) — Finny](https://getfinny.app/blog/best-ios-budget-apps-2026)
- [Apple Shortcuts for Expense Tracking 2026 — Finny](https://getfinny.app/blog/apple-shortcuts-expense-tracking-automations-2026)
- [State of Subscription Apps 2025 (hard paywall 10.7% vs freemium 2.1%) — RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/)
- [Web vs in-app subscriptions conversion test — RevenueCat](https://www.revenuecat.com/blog/growth/iap-vs-web-purchases-conversion-test/)
- [Fintech Push Notifications Best Practices 2026 — EngageLab](https://www.engagelab.com/blog/fintech-push-notifications-best-practices-use-cases)
- [Push Notifications in Fintech (retention, rich push 56% uplift) — CleverTap](https://clevertap.com/blog/push-notifications-in-fintech/)
- [Dynamic Island: what apps can do with it 2026 — Newly](https://newly.app/guides/dynamic-island)
