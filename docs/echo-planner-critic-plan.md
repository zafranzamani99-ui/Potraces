---
name: echo-planner-critic-plan
description: A deterministic budgeting brain (budgetModels.ts + myEconomics.ts) wrapped in a PLANNER→CRITIC loop. The planner proposes a tailored plan ON TOP of the engine (never inventing ringgit); a critic challenges it against a library of real-world failure modes + the user's own reality; the critic's knowledge is refreshed by an OFFLINE, human-reviewed insight pipeline distilled from compliant sources only. Calm tone, no red, banned-word vocabulary, money math deterministic & auditable.
metadata:
  type: architecture-plan
  status: draft
  date: 2026-06-19
  depends-on: budget-models-echo-spec.md, commitments-number-one-roadmap, memory/legal-regulatory-risk.md
---

# Echo Planner ↔ Critic + the Lived-Experience Knowledge Base

> Language guard for this whole doc: every user-facing string follows CALM vocabulary — **kept / came in / went out / set aside / left to spend / breathing room**. NEVER "budget" (banned word, `moneyChat.ts:63`), never profit/loss/revenue/ROI/inventory, never red/alarm. "budget" appears below ONLY in existing internal type/file names (`budgetModels.ts`, `Budget`, `add_budget`). The engine numbers are deterministic and auditable; the LLM only reasons, ranks, and explains.

---

## 1. Vision in plain language

Today Echo guesses with one model call and emits chips. A real budgeting brain needs two voices, not one.

