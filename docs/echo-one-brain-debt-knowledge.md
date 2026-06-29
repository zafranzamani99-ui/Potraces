# Echo One-Brain — Malaysian Debt-Instrument Knowledge

**Status:** plan only. New data file + updated knowledge. Wiring into chat deferred (safe, un-wired pattern).
**Owner:** Echo / money chat.
**Date:** 2026-06-19.

Two goals:

- **(A)** A complete Malaysian DEBT-INSTRUMENT catalog Echo must know — education loans, credit cards, BNPL, and lending apps.
- **(B)** A ONE-BRAIN design so the SAME knowledge powers both the budgeting feature and general Echo chat — one prompt seam, one knowledge source, one scope gate.

Hard rules carried from `echoKnowledge.ts` and `moneyChat.ts`: money math stays **deterministic**, **no red**, never **"you should"**, never the banned words (profit/loss/revenue/ROI/inventory/budget). Every nudge and copy example must read instantly to a 23-year-old Malaysian.

---

## 1. The instrument catalog

The catalog Echo must know. Each row is the real mechanic, plain English. `kind` matches the `myDebtInstruments.ts` type (see §3). "The trap" is what actually bites young users, framed as an observation, not a warning.

| Instrument | Provider | kind | Typical cost | Late fee | The real trap (plain) |
|---|---|---|---|---|---|
| **PTPTN** | PTPTN | `edu_loan` | 1% per year ujrah (a flat service charge, not compound interest) on the loan amount. Min monthly is about 5–8% of your pay. Balance is usually RM30k–80k for a degree, much more for medicine/overseas. | No cash "late fee" — but ignore it and PTPTN can deduct straight from your salary, and you can get CCRIS-blacklisted. | Most people think it's free or a grace forever. It's a real loan everyone repays. Pay it all off within 12 months of finishing and you owe **zero** ujrah (principal only). Leave it and from month 13 the ujrah kicks in, then salary deduction. |
| **MARA loan** | MARA | `convertible_loan` | Mostly written off if your CGPA is good — high marks can cut what you owe by up to ~90%, turning it into a near-scholarship. Fail or don't finish = repay the full amount. | Same as a loan once it's owed — repayment starts after studies. | Feels free because good grades shrink it. But it is a loan until the condition is met. Slip below the grade tier, or don't graduate, and a big chunk (or all of it) snaps back as real debt. |
| **JPA / "biasiswa"** | JPA (Public Service Dept) | `convertible_loan` | New model (from 1 Jun 2025): your final CGPA sets how much you repay — top grades repay only 5%, lower grades 10/15/20%, fail = 100%. Old 2016 model: serve the government for your bond years = 0%, private/abroad = repay 25–100%. | Break the bond and it's not a fee — it's the **whole amount as one lump sum**. | Everyone calls it "biasiswa" (scholarship) so it feels free. It's mostly a **convertible loan**. Break the bond, work abroad, or fail and you can owe the full principal at once — reported cases up to ~RM500k for overseas scholars. |
| **JPA full scholarship** | JPA | `scholarship` | RM0 to repay if you meet the terms (a real minority of awards, e.g. B40 dermasiswa). | None if terms are met. | Mistaking a convertible loan for this one. Only a true "biasiswa penuh" has nothing to repay — check which one you actually hold. |
| **Credit card** | Any bank (BNM rules) | `credit_card` | 15–18% per year if you carry a balance (15% if you always pay on time, up to 18% otherwise). Min payment = 5% of what you owe. | 1% of the balance, min RM10, capped at RM100. | Paying only the 5% minimum on RM5,000 takes about **6 years** and roughly **RM1,900 extra**. The moment you don't pay in full, the interest-free window is gone and charges hit the whole balance. |
| **Atome** | Atome | `bnpl` | 0% if you pay on time. Splits a purchase into 3 (sometimes 6/9/12) monthly bits. | ~RM23–30 per missed payment, plus the account freezes and a ~RM50 reactivation fee. | Tiny "3 payments" feels free, so it's easy to open many. Miss one and the flat fees + reactivation stack up fast. |
| **SPayLater (Shopee PayLater)** | Shopee | `bnpl` | 0% on the 1-month plan; longer plans ~1.5% per month. | Flat RM10, account frozen until you settle + RM10 to reactivate. | Built into checkout, so it's the default tap. Easy to forget it's a loan you owe next month. |
| **TikTok PayLater** | TikTok | `bnpl` | Credit line up to RM10,000, split over up to 12 months. | Flat per-miss fee, account frozen. | A RM10k line sitting inside an app you scroll for fun. Big limit + impulse buys = a balance that creeps up quietly. |
| **Grab PayLater** | Grab | `bnpl` | Pay-in-4 or instalments, 0% on time. | ~RM10 admin/reactivation per missed payment. | You already use Grab for food and rides, so it's the easy default — many small "later" buys add up across the month. |
| **Shopee SLoan** | Shopee | `lending_app` | A cash loan up to RM100,000 at ~18% per year, over 3/6/12 months. | Standard loan late charges. | Real cash, instant, from an app you shop in. Bigger and longer than BNPL — much more to repay if you take the max. |
| **TNG GOpinjam** | Touch 'n Go (via CIMB) | `lending_app` | RM100–RM10,000, fixed 8–36% per year (36% on the shortest, under-3-month loans). No processing fee, money lands instantly. | Standard loan late charges. | Disburses in seconds straight into the wallet you already spend from. Short, small, high-rate loans make it easy to re-borrow to cover the last one. |
| **Boost (PayFlex / loans)** | Boost | `lending_app` | Shariah-compliant. PayFlex splits into 3/6/9/12 months. Wakalah fee RM5 (under RM100) / RM10 (over). | Late charge ~1% per year, worked out daily. | Same instant-cash convenience inside an e-wallet — easy to treat as "free money" rather than something you owe back. |

