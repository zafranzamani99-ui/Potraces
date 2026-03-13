# Potraces AI — Complete Personal Mode Scenario Map

> Every scenario the AI must handle, from quick expense logging to mid-life financial crisis.
> Covers both **Money Chat** (conversational) and **Notes** (extraction).

---

## STATUS LEGEND

- ✅ Works now
- ⚠️ Partially works / fragile
- ❌ Broken or missing
- 🔧 Needs fix (specific issue noted)

---

## A. QUICK RECORDING — "I Just Spent Money"

User just paid for something. Wants to log it before they forget.

### A1. Simple single expense

| # | Input | Chat | Notes | Status |
|---|---|---|---|---|
| 1 | "lunch rm12" | add_expense, food | Gemini extract | ✅ |
| 2 | "rm50 petrol" | add_expense, transport | local parser | ✅ |
| 3 | "grab to klcc rm23.50" | add_expense, transport | "grab" keyword | ✅ |
| 4 | "beli ubat rm35" | add_expense, health | "ubat" keyword | ✅ |
| 5 | "parking 5 ringgit" | AI handles | BARE_AMOUNT catches | ✅ |

### A2. Expense with wallet

| # | Input | Issue | Status |
|---|---|---|---|
| 6 | "lunch rm18 bayar guna tng" | Chat: wallet match + deduct ✅. Notes: wallet matched but no deduct | ⚠️ |
| 7 | "topup tng rm100 from maybank" | `transfer` action: fromWallet→toWallet | ✅ |
| 8 | "bayar rm200 pakai spaylater" | `add_bnpl` action: uses credit wallet + records expense | ✅ |

### A3. Multiple items in one message

| # | Input | Issue | Status |
|---|---|---|---|
| 9 | "topup hotlink rm35 and lunch rm12" | 2 expenses. Chat: depends on Gemini creating 2 actions | ⚠️ |
| 10 | "parking rm5, lunch rm18, grab rm23" | 3 expenses comma-separated | ⚠️ |
| 11 | "beli groceries rm156 maybank, snacks rm23 tng" | 2 expenses, 2 different wallets | ⚠️ |

### A4. Past dates

| # | Input | Issue | Status |
|---|---|---|---|
| 12 | "semalam dinner rm65" | `date` field on actions — AI sends ISO date | ✅ |
| 13 | "last friday petrol rm80" | `date` field — AI resolves "last friday" to date | ✅ |
| 14 | "3 march beli kasut rm299" | `date` field: "2026-03-03" | ✅ |

### A5. Bare amounts (no RM prefix)

| # | Input | Issue | Status |
|---|---|---|---|
| 15 | "spent 45 kat uniqlo" | Notes: local parser misses bare "45". Gemini catches | ⚠️ |
| 16 | "lunch 12" | No "rm", no dash — only Gemini can parse | ⚠️ |

### A6. Income recording

| # | Input | Issue | Status |
|---|---|---|---|
| 17 | "gaji masuk rm3200" | add_income | ✅ |
| 18 | "freelance payment rm500" | add_income | ✅ |
| 19 | "mak bagi rm200 duit raya" | Income but person-linked. Chat: add_income ✅ but no person tracking | ⚠️ |
| 20 | "shopee refund rm45" | "shopee" is in EXPENSE_KEYWORDS — conflict with "refund" | ⚠️ |
| 21 | "sold old phone rm800" | Income, but "sold" is in SELLER_KEYWORDS — may misclassify | ⚠️ |

---

## B. REFLECTION — "Where Did My Money Go?"

End of week or month. User opens Chat feeling anxious or curious.

### B1. Basic questions (AI has data)

| # | Input | Status |
|---|---|---|
| 22 | "where does my money go?" | ✅ category breakdown in context |
| 23 | "how much i spent on food?" | ✅ category data available |
| 24 | "berapa baki maybank?" | ✅ wallet balances in context |
| 25 | "total semua wallet berapa?" | ✅ can sum wallet list |
| 26 | "am i spending more than i earn?" | ✅ income vs expense available |