- **The PLANNER** is the optimist. It takes the user's real numbers — what came in, the protected Malaysian commitments (EPF, PTPTN, zakat, rent, petrol), the trailing spend — runs them through the already-built deterministic engine (`src/services/budgetModels.ts`), and proposes a tailored plan: "set aside RM400, makan RM500, transport RM300, RM350 breathing room." Every ringgit in that plan is computed by the engine, never invented by a model.
- **The CRITIC** is the friend who's seen people fall. It reads the proposed plan and the user's own reality and asks the hard questions: *the plan leaves no cushion and they carry card debt; the plan sets makan at RM500 but they've run RM700 three months running; three BNPL plans are already stacking under "shopping".* It checks the plan against a **library of named, real-world failure modes** — distilled from how young Malaysians actually go broke (AKPK, BNM, MDI, PTPTN, KRI research) — and against the user's own tracked data. It scores the plan, and where something is genuinely off it returns a concrete revision and a **gentle nudge** (calm, no red, no banned words).
- **The lived-experience knowledge base** is the critic's memory of how things go wrong. It is NOT a live feed and NOT scraped from anyone's social posts. It is a **human-curated, citation-backed anti-pattern library** (`src/constants/echoKnowledge.ts`) refreshed offline from compliant sources only (regulator stats, published research, the app's own opt-in user data). Raw insight is **distilled** into checkable thresholds and calm nudges before it ever reaches the critic — never fed raw or live.

The loop is small and honest: planner proposes, critic reviews against the anti-pattern library + the user's reality, the planner revises once, and the best-scoring plan ships as tappable confirmation chips. If anything fails — critic errors, offline, timeout — the deterministic engine plan ships as-is, because it was already a complete, valid plan before the critic ever ran.

This is **Step 3 of the Commitments #1 roadmap** ("the Moat"). It builds directly on `budget-models-echo-spec.md`, adding the missing intelligence: a plan you can trust because a second voice already challenged it against how people really lose the thread.

---

## 2. The agent loop

This is an **Evaluator-Optimizer / Reflect-Refine loop**, not autonomous agents. It is bounded, fast, and the engine — never the LLM — owns every number.

### 2.1 What stays DETERMINISTIC vs what the LLM does

| Concern | Owner | Why |
|---|---|---|
| Every ringgit amount (set-aside, per-category, breathing room, totals) | **Engine** (`budgetModels.ts` → `tailorPlan`, `recommendModel`, `scoreModels`) | Numbers must reconcile and be testable. The `PERSONAS` battery (`budgetModels.ts:441`) is the regression set. |
| Model selection + ranking | **Engine** (`scoreModels`, `recommendModel`) | A knowledge-encoded scoring matrix, already tuned against 12 personas. |
| Cost-of-living sanity (`realityCheck`) | **Engine** (`myEconomics.ts:125`) | Dated, sourced, auditable. |
| Anti-pattern threshold checks (does plan leave a cushion? debt-to-income multiple? BNPL stack count?) | **Deterministic critic** (pure functions over engine output + store data) | A trigger that fires on a number must itself be a number, not a model's opinion. |
| Compliance / honesty enforcement (no "should", banned words, every "lined up" has an `[ACTION]`) | **Deterministic critic** (regex + structural checks) | Hard guardrails, not negotiable, must never depend on a model's mood. |
| Narrate the plan, rank near-ties, explain *why* a failure mode matters in this person's words, phrase the gentle nudge | **LLM** (reason / rank / explain only) | The one thing a model is genuinely better at. It never produces a ringgit figure — engine figures are passed through as **strings**. |

The LLM is the **LLM-Modulo** pattern: the deterministic critic is the **sound verifier that gates** whether the LLM critic is even consulted. If the deterministic checks already fail hard (arithmetic doesn't reconcile, a survival floor is breached), we don't spend an LLM call — we revise or ship the engine plan.

### 2.2 The loop, step by step

```
0. INPUT          engine builds TailorInput from store data (income cadence,
                  commitments tier, trailing-avg per category).  ← deterministic

1. PLAN (planner) engine.tailorPlan(input) → TailoredPlan.       ← deterministic, NO LLM
                  This is already a complete, valid, shippable plan.

2. HARD GATE      deterministic arithmetic validation:
                  - allocations + setAside ≤ breathingRoom (no over-commit)
                  - no negative allocations
                  - protectedTier reserved FIRST
                  - survival floor intact (realityCheck not breached silently)
                  FAIL → engine re-derives (clamp), never asks the LLM. ← deterministic

3. REVIEW (critic) deterministic anti-pattern pass over (plan + user reality):
                  runs every failure-mode check in echoKnowledge.ts against the
                  plan and the user's tracked data → a list of grounded objections,
                  each {principle, evidence (a figure/quote), severity, suggested_revision}.
                  Objections with NO evidence pointer are DROPPED.        ← deterministic

4. (optional) LLM critic — ONLY for plan-shaped replies, ONLY if flagged:
                  restricted decision space KEEP / REVISE / ESCALATE.
                  Strict tool-use JSON; engine figures passed as strings.
                  Hallucinated objections are filtered by the same evidence rule. ← LLM, metered

5. DECIDE         ACCEPT  → score ≥ threshold, ship.
                  REVISE  → planner re-runs the engine with the critic's concrete
                            revision applied (e.g. raise the set-aside floor, cap
                            makan to trailing actual). At most ONE revision pass.
                  ESCALATE→ surface as a calm note to the user, ship best-so-far.

6. STOP           ship the HIGHEST-scoring plan as tappable chips (tailor_plan).
                  Never ship a revision that scored LOWER than its predecessor.
```

### 2.3 Bounded iteration (the rules that keep it safe)

Research is unambiguous: Reflexion / Self-Refine gains **plateau by round 2-3** and refinement can make outputs **worse** (reward hacking, ignored feedback). LLM critics **hallucinate objections** (more nitpicks and false-positives than humans). So:

- **Hard-cap at 1 critic round by default, 2 maximum. Never 3+.**
- **Always keep the highest-scoring plan.** Never ship a revision that scored lower than what it replaced.
- **The critic can never block.** Escape conditions:
  - At/above threshold → accept and ship.
  - Revision didn't improve → stop, ship the previous best.
  - Cap reached → ship best-so-far, unresolved objections become **soft notes** (calm observations, never alarms).
  - Critic failure / timeout / offline → ship the **engine deterministic plan** as a fully valid fallback (it was complete at step 1).
- **Fast inline.** The inline critic reads only **cheap pre-materialized context** (the plan + already-computed store aggregates) and returns within an interactive latency budget. All expensive learning (spending-norm modeling, baseline enrichment, memory writes) runs **async after the plan ships** and feeds only the *next* run (§5). This is the dual-process / async-memory split.
- **Restricted decision space + evidence-required.** The LLM critic may only return KEEP / REVISE / ESCALATE, and every objection must carry an `evidence` quote or figure or it is dropped before it can trigger a revision.

### 2.4 Metering (a real constraint — decide before building)

A planner→LLM-critic turn is **two** Gemini calls, but `premiumStore.incrementAiCalls()` currently fires **once per send** (`moneyChat.ts:932, 1002`) against the free cap of **100/mo** (`constants/premium.ts:9`, `premiumStore.ts:97 canUseAI`). Default posture: **the deterministic critic is free** (no model call), so the common path stays a single metered call. The optional LLM critic is a **feature-flagged, explicitly-metered escalation** — if used it must reconcile with `incrementAiCalls` so a two-pass turn doesn't silently burn 2 of 100 or mis-meter. Open question §9.

---

## 3. The insight / research pipeline

The critic is only as good as its knowledge base. That knowledge must come from somewhere honest. This section is deliberately blunt about what we will and will not do, because the temptation (scrape Threads/FB/X for strangers' money-confessions) is exactly the part that is illegal, non-compliant, and indefensible.

### 3.1 What we will NOT do — and why

**We will NOT scrape or continuously harvest Threads, Facebook, X/Twitter, or any platform for strangers' financial posts. Full stop.** This is removed from the roadmap; we do not launder it through the official APIs (they neither permit nor technically enable it).

- **ToS — all three ban it.** X's Developer Agreement + 2023+ ToS explicitly prohibit scraping/crawling without prior written consent AND ban using X content to train any model. Meta's Automated Data Collection Terms forbid collecting data via automated means without permission; Threads inherits Meta's anti-automation rules.
- **The APIs don't unlock the use.** X's API is pay-per-use with no free tier (Pro $5k/mo, Enterprise ~$42k/mo) and its policy bars bulk profiling + AI-training on the data. Meta's Graph/Threads APIs expose only a developer's OWN authorized content + narrow public search — not bulk third-party profiling. CrowdTangle is dead; its successor (Meta Content Library) is gated to vetted academic/non-profit researchers via ICPSR at U. Michigan — a for-profit app cannot get in.
- **"Publicly available" is not a legal shield.** hiQ v. LinkedIn: LinkedIn WON its breach-of-contract claim (ToS anti-scraping is enforceable); hiQ settled with a permanent injunction + $500k. The Dutch DPA fined Clearview AI €30.5M for scraping public photos — public availability is no defense for processing identifiable personal data. Financial confessions are the same fact pattern.
- **PDPA 2024 makes it worse.** The Amendment Act (gazetted 17 Oct 2024, phased from 1 Jan 2025) requires granular/withdrawable consent, extends direct liability to processors (Apr 2025), adds breach notification + DPO, and Cross-Border Transfer Guidelines (2025) govern data sent overseas (e.g., to a US LLM). Processing identifiable strangers' financial posts, transferred cross-border to an AI provider, with no consent and no lawful basis is squarely non-compliant. (Ties to `memory/legal-regulatory-risk.md`.)
- **Ethics.** Covertly profiling identifiable people's financial distress for someone else's commercial gain, with no consent and no benefit to the subject, fails basic research-ethics and PDPA fairness. We don't build it.

### 3.2 The compliant sources we WILL use

| Source class | Concrete examples | What it gives the critic | Personal-data risk |
|---|---|---|---|
| **Regulator / official datasets** | BNM Financial Stability Reviews; data.gov.my household-debt dashboard; AKPK credit-counselling insights; DOSM HIS; MDI insolvency stats; PTPTN repayment data | Population-level "how Malaysians go broke" thresholds (DSR >60%, sub-RM3k delinquency risk, BNPL totals) | **None** — public, aggregate |
| **Published research / surveys** | RinggitPlus RMFLS (8 yrs); Khazanah Research Institute "Savings in Crisis"; academic gig-economy studies | Behavioural priors, savings-shortfall curves | **None** — published aggregate |
| **Creator / news content** | Personal-finance creators, news stories — **link out + attribute**, never ingest into a model/DB; fair-quote only with permission/license | Editorial framing, lived narrative | **None if attributed, not ingested** |
| **The app's OWN opt-in user data** (the strongest play) | Echo transactions, debts/splits, wallet, budgets — with clear opt-in, minimised/on-device processing, PDPA-compliant cross-border handling | Real first-party "how *our* users go broke" signals — a legal, ethical data moat | **Consented first-party** — governed per §6 |
| **Human curation** | A maintained library distilling all of the above, each entry citation-backed | The auditable, editorially-controlled bridge between raw insight and the critic | **None** |

If platform-derived social-trend insight is ever genuinely wanted, the only legitimate route is a **research partnership** with a vetted academic/non-profit holder of Meta Content Library access sharing **aggregate, de-identified** findings under agreement — never raw posts pulled by the app. Treat as "maybe-later research collaboration," not a product feature.

### 3.3 How raw insight becomes the anti-pattern library (distillation, not a live feed)

```
 compliant raw sources (BNM FSR, AKPK, RMFLS, KRI, MDI, opt-in user aggregates)
        │
        ▼  (1) HUMAN CURATION  — a person reads the source, extracts the failure mode + the figure
        │
        ▼  (2) DISTILL          — failure mode → {trigger threshold, severity, calm nudge copy, citation}
        │
        ▼  (3) REVIEW           — compliance + copy read (no "should", no red, no banned words, framed as observation)
        │
        ▼  (4) VERSION + COMMIT — written into src/constants/echoKnowledge.ts (pure data, citation per entry)
        │
        ▼  (5) CRITIC reads ONLY the distilled, committed library — NEVER the raw source, NEVER a live feed
```

The critic never sees a raw BNM PDF, a news article, or a live API. It sees a **frozen, human-reviewed, citation-backed constant**. The raw→distilled step is **offline and out-of-band** from the chat path. Refresh cadence is quarterly / on-release (BNM FSR, annual RMFLS) — manual, human-reviewed (§5).

---

## 4. The anti-pattern library (seed table)

A pure constants module — **`src/constants/echoKnowledge.ts`** — modeled exactly on `myEconomics.ts`: pure data, zero app/RN imports, importable by `budgetModels.ts` and the critic, surfaced into the prompt the same way `ACTION_PROMPT`/`learnedHints`/`pendingBlock` already are at `moneyChat.ts:870`. Each entry: a named failure mode, the deterministic trigger/threshold the critic checks against the plan + the user's data, the gentle calm nudge it raises, and a source citation.

> Thresholds marked **(inferred)** are not given directly by the literature and MUST be calibrated/sourced before hard-coding (§9). All nudge copy is illustrative EN; final copy goes through `useT()` in BOTH `en.ts` + `ms.ts`, casual-BM per memory.

| # | Failure mode | Trigger / threshold the critic checks | Gentle nudge (calm, no red, no "should") | Source |
|---|---|---|---|---|
| 1 | **unsecured-debt-multiple** | total unsecured debt (cards + personal loans + BNPL) > ~6× monthly came-in = note; ~17× = the AKPK distressed average | "what's owed is around {n}× a month's came-in. just showing where the line sits — the plan can lean a bit harder on setting aside if you want." | AKPK 2024 (RM36k avg vs RM2,062 median 20-29 income) |
| 2 | **minimum-payment-revolver** | a card balance carried month-to-month + payment near the minimum, at assumed 15-18% p.a. | "paying the minimum on RM{bal} stretches it ~6 years and ~RM1,900 in interest per RM5k. just the maths of it." | RinggitPlus / MoneyBuddy 2024-26 (illustrative arithmetic) |
| 3 | **bnpl-stacking** | 3+ concurrent active BNPL plans, OR BNPL instalments > ~10-15% of came-in **(inferred)** | "there are {n} instalment plans running at once — they're easy to lose track of. want them grouped so the plan sees them?" | BNM FSR; ~40% of BNPL users under 30; 12% miss payments |
| 4 | **wants-funded-by-credit** | a discretionary 'want' (shopping/fashion/gadgets/dining/travel) charged to credit/BNPL while cash buffer ≤ 0 | "that {item} went on credit while the buffer's at zero. no judgement — just flagging the timing." | AKPK 2024 (38% bought things not needed); lifestyle = 21% of youth-debt drivers |
| 5 | **no-buffer-irregular-income** | income cadence = irregular/gig AND emergency buffer < ~1 month of went-out | "came-in lands at odd times and there's under a month set aside — that's the combo that usually trips people. the plan can build a small cushion first." | BNM FSR (unstable income = top late-payment reason); SOCSO 2025 |
| 6 | **ptptn-ignored** | employed + a PTPTN balance present + zero repayment tracked/budgeted | "PTPTN's sitting there with nothing going to it yet. left long enough it can become a salary deduction (2-15%). want a line for it in the plan?" | PTPTN Dec-2024 (~400k never started; salary-deduction enforcement exists) |
| 7 | **festive-credit-spike** | a festive-month spend spike >X% above baseline **(inferred)** financed by new credit/BNPL rather than a pre-saved sinking fund | "Raya/duit-raya tends to land as one big lump. setting aside ~RM60/mo quietly means it won't ambush you in March." | "broke after Raya" pattern; BNPL-for-Raya warnings |
| 8 | **debt-outpacing-savings** | month-over-month total debt rises while savings/net worth is flat or falling | "what's owed crept up this month while what's set aside held flat. just naming the direction, not the size." | KRI 2024 (90% of under-30 EPF off the RM240k target; sub-RM3k borrow ~7× annual income) |
| 9 | **thin-income-overcommitted** | fixed commitments (rent + all debt service incl. PTPTN) > ~40-50% of take-home on a sub-RM3,000 income **(inferred ratio)** | "the locked-in stuff already takes ~{pct}% before fun money. the plan keeps the rest honest about that." | ~70% of grads under RM2,000; stagnant wages (Economic Outlook 2024) |
| 10 | **lifestyle-inflation-ratchet** | recurring discretionary spend rose after an income bump WITHOUT a matching rise in set-aside rate | "came-in went up and so did the everyday spend — set-aside stayed the same. just an observation, your call what to do with it." | Gen Z spend trends; 'flex culture' (softer/causal — nudge only, never alarm) |
| 11 | **plan-leaves-no-cushion** *(plan-internal)* | the proposed plan's set-aside slice rounds to ~0 while no buffer exists yet | "this split spends everything that's left — there's room to peel off a small slice first if you'd rather." | engine + KRI savings-shortfall |
| 12 | **plan-vs-actual-undershoot** *(plan-internal)* | a proposed category allocation is materially below the user's trailing actual (e.g. makan RM500 vs RM700 run-rate) | "the plan pencils makan at RM{plan} but the last few months ran ~RM{actual}. want it set to what's real, or kept tight on purpose?" | engine trailing-avg vs allocation |

**Enforcement posture (mandatory):** frame on the **individual's cashflow, not the economy** — BNM calls BNPL system-risk "contained" (0.2% of household debt), so the danger is to *this* user, never a moralising lecture. Tone follows project rules: no red, neutral went-out/came-in language, calm framing, never "you should". The critic does **not** over-index on the moralising "overspending" narrative (the literature conflates discretionary with shock-driven distress — §9).

---

## 5. How it gets smarter over time

The learning ladder — static priors → per-user adaptation → feedback signals → population calibration — maps directly onto the existing stack, and the knowledge base is refreshed **offline, human-reviewed**, never live in the chat path.

| Rung | What it is | Where it lives | When it refreshes |
|---|---|---|---|
| **1. Static priors** | The engine's scoring weights (`budgetModels.ts` `scoreOne`) + the seed anti-pattern thresholds (`echoKnowledge.ts`) + `myEconomics.ts` figures | Pure constants, shipped in the bundle | On app release; the `PERSONAS` battery (`budgetModels.ts:441`) is the regression gate |
| **2. Per-user adaptation** | The critic checks against *this* user's trailing averages, buffer, debt mix, cadence — the same plan triggers different objections for different people | Computed at run-time from store data + the precomputed trailing-avg helper | Every plan run (deterministic, cheap) |
| **3. Feedback signals** | Did the user accept/revise/ignore the nudge? Did they tap the suggested revision? Logged as objections-raised vs objections-upheld | Async after the plan ships → `learningStore` (precedent: `getPromptHints`, `moneyChat.ts:860`) + `EchoMemoryEntry` (`playbookStore.ts:11`) | Async, post-ship; feeds only the **next** run |
| **4. Population calibration** | Aggregate, opt-in, de-identified "how *our* users go broke" signals re-tune the **(inferred)** thresholds (e.g. the real BNPL-share-of-income at which trouble starts) | Offline analysis → distilled → a new **versioned** `echoKnowledge.ts` commit | **Offline, human-reviewed**, quarterly / on regulator-release; never auto-written into the live library |

**Where/when the critic's knowledge base is refreshed:** the anti-pattern library is **never** updated live or by the model. New insight (rung 4) goes through the §3.3 distillation pipeline — human curation → distill → compliance+copy review → version → commit. The critic only ever reads a frozen, committed, citation-backed library. Drift is monitored: log objections-raised vs upheld to detect reward-hacking, with a **kill-switch** to engine-only plans if the critic misbehaves (§9).

The dual-process split is load-bearing here: the **inline critic stays fast and dumb** (reads pre-materialized context only); **all learning is slow and async** and never blocks the interactive turn.

---

## 6. Data governance / PDPA / advice-compliance stance

Everything below ties to the existing `ADVICE_GUARD` / no-"should" rule and `memory/legal-regulatory-risk.md`.

- **Observation + options, never "you should".** The hard rule already lives in the system prompt (`moneyChat.ts:62`: NEVER "you should / you need to / I recommend / consider / try to"). A *plan* edges from observation toward advice (spec §11.5, `budget-models-echo-spec.md:211`). Mitigation: the plan is **a set of options the owner taps to confirm** (chips), never an auto-applied recommendation. The **critic hard-blocks** any planner/LLM output phrased as a recommendation — regex for "you should / you need to / I recommend / consider / try to" + the banned-words list (`moneyChat.ts:62-63`) is part of the deterministic critic, not optional.
- **Confirmation honesty.** Every "lined up / dah sedia / tap to confirm" must have a matching `[ACTION]` block (`moneyChat.ts:55-56`). The deterministic critic verifies this structurally before chips render — no orphan confirmation phrases.
- **Statutory math is "common rates", not tax advice.** EPF/PTPTN/zakat figures come from `myEconomics.ts` (dated, sourced) and are framed as "based on common rates", never as tax/financial advice. Rates are configurable defaults (staleness is a known risk, §9).
- **Engine numbers are deterministic and auditable.** No ringgit figure is ever produced by the LLM; engine figures pass through as strings. Any amount can be traced to `tailorPlan` + its inputs.
- **PDPA-2024 check on every new data source.** For the opt-in user-data path (rung 4): document lawful basis, explicit/withdrawable consent, minimised/on-device processing where possible, cross-border handling for any AI step, processor agreements, retention, breach-readiness — **before** shipping. Keep the design "aggregate-and-published OR first-party-and-consented" so the check stays trivial. Confirm whether financial-status data is "sensitive" vs merely "protected" under the amended PDPA (affects strictness — §9).
- **No third-party personal data, ever.** The anti-pattern library is built from aggregate/published figures + consented first-party data only. No identifiable stranger's data enters the system at any point.

---

## 7. Integration points in the real stack

All grounded in the verified files. The loop lives in `src/services`; `MoneyChat.tsx` stays a thin renderer.

| Concern | Concrete anchor |
|---|---|
| **Planner = the un-wired engine** | `src/services/budgetModels.ts` — `recommendModel` (`:310`), `scoreModels` (`:275`), `tailorPlan` (`:381`) → `TailoredPlan` (`:73-91`). Imports only `myEconomics.ts` (`:21`); zero importers in app code today. `PERSONAS` battery `:441` = regression set. |
| **Engine data** | `src/constants/myEconomics.ts` — `MY_ECONOMICS`, `realityCheck` (`:125`), `estimateFromGross`. Pure data, no imports. |
| **Anti-pattern library (NEW)** | `src/constants/echoKnowledge.ts` — pure constants, modeled on `myEconomics.ts`; imported by `budgetModels.ts` + the critic; surfaced into the prompt at `moneyChat.ts:870` alongside `ACTION_PROMPT`/`learnedHints`/`pendingBlock`. |
| **Planner pre-pass injection** | `moneyChat.ts` `_buildChatBody` (`:856-899`); inject the `TailoredPlan` as a NEW prompt layer at `:870` — same mechanism as the existing layers. The LLM narrates + emits chips, never re-derives numbers. |
| **Scope routing** | `classifyScope` (`moneyChat.ts:336`) — add a `tailoring` flag so the planner pre-pass + trailing-avg context only load for plan/budget/affordability intents (don't widen every prompt). |
| **Trailing-avg helper (NEW, required)** | `buildFinancialContext` (`moneyChat.ts:410`) computes this-month + last-month only. `tailorPlan` needs `trailingAvgByCategory` (3-6mo). Build a shared util feeding `TailorInput`; also satisfies spec §7 (`:132`). **Blocking dependency** — planner can't run accurately without it. |
| **Critic (deterministic) placement** | Run on the FINAL reply text (streaming complicates per-token critique). Best home: a new validator in `chatActions.ts` (reusable) invoked between `parseActions` (`MoneyChat.tsx:1191`) and `addPendingActions` (`:1216`), OR pre-display in `moneyChat.ts` before `_displayTextFromPartial` (`:952`). Enforces compliance/honesty (`moneyChat.ts:62-63, 55-56`) + plan arithmetic sanity. |
| **Apply surface (reuse, don't reinvent)** | `tailor_plan` composite action → add to `ACTION_PROMPT` (`chatActions.ts:1265`) + `executeAction` switch (`chatActions.ts:435`); returns an extended `ActionReceipt` (`chatActions.ts:97-109`) with `budgetIds?` / `playbookId?` for honest batch undo. Coexist with the Save-All / `DESTRUCTIVE_ACTIONS` grouping (`chatActions.ts:119`). |
| **Pending chips / confirmation contract** | `aiInsightsStore.pendingActions` (`:36`), `addPendingActions` (`:190`), `lastSave` (`:40`) for undo. Untouched — the plan applies through the existing chip→receipt→undo path. |
| **Persistence targets** | Monthly-category plan → `Budget` via `personalStore.addBudget`; income-envelope plan → `Playbook` via `playbookStore.createPlaybook` (`:28`). Plan memory → `EchoMemoryEntry` + `saveEchoSession` (`playbookStore.ts:11,25,70`). |
| **Offline insight pipeline (NEW, off the hot path)** | `src/services/insightPipeline.ts` run from `App.tsx` foreground/startup (where `syncAll` already runs); writes to existing `aiInsightsStore` slots — `spendingMirrorText` (`:75`), `reportNarratives` (`:26`) — + `EchoMemoryEntry`. Gated by `canUseAI`; respects `budgetEchoHidden`. |
| **Premium gating / metering** | `premiumStore.canUseAI()` (`:97`, free cap 100/mo `constants/premium.ts:9`); `incrementAiCalls()` fires once per send (`moneyChat.ts:932, 1002`). Deterministic critic = free; optional LLM critic = metered, feature-flagged (§2.4). |
| **Learned-knowledge-into-prompt precedent** | `learningStore.getPromptHints` (`moneyChat.ts:860`) — the pattern for how a derived layer enters the prompt; the anti-pattern KB follows it. |

**Where the loop physically lives:** all in `src/services` (`moneyChat.ts` orchestration seam + new `planner.ts` / `critic.ts` modules). `MoneyChat.tsx` only calls `sendChatMessageStream` and renders chips — no planner/critic logic in the UI.

---

## 8. Phasing

### Phase 1 — the safe, UN-WIRED planner + critic brain (testable in isolation)

Exactly like `budgetModels.ts` is today: imports nothing app-level, imported by nothing, deleting it leaves the app byte-for-byte unchanged.

1. **`src/constants/echoKnowledge.ts`** — the seed anti-pattern library (§4 table) as pure data + citations. No imports. ✓ verify: pure constants, zero app imports.
2. **`src/services/critic.ts`** — deterministic critic: pure functions `(plan, userRealitySnapshot) → Objection[]`, each `{principle, evidence, severity, suggested_revision}`; the compliance/honesty regex checks; the arithmetic hard-gate. Imports only `budgetModels.ts` + `echoKnowledge.ts`. ✓ verify: a `CRITIC_PERSONAS` battery (mirror `PERSONAS`) asserting each failure mode fires on a crafted plan and stays silent on a clean one.
3. **`src/services/planner.ts`** (thin) — wraps `tailorPlan` + applies a critic revision deterministically (raise set-aside floor, cap allocation to trailing actual). The 1-round bounded loop, fully deterministic, no LLM. ✓ verify: revision never lowers score; always keeps best; never exceeds 1 round.
4. **Regression harness** — extend the persona idea: every persona's plan must pass the critic with zero hard objections OR the objection must be the *intended* one. Run in isolation (no app, no network, no stores).

**Phase 1 ships nothing user-facing.** It's a brain on a bench, exactly like the engine today.

### Phase 2 — wire the deterministic loop into Echo (gated, single-pass)

- Build the **trailing-avg helper** (blocking dependency, §7).
- Add the `tailoring` scope flag + planner pre-pass injection in `_buildChatBody`.
- Run the **deterministic critic** between `parseActions` and `addPendingActions` (no LLM, no extra metering).
- Add the `tailor_plan` composite action + extended `ActionReceipt` + batch undo.
- Feature-flagged; respects `budgetEchoHidden` + `canUseAI`.

### Phase 3 — optional LLM critic + offline insight pipeline (each separately gated by the user)

- LLM critic as a metered, feature-flagged escalation for plan-shaped replies only (resolve §2.4 metering first).
- `insightPipeline.ts` off the hot path, writing to existing slots.

### Explicitly DEFERRED until later, gated by the user

- **Anything that scrapes or touches a live external feed** — there is none in this plan; if ever proposed, it goes through §3.1/§6 and a user gate first.
- **The opt-in population-calibration data path** (rung 4) — needs the §6 PDPA check + explicit consent flow before any user data is aggregated.
- Step-ladder debt sequencing tied into the Debts store; real payday anchor; multi-month plan history (per `budget-models-echo-spec.md §10`).

---

## 9. Risks + open questions

**From the planner-critic loop:**
- **Scoring scale + threshold:** single composite score vs per-principle pass/fail? Per-principle is more auditable and harder to game — lean that way, confirm.
- **When does the critic run?** Every plan, or only when the engine flags ambiguity / near-equal model scores? Running always increases latency + hallucinated-objection risk.
- **Same model for planner + critic?** Same model raises reward-hacking risk; a separate (stronger) critic is defensible for a high-stakes financial decision but costs more. The deterministic critic sidesteps most of this.
- **Telemetry for a misbehaving critic + kill-switch threshold** to fall back to engine-only plans — define the objections-raised-vs-upheld drift metric.
- **Offline behaviour surfaced honestly:** an engine-only (no-critic) plan should be presented identically in tone but the system must know it wasn't AI-reviewed.

**From metering + context (verified):**
- **Two-pass metering** (§2.4): does an LLM-critic pass count as a 2nd call against the 100/mo cap, or stay single-pass deterministic? Decide before building.
- **Token budget:** planner plan + anti-pattern KB + trailing averages all add to the system prompt against `maxOutputTokens 4096` and the last-10-history window (`moneyChat.ts:875,894`). A token-budget audit is required so a large tailored plan doesn't truncate the reply (spec §11.4).
- **Atomic vs N chips:** one `tailor_plan` chip (clean batch undo, needs the extended `ActionReceipt`) vs N per-category chips (matches today's one-action-per-chip + Save-All). Spec leans atomic — verify coexistence with `DESTRUCTIVE_ACTIONS` Save-All grouping.
- **Trailing-avg helper is a blocking dependency** — build it first.

**From compliance + data:**
- **Plan-as-advice line:** does framing the plan as tappable options keep it safely on the observation side of `ADVICE_GUARD`? Needs a copy/compliance read (spec §11.5).
- **Is the consent flow + privacy policy explicit enough** about deriving aggregate failure-mode insights, and is any AI/LLM step in-country or cross-border (triggers PDPA-2024 Cross-Border Guidelines)? Privacy + data-flow review before rung-4.
- **Sensitive vs protected** classification of financial-status data under the amended PDPA — affects how strict first-party handling must be; worth a local-counsel confirmation.

**From the evidence base (calibration before hard-coding):**
- The **(inferred)** thresholds — safe debt-service-to-income ratio for MY youth (40-50%), harmful BNPL-share-of-income (10-15%), festive-spike % — are not given directly by the literature. Calibrate against opt-in first-party data (rung 4) before treating as hard alarms.
- **Causal weight of "flex culture" vs wage stagnation is contested** — the critic must not over-index on the moralising overspending narrative; keep #10/#4 as gentle nudges, never hard objections.
- **Shock-driven vs lifestyle-driven distress** — the data conflates them; the library should distinguish where possible so the critic doesn't lecture someone hit by a medical/family shock.
- **Refresh cadence + ownership** of the curated library (quarterly / on BNM FSR + annual RMFLS) — decide who owns it and how versioning works.
- **Post-CCA (Mar 2026) effect** on BNPL behaviour is unknown; mandatory affordability checks + credit-bureau reporting may move the `bnpl-stacking` threshold within a year — re-verify annually.
- **Statutory freshness:** EPF/PTPTN/zakat rates drift; keep them configurable defaults (`myEconomics.ts` is already stamped `asOf`).