**One thing to remember (the headline):** PTPTN is a real loan for nearly everyone. MARA and JPA *feel* free but are mostly **convertible loans** — free only if you keep your side (grades or government service). Miss that and the whole amount can come back as one lump sum. From **1 Mar 2026** the Consumer Credit Act means missed BNPL payments can also show up on your credit record (CTOS/CCRIS) and hurt future home/car loans.

**Numbers are dated and sourced.** Edu findings confirmed Oct–Nov 2025 (PTPTN ujrah + Budget 2026), JPA "PBU Akademik" launched 1 Jun 2025, MARA CGPA tiers 2025/26. Credit/BNPL current as of Jun 2026; CCA 2025 in force 1 Mar 2026. MARA exact percentages and Atome's exact late fee are marked `inferred` pending an official source.

---

## 2. Failure modes (new / updated)

These extend `FAILURE_MODES` in `echoKnowledge.ts`, now naming real instruments. Each has a **checkable trigger** (deterministic, from tracked data) and a **plain nudge**. Tone copies the existing entries: calm, no red, observation + option, never "you should". `{placeholders}` are filled by deterministic math, never by the model.

| id | severity | Checkable trigger | Plain nudge |
|---|---|---|---|
| `paylater-stacking` | caution | 2+ different BNPL providers (Atome / SPayLater / TikTok PayLater / Grab PayLater) with a live plan in the same month. | "there are {n} pay-later apps running at once — Atome, Shopee, Grab. easy to lose track. want them in one list so you see the monthly total?" |
| `lending-app-spiral` | serious | A new GOpinjam/SLoan/Boost loan opened while a previous one from the same app is still owed (re-borrow within ~30 days). | "looks like a new {app} loan came in before the last one was clear. just showing the pattern — the plan can put a line aside to break the loop." |
| `edu-loan-ignored` | caution | PTPTN balance present and RM0 has gone to it for 3+ months past graduation. | "nothing's going to PTPTN yet. left long enough it can turn into a salary deduction. clear it within 12 months of finishing and you skip the 1% charge — want a line for it?" |
| `scholarship-bond-breakage` | serious | A `convertible_loan` (JPA/MARA) marked "condition at risk" — bond not being served, or grades below the kept tier. | "this one's tagged as a maybe-loan. if the grade or service condition isn't met, the full amount can come due at once. want to set a little aside just in case?" |
| `card-revolver` | caution | Card balance carried 2+ months and payment each month is at/near the 5% minimum. | "paying near the minimum on the card stretches it for years — about RM1,900 extra per RM5k. just the maths. the plan can aim a bit higher if you want." |

Notes:
- `paylater-stacking` supersedes the generic `bnpl-stacking` entry by naming providers; keep the old id as an alias so nothing already referencing it breaks.
- `card-revolver` overlaps the existing `minimum-payment-revolver` — keep one, alias the other.
- `scholarship-bond-breakage` needs a per-instrument "condition" flag in `myDebtInstruments.ts` (on-track vs at-risk). When unknown, Echo asks rather than assumes — never auto-flag.

---

## 3. The ONE-BRAIN design

**The problem.** Today there are two disconnected brains:

