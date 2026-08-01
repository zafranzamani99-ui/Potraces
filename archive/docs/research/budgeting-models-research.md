# Budgeting Models — Research & Localization for Potraces / Echo

Research synthesis. Feeds a real budgeting-model feature. Opinionated.

Three research streams consolidated here:
1. **MODELS** — the influential global budgeting frameworks, profiled and rated.
2. **MALAYSIA** — the fixed-commitment reality layer (EPF, PTPTN, zakat, transport, sinking funds) with real RM figures.
3. **COMPETITORS** — how PFM apps onboard a budget, and the AI-tailoring gap Echo can own.

---

## 1. The Problem — Why You Can't Just Bolt 50/30/20 Onto Malaysia

Western budgeting rules assume a household with discretionary headroom: stable monthly salary, essentials comfortably under half of take-home, and a culture where "savings" means a generic brokerage or savings account. None of that holds for the app's core audience — a low-to-mid income Malaysian, often renting a room, frequently with PTPTN debt, sometimes earning irregular gig/seller income, and (if Muslim) owing zakat.

Two findings dominate everything below:

- **Tracking beats math.** Across the model research and the competitor scan, the single most-repeated truth is *"the best budget is the one you'll stick with."* ~60% of people abandon budgets within 3 months — 37% say "too complicated," 28% "forgot to track." The win is not the *perfect ratio*; it is a model someone actually completes and re-opens. This biases everything toward low-friction, automatable, honest models over mathematically-optimal ones.
- **The "needs" allowance is the breaking point.** Almost every fixed-percentage rule allocates ~50% to needs. For low/median Malaysian incomes, essentials realistically run **60–80%+** of take-home, with rent alone hitting 40–50% in the Klang Valley / Penang / JB. So 50/30/20's 20% savings target is *aspirational, not realistic* — and presenting it as a goal induces guilt rather than behavior change.

The right architecture is therefore: **(a) compute a protected Malaysian "commitments" tier FIRST** (EPF, zakat, PTPTN, transport, rent, sinking-fund accruals), **(b) apply a flexible, honestly-proportioned split only to the remainder**, and **(c) let Echo pick, localize, and continuously re-balance the model** — the trifecta no surveyed competitor occupies.

---

## 2. Budgeting Models — Comparison Table

The models cluster into three families:
- **Proportional / percentage rules** — low-effort, self-correcting, blunt (50/30/20, 60/20/20, 70/20/10, 80/20, Barefoot buckets, Conscious Spending).
- **Allocation-intensive** — per-transaction discipline, maximum control (zero-based/YNAB, envelopes/cash-stuffing, Kakeibo).
- **Goal-ladder / sequential** — prescribe an order of operations, not category splits (Ramsey baby steps, pay-yourself-first/anti-budget).

All percentages are of **post-tax / take-home** income unless noted.

