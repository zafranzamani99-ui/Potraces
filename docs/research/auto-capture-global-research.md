# Auto-Capturing Transactions: Global Research & Strategy for Potraces

_Researched June 2026. Question: "Why can other apps auto-detect transactions, and what should Potraces do?"_

## TL;DR

The mature world does NOT scrape notifications. Serious personal-finance apps (Monarch, Copilot,
Emma, Rocket Money, Cleo) auto-capture via **regulated open-banking APIs** through aggregators
(Plaid, MX, Finicity, TrueLayer, Tink, Finverse, Brankas). The bank hands over data with user
consent — legal, durable, identical on iOS and Android.

**Notification/SMS scraping is a developing-market workaround** used precisely where open banking
didn't exist yet (India's Walnut, SEA trackers). It is Android-only, fragile, and a dead-end.

**Malaysia's open-finance rails are real but ~2027.** BNM published the Open Finance Exposure Draft
on 18 Nov 2025; PayNet is building the platform; production starts Jan 2027 for big banks. So Malaysian
apps resort to SMS scraping / manual entry today **because the rails aren't built yet** — not because
they're clever.

---

## 1. The five mechanisms, ranked by durability

| # | Method | Platforms | Coverage | Durability | Notes |
|---|--------|-----------|----------|------------|-------|
| 1 | **Open-banking API aggregation** | iOS = Android | All connected banks | ★★★★★ | The real answer. Needs aggregator + often licensing. |
| 2 | **Email / Gmail parsing (AI)** | iOS + Android | Banks/e-wallets that email alerts + e-receipts | ★★★★ | Cross-platform, no bank deal, buildable now. |
| 3 | **iOS Shortcuts automations** | iOS only | Apple Pay txns + SMS keyword | ★★ | User wires it up; partial coverage. |
| 4 | **Android NotificationListener / READ_SMS** | Android only | Whatever pushes a notification/SMS | ★★ | Fragile per-bank regex; scary permission. |
| 5 | **Manual + AI receipt scan** | iOS + Android | Anything photographed | ★★★ | What Potraces has today. |

### Why iOS "can't" but Android "can" (the sandbox)
iOS forbids any app from reading another app's notifications or SMS — no `NotificationListenerService`
equivalent, no `READ_SMS`. This is unchanged in 2026. That's why **Walnut stays Android-only**. Apps
that appear to auto-capture on iOS actually use **Shortcuts Automations**: the iOS 17+ **Apple Pay
"Transaction" trigger** (fires on Tap-to-Pay, passes merchant/amount/card) or a **Message keyword
automation**, both of which the *user* sets up and which then call the app's **App Intent**. The app
never reads anything itself.

The EU's Digital Markets Act is starting to crack this open — iOS 26.3 (Dec 2025) added third-party
notification *forwarding* for wearables — but it's EU-only and not general cross-app reading. Don't
build on it.

---

## 2. Global regulatory landscape (the "far" research)

The whole world is converging on **mandated, consent-based, API open banking**. Where it's live, apps
auto-capture cleanly. Where it isn't, they hack.

- **🇲🇾 Malaysia — arriving 2027.** BNM **Open Finance Exposure Draft** released 18 Nov 2025;
  consultation closes 1 Mar 2026. Technical platform built by **PayNet** with 7 banks + EPF; pilot
  mid-2026. Phased rollout: banks >1M customers **1 Jan 2027**, banks >100k **1 Jan 2028**,
  DFIs/EMIs (>5M active) **1 Jan 2029**. Standards align to global norms: REST, JSON, OAuth2,
  TLS 1.2+, ISO 20022. _This is the single most important date for Potraces._
- **🇪🇺 EU — PSD2 live, PSD3/PSR + FIDA next.** PSD2 mandated bank APIs (2018). PSD3 + Payment
  Services Regulation reached provisional agreement 27 Nov 2025; in force ~2026, mandatory ~late
  2027. **FIDA** extends open data beyond payment accounts to insurance, pensions, investments.