- **Brain A — Echo chat (LIVE).** Built entirely in `src/services/moneyChat.ts`. `_buildChatBody` (line ~856) concatenates `buildSystemPrompt()` + `ACTION_PROMPT` + `learningStore.getPromptHints()` (line 860) + a pending-actions block + `buildFinancialContext()` into one `fullSystem` string (line 870) passed as Gemini `system_instruction`.
- **Brain B — structured budgeting (un-wired).** `budgetModels.ts` + `planner.ts` + `critic.ts`, consuming the knowledge constants `myEconomics.ts` and `echoKnowledge.ts`. These are "SAFE BY DESIGN: imported by nothing." Their Malaysian knowledge **never reaches the chat prompt** — so chat cannot reason about PTPTN/Atome/SLoan today.

**The fix (small, because the bridge already exists).** `learningStore.getPromptHints()` (learningStore.ts:170) is a pure function returning a prompt fragment (`\nUSER PREFERENCES (learned from corrections):\n...`, line 198) that `_buildChatBody` splices into `fullSystem` at line 870. Mirror that exactly.

### 3.1 One knowledge source

Chat reads the **same constants** the critic/engine read — no copy, no fork:

- `src/constants/myEconomics.ts` — EPF 11%, RON95 RM1.99/L, zakat 2.5%, PTPTN share-of-gross, Belanjawanku baselines, DOSM bands. Already `asOf` + `source` stamped.
- `src/constants/echoKnowledge.ts` — `FAILURE_MODES` + `THRESHOLDS` (the behavioral anti-pattern library).
- `src/constants/myDebtInstruments.ts` — **NET-NEW** (does not exist yet). The instrument catalog from §1 + the named failure modes from §2.

A single edit to a constant updates both the chat prompt and the deterministic critic — genuinely one brain.

### 3.2 `myDebtInstruments.ts` shape (match `echoKnowledge.ts` exactly)

Pure data, zero RN/app imports. Each instrument is a typed record stamped with `asOf` + `source` + optional `inferred`, with a calm, banned-word-safe `trap`/`nudge`. Plus one tiny pure formatter that renders a compact, no-red prompt fragment.

```
export type InstrumentKind =
  | 'edu_loan' | 'scholarship' | 'convertible_loan'
  | 'credit_card' | 'bnpl' | 'lending_app' | 'personal_loan';

export interface DebtInstrument {
  id: string;
  name: string;
  provider?: string;
  kind: InstrumentKind;
  typicalCost: string;   // plain English, e.g. "1% per year ujrah, min 5–8% of pay"
  lateFee?: string;
  trap: string;          // observation, no red, no "you should"
  note?: string;
  asOf: string;
  source: string;
  inferred?: boolean;    // MARA %, Atome late fee
}

export const DEBT_INSTRUMENTS: DebtInstrument[] = [ /* the §1 rows */ ];

// New named failure modes (§2) live here so they sit next to the instruments,
// reusing the FailureMode interface from echoKnowledge.ts.
export const INSTRUMENT_FAILURE_MODES: FailureMode[] = [ /* §2 rows */ ];

// Pure formatter — renders the scope-gated prompt fragment.
export function formatInstrumentHints(ids?: InstrumentKind[]): string { /* ... */ }
```

Same shape means the same file can later feed `critic.ts`'s deterministic checks AND the chat prompt.

### 3.3 One exporter, mirroring `getPromptHints`

Add a pure function in a new `src/services/echoKnowledgeContext.ts`:

```
export function buildKnowledgePromptHints(scope: ContextScope, userMessage: string): string
```

It imports the three constants files and returns a compact, scope-gated fragment (same `\n`-prefixed style as `getPromptHints`). Keep it pure (no RN/store imports) so it's testable like the `budgetModels` persona battery.

In `_buildChatBody`, splice it into `fullSystem` right after `learnedHints` (line 870):

```
const knowledgeHints = buildKnowledgePromptHints(scope, message); // NEW
const fullSystem =
  `${buildSystemPrompt(currency)}\n\n${ACTION_PROMPT}` +
  `${learnedHints}${knowledgeHints}${pendingBlock}` +
  `\n\nTHE USER'S FINANCIAL DATA:\n${context}`;