### B2. Comparison questions (limited data)

| # | Input | Issue | Status |
|---|---|---|---|
| 27 | "compare this month vs last month" | Last month top 5 categories now in context | ✅ |
| 28 | "food spending this month vs last?" | Last month category breakdown available | ✅ |
| 29 | "am i doing better this month?" | Can compare kept + categories | ✅ |

### B3. Time-scoped questions (missing data)

| # | Input | Issue | Status |
|---|---|---|---|
| 30 | "what i spend most on this week?" | Only monthly breakdown, no weekly filter | ❌ |
| 31 | "how much i spent today?" | 20 recent txns now — better coverage | ⚠️ |
| 32 | "how much i spent on shopee this year?" | No yearly aggregation | ❌ |
| 33 | "spending trend over 3 months" | Only current + last month data | ❌ |

### B4. Pattern/insight questions

| # | Input | Issue | Status |
|---|---|---|---|
| 34 | "which day i spend the most?" | Only 10 txns — not enough data | ❌ |
| 35 | "kenapa bulan ni banyak keluar?" | Context shows categories + 20 recent txns | ✅ |
| 36 | "apa biggest expense bulan ni?" | Category breakdown + 20 txns — good coverage | ✅ |

---

## C. PURCHASE DECISIONS — "Can I Afford This?"

User eyeing something. Wants honest numbers, not advice.

### C1. Simple affordability check

| # | Input | Status |
|---|---|---|
| 37 | "can i buy airpods rm999?" | ✅ shows wallet + kept + days left |
| 38 | "ada duit nak beli iphone tak?" | ✅ same pattern |
| 39 | "enough money for concert ticket rm250?" | ✅ |

### C2. Conditional affordability (needs reasoning)

| # | Input | Issue | Status |
|---|---|---|---|
| 40 | "if i buy rm500 shoe, how much left for food?" | Needs: food budget remaining - rm500. AI sees budgets | ⚠️ |
| 41 | "nak amik spaylater rm2000, rm167/month — can?" | Monthly commitment vs income. No installment simulation | ❌ |
| 42 | "car insurance rm1200 due next month, ready?" | No upcoming bill dates in context | ❌ |
| 43 | "worth it cancel netflix+spotify to save for trip?" | Multi-step: sum subs × months = timeline. Complex | ⚠️ |
| 44 | "if save rm500/month, when can buy macbook rm6999?" | Goal projection — possible but no structured tool | ⚠️ |

---

## D. DEBT TRACKING — "People Owe Me Money"

The most emotionally charged scenarios. Friends, family, housemates.

### D1. Creating debts

| # | Input | Chat | Notes | Status |
|---|---|---|---|---|
| 45 | "ali pinjam rm200" | add_debt they_owe | Gemini debt | ✅ |
| 46 | "i owe siti rm50 for lunch" | add_debt i_owe | Gemini debt | ✅ |
| 47 | "lent rm100 to abu for phone bill" | add_debt they_owe | ✅ | ✅ |

### D2. Querying debts (per-person data now in AI context)

| # | Input | Issue | Status |
|---|---|---|---|
| 48 | "how much ali owe me?" | Per-person debt list with names + amounts + due dates | ✅ |
| 49 | "siapa hutang aku paling banyak?" | Per-person list, AI can compare | ✅ |
| 50 | "list semua orang hutang aku" | Full per-person breakdown (cap 15) | ✅ |
| 51 | "total berapa orang hutang aku?" | Total + per-person count | ✅ |

### D3. Settling debts

| # | Input | Chat | Notes | Status |
|---|---|---|---|---|
| 52 | "ali dah bayar rm100" | `debt_update` action — finds Ali's debt, records payment, shows remaining | ✅ |
| 53 | "siti settled everything" | AI should use debt_update with full remaining amount — depends on reasoning | ⚠️ |
| 54 | "ali bayar balik rm50 cash" | `debt_update` records payment. Wallet income not auto-added | ⚠️ |
| 55 | "cancel ali punya hutang la" | `forgive_debt` action — marks debt as settled | ✅ |