- **🇬🇧 UK** — building its own open-finance framework, not adopting PSD3.
- **🇺🇸 US — CFPB §1033** finalized Oct 2024 (open-banking mandate) but in **legal limbo / rewrite**
  through 2025–26. Big banks (JPMorgan, Wells Fargo) are dropping screen-scraping voluntarily anyway.
- **🇮🇳 India — Account Aggregator (the model SEA follows).** RBI framework live since Sep 2021.
  By Dec 2025: **2.61B accounts enabled, 252.9M users, 17 licensed AAs**. Consent-artefact based,
  part of India Stack alongside UPI/Aadhaar/DigiLocker. Proof the consent model scales massively.
- Also live: **Australia CDR**, **Brazil Open Finance** (very advanced), **Singapore SGFinDex**.

**Takeaway:** auto-capture is a *regulatory* capability, not an app trick. Malaysia is ~12–18 months
from the rails that make it clean.

---

## 3. What's available for Malaysian banks TODAY (pre-2027)

- **Finverse** — already covers **Maybank + CIMB Malaysia** (individual accounts) plus ~9 MY banks
  via a single Data API. Works on iOS AND Android. Commercial contract + likely cost; consent &
  possibly BNM registration apply. No e-wallets (TNG/GrabPay) yet.
- **Brankas** — Singapore-based open-finance/aggregation across SEA incl. Malaysia (CIMB, Maybank,
  Public Bank, Hong Leong involved in OB initiatives). Similar commercial/compliance footprint.
- **Salt Edge** — 5,000+ banks globally; some MY coverage; AISP model.
- **BNM OpenAPI portal** (apikijangportal.bnm.gov.my) — official, but mostly FX/reference data today,
  not consumer account data.

**Reality check — actual MY payment mix → what captures it** (refined with user input: Apple Pay
usage is *rising*, but TNG + bank QR dominate):

| Rail | Best capture | iOS | Android | Note |
|------|--------------|-----|---------|------|
| **Apple Pay** (growing) | iOS Shortcuts **Transaction trigger** | ✅ auto, free | (Google Pay equiv) | Coverage *grows* as adoption rises — ages well. |
| **Bank QR / DuitNow** (MAE, CIMB) | Open-banking aggregator (Finverse) + bank email alerts | ✅ via aggregator | ✅ | Debit lands in bank feed → caught regardless of QR. **PayNet runs both DuitNow AND Open Finance → clean 2027 path.** |
| **TNG eWallet** (dominant) | Android NotificationListener / manual / screenshot→AI | ❌ **structural gap** | ✅ | EMI = **last in BNM timeline (2029)**. Push-only (no SMS), no per-txn email, no consumer API. |

**Key consequences:**
- Apple Pay Shortcuts trigger is NOT near-useless — it's a free channel whose coverage grows over
  time. Build the App Intent receiver early.
- Bank QR is the *best-covered* rail long-term (PayNet owns DuitNow + the Open Finance platform).
- **TNG is the real hole on iOS** and stays open until ~2029. The right answer for TNG is not an
  impossible read — it's **frictionless manual capture** (Back Tap / Siri / widget → "RM12 lunch",
  or screenshot → existing AI parser). This makes the **App Intent quick-add do double duty**: TNG
  manual entry + Apple Pay auto-capture receiver.
- Aggregators (Finverse/Brankas) cover *bank accounts* but not *e-wallets*; cost money + compliance.
- Broadest cheap net today across all rails: **email parsing** + **manual/AI receipt scan**.

---

## 4. Recommended strategy for Potraces

Don't bet the product on notification scraping (Android-only, fragile, off-brand). Build a layered
"connections" capability that is **open-finance-ready** so 2027 is a plug-in, not a rewrite.

**Phase A — now, cross-cutting (iOS-first, your priority platform)**
- Ship an **App Intent** native module + Expo config plugin → unlocks **Back Tap, Siri, Spotlight,
  Control Center, widgets, Lock Screen** quick-add. One build, many surfaces. Guided setup card to
  teach Back Tap assignment.