```

This keeps it ONE brain: one prompt assembly (`_buildChatBody`), one knowledge source (the constants), one scope gate.

### 3.4 One scope gate (mandatory, not cosmetic)

`geminiClient.ts` exposes `system_instruction` (GeminiRequestBody, line 104) but **no** `cachedContent`/cache field — so the knowledge rides inside **every** per-call `system_instruction`. An always-on dump would bloat all 100/mo free-cap calls. So gate it.

Extend the existing `ContextScope` type (`moneyChat.ts:311`) with a `myKnowledge` flag (plus finer sub-flags like `debtInstruments`). Set it inside `classifyScope` (line 336) when the message hits debt/loan/instrument/budget keywords. Then `buildKnowledgePromptHints` emits **only** the matching slices:

- **General / greeting** (the `m.length < 15` / "macam mana" `ALL_SCOPE` branch, line 341) → a short, broad overview (one or two lines: "PTPTN is a real loan; pay-later and app loans add up").
- **Targeted debt/budget/loan question** → the deep instrument detail for the matched kinds only.

Proposed keyword set (needs owner sign-off for Manglish/BM phrasing):
`ptptn|mara|jpa|biasiswa|atome|spaylater|shopee.*later|tiktok.*later|grab.*later|bnpl|ansuran|installment|sloan|gopinjam|boost|pinjam|loan|kad kredit|credit card|riba|takaful`

Echo can then answer **any** money question grounded in this knowledge — not just budgeting.

### 3.5 Metering (no extra cost)

The knowledge stays inside the **single existing chat call** (no separate critic round-trip), so `incrementAiCalls()` (moneyChat.ts ~932/1002) still fires once. We are **not** adding a second model call for grounding. Worth a quick `countTokens` spot-check on the deep slice before authoring the full library, since there's no context-caching to amortize it.

---

## 4. Plain-English copy rules

The old copy was too high-level. Every line must read instantly to a 23-year-old Malaysian. No jargon, no red, never "you should".

**Avoid → Use**

| Don't write | Write instead |
|---|---|
| discretionary | fun money / spare money |
| allocate | set aside / put toward |
| commitments tier | locked-in / what you owe |
| trailing (average) | the last few months |
| leverage | borrowing / using a loan |
| liability / outstanding | money you owe |
| disposable income | what's left |
| revolving balance | the bit you didn't pay off |
| amortising | paid off bit by bit |
| convertible loan (to the user) | a loan that can be written off if you keep your side |
| contingent liability | a maybe-loan |
| principal | the amount you borrowed |
| ujrah (alone) | the 1% yearly charge (ujrah) |

**Do:**
- Lead with the observation, then offer an option ("want a line for it?").
- Use ringgit and months, not ratios, when you can ("about 6 years, roughly RM1,900 extra").
- Name the real app (Atome, GOpinjam) so it's concrete.
- Keep the maths deterministic — the model never invents a number.

**Don't:**
- No "you should", "you need to", "be careful".
- No red / alarm framing. A maybe-loan is "just showing where the line sits", not a danger.
- No banned words: profit, loss, revenue, ROI, inventory, budget.
- Don't moralise ("stop overspending"). Frame on this person's cashflow.

---

## 5. Phasing

Keep the **safe, un-wired** pattern. Same discipline as `echoKnowledge.ts` / `myEconomics.ts` ("imported by nothing").

- **Phase 1 — data only (this plan).** Author `src/constants/myDebtInstruments.ts` (§1 catalog + §2 failure modes), pure data, dated + sourced + `inferred`-flagged, banned-word-safe. Add the new/aliased entries to `echoKnowledge.ts` `FAILURE_MODES`. **Imported by nothing.** Deleting it leaves the app byte-for-byte unchanged. No chat behavior changes.
- **Phase 2 — wire into chat (deferred).** Add `echoKnowledgeContext.ts` with `buildKnowledgePromptHints`, extend `ContextScope` + `classifyScope` with the `myKnowledge` gate, splice into `fullSystem` at moneyChat.ts:870. Run a `countTokens` check first. Ship behind the existing AI feature gate.
- **Phase 3 — share with the critic (when budgeting wires up).** `critic.ts` reads `INSTRUMENT_FAILURE_MODES` from the same file, so chat-prompt knowledge and critic checks can never drift.

**Before shipping any user-facing instrument copy:** one compliance/copy pass (per `memory/legal-regulatory-risk.md`) so naming Atome / GOpinjam / convertible loans stays factual, non-defamatory, and advice-free.

---

## Open questions
- MARA exact CGPA-to-repayment % and whether MARA charges its own 1% ujrah — cited figures are from finance blogs, not mara.gov.my. Keep `inferred: true`.
- Atome Malaysia exact 2026 late fee (RM23 vs RM30 conflict). Keep `inferred: true` until the official T&C confirms.
- Exact post-CCA late-fee caps and affordability thresholds — pending CCC subsidiary regulations (Jun–Dec 2026 transition).
- Final scope keyword set for `classifyScope` — needs owner sign-off on Manglish/BM phrasing.
- Token cost of the deep slice — `countTokens` spot-check before authoring the full library.
