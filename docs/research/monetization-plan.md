# Potraces — Go-to-Revenue Plan (2026-06-13)

## The two hard truths (grounded in the code)
1. **No purchase rail exists.** `premiumStore` is a trial-only flag (`trialStartDate`); no RevenueCat / react-native-iap / IAP. `@stripe/stripe-terminal-react-native` is seller card-acceptance, not subscriptions. → **RM0 collectable until this is wired.**
2. **The monetizable side is free.** `premium.ts` gates only personal features (wallets/budgets/scans/AI/playbooks). The whole seller/stall suite (order pages, customers, DuitNow QR, Supabase sync, season analytics) is unmonetized. Businesses pay; consumers don't.

## Strategy: business is the revenue, personal is the funnel
Keep personal finance free and excellent — it builds the habit, the brand, and the install base. Charge the micro-merchants, who have real willingness-to-pay (a side-hustle seller earning RM500–2000/mo will pay RM20–25/mo for tools that save hours + get them paid faster + look pro).

## Critical path to the first ringgit (in order)
1. **Apple Developer + Google Play enrollment** (memory: PENDING). Blocks everything — IAP, dev build, device testing.
2. **Wire RevenueCat** (industry standard for RN subscriptions: handles IAP, entitlements, trials, restore, cross-platform). Single highest-leverage build. Replace the trial-only `premiumStore` with RevenueCat entitlements (keep the trial logic as the RC intro offer).
3. **Restructure `premium.ts`** from one personal tier → three entitlements: `free`, `plus` (personal), `business` (seller/stall).
4. **Gate the seller infrastructure** behind `business`. Wire `PaywallModal` at the upgrade moments (2nd shop product over cap, branded-page toggle, WhatsApp reminder, QR confirmation).

## Recommended pricing (Malaysia)
| Tier | Price/mo | What's in it |
|---|---|---|
| **Free** | RM0 | Full personal core; 1 shop link, capped orders/products/customers (the hook + viral surface) |
| **Potraces+** (personal) | **RM5.90** | Cloud sync/backup (the dormant sync — the #1 upgrade reason), advanced Echo/AI, unlimited wallets/budgets/goals, unlimited receipt scans |
| **Potraces Business** (seller/stall) | **RM24.90** | Unlimited orders/products/customers, branded order page (custom slug + logo), WhatsApp payment reminders, DuitNow QR + payment confirmation, sales/season analytics |
Note: current RM10 single tier is too high for personal-only and too low for business. Split it.

## Growth = built-in virality (free CAC — the real profit multiplier)
Every artifact a seller sends a customer carries the brand:
- Order pages / DuitNow QR / shared bills → "powered by Potraces" → customer installs.
- Split-bill + shared-subscription features pull friends in.
LTV:CAC works only because acquisition is near-free via these loops. Invest in making them slick (one-tap share, clean public pages) over paid ads.

## The long game: payments take-rate (2026–2027, regulatory-gated)
The DuitNow QR→confirmation pipeline + Stripe Terminal scaffolding point at the real scale revenue: a small fee on seller transactions. BUT: do NOT custody money yourself — partner a licensed PSP and take a SaaS/referral fee. Compliance line flagged in `memory/legal-regulatory-risk.md` (e-money / payments). Sequence this AFTER subscriptions prove the merchant base.

## Decisions only the founder can make
1. Enrollment: Apple + Play now (the gate). 
2. Rail: RevenueCat (recommended) — confirm.
3. Final prices + the exact free/paid feature line per tier.
4. Commit to the payments/PSP path later? (compliance investment).

## First executable build (ready once #1 is enrolled)
RevenueCat integration + the three-entitlement refactor of `premium.ts` + paywall trigger points. Spec can be finalized now against the existing feature set so it's a fill-in-the-blanks build the day enrollment clears.