### D4. Splitting bills

| # | Input | Issue | Status |
|---|---|---|---|
| 56 | "dinner rm90, split with ali and abu" | split_bill now creates expense + debts | ✅ |
| 57 | "dinner rm120, ali rm45, abu rm35, me rm40" | Unequal split — only equal supported | ❌ |
| 58 | "wifi rm150 split 4 housemates every month" | Recurring split — only one-time | ❌ |

### D5. Subscription sharing

| # | Input | Issue | Status |
|---|---|---|---|
| 59 | "netflix rm75 share with 5 people" | Chat: asks names step-by-step → creates sub + debts | ✅ |
| 60 | "one person quit netflix share" | `update_subscription` + `forgive_debt` for person who quit | ✅ |
| 61 | "bump netflix to rm84, split 6 ways" | `update_subscription` newAmount + new debts via add_debt | ✅ |

### D6. Debt note dumps (Notes mode)

| # | Input (multi-line) | Status |
|---|---|---|
| 62 | `mereka hutang`<br>`100-ali`<br>`50-abu`<br>`300-mak(duit raya)` | ✅ structured parser |
| 63 | `mohsin`<br>`air-3`<br>`petrol-7.5`<br>`tol-5.8` | ✅ person-scoped + merge |
| 64 | `mereka hutang`<br>`200-ali`<br>`aku hutang`<br>`100-siti` | ✅ direction switching |
| 65 | `ali hutang`<br>`- nasi 8`<br>`- teh 3.50`<br>`total: 16.50` | ❌ total line double-counted |

---

## E. BILLS & SUBSCRIPTIONS — "Auto-Debit Life"

### E1. Recording subscriptions

| # | Input | Chat | Notes | Status |
|---|---|---|---|---|
| 66 | "add netflix rm54.90 monthly" | add_subscription ✅ | Subscription handler added in confirmExtraction | ✅ |
| 67 | "spotify rm15.90 yearly" | add_subscription ✅ | Same | ✅ |
| 68 | "gym rm150 monthly" | add_subscription ✅ | Same | ✅ |

### E2. Querying subscriptions

| # | Input | Issue | Status |
|---|---|---|---|
| 69 | "how much i pay for subs total?" | AI sees sub list with amounts — can sum | ✅ |
| 70 | "bila netflix next due?" | nextBillingDate now in AI context | ✅ |
| 71 | "what bills coming this week?" | Billing dates in context — AI can filter | ✅ |
| 72 | "yearly subs berapa per month?" | AI needs to divide yearly by 12 — reasoning dependent | ⚠️ |

### E3. Managing subscriptions

| # | Input | Issue | Status |
|---|---|---|---|
| 73 | "cancel gym subscription" | `cancel_subscription` action — fuzzy matches name | ✅ |
| 74 | "change netflix to rm84/month" | `update_subscription` action: fuzzy match + update amount/cycle | ✅ |
| 75 | "digi rm240 quarterly" | Quarterly billing cycle now supported | ✅ |

---

## F. SAVINGS GOALS — "I Want to Save For..."

### F1. Goal queries

| # | Input | Issue | Status |
|---|---|---|---|
| 76 | "how's my japan trip goal?" | AI sees goal name + current/target + deadline + pace | ✅ |
| 77 | "berapa lagi nak sampai target?" | AI can calculate remaining | ✅ |
| 78 | "on track tak for japan?" | Deadline, days left, RM/day needed now in context | ✅ |

### F2. Goal contributions (ACTIONS)

| # | Input | Issue | Status |
|---|---|---|---|
| 79 | "simpan rm200 for japan trip" | `add_goal_contribution` action — fuzzy matches goal | ✅ |
| 80 | "add rm500 to emergency fund" | Same — fuzzy match | ✅ |
| 81 | Notes: `simpan-500(japan)` | `savings_goal` handler in confirmExtraction — fuzzy match + contributeToGoal | ✅ |

### F3. Goal coaching (PROACTIVE AI)

These are scenarios where the AI should PROACTIVELY help, not wait to be asked.