| Model (source) | Mechanics | Best for | Weakness / edge case | Flexibility |
|---|---|---|---|---|
| **50/30/20** (Warren & Warren Tyagi, *All Your Worth*, 2005) | 50% needs (rent, utilities, transport, groceries, min. debt) / 30% wants / 20% savings + debt-paydown | Middle-income, stable pay, essentials under ~50%; wants a simple 3-bucket mental model | Breaks in high-cost-of-living / low-income / high-debt households where needs alone hit 60–80%, making 20% savings fantasy; needs/wants line is fuzzy | MODERATE — fixed ratios, no per-transaction tracking |
| **60/20/20** | 60% needs / 20% savings + debt / 20% wants | Essentials exceed half of take-home but still want 3 numbers | Still assumes you *can* cap needs at 60% and trim fun to 20%; same fuzzy needs/wants line | MODERATE |
| **70/20/10** | 70% living (needs **AND** wants combined) / 20% savings + investments / 10% debt repayment or giving | Beginners overwhelmed by 3+ categories; people attacking debt or giving while still saving | 70% for *all* spending is tight for low earners; 10% to debt is slow under heavy loads; merging needs+wants loses spending insight | LOW–MODERATE — fewer buckets, looser |
| **80/20** (Pareto / pay-yourself-first) | Save/invest 20% FIRST (auto on payday); spend remaining 80% with no category tracking | Tracking-haters, beginners, irregular spenders wanting a guaranteed savings floor | Zero visibility into the 80% (won't surface leaks); 20% may be unrealistic at very low income; no debt lane | LOW — most flexible percentage rule |
| **Zero-based / YNAB** ("give every dollar a job") | Income − allocations = 0; every dollar pre-assigned before the period. YNAB 4 rules: give every $ a job; embrace true expenses; roll with the punches; age your money | Detail-oriented; max-control seekers; **irregular/variable income** (budget last month's money) | High effort/discipline; frequent reconciliation; intimidating; easy to abandon | HIGH structure, FLEXIBLE allocation ("roll with the punches" allows mid-period moves) |
| **Envelope / cash-stuffing** (digital or physical) | Budget each category, fund a labeled envelope; empty envelope = stop spending there until next period | Chronic overspenders; people who "feel" spending with cash; want hard category caps | Cash impractical for online/recurring bills, unsafe to hold; rigid (no borrowing without breaking system); tedious; needs digital app for modern use | HIGH — hard caps per category |
| **Pay-yourself-first / reverse / anti-budget** | Set aside savings (+ invest/give) OFF THE TOP, spend the rest freely with no line-item tracking. Start 1–5% if tight, scale to 10–20% | People who reliably overspend "leftover" savings; dislike tracking; value automation | No spend visibility; can mask living beyond means; weak for aggressive debt payoff | LOW — very flexible spend side |
| **Dave Ramsey 7 Baby Steps** (sequential) | 1) $1k starter EF; 2) pay all non-mortgage debt via **snowball** (smallest balance first); 3) 3–6 mo expenses EF; 4) invest 15% for retirement; 5) kids' college; 6) pay off home; 7) build wealth & give. Pairs w/ zero-based monthly budget | People in debt needing motivation, structure, clear order of operations; behavior-focused | Snowball mathematically suboptimal vs **avalanche** (ignores interest rate); anti-credit dogmatic; $1k starter thin in 2026; delays investing during long payoffs | VERY HIGH (prescribed order, little customization) |
| **Barefoot Investor buckets** (Scott Pape, AU) | BLOW 60% (essentials; sub-split Daily, Splurge ~10%, Smile ~10%, Fire Extinguisher ~20% debt) / MOJO 20% (emergency, start ~$2k) / GROW 20% (low-fee super/index) | Anyone wanting a named-account system that bakes in both fun and discipline | AU-centric (super, specific banks); 60% blow tight for low earners; more setup than a simple rule | MODERATE (named buckets, %s adjustable) |
| **Kakeibo** (Hani Motoko, Japan, 1904) | Mindful hand-written ledger; 4 questions (income? save? spent? improve?). Categories: Needs, Wants, **Culture** (books/music/education), Unexpected. Monthly reflection is core | Reflective/mindful people; emotional/impulse spenders; pairs with journaling | Manual/time-consuming; no prescribed allocations (less actionable); feels slow in a digital age | LOW on numbers, HIGH on the tracking/reflection ritual |
| **Ramit Sethi Conscious Spending Plan** (*IWTYTBR*) | Fixed Costs 50–60% / Investments 10% / Savings 5–10% / Guilt-Free Spending 20–35%. "Spend extravagantly on what you love, cut mercilessly on what you don't"; automate everything | Higher-discretionary earners; people who want permission to spend on what they value while automating wealth | Ranges need self-calibration; 10% investing + guilt-free assumes income headroom low earners lack; less prescriptive | LOW–MODERATE (ranges + automation, flexible spend) |

---

## 3. Matching Variables — How to Pick a Model for a Person

