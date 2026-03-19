# Potraces — Competitive Analysis & Feature Gap

## Market Position

The Malaysian finance app market is dominated by global apps (YNAB, Wally, Money Manager, Monefy, Expensify) and local neobanks/aggregators (BigPay, iMoney, Touch 'n Go). No Malaysian-made app targets the dual personal + small seller/stall use case.

## Feature Comparison

| Feature | YNAB | Wally | Money Manager | Potraces |
|---|---|---|---|---|
| Expense/income tracking | Yes | Yes | Yes | **Yes** |
| Budgets | Yes | Yes | Yes | **Yes** |
| Goals/savings | Yes | Yes | No | **Yes (deep)** |
| Charts/reports | Yes | Yes | Yes | **Yes** |
| Transaction search + filters | Yes | Yes | Yes | **Yes** |
| Multiple wallets/accounts | Yes | Yes | Yes | **Yes** |
| Debt tracking + splits | No | No | Basic | **Yes (deepest)** |
| AI chat | No | Yes | No | **Yes** |
| Subscriptions tracking | Yes | Yes | No | **Yes** |
| Onboarding | Yes | Yes | Yes | **Yes** |
| Receipt scanning | No | Yes | No | **Yes (seller)** |
| Seller POS + orders | No | No | No | **Yes** |
| Stall session selling | No | No | No | **Yes** |
| Hawker/home business mode | No | No | No | **Yes** |
| Malaysian-first (RM, Malay) | No | No | No | **Yes** |
| Web order page for sellers | No | No | No | **Yes** |
| Export (CSV/PDF) | Yes | Yes | Yes | **No** |
| Bill reminders/notifications | Yes | Yes | Yes | **No** (infra exists) |
| Dark mode | Yes | Yes | Yes | **No** (code exists, not wired) |
| Auto-record recurring payments | Yes | Yes | Yes | **No** |
| Cloud backup/sync (personal) | Yes | Yes | Yes | **No** |
| Home screen widgets | Some | No | Yes | **No** |
| Bank sync | Yes | Yes | No | **No** |
| Multi-currency | Yes | Yes | Yes | **No** |

## Current Competitive Rating: ~60%

Strong on core features + uncontested depth in debt/splits/seller. Gaps are quality-of-life features, not core functionality.

## Moat (Uncontested)

- Personal finance + seller/stall hybrid — nobody else does this
- Malaysian-first: RM currency, Malay language, local food references, Manglish
- Emotional design: calm palette, no red, gentle language ("kept" not "profit", "came in" not "revenue")
- 250k+ hawkers + hundreds of thousands of home-based sellers in Malaysia currently using WhatsApp + notebook

## Features to Close Gap to ~80%

### Priority 1: Export Transactions (CSV) — ~150 lines
- Table stakes. Every competitor has this.
- `xlsx` + `expo-sharing` already used in seller mode (SeasonSummary.tsx)
- Just wire the same pattern for personal transactions
- Add "export" button in TransactionsList filter area

### Priority 2: Bill Reminder Notifications — ~100 lines
- `expo-notifications` installed, token registration done, Android channel created
- `scheduleNotificationAsync` never called anywhere
- Wire: when subscriptions auto-advance `nextBillingDate`, schedule a local notification 1 day before
- Add notification preferences in Settings (already has `notificationsEnabled` toggle)

### Priority 3: Auto-Record Subscription Payments — ~50 lines
- When a subscription auto-advances or is marked paid, create a personal `Transaction`
- Links subscription tracking to actual expense history
- Small change in `personalStore` subscription advance logic

### Priority 4: Dark Mode Activation — Large refactor
- `COLORS_DARK` fully defined in `src/constants/index.ts`
- `useThemeColors()` hook exists in `src/utils/colorScheme.ts`
- Problem: every screen hardcodes `CALM` — need to replace with theme-aware references
- Recommend: defer to a dedicated sprint, or implement via React context that swaps the CALM object

## Features to Defer (High Effort, Lower Priority)

| Feature | Why defer |
|---|---|
| Bank sync | Requires fintech partnerships, PSD2/open banking compliance |
| Personal cloud backup | Need Supabase schema + sync service for personal data |
| Multi-currency | Need exchange rate API, per-transaction currency field, migration |
| Home screen widgets | Nice-to-have, not deal-breaker for MVP |

## Positioning Strategy

Don't compete head-on with YNAB/Wally on "budget tracking." Compete on:

**"The app Malaysian sellers and hawkers actually use to track their business and personal money in one place."**

The dual personal + seller/stall angle is uncontested in Malaysia.

## Vulnerabilities

- **Discovery**: Global apps have millions of downloads and SEO dominance
- **No bank sync**: Malaysian users accustomed to BigPay/TNG auto-tracking
- **Single developer**: Scaling support, updates, localization if it catches on
- **Monetization**: Premium tier needs compelling value proposition

## Sources

- [AIA Malaysia — 4 Money Apps](https://www.aia.com.my/en/knowledge-hub/plan-well/4-money-apps-to-help-you-manage-money-better.html)
- [CelcomDigi — Top budgeting apps for Malaysians](https://discover.celcomdigi.com/blog/top-budgeting-apps-for-malaysians)
- [MrMoneyTV — 5 Budgeting Apps Malaysia](https://www.mrmoneytv.com/post/5-budgeting-apps-to-manage-your-money-in-malaysia)
- [MyPF — 9 Best Personal Finance Apps for Malaysians](https://mypf.my/2023/08/16/10-best-personal-finance-apps-for-malaysians/)
- [FintechNews — Top 12 Fintech Startups in Malaysia](https://fintechnews.sg/top-fintech-startups-malaysia/)