| # | Scenario | What AI should say | Current | Status |
|---|---|---|---|---|
| 82 | Goal deadline is 2 months away, user is 40% there | "Your Japan trip goal needs RM 3,600 more in 60 days — that's about RM 60/day" | Deadline + pace in context | ✅ |
| 83 | User kept RM 800 this month, has goal needing RM 500/month | "You kept RM 800 this month. Your Japan trip needs RM 500/month to stay on track" | Kept amount + goal pace available | ✅ |
| 84 | User hit 50% milestone | "Nice — halfway there on your Japan trip! RM 5,000 / RM 10,000" | Percentage in context + SYSTEM_PROMPT celebrates milestones | ✅ |
| 85 | User missed contribution for 2 months | "Your Japan trip hasn't had a contribution since January. Still going for it?" | Recent contributions now in context | ✅ |

---

## G. BUDGET STRESS — "I'm Almost Over Budget"

### G1. Budget queries

| # | Input | Issue | Status |
|---|---|---|---|
| 86 | "how's my food budget?" | AI sees budget: spent/allocated/remaining | ✅ |
| 87 | "am i over budget on anything?" | AI can check all budgets | ✅ |
| 88 | "how much food budget left?" | Direct from context | ✅ |

### G2. Budget stress relief (PROACTIVE AI — the key differentiator)

| # | Scenario | What AI should say (calm, no judgment) | Status |
|---|---|---|---|
| 89 | Food budget 90% used, 15 days left | "Your food breathing room is down to RM 50 with 15 days to go. That's about RM 3.30/day" | SYSTEM_PROMPT guides this behavior | ✅ |
| 90 | Shopping budget 100% exceeded | "Shopping went past the RM 300 mark — you're at RM 342. Just so you know" | SYSTEM_PROMPT + budget context | ✅ |
| 91 | User records food expense that would bust budget | After recording: "That puts food at RM 480 / RM 500 — RM 20 left for 8 days" | `getBudgetImpact()` auto-appended to action result | ✅ |
| 92 | All budgets healthy | "Everything's breathing fine this month. Food has RM 200 left, transport RM 150" | SYSTEM_PROMPT guides + budget data available | ✅ |

### G3. Budget coaching (what makes Potraces special)

The AI should NOT say "spend less." Instead:

| Scenario | BAD response | GOOD response |
|---|---|---|
| Over food budget | "You should eat at home more" | "RM 520 went to makan this month, past the RM 500 mark. Most of it was grab food — RM 280. The rest was dine-in" |
| Near limit | "Be careful with spending" | "Transport is at RM 180 / RM 200. 5 days left. You've been averaging RM 12/day for transport this month" |
| Way over | "This is a problem" | "Shopping hit RM 450, which is RM 150 past your RM 300 breathing room. Shopee was RM 310 of that" |

---

## H. EMOTIONAL MOMENTS — "I Feel Broke / Stressed / Lost"

This is where Potraces personality matters most. The AI is a calm Malaysian friend, not a financial advisor.

### H1. Feeling broke

| # | Input | Good AI response | Status |
|---|---|---|---|
| 93 | "i'm so broke la" | "Looking at the numbers — RM 3,200 came in, RM 2,800 went out. You kept RM 400. The feeling makes sense." | ✅ prompt covers |
| 94 | "baru gaji tapi dah habis" | "RM 3,200 came in 5 days ago. RM 1,800 already went out — mostly bills (RM 900) and food (RM 450)." | ⚠️ can answer but doesn't know exact salary date |
| 95 | "every month same thing, money gone" | "This month RM 2,800 went out. Last month was RM 2,600. The pattern is pretty consistent." | ⚠️ limited to 2 months |
| 96 | "rasa macam tak worth it tracking" | "That's totally okay. The numbers are here whenever you want to look. No pressure." | ✅ personality |

### H2. Spending guilt