The single biggest matching variable is **whether essential costs already exceed the model's "needs" allowance.** Beyond that, seven variables map a person to a model. An auto-recommender quiz over these is the strongest product translation of this research.

| Variable | Signal | Steer toward | Steer away from |
|---|---|---|---|
| **(a) Income level** | Low income | Flexed needs shares (60/20/20, 70/20/10) or a small automated pay-yourself-first % | 50/30/20, 80/20's 20% floor (savings targets become fantasy) |
| **(b) Debt load** | High / high-interest debt | Sequential debt-first (Ramsey baby steps; **avalanche** if math-driven) | Pure savings-percentage rules |
| **(c) Income stability** | Irregular / variable (gig, seller) | Zero-based/YNAB ("budget money you already have"), envelopes | Rigid monthly % assuming steady inflow |
| **(d) Dependents** | More dependents inflate "needs" | Bigger essentials bucket + buffer emphasis (Mojo/EF) | 50% needs cap |
| **(e) Goal type** | Wealth-building | Pay-yourself-first / 80-20 / Conscious Spending | — |
| | Debt payoff | Ramsey / snowball | — |
| | Awareness / behavior change | Envelopes / Kakeibo | — |
| | Big one-off goal | Zero-based / named buckets | — |
| **(f) Discipline / effort tolerance** | Low | Automated low-touch (80/20, pay-yourself-first, Conscious Spending) | Zero-based daily reconciliation |
| | High (wants control) | Zero-based, envelopes, Kakeibo | — |
| **(g) Psychology** | Overspender | Hard caps (envelopes) **or** built-in fun money (Barefoot Splurge, Ramit guilt-free) | — |
| | Reflective | Kakeibo | — |

---

## 4. The Malaysian Localization Layer

A Malaysian budget cannot just swap `$`→`RM` on a Western model. Near-mandatory, structurally-fixed commitments consume most of a low/median wage **before discretionary money exists.** The model must compute a protected **commitments tier first**, smooth annual lumps into monthly accruals, and only then apply any proportional split to the remainder.

### 4.1 Fixed-commitment levers (computed FIRST, before any split)

| Lever | Real figures (current 2025/2026) | Modeling rule |
|---|---|---|
| **EPF / KWSP** | Employee 11% (under 60; 5.5% at 60+), deducted **pre-paycheck**. Employer 13% (≤RM5,000) / 12% (>RM5,000). Restructured 11 May 2024 into 3 accounts: 75% Akaun Persaraan (locked) / 15% Akaun Sejahtera (housing, education, medical, age-50) / 10% Akaun Fleksibel (withdraw anytime, min RM50) | Budget **take-home (net of EPF)**, not gross. Decide: deducted commitment vs informational "forced savings" counted toward savings rate vs both |
| **EPF Basic Savings target** | Long-standing RM240,000 by 55 (≈RM1,000/mo × 20 yrs); rising to **RM390,000 by 60** (steps: RM290k by 2030, RM340k by 2027). Only ~36% of active members hit RM240k (Oct 2024). EPF ~10-yr avg ~5.9% p.a. | Anchor the default savings/retirement goal to these RM figures, not US/AU defaults |
| **PTPTN repayment** | Starts 12 mo after study ends regardless of employment; ujrah ~1%. Recommended 5–8% of gross. **SG-PTPTN salary-deduction** auto-deducts + 10% discount; 15% off lump-sum settlement. From 2026: overseas-travel curbs for 5+ yr non-payers earning >RM6,000/mo. Older rule: ~2% deduction kicks in above ~RM2,000/mo | Flag SG-PTPTN as **already-deducted** to avoid double-counting; ask for actual monthly instalment (simplest, most accurate) |
| **Zakat (Muslims)** | Zakat pendapatan fixed **2.5%**. Gross method: 2.5% of annual income (e.g. RM57k/yr → RM1,425/yr ≈ RM118.75/mo). Net method: 2.5% on surplus after EPF, basic living, dependants. Triggered above **nisab** (85g gold value, updated ~twice/yr, varies by state). Near-100% income-tax rebate | **Opt-in toggle**, not assumed. Ship simple Gross 2.5% default; per-state nisab/allowance tables are a maintenance burden |
| **Transport (petrol + toll)** | **BUDI95** (from 30 Sep 2025): RON95 fixed RM1.99/litre for eligible citizens, ≤300 L/mo, cars + motorcycles equal on fuel. Gap driven by **consumption** (cars burn far more) + **tolls** (motorcycles pay ~½ Class-1 car rate; monthly pass from ~RM75) | Let user pick **vehicle type** (car / motorcycle / public transport) and scale the transport commitment |
| **Rent / room** | Often **40–50%** of income in Klang Valley. Whole 1-bed ~RM1,500 (outside centre) to ~RM2,400 (city centre); room/shared far cheaper (why room-sharing dominates for low earners) | Largest single commitment; do not fold into a generic "needs" cap |

