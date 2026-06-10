# Budget Screen Design Research — Reference Brief

> Purpose: a concrete, reference-backed design brief for Potraces' **budget screen** (categories, money-left, spending pace). Studied real, beloved apps — not generic templates — to help a designer produce *crafted* output, not "AI-generated" filler.
>
> **Potraces constraints (designer MUST respect):** Malaysian, RM currency, Manglish context. Palette = warm off-white bg, **olive** accent, **bronze**, **gold** — calm/earthy. **NO red. NO bright green.** Tone calm, never scolding. Must work in **dark mode** (CALM_DARK). Lowercase labels in seller mode.

---

## Part A — Per-app findings

### Copilot Money (the design benchmark)
Built by ex-Apple designers; widely cited as the most polished finance app. Concrete moves:
- **Spending breakdown = animated donut**, not a static pie. Tapping a slice ("Dining Out") *animates the chart open* to reveal subcategories and the individual transactions inside — the chart is the navigation, not a decoration.
- **Budget categories use horizontal progress bars + clear color-coding** for at-a-glance "where am I vs my budget."
- **Animated budget *dials*** and a Face-ID success animation create a premium "alive" feel — motion is the differentiator, not the layout.
- **Empty states are CTAs**, never blank (e.g. recurring screen with no data shows "add items" guidance). Contextual tooltips onboard features gradually instead of dumping everything at once.
- Lesson: clarity + smooth motion beats spreadsheet density. Numbers are big and legible; chrome is minimal.
- Sources: screensdesign.com showcase; 9to5Mac review; Money with Katie review; Medium UX audit (see links).

### Monzo (best for "left to spend" + personality)
- **"Left to Spend" hero number** = balance − upcoming scheduled payments − committed budgets. It answers the only question users actually have: *how much can I spend right now without breaking something.*
- **Summary dial** literally races money-remaining against *time-until-payday* — it's a **pace** device, not just a total. Below the dial, a **green "you could spend X today and stay on track"** daily-allowance line. (We'll swap green → olive/gold.)
- **Trends** upgraded the single dial to an **interactive graph against a goal line** — shows trajectory, not just a snapshot.
- **Magic moments** (their term): confetti on "Get Paid Early," a frost animation when you freeze a card, custom illustration style (illustrator Ola Dobrzyńska) for movement/energy. These are *details that make you stop and smile* — designed deliberately, sparingly.
- Sources: monzo.com/blog (magic moments, Trends), Monzo Help (Summary dial, Left to Spend), Creative Bloq.

### Monarch Money
- **Visual progress bars per category**, dashboard budget widget, fully **customizable category emojis + ordering** (personalization = ownership).
- **Rollover categories**: leftover carries to next month; a small **"cycle" icon** marks rollover-on. Great for irregular Malaysian spend (groceries, makan, festive). Settings appear on hover/gear per category — progressive disclosure.
- Caveat: a public teardown flagged Monarch's dashboard for **density / 7 design flaws** — proof that even an $850M app can over-pack a screen. Don't copy the clutter.
- Sources: monarch.com/features/budgeting; Monarch Help (rollovers, dashboard); LinkedIn teardown.

### YNAB
- **"To Be Budgeted" hero** across the top = money with no job yet. Philosophy: assign every ringgit a job *before* spending.
- **Color = state**: green = available, orange = underfunded, red = overspent. Useful *model* but the literal palette is exactly what Potraces forbids — we map state to **olive (good) / gold (watch) / bronze (over)** instead of green/orange/red.
- Lesson worth keeping: a single, prominent "unassigned money" number gives the screen a **focal point and a job to do.**

### Cleo (personality / emotional)
- Thesis: *"The future of finance is not spreadsheets, it's personality."* Conversational, "sassy big-sister" voice. **15 comedy writers on payroll** generate response datasets that fine-tune the AI tone.
- Personality walks a line: non-judgmental friend who still flags bad habits. Users stay because it feels like a companion, not software.
- For Potraces: we want the *warmth and human voice* (Manglish), but **dialed to calm, never snark/roast** — closer to a supportive kakak than Cleo's clap-back mode.
- Sources: Inc. (comedy writers), Cleo tone-of-voice talk, Penny Hoarder review.