| # | Input | Good AI response | Status |
|---|---|---|---|
| 97 | "i hate that i spent rm400 on shopee" | "RM 400 went to Shopee this month. It's the second biggest category after food." | ✅ no judgment |
| 98 | "why do i keep buying things i don't need" | "Shopping is at RM 650 this month. Most of it is Shopee (RM 400) and Lazada (RM 150)." | Per-merchant breakdown now in context (2+ occurrences) | ✅ |
| 99 | "i feel bad spending on myself" | "RM 200 went to things for you this month. That's about 8% of everything." | ✅ observation only |

### H3. Friend/family money stress

| # | Input | Good AI response | Issue | Status |
|---|---|---|---|---|
| 100 | "my friends never pay me back" | "People owe you RM 450 total. Ali: RM 200, Siti: RM 150, Abu: RM 100." | Per-person debt list in context | ✅ |
| 101 | "kawan hutang rm500 tapi malu nak tanya" | "RM 500 is a lot. It's sitting there — the record is here if you ever want to bring it up." | Per-person details + SYSTEM_PROMPT empathy | ✅ |
| 102 | "family always ask money from me" | "You've sent RM X to family this month." | ⚠️ depends on "family" category tracking |
| 103 | "mak suruh pinjam duit lagi" | Acknowledge. Show current debt totals. | ⚠️ totals only |

### H4. Life crisis moments

| # | Input | Good AI response | Issue | Status |
|---|---|---|---|---|
| 104 | "i lost my job" | "Let's look at where things stand. You have RM X across your wallets. Monthly expenses have been around RM Y. That gives you about Z months of breathing room." | ✅ can calculate this |
| 105 | "car broke down, need rm3000 repair" | "Right now your wallets total RM X. Your Japan trip goal has RM Y. These are just the numbers — you'll figure out what makes sense." | ✅ shows options without advising |
| 106 | "medical emergency rm5000" | Show wallet totals, goal money, credit available. No advice. | ⚠️ credit wallet limits not in context |
| 107 | "just got divorced, need to restart everything" | Be warm. Show total financial picture. "Here's everything in one place." | ✅ personality + data |

---

## I. SUBSCRIPTION HELL — "Why Am I Paying For All This?"

Real scenario: user signed up for 8+ subscriptions over 2 years, forgot half of them.

### I1. Discovery

| # | Input | Good AI response | Status |
|---|---|---|---|
| 108 | "how many subs do i have?" | "You have 8 active subscriptions totaling RM 285/month" | ✅ sub list in context |
| 109 | "which sub is the most expensive?" | Can sort by amount | ✅ |
| 110 | "berapa subs yang aku tak guna?" | "I can see your subs but I don't know which ones you actually use — only you know that. Here they are: [list]" | ✅ honest |

### I2. Subscription impact awareness

| # | Input | What AI should show | Status |
|---|---|---|---|
| 111 | "total subs per year berapa?" | Monthly × 12 + yearly subs. Math needed | ⚠️ |
| 112 | "what if i cancel all subs?" | "That's RM 285/month or RM 3,420/year that would stay with you" | ⚠️ depends on reasoning |
| 113 | "subs makan berapa percent of income?" | Needs: total sub cost / monthly income × 100 | ⚠️ |

### I3. Proactive sub awareness (IDEAL future behavior)

| # | Scenario | AI could say | Status |
|---|---|---|---|
| 114 | User has 3 streaming subs (RM 150 total) | When asked about spending: "Streaming alone is RM 150/month — Netflix, Spotify, YouTube Premium" | ⚠️ data there but AI might not surface |
| 115 | Sub billing date tomorrow | "Netflix RM 54.90 is due tomorrow" | Billing dates now in context | ✅ |
| 116 | User overspending + many subs | "You went over on food and shopping. Meanwhile RM 285/month goes to subscriptions automatically" | ⚠️ reactive only |

---

## J. DEBT SPIRAL — "I Owe Too Many People"

The scary one. User has accumulated debts from multiple people + BNPL.

### J1. Debt awareness

| # | Input | What AI should show | Status |
|---|---|---|---|
| 117 | "total aku hutang berapa?" | AI sees total + per-person breakdown | ✅ |
| 118 | "list semua hutang aku" | Per-person with amounts + due dates (cap 15) | ✅ |
| 119 | "which hutang paling urgent?" | Due dates in context — AI can find soonest | ✅ |
| 120 | "BNPL total berapa?" | AI sees "Future You Owes" BNPL total | ✅ |