### 4.2 Sinking funds — annual lumps smoothed to monthly accruals

Lumpy annual outflows wreck a flat monthly budget unless accrued. Let the user enter **annual amount + due month**; Echo divides by 12 and tracks a building reserve.

- **Road tax** + **vehicle insurance / takaful** renewal (annual)
- **Life / medical takaful** premiums (carry tax reliefs: life RM3,000, EPF RM4,000, education/medical insurance raised to RM4,000 in Budget 2025, lifestyle RM2,500)
- **Festive** spend: Raya / CNY / Deepavali — duit raya / angpau, balik kampung travel, food

### 4.3 Malaysia-specific savings vehicles (model as named goals, not generic)

- **ASB / ASNB** unit trusts (ASB FY2025 distribution 5.75 sen/unit; ~5%+ p.a., low-risk, withdraw anytime; ~11.4M unitholders)
- **Tabung Haji** (Hajj savings, religiously motivated)
- **EPF top-up**

EPF, ASB and Tabung Haji are the three instruments whose yearly dividend announcements Malaysians actually track.

### 4.4 Income bands — DOSM Household Income Survey 2024 (released Oct 2025)

> **NOTE: these are HOUSEHOLD, not individual, figures.**

| Band | Monthly household income |
|---|---|
| **B40** | up to RM5,249 |
| **M40** | RM5,250 – RM11,819 |
| **T20** | RM11,820+ |
| National **mean** | RM9,155 |
| National **median** | RM7,017 |
| **T15** (Budget 2025) | ~RM13,000+ (varies by state; KL T15 ~RM19,005) |
| **Minimum wage** (2025) | RM1,700/mo |

### 4.5 Belanjawanku 2024/2025 — the credible local reference budget

EPF + UM Social Wellbeing Research Centre, released 12–13 Dec 2024. Use as default category seeds + sanity benchmark for a single Klang-Valley renter.

| Belanjawanku profile | Monthly |
|---|---|
| Single adult, KV, **public transport** | **RM1,970** |
| Single adult, KV, **with a car** | **~RM2,800** (car adds ~RM800/mo) |
| Family with one child | ~RM6,420 |

Categories: housing, food, transport, utilities, healthcare, personal care, social participation, discretionary, annual expenses, savings.

**Illustrative category shape** (directional — from the earlier 2019 single/public-transport ~RM1,870 split; exact 2024/25 per-category amounts not in indexed sources, confirm from EPF PDF before hard-coding):

| Category | ~RM/mo |
|---|---|
| Food | 550 |
| Housing | 300 |
| Savings | 250 |
| Transport | 200 |
| Social participation | 150 |
| Discretionary | 130 |
| Utilities | 100 |
| Annual expenses (sinking) | 90 |
| Personal care | 70 |
| Healthcare | 30 |

> **Single-renter KL reality (2025):** a whole 1-bed (~RM1,500–2,400) + utilities/internet (~RM230) is **well above** the RM1,970 "modest" figure — which is why room-sharing dominates among low earners.