### Emma
- **Segmented donut** across Current / Savings / Investments; **dynamic donut for budget progress**; computes a **daily allowance** for disciplined spending. Strong, customizable categories. Reinforces that **daily-allowance framing** is a recurring best-in-class pattern.

### Rocket Money / Plum / Snoop / PocketGuard (daily-allowance cluster)
- The 2026 standard for *daily* budget apps: **turn income − bills into one clear daily "safe to spend" number**, make logging fast. **Daily framing — not just monthly totals — is what separates these apps.** PocketGuard's whole pitch is one safe-to-spend figure.

### Industry / emotional-design sources
- Calm budget design: **"use calm, neutral tones; avoid harsh colors that signal alarm unless necessary"**; "a budgeting app has to calm the mind"; accent colors highlight but should never overwhelm. Directly validates Potraces' no-red stance.
- **Reward good behavior**: visual celebrations + milestones create positive emotion around saving; streaks/badges boost retention (Monzo, Step cited). Keep ours gentle (a quiet glow / small note, not a casino).
- AI personalization 2026: dashboards **reorder modules by behavior** — surface the category a user checks daily first.

---

## Part B — Extracted patterns (the 7 asks)

### 1. Hero / "money left" treatment
The best apps do **not** lead with a category list. They lead with ONE emotionally-loaded answer to *"how much can I spend?"*:
- **Big number, one focal point.** Monzo "Left to Spend," YNAB "To Be Budgeted," Emma/PocketGuard daily allowance. Set in a large, friendly numeric weight; everything else is visibly smaller.
- **What makes it feel *alive*:** it's **pace-aware**, not static. Monzo's device = *money remaining vs time-to-payday*. The feeling comes from the number being **in motion / contextual to today** ("RM23 left to spend today"), and from a **dial/arc that fills**, plus **smooth animation** on load (Copilot dials).
- **Framing that lands for Malaysians:** a **daily allowance** ("RM23 boleh today") is more tangible than an abstract monthly remainder. Offer monthly *and* a today number.
- For Potraces: hero = a **filling arc or ring in olive** with the spend-today number centered; a quiet sub-line "on track till payday." Animate the arc filling on entry. Dark mode: arc glows softly on CALM_DARK surface.

### 2. Category list anatomy (avoid the grey ledger)
Best-in-class row (Copilot / Monarch / Emma): **icon + name on the left, a slim progress bar, the number(s) on the right.** Specifics:
- **Icon treatment:** rounded soft-tinted chip (category-colored, low-saturation), often a **custom emoji** the user picked (Monarch) — ownership kills the generic feel.
- **Progress indicator:** thin **rounded-cap progress bar** tinted to the category, OR a mini ring. The bar is the visual rhythm down the list — varied fill levels make it feel alive vs uniform grey rows.
- **Number placement:** emphasize **"left"** (e.g. **"RM40 left"** big) over "RM60 of RM100 spent" (small/secondary). People budget against what *remains*.
- **Avoid the ledger look:** vary emphasis (don't weight every row equally), use category color in the bar/chip, group with light section headers, lots of breathing room. Tap a row to **expand into its transactions** (Copilot's animated drill-down).