**Phase B — now, cross-platform auto-capture without licensing**
- **Email parsing**: let users connect Gmail/IMAP (or forward to a parse address). Reuse the existing
  Groq/Gemini receipt pipeline to extract merchant/amount/date from bank & e-wallet alert emails and
  e-receipts. Works identically on iOS + Android. No bank deal, no Apple sandbox issue.

**Phase C — power features, opt-in, platform-specific**
- **Android**: optional `NotificationListenerService` module for users who want hands-off capture,
  with MY-bank parsers (Maybank, CIMB, TNG, etc.). Clearly labeled, opt-in.
- **iOS**: ship a one-tap **Shortcuts automation** template (Apple Pay + SMS keyword) that calls the
  App Intent. Partial, but free.

**Phase D — the moat (2026→2027)**
- Architect a generic **"Connection" abstraction** (source → normalized transaction → dedupe →
  confirm). Pilot **Finverse/Brankas** for Maybank+CIMB now if budget allows. When **BNM Open Finance**
  goes live (Jan 2027), plug in PayNet's APIs behind the same abstraction. Position Potraces as
  **open-finance-ready from day one** — that's the durable advantage over SMS-scraping incumbents.

**Design/brand guardrails:** consent-first, time-limited, on-device parsing where possible, never read
personal messages, calm framing ("we'll suggest, you confirm"), full BM parity, no red. Auto-captured
items are *suggestions* the user approves — never silent writes.

---

## Sources
- [BNM Open Finance rollout — Fintech News MY](https://fintechnews.my/54091/regtech-fintech-regulation-malaysia/malaysia-open-finance/)
- [BNM Open Finance Exposure Draft — HHQ](https://hhq.com.my/posts/open-finance-in-malaysia-bank-negara-malaysias-exposure-draft/)
- [State of open banking Malaysia 2025](https://www.sarah-huang.com/post/state-of-open-banking-malaysia-2025)
- [Finverse — Maybank Malaysia](https://www.finverse.com/banks/maybank-malaysia) · [Finverse — CIMB Malaysia](https://www.finverse.com/banks/cimb-malaysia) · [Finverse Data API](https://www.finverse.com/bank-data-api)
- [Brankas — Future of Open Banking in Malaysia](https://blog.brankas.com/The-Future-of-Open-Banking-in-Malaysia-A_Landscape-Analysis)
- [Salt Edge — Account Information](https://www.saltedge.com/products/account_information)
- [PSD3/PSR/FIDA — Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/cedd39c6/psd3-and-psr-from-provisional-agreement-to-2026-readiness)
- [CFPB §1033 in flux — American Banker](https://www.americanbanker.com/news/on-the-day-of-a-would-be-deadline-open-banking-is-in-flux)
- [India Account Aggregator — Sahamati/Medium](https://medium.com/digital-banking-2030/how-sahamatis-account-aggregator-model-is-redefining-financial-data-ownership-in-india-941b4a931dc9)
- [iOS cross-app notification limits](https://medium.com/@ritika_verma/notifications-in-ios-8ef4231b65a3) · [iOS 26.3 notification forwarding — MacRumors](https://www.macrumors.com/2025/12/15/ios-26-3-notification-forwarding/)
- [Apple Shortcuts expense automations — Finny](https://getfinny.app/blog/apple-shortcuts-expense-tracking-automations-2026) · [Apple Pay automation — MoneyCoach](https://moneycoach.ai/blog/automating-expense-tracking-with-apple-pay-simplifying-financial-management-with-shortcut-automations)
- [Walnut iOS impossibility — Quora](https://www.quora.com/Is-there-any-application-for-iPhone-which-analyses-the-SMS-and-creates-the-expense-sheet-like-Walnut-application-in-Android)
- [How PFM apps connect via aggregators — Engadget](https://www.engadget.com/apps/best-budgeting-apps-120036303.html)
- [App Intents — Apple Developer](https://developer.apple.com/documentation/appintents)