### 4.6 SST — background context only, not a deducted line

Consumption tax, affects prices of wants/services (6–8%), **not** income. Expanded 1 Jul 2025 (most newly-scoped services 8%; F&B/telco/parking/logistics stay 6%). From 1 Jan 2026: rental/leasing service tax cut 8%→6%, MSME exemption threshold raised to RM1.5M. Daily essentials untaxed. Treat as inflationary pressure already embedded in recorded prices — never a line Echo deducts.

### 4.7 The 50/30/20 misfit is documented locally

EPF's own guide and RinggitPlus both advise budgeting on take-home **after EPF** and treating PTPTN salary-deduction as already-committed. On a low Malaysian wage, needs run 60–70%+, so the 50% cap is unattainable and induces guilt. (The wealthwisdom.my "Malaysian version" article could not be fetched directly in this env, but the conceptual claim — EPF + PTPTN + petrol/toll + room rent eat almost everything on ~RM1,000, leaving near-zero discretionary — is corroborated by EPF / RinggitPlus / press.com.my.)

**Do NOT enforce the 50% needs cap.** Show the real ratio without red/alarm framing (honor MEMORY: calm earthy tones, no red, casual gen-z BM copy — *jom, dah*). Treat the discretionary split as advisory on the **post-commitments remainder**.

---

## 5. Competitive Scan — Onboarding & the AI-Tailoring Gap

The PFM market splits into two camps on model selection: **one opinionated method as product identity** vs **let the user choose / stay vague.** AI today is used almost entirely for the boring middle (auto-categorization, recurring-bill detection, history-based starting budgets) and conversational nudges — **never** to pick + localize + continuously re-balance a famous model.

| App | Model stance | Onboarding into the budget | AI role | Notable |
|---|---|---|---|---|
| **YNAB** | One method, no choice (zero-based) | 4 Rules; high-friction by design | None for method | ~60% abandon budgets in 3 mo; loses people to learning curve + $109/yr; strong committed-user behavior change |
| **EveryDollar** (Ramsey) | One method (zero-based, income−exp=0) | Hook: avg **$3,015** "budget margin" found in first 15 min; rebuild **every** month | Light | Method-first |
| **Monarch Money** | **Multi-model leader** — Flex vs Category, **switch anytime** | ~30 min; Flex = "one-number budget that sticks" (Fixed / Non-monthly recurring / Flexible) | **Smart Goals** (Mar 2026) auto-suggests + adjusts savings targets monthly — closest to adaptive, but **goals-only** | Choose-and-switch is best-validated retention pattern |
| **Copilot Money** | Category budgets + optional Rollovers | Bank-link; AI learns categories | Categorization (manual work gone after 2–3 wks) | "Adaptive" = categorization + rollover, not model re-selection; iOS-centric |
| **PocketGuard** | Proprietary "In My Pocket" | Auto-builds: income − bills − goals − spend | ML pattern analysis, alerts at 50% category usage | Single safe-to-spend hero number |
| **Goodbudget** | One method (digital envelopes), no bank sync | Create envelopes, allocate each paycheck | None | Great for impulse-control + couples |
| **Rocket Money** | Budgeting is **secondary** | Free tier caps custom budgets at 2 categories | AI = automation of saving (Smart Savings autopilot) + sub-cancel/negotiate | "Hate budgeting? You'll love Rocket Money" |
| **Cleo** | Chat-first AI money coach (closest UX cousin to Echo) | Auto-creates budget from patterns; NL queries | Sarcastic/motivational nudges; **July 2025**: "first AI money coach that speaks, thinks and remembers" (persistent memory) | Validates conversational-personalization thesis; does **not** pick/localize/re-balance a named model |
| **Quicken Simplifi** | One proprietary plan, marketed "adaptive" | AI builds plan from income + bills, adjusts "as life changes" | Plan generation | Adaptive ≠ choice of famous models |

### The re-balancing weakness (industry-wide)