### 3. Color & emotion (warm, calm, no red, no bright green)
Map *state* to Potraces tokens (semantic, not literal traffic-light):
- **On track / good** → **olive** (your positive). NOT bright green.
- **Getting close / watch** → **gold** (#B2780A) — a gentle "ease up," not alarm.
- **Over budget** → **bronze** (#8B7355), a warm earthy "noted," plus calm copy ("a bit over — that's okay"). **Never red, never a shamed glow.**
- **Reward good behavior:** when a category ends under budget, a small **olive checkmark / soft glow / one warm line** ("you kept RM18 here 🌿"). Use the language rule: *kept*, not *saved/profit*.
- Principle (sourced): accents highlight, never overwhelm; neutral calm base, color used to *guide a decision*, not decorate.

### 4. Typography & hierarchy
- **One dominant number** (the hero). Category "left" amounts are the second tier. Spent/budget totals and labels are third-tier, smaller and muted.
- Fintech-2026 norm: **bold typography + soft gradients + neutral palette + minimal borders + soft shadows.** Numbers in a clean, slightly condensed/tabular face so columns align.
- Hierarchy via **size + weight + color-mute**, not boxes/borders. Borderless cards on the warm bg; in dark mode use C.surface + 1px C.border so cards float (per memory rule).

### 5. Personality / delight devices
- **Voice:** warm Manglish, calm-supportive (kakak, not Cleo-roast). e.g. "RM23 left for today — boleh relax." Over budget: "Bit over on makan this month — no stress, next month we adjust."
- **Micro-interactions:** arc fills on load; bar springs when a transaction lands in its category; gentle haptic when crossing into "watch."
- **Celebratory (gentle):** soft olive glow / a single leaf or coin motif when a category lands under budget or a streak continues — Monzo "magic moment" energy, dialed *way* down (no confetti storm).
- **Empty state = CTA + warmth** (Copilot): no budgets yet → friendly illustration + "set your first one, senang je."

### 6. "AI-generated / generic" tells to AVOID
From design-critique sources — concrete tells of generic/AI output:
- The **"AI purple problem"**: indigo/violet gradients + generic patterns. (We're earthy olive/bronze — already differentiated; don't drift to default fintech purple/blue.)
- **Evenly-weighted everything**: every card/row the same size and weight → no focal point. Crafted screens have ONE hero and a clear second tier.
- **Generic chips / default shadows / default rounded cards** with no category identity.
- **Decorative color with no meaning** (color that doesn't encode state).
- **Output that "loosely fits"** but ignores context — e.g. ignoring RM/Manglish, ignoring the no-red rule, ignoring daily-allowance framing Malaysians actually use.
- Counter (sourced): *"simplicity takes more work — every element earned its place."* Cut, don't pad.

### 7. Generic vs Crafted checklist
| ❌ Generic (AI-tell) | ✅ Crafted (do this) |
|---|---|
| Category list is the first thing; no hero | One big **money-left / spend-today** hero with a filling arc |
| Static pie/donut for decoration | Donut/arc that **animates + drills into transactions** |
| Every row & card same weight | Clear 3-tier hierarchy; emphasize "left" |
| Traffic-light red/green | olive=good, gold=watch, bronze=over; **no red, no bright green** |
| Grey uniform progress bars | Category-tinted rounded bars + user emoji/icon chips |
| Monthly total only | **Daily allowance** ("RM__ boleh today") + monthly |
| Default indigo/blue gradient | Warm earthy olive/bronze/gold, calm neutral base |
| Blank empty state | CTA + warm Manglish line |
| Scolding over-budget alarm | Calm, non-judgmental copy + bronze |
| Numbers misaligned, decorative | Tabular numerics, aligned, one dominant figure |

---

## Part C — 3–4 concrete direction options

### Direction 1 — "The Olive Dial" (ref: Monzo Summary + Copilot motion) ★ recommended
- **Hero:** large filling **arc/ring in olive** at top, center number = **"RM23 — boleh today"** (daily allowance), sub-line "on track till payday." Arc animates fill on load (Copilot). Tap → expands to the monthly "left to spend" graph (Monzo Trends interactive line vs goal).
- **Below:** category rows, each a tinted rounded progress bar, user-chosen emoji chip, "RM__ left" emphasized.
- **Over budget:** that segment goes bronze + calm line; no red.
- Why: nails the #1 user question (spend-now), pace-aware = *alive*, motion = premium, fully within palette.

### Direction 2 — "Envelopes, earthy" (ref: YNAB + Monarch rollovers)
- **Hero:** "To Spend" pool number (unassigned ringgit) styled big.
- **Categories as soft envelope cards** with rollover **cycle icon** (Monarch) for festive/irregular makan. State color = olive/gold/bronze.
- Best if Potraces wants intentional *assign-every-ringgit* budgeting. More structured, slightly more cognitive load.

### Direction 3 — "Companion" (ref: Cleo + Monzo magic moments)
- **Hero is a short warm sentence + number** from an AI kakak: "You've got RM340 left this month, RM23/day. Makan's running a bit warm — nak I watch it?" with the arc as support.
- Category list secondary. Leans on Potraces' existing AI/notes layer.
- Highest personality/delight; risk = needs disciplined calm tone (avoid Cleo snark) and good copy.

### Direction 4 — "Donut drill-down" (ref: Copilot breakdown)
- **Hero = animated donut** of category spend (olive/bronze/gold/sky/mauve from the semantic palette). Tap a slice → animates open into subcategories + transactions.
- List lives *inside* the chart interaction. Most visual; best when users want to *understand* where money went more than pace-to-payday.

**Recommendation:** **Direction 1 (The Olive Dial)** — combines Monzo's proven "spend-today, pace-aware" hero (the question users actually ask) with Copilot's animated-dial polish, expresses cleanly in olive/gold/bronze with no red, supports dark-mode glow, and reads naturally in Manglish ("boleh today"). Borrow Monarch's per-category emoji + rollover and Copilot's tap-to-expand transactions as enhancements.

---

## Sources
- Copilot: https://screensdesign.com/showcase/copilot-track-budget-money · https://9to5mac.com/2024/10/31/copilot-money-review-ipad-cash-flow-tags/ · https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/ · https://medium.com/design-bootcamp/ux-ui-audit-4-improvements-for-the-copilot-app-57e9f8e4ac20
- Monzo: https://monzo.com/blog/2022/11/04/how-we-design-magic-moments-at-monzo · https://monzo.com/help/budgeting-overdrafts-savings/how-does-the-summary-dial-work · https://monzo.com/help/budgeting-overdrafts-savings/what-is-left-to-spend · https://monzo.com/blog/trends · https://www.creativebloq.com/web-design/ux-ui/monzos-brilliant-ui-design-is-a-delight-to-use
- Monarch: https://www.monarch.com/features/budgeting · https://help.monarch.com/hc/en-us/articles/4411119762196-Rollover-Budgets · https://www.linkedin.com/posts/simonmccade_monarch-is-a-850m-company-but-i-still-activity-7420440763248930816-Bh4R
- YNAB: https://medium.com/@mattholla/you-need-a-budget-thats-usable-28df46decc51 · https://springfinancial.ca/blog/save-invest/beginners-guide-to-budgeting-with-ynab/
- Cleo: https://www.inc.com/ben-sherry/why-this-company-hires-comedy-writers-to-craft-an-edgy-ai-budget-assistant/91194888 · https://www.youtube.com/watch?v=ZvCAnkMrfcc · https://www.thepennyhoarder.com/budgeting/cleo-app-review/
- Emma: https://emma-app.com/features/tracking/budgeting · https://orbitmoney.io/compare/emma-app-review
- Daily allowance / safe-to-spend: https://www.spendaily.com/articles/best-daily-budget-app · https://www.rocketmoney.com/learn/personal-finance/best-budgeting-apps
- Patterns / emotion / generic-vs-crafted: https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/ · https://www.onething.design/post/budget-app-design · https://www.eleken.co/blog-posts/budget-app-design · https://michalmalewicz.medium.com/did-ai-just-kill-ui-design-d818efbf440e · https://www.theuxda.com/blog/rise-dopamine-banking-how-fintechs-and-neobanks-are-redefining-customer-experience · https://www.onething.design/post/top-10-fintech-ux-design-practices-2026