### J2. Debt stress relief

| # | Input | Good AI response | Status |
|---|---|---|---|
| 121 | "i owe so many people" | "Total you owe: RM 1,200 to [N] people. Owed to you: RM 450. Net: you're RM 750 out." | Per-person breakdown + SYSTEM_PROMPT empathy | ✅ |
| 122 | "can i even pay all this?" | "You owe RM 1,200 total. You kept RM 800 this month. If the pace stays, it would take about 1.5 months" | Data available, reasoning dependent | ⚠️ |
| 123 | "which one should i settle first?" | Should NOT advise. "Here are your debts sorted by amount: [list]. Some have due dates." | Per-person + due dates available | ✅ |
| 124 | "i keep borrowing from friends" | "You've added [N] new debts this month totaling RM X. Last month it was Y." | ❌ no historical debt tracking in context |

### J3. Debt progress

| # | Input | What AI should show | Status |
|---|---|---|---|
| 125 | "berapa dah aku bayar balik bulan ni?" | Needs: sum of debt payments this month | ❌ not in context |
| 126 | "aku dah settlekan siti and abu" | `debt_update` for each person — AI creates 2 actions | ✅ |
| 127 | "hutang aku naik ke turun?" | Compare current vs previous debts | ❌ no historical |

---

## K. NOTES QUICK DUMPS — Real Note Patterns

How users actually write notes on their phone. Fast, messy, shorthand.

### K1. Simple lists

| # | Input | Status |
|---|---|---|
| 128 | `lunch-12`<br>`petrol-45`<br>`parking-3` | ✅ local parser |
| 129 | `nasi lemak-8`<br>`teh tarik-3.50`<br>`parking-5` | ✅ |
| 130 | `gaji-3200`<br>`sewa-800`<br>`wifi-150` | ⚠️ mixed income+expense — Gemini handles, local might not |

### K2. Debt lists

| # | Input | Status |
|---|---|---|
| 131 | `mereka hutang`<br>`100-ali`<br>`50-abu` | ✅ |
| 132 | `mohsin`<br>`air-3`<br>`petrol-7.5`<br>`mael`<br>`flavor-23` | ✅ person-scoped |
| 133 | `300-mak(duit raya)` | ⚠️ direction defaults i_owe — might be income (duit raya FROM mak) |

### K3. Mixed intent dumps

| # | Input | Issue | Status |
|---|---|---|---|
| 134 | `gaji-3200`<br>`sewa-800`<br>`simpan-500`<br>`lunch-12` | income + expense + savings_goal + expense. All handlers now exist | ✅ |
| 135 | `netflix-75`<br>`digi-50`<br>`100-ali hutang` | subscription + bill + debt. Subscription handler added | ✅ |

### K4. Edge cases

| # | Input | Issue | Status |
|---|---|---|---|
| 136 | `110+20-3-7.5 = 76.7` | Math line — MATH_LINE regex skips it | ✅ |
| 137 | Lines with ✅ checkmark | CHECKMARK regex skips | ✅ |
| 138 | `ali hutang`<br>`- nasi 8`<br>`- teh 3.50`<br>`total: 16.50` | "total" line extracted as duplicate item | ❌ |
| 139 | `byr prkng rm5` (abbreviated Malay) | "prkng" not in keywords, Gemini might catch | ⚠️ |
| 140 | `cash + 20` | INCOME_KEYWORDS has "cash" but +20 pattern needs specific handling | ⚠️ |

---

## L. WALLET JUGGLING — Malaysian E-Wallet Life

Users have 3-5 wallets/accounts. Money moves between them constantly.