Re-balancing today is one of: **MANUAL** move-money (YNAB, Lunch Money — current period only); **CRUDE** auto-rollover (Actual Budget pulls overspend from next month; Copilot rollovers); or **GOAL-only** adaptation (Monarch Smart Goals). **Nobody continuously re-optimizes the WHOLE model against real-spend drift.**

### Onboarding-into-method patterns observed

- **(a)** method IS the product, no choice (YNAB, EveryDollar, Goodbudget, PocketGuard)
- **(b)** pick 1 of 2 + switch anytime (Monarch Flex/Category)
- **(c)** auto-build then let user tweak (PocketGuard, Simplifi, Cleo)
- **(d)** personality/style **quizzes** (Ally, Netspend, BuzzFeed, credit unions) — but these are marketing lead-magnets, **NOT wired into the live budget engine**

### Malaysian / SEA landscape

Thin and mostly **not** budgeting-method apps: Money Lover (generic tracker + budgets), Wally (360 view), Money Coach (smart per-category budgets). StashAway / Wahed are robo-**investing** (Wahed = Shariah-compliant), not budgeting. **No local app picks/localizes a famous budget model or handles RM-specific, irregular-income, or Islamic (zakat, no-riba, halal) budgeting context.** US apps dominate but are US-bank-link-centric and culturally generic — a real localization opening.

### Where Echo wins (the unoccupied trifecta)

An AI that **(1) PICKS** a famous model from the user's real wallet/transaction history + income regularity, **(2) LOCALIZES** it — RM amounts, Malaysian categories (makan, kopi, Grab, petrol, Raya spikes), irregular gig/seller income, optional Islamic layer (zakat line, halal/no-riba framing), Malay gen-z tone — and **(3) CONTINUOUSLY RE-BALANCES** the whole model monthly against drift ("your 30% wants is really running at 41% — want me to shift the model or your habits?"). Re-balancing must be **propose-then-confirm**, honoring Echo's existing receipt/undo contract (show before/after, user accepts; never silently move money). Localization is the defensible moat vs US-bank-link-dependent incumbents.

---

## 6. Recommended Shortlist for Potraces

Treat famous models as **interchangeable presets** Echo can recommend, swap, and blend — never a single dogma. Make a low-effort **Flex / one-number** option the default on-ramp (Monarch-validated). Each preset applies to the **post-commitments remainder**, after the Malaysian commitments tier (§4) is reserved.

| # | Model | One-line rationale for Potraces |
|---|---|---|
| 1 | **Pay-yourself-first / 80-20** | One number, fully automatable, guarantees a savings floor with zero per-transaction tracking; lowest-friction on-ramp; % scales 1–5% → 20% as the user grows. Maps to an "auto-set-aside" feature. |
| 2 | **Flexed 60/20/20 or 70/20/10** (NOT 50/30/20) | For low/mid income, essentials exceed 50%, so 50/30/20's savings target is demoralizing. A 60/20/20 (or 70/20/10 with an explicit 10% debt lane) gives essentials an honest share — same 3-bucket simplicity, far higher completion. |
| 3 | **Digital envelope / category-cap** | Tangible per-category hard limits directly target the overspending common at lower incomes; digitizing removes cash-handling drawbacks; pairs with the existing transaction/notes flow ("remaining" indicators). |
| 4 | **Simplified Ramsey-style step ladder** | When there's debt and no buffer, an **order** of operations (tiny starter EF → attack debt → 3–6 mo buffer → invest) beats any ratio, because ratios assume a surplus that doesn't exist yet. Snowball early wins suit the app's goals ladder; localize amounts to RM, offer avalanche for the math-minded. |
| 5 | **Kakeibo reflective layer** (differentiator) | Not its manual ledger — adopt its **4 questions + month-end reflection** as a lightweight review prompt, plus its "Culture/growth" category. Fits an app already built on notes/AI + mindfulness; builds awareness for emotional spenders; overlays on top of whichever numeric model the user picks. |
| 6 | **Zero-based / YNAB** (advanced + irregular-income lane) | Opt-in **expert** mode, never the beginner default (high effort, ~60% abandon). BUT it is the right pick specifically for **irregular gig/seller income** ("spend last month's money") — common in business mode. |

### The single default Echo should recommend

For a **typical low-mid income Malaysian renter**: a **flexed 60/20/20 layered on a protected commitments tier**, fronted by a **pay-yourself-first auto-set-aside** for the savings slice.

- Reserve the Malaysian commitments tier first (EPF take-home basis; rent/room; transport by vehicle type; PTPTN if applicable; zakat if opted in; sinking-fund accruals).
- Of the remainder, target **~60% needs / 20% savings / 20% wants** — but **show the real ratio honestly** (needs may exceed 60%) without guilt/red framing.
- Automate the savings 20% as a pay-yourself-first set-aside so it happens regardless of discretionary discipline.

**Explicitly avoid making 50/30/20 the default** (offer it as a selectable preset only — research consistently flags it unfeasible for this audience). Treat **zero-based/YNAB as advanced**, surfaced specifically when Echo detects irregular income.

---

## 7. Open Questions (before building)

**Models / product:**
- Actual income/essentials profile of users (median take-home, rent-to-income, share with high-interest debt) — determines whether 60/20/20 vs 70/20/10 vs a custom flexed split is the default.
- Share of users with **irregular income** (gig/seller) — if large, zero-based/envelope "spend last month's money" logic may outweigh any fixed % rule.
- **Pick vs auto-recommend:** explicit user choice (Monarch-style) or Echo auto-pick from a quiz on the 7 matching variables, with a visible "why this model" + one-tap switch? (Auto-pick with override is the likely answer.)
- **Re-balancing cadence:** silent suggestions, weekly check-ins, or month-end review? Tune against Cleo's nudge frequency vs YNAB's daily-chore fatigue.
- **Data density:** with manual + voice + QR capture (no full bank-link), is there enough history for confident auto-pick + re-balance? May need a minimum-data threshold.

**Potraces integration:**
- How the budget interacts with existing concepts (wallets, debts, goals, savings, the *kept / came in / went out* language) — avoid duplicate/conflicting allocations between the budget "savings" bucket and the Goals feature, or the "debt" lane and the Debts/Splits screens.
- Where the budget lives in the personal-mode ladder (onboarding → wallet → transactions → notes/AI → budget → goals); flow-logic skill defines budget as downstream of transactions/notes — confirm dependencies first.

**Malaysia data / config:**
- Exact per-category RM breakdown of the **Belanjawanku 2024/2025** single-adult RM1,970 figure (only 2019 split + headline totals were retrievable) — confirm from the official EPF PDF before hard-coding seed defaults.
- PTPTN: ask for the user's actual monthly instalment (simplest/most accurate) vs estimating from loan size + scheme (ujrah 1% vs conventional 3%, fixed-instalment vs SG-PTPTN)?
- Zakat: ship a simple **Gross 2.5%** default vs maintain per-state nisab/allowance tables (twice-yearly nisab updates = maintenance burden)?
- **EPF treatment:** deducted commitment, informational "forced savings" counted toward savings rate, or both? Changes whether the user's savings % looks healthy.
- Clean rule to avoid **double-counting** salary-deducted items (PTPTN SG-PTPTN, employer zakat deduction, EPF) when the user enters take-home (already removed) vs gross (not removed).
- Localized RM-denominated benchmarks (emergency-fund targets, EPF/retirement equivalents to Ramsey's 15% / Barefoot's super) instead of US/AU defaults.

**Cultural / sensitivity:**
- Islamic/Shariah layer (zakat, halal framing): default-on for MY users, opt-in toggle, or detected? Sensitive — explicit product/cultural decision, not an assumption. (Research leans **opt-in toggle**, defaulting off where it doesn't apply.)