| # | Input | Issue | Status |
|---|---|---|---|
| 141 | "total semua wallet berapa?" | AI sums wallet list | ✅ |
| 142 | "which wallet paling banyak?" | AI compares | ✅ |
| 143 | "transfer rm200 maybank to tng" | `transfer` action: fromWallet→toWallet | ✅ |
| 144 | "topup tng rm100 from maybank" | `transfer` action | ✅ |
| 145 | "bayar spaylater rm167 from maybank" | `repay_credit` action: reduces usedCredit + deducts from bank | ✅ |
| 146 | "how much credit left on spaylater?" | Credit limit + used + available now in context | ✅ |

---

## PRIORITY IMPLEMENTATION PLAN

### Tier 1 — Day 1 Expectations ✅ ALL DONE

| Fix | Impact | Status |
|---|---|---|
| **Per-person debt details in AI context** | #48-51, #100-101, #117-127 | ✅ |
| **`debt_update` action in Chat** | #52-55, #126 | ✅ |
| **Subscription handler in Notes** | #66-68, #135 | ✅ |
| **Date override on ChatAction** | #12-14 | ✅ |

### Tier 2 — Week 1 ✅ ALL DONE

| Fix | Impact | Status |
|---|---|---|
| **`transfer` action** | #7, #143-144 | ✅ |
| **Goal deadline + pace in context** | #78, #82-84 | ✅ |
| **Subscription billing dates in context** | #70-71, #115 | ✅ |
| **Last-month category breakdown in context** | #27-28 | ✅ |
| **Split_bill also creates the expense** | #56 | ✅ |
| **Budget impact after recording expense** | #91 | ✅ |

### Tier 3 — Month 1 ✅ MOSTLY DONE

| Fix | Impact | Status |
|---|---|---|
| **`add_goal_contribution` action** | #79-81 | ✅ |
| **Budget coaching in SYSTEM_PROMPT** | #89-92 | ✅ |
| **BNPL action + handler** | #8, #11 | ✅ |
| **Unequal split support** | #57 | ⚠️ receipt-based item assignment done (wizard step 4), text-based unequal split still missing |
| **20 recent txns in context** | #35-36 | ✅ |
| **Per-merchant breakdown** | #98 | ✅ |
| **Post-action observations in SYSTEM_PROMPT** | "that puts food at..." | ✅ |

### Tier 4 — Makes Potraces the BEST friend

| Fix | Impact | Status |
|---|---|---|
| **Goal coaching in SYSTEM_PROMPT** | #82-85 | ✅ |
| **Debt coaching in SYSTEM_PROMPT** | #121-127 | ✅ done (per-person context + empathy prompts) |
| **Sub audit**: AI groups subs by type, shows annual cost | #111-116 | ⚠️ data there, depends on reasoning |
| **Weekly digest**: proactive message summarizing the week | New feature | ❌ remaining |
| **Spending velocity**: "you're spending rm X/day, at this pace..." | New insight | ❌ remaining |
| **Net worth view**: wallets - debts - BNPL = real position | New context | ❌ remaining |

### Also done (second pass)

| Fix | Scenarios | Status |
|---|---|---|
| **Spending velocity (RM/day + projection)** | New insight | ✅ |
| **Net worth view (wallets − debts − BNPL)** | New context | ✅ |
| **Credit limit/available in context** | #146 | ✅ |
| **Quarterly billing cycle** | #75 | ✅ |
| **`cancel_subscription` action** | #73 | ✅ |
| **`forgive_debt` action** | #55 | ✅ |

### Also done (third pass)

| Fix | Scenarios |
|---|---|
| `update_subscription` action | #74, #60-61 |
| `add_bnpl` action (credit wallet) | #8, #11 |
| `repay_credit` action (pay off BNPL) | #145 |
| Per-merchant spending breakdown in context | #98 |
| Goal contribution history in context | #85 |
| Quarterly billing cycle in UI picker | (SubscriptionList, constants) |

### Still remaining (not yet implemented)

| # | Scenario | What's needed |
|---|---|---|
| 57 | Unequal splits (text-based) | Receipt split wizard handles item-based assignment. AI Chat `split_bill` still only supports equal split |
| 58 | Recurring splits | Recurring split mechanism |
| 124-125, 127 | Historical debt tracking | Debt change history in context |
