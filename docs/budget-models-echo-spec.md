---
name: budget-models-echo-spec
description: Echo-tailored budgeting models — pick (or get recommended) a famous model, Echo tailors it to real income + commitments + spending, then continuously re-balances it as "went out" data arrives. Slots under the Commitments #1 roadmap.
metadata:
  type: feature-spec
  status: draft
  date: 2026-06-19
---

# Echo-Tailored Budget Models

> Language guard for this whole doc: every user-facing string follows the CALM vocabulary — **kept / came in / went out / set aside / left to spend / breathing room**. NEVER "budget" (banned word, `moneyChat.ts:63`), NEVER profit/loss/revenue/inventory, NEVER red. The word "budget" appears below ONLY in internal type/file names (`Budget`, `add_budget`, `BudgetPlanning.tsx`) that already exist in code — never in copy.

---

## 1. Vision (one paragraph)

Most budgeting apps hand you a museum of frameworks and make you do the math. Potraces does the opposite: Echo asks 3-4 questions, recommends **one** famous model with a one-line "why", and tailors that model to *your* real numbers — your came-in cadence, your protected Malaysian commitments (EPF, PTPTN, zakat, rent, petrol), and your actual trailing spend — so day one already fits your life, not a US household's. But the model is only a **starting line**. The product is the **tracking**: as real "went out" data lands, Echo runs a continuous **re-balance loop** — "you set RM500 for makan, you're at RM700 with 9 days left — pull from personal spend or stretch the target?" — and offers concrete moves as tappable confirmation chips. Nobody else picks a famous model *for* you, localizes it to Malaysian income reality, and then keeps it honest against reality month after month.

This feature is **Step 3 of the Commitments #1 roadmap** ("the Moat — safe-to-spend after commitments, anchored to income cadence"). It depends on the commitments trust loop (Step 2) being accurate, because **a tailored plan built on bad commitment data is poison.**

---

## 2. Where it lives (grounded in the IA findings)

No new tab, no new store-screen, no Onboarding detour. Three concrete surfaces, all already wired:

| Surface | Concrete location | Role |
|---|---|---|
| **Setup entry** | `src/screens/personal/BudgetPlanning.tsx` empty-state (the `EmptyState` at `BudgetPlanning.tsx:1907`/`:1981`, shown when `!hasBudgets`) gains a primary action **"let Echo tailor a plan"**. It opens a `FloatingModal` (choices, `maxWidth 520`) → `BottomSheet` (the Q&A flow). | First-run + "switch model later" entry |
| **Ongoing plan view** | `BudgetPlanning.tsx` itself — the existing `viewMode` segment (`BudgetPlanning.tsx:325`, `'budget' \| 'playbook'`) is where the tailored split renders. A monthly-category plan renders as the existing **budget** view (category rows); an income-envelope plan renders as the existing **playbook** view. Mirrored read-only on the Dashboard via the existing `BreathingRoom` card (`Dashboard.tsx:58,1067`). | The plan the user lives in daily |
| **Echo's nudges** | The **existing Echo FAB** already on `BudgetPlanning.tsx:2584-2659`, gated by the existing **`budgetEchoHidden`** setting (Settings toggle `echoOnBudgets`, `Settings.tsx:1314`). Re-balance nudges arrive as its greeting bubble + `EchoInlineChat` sheet (`BudgetPlanning.tsx:2662`). The actual *plan edits* are executed in the full action surface, **MoneyChat** (`RootNavigator.tsx:380`, `PersonalNavigator.tsx:84`). | Where "you're at RM700" appears |

**Why this split:** `EchoInlineChat` (`src/components/common/EchoInlineChat.tsx`) is **read-only Q&A — it does NOT parse or execute actions** (calls `sendChatMessage`, not the streaming/parse path). So the *nudge* (observation + a chip "open in Echo") can appear inline, but the *apply* (emitting `[ACTION]` blocks → pending chips → `executeAction`) must happen in MoneyChat, which already runs `parseActions` + `executeAction` (`MoneyChat.tsx:40,1543`). This honors the confirmation contract with zero new plumbing.

---

## 3. Setup flow (3-4 questions → one recommendation → tailored split)

Echo runs this as a short conversation, not a form. Simplicity-first: **never** show all models up front.

**Echo asks (one at a time — the `moneyChat.ts` "one thing at a time" rule):**

1. **Cadence** — "when does money usually come in — same day every month, or whenever?" (detects salaried vs irregular; Echo can pre-fill from trailing `type:'income'` transactions in `buildFinancialContext`).
2. **The big locked-in stuff** — "what's locked in every month before fun money? rent, PTPTN, EPF if it's not auto-cut, phone, that kind." (builds the **commitments tier** — reuses existing `Subscription`/commitment data from `personalStore`).
3. **One goal** — "anything you're trying to set aside for right now — or just want breathing room?" (maps to pay-yourself-first; reuses `Goal` from `personalStore`, `contributeToGoal`).
4. **(conditional) Debt pressure** — only if commitments include BNPL/credit: "any of these you're racing to clear?" (routes to a step-ladder model).

**Then Echo recommends ONE** (see §5 logic) with a one-line why:

> "you've got a steady payday and rent eats ~45% — i'd start you on **pay-yourself-first**: set aside one slice the day money lands, the rest is yours to spend. simplest one to actually stick to. want me to line it up?"

**Then it shows the tailored split** as a preview (read-only card stack), and on "yes" emits the plan as confirmation chips (§7). The user can tap **"try a different one"** at any point — that re-opens the recommendation with the next-best model. Switching later = same entry from the empty-state / a small "change model" action on the plan view.

---

## 4. Model catalog at MVP + the Malaysian layer

**Ship exactly 4 at MVP** (one per real situation — not 8):

| Model | Mechanic | Echo picks it when |
|---|---|---|
| **Pay-yourself-first** (anti-budget / 80-20) | Set aside ONE slice first, rest is free to spend. | Steady cadence, wants simplest, low debt. **Default winner.** |
| **Flexed 60/20/20** (honest-needs share) | needs / wants / set-aside, but needs share is *measured from real commitments*, not assumed 50%. | Wants structure; commitments are 50-70% of came-in. |
| **Digital envelopes** | Per-category ceilings ("left to spend" per envelope). | Overspends in a few specific categories; wants tangible limits. Maps to existing **Playbook** allocations. |
| **Step-ladder** (simplified Ramsey) | Sequence, not ratios: tiny cushion → clear high-cost debt → build buffer. | Has BNPL/credit pressure and no buffer. |

**The Malaysian layer Echo applies on top of *every* model** (research: Belanjawanku 2024/25; the "protected commitments tier"):

- **Protect the commitments tier first**, before any ratio runs: EPF/KWSP (11% if not auto-cut), PTPTN (once came-in > ~RM2,000/mo), zakat (~2.5%, Muslim users), rent/room, petrol+toll (car vs motor differs sharply).
- **Smooth annual sinking-fund lumps into monthly accruals**: road tax, takaful/insurance renewal, Raya/festive. ("i'll set aside RM60/mo so Raya doesn't ambush you.")
- **Only apply the model's ratio to what's *left after* the protected tier** — never to gross came-in. This is the single fix that makes Western ratios honest for a Malaysian median wage.

---

## 5. Echo's tailoring logic (income + commitments + goals → numbers)

Ordering is **pay-yourself-first**, computed in this sequence:

1. **Came-in baseline** = trailing average of `type:'income'` transactions (needs a **multi-month average helper** — see §7; today `buildFinancialContext` only sends this-month + last-month).
2. **Protected commitments tier** = sum of recurring commitments (`Subscription`/commitment rows) + statutory MY items + monthly accrual of sinking funds. Subtract from baseline → **"real breathing room"**.
3. **Set-aside slice** = the goal from Q3 (pay-yourself-first: this is reserved *before* spend, not last). If no goal → a small default cushion (the existing 10% safety buffer the budget hero already uses, `en.ts:1640`).
4. **Apply the chosen model's ratio to the remainder only.** e.g. flexed 60/20/20: the "needs" share is replaced by the *measured* commitments tier; wants/set-aside split the rest.
5. **Map to category numbers** using the user's **trailing per-category averages** (data-driven, not blunt 50/30/20), clamped so the sum equals available money.

Allocation logic = trailing-average-anchored, not pure heuristic and not pure LLM free-reasoning. The ratio frames it; the user's real category history fills the numbers. (Open question §11: how much to let the LLM free-reason vs. compute deterministically.)

---

## 6. The re-balance loop (the magic)

**Triggers** (any one fires a nudge; respect `budgetEchoHidden`):
- A category's `spentAmount` crosses its allocation (derived live, same as today's budget view).
- Pace forecast says a category will overshoot before payday (the pace/forecast already in `buildFinancialContext`).
- Payday lands (new `type:'income'` txn) → "want me to re-tailor for this month?"
- A new commitment is added/edited (Step 2 data changes the protected tier).

**What Echo says + offers** (observation, never advice — honors `ADVICE_GUARD`; presents options, never "you should"):

> EN: "makan was set at RM500 — you're at RM700 with 9 days left. two honest moves: pull RM200 from your personal-spend slice, or stretch makan to RM700 and the rest tightens. want one of these lined up?"

Echo then emits the matching `[ACTION]` block(s) for whichever the user picks — an `edit_budget` to move the ceiling, or a paired adjustment across two categories. It **never auto-applies**: it's a chip the owner taps (`aiInsightsStore.addPendingActions`, `aiInsightsStore.ts:190`).

What it offers, concretely:
- **Pull from another slice** (paired edit_budget: +RM200 here, −RM200 there).
- **Stretch the target** (single edit_budget; show what tightens elsewhere).
- **Leave it, just flag it** (no action — honest observation only).
- At payday: **re-tailor** (a fresh plan batch, §7).

Copy stays calm and red-free — over-limit uses `C.overdue` terracotta, framed gently ("a bit over — no stress", `en.ts:1624`), never alarm.

---

## 7. Data model (reuse first)

**Reuse, do not reinvent:**

- **Monthly-category plan** → existing `Budget` (`types/index.ts:813-825`) via `personalStore.addBudget` (`personalStore.ts:126`). A tailored plan = N `Budget` rows summing to available money.
- **Income-envelope plan** → existing `Playbook` + `PlaybookAllocation` (`types/index.ts:829-869`) via `playbookStore.createPlaybook` (`playbookStore.ts:28`), because a Playbook ties `allocations` to a `sourceAmount` (the income that started it) — the natural fit for "a model tailored to income".
- **Echo session memory** → existing `EchoMemoryEntry` + `saveEchoSession` (`playbookStore.ts:11,70`) already stores plan summary + advice across 6 months — reuse for "remember last month's plan".

**New action type (one):** add `tailor_plan` to `ACTION_PROMPT` (`chatActions.ts:1265-1580`, alongside `add_budget` #20) and handle it in the `executeAction` switch (`chatActions.ts:435`). Payload carries an `allocations[]` array + `target:'budget'|'playbook'` so one tap applies the whole plan atomically.

```
{"type":"tailor_plan","model":"pay_yourself_first","target":"budget",
 "allocations":[{"category":"food","amount":500},{"category":"transport","amount":300},...],
 "setAside":400,"description":"your tailored plan"}
```

**Receipt — must be honest (critical):** today `add_budget`/`edit_budget` return **NO receipt** and are therefore **NOT undoable** (`chatActions.ts:1059-1075`; `hasReversiblePayload` `MoneyChat.tsx:~1221`). A 6-category plan with no undo is unacceptable. So extend `ActionReceipt` (`chatActions.ts:97-109`) with `budgetIds?: string[]` / `playbookId?: string`, and teach `undoReceipts` (`MoneyChat.tsx:~1239`) to reverse the whole batch (delete the created budgets / delete the playbook). Re-tailoring (edit) snapshots the prior allocations into `edited.prev` so undo restores, never deletes.

**Context extension (one helper):** add a **trailing 3-6 month per-category average** block to `buildFinancialContext` (`moneyChat.ts:410-794`), gated behind a new scope flag in `classifyScope` (`moneyChat.ts:336-408`) so it only loads for tailoring requests — don't widen every prompt. Today the context only carries this-month + last-month categories.

**No new recurring-income model / payday anchor is built** at MVP — cadence is inferred from trailing income txns. (A real payday anchor is a known gap, §11.)

---

## 8. UI surfaces & components to reuse

- **Setup picker / preview** → `FloatingModal` (`src/components/common/FloatingModal.tsx`, default `maxWidth 520`, tablet-capped) for the recommendation card; `BottomSheet` (`src/components/common/BottomSheet.tsx`) for the Q&A flow.
- **Model "switch" toggle / step tabs** → the existing **segment pill** pattern `segmentChip` (`BudgetPlanning.tsx:1353`, active = `withAlpha(C.accent,0.08)` bg + `C.accent` border/text). Do NOT invent a new pill.
- **Plan rows / preview cards** → `Card` (`src/components/common/Card.tsx`, `C.surface` + 1px `C.border` so it floats in dark mode).
- **Category selection** (when user edits a slice) → `CategoryPicker` (`src/components/common/CategoryPicker.tsx`, opens `CategoryManager` inline — no navigation).
- **Period / payday date** → `CalendarPicker` (`src/components/common/CalendarPicker.tsx`).
- **Empty state** → `EmptyState` (`src/components/common/EmptyState.tsx`) — already the setup entry.
- **Nudge surface** → existing Echo FAB + greeting bubble + `EchoInlineChat` already on `BudgetPlanning.tsx`.

**Hard constraints (all MANDATORY):**
- **NO dropdowns / collapsibles** — show the recommendation and the split fully expanded; choices are floating cards / sheets.
- **makeStyles(C) pattern** — `const makeStyles = (C: typeof CALM) => StyleSheet.create({...})` outside the component, `const styles = useMemo(() => makeStyles(C), [C])` inside; `C = useCalm()`. Never hardcode `CALM.` in a component body.
- **Tablet** — any custom card/modal adds `maxWidth` + center; prefer the primitives that already cap.
- **Dark mode** — every card `C.surface` + 1px `C.border`; dims darken (`C.dimBg`), never light-wash. Over-limit = `C.overdue`, never red.
- **No red, one accent** — `C.accent` (olive) is the single highlight per screen; positive = olive, not green.
- If any preview has a horizontal scroller: 40px right-edge `LinearGradient` fade using `withAlpha(bg,0)→bg`, never `'transparent'`.

---

## 9. Copy examples (EN + casual BM)

All strings go through `useT()` and MUST be added to BOTH `src/i18n/en.ts` AND `src/i18n/ms.ts`, extending the existing **`budget`** namespace (`en.ts:1564`, `ms.ts:1560`). EN = lowercase/calm; BM = warm kedai-kopi casual (jom/nak/dah/boleh, loanwords ok), never aku/kau, never textbook-stiff.

**Recommendation:**
- EN: "steady payday, rent eats ~45% — i'd start you on **pay-yourself-first**. set aside one slice when money lands, rest is yours. simplest to stick to. line it up?"
- BM: "gaji masuk tetap, sewa makan ~45% — jom mula dengan **simpan dulu**. asingkan satu bahagian masa duit masuk, baki untuk kau. paling senang nak ikut. nak saya sediakan?"

**Plan lined up (confirmation honesty):**
- EN: "your plan's lined up — makan RM500, transport RM300, set aside RM400. tap to confirm and i'll save it."
- BM: "plan dah sedia — makan RM500, transport RM300, simpan RM400. tekan untuk sahkan & simpan."

**Re-balance nudge:**
- EN: "makan was RM500, you're at RM700 with 9 days left. pull RM200 from personal spend, or stretch makan to RM700? say which and i'll line it up."
- BM: "makan RM500 tadi, sekarang dah RM700, tinggal 9 hari. nak tarik RM200 dari belanja peribadi, atau naikkan makan jadi RM700? bagitau, saya sediakan."

**Payday re-tailor:**
- EN: "money just came in — want me to re-tailor this month's plan, or keep last month's?"
- BM: "duit baru masuk — nak saya susun semula plan bulan ni, atau kekal macam bulan lepas?"

**Sinking-fund accrual:**
- EN: "i'll quietly set aside RM60/mo so Raya doesn't ambush you in March."
- BM: "saya asingkan RM60 sebulan diam-diam, supaya Raya tak terkejut bulan tiga nanti."

---

## 10. MVP vs later

**MVP:**
- 3-4 question setup, **one** recommendation + one-line why, "try a different one".
- 4 models (§4) + the Malaysian protected-commitments layer.
- Tailored split applied via the new `tailor_plan` action → batch of `Budget` rows OR one `Playbook`, as tappable chips.
- Honest receipt + batch undo (extend `ActionReceipt` + `undoReceipts`).
- Trailing per-category average helper in `buildFinancialContext` (scope-gated).
- Re-balance loop: over-limit + pace triggers; offers pull/stretch/flag; payday re-tailor prompt.
- All copy in EN + BM `budget` namespace; gated by `premiumStore.canUseAI()` like every Echo call; nudges respect `budgetEchoHidden`.

**Later:**
- Real recurring-income model + payday anchor (today inferred).
- Sinking-fund auto-accrual as a first-class object.
- "Apply plan" reachable from `EchoInlineChat` inline (would require giving it the parse/execute/chip flow it lacks today).
- Multi-month plan history / "compare to last month".
- Step-ladder debt sequencing tied into the Debts store.
- Model A/B "this one fit better last 2 months" suggestion.

---

## 11. Open questions / risks

1. **Budget rows vs Playbook envelope** — monthly-category (`Budget`/`BudgetPlanning` budget view) vs income-envelope (`Playbook`/playbook view). The `tailor_plan` `target` field defers this per-plan, but the *default* per model needs deciding.
2. **Allocation engine** — deterministic compute (trailing averages clamped to ratio) vs LLM free-reasoning. Leaning deterministic-framed-by-ratio; needs the multi-month helper either way.
3. **Atomic vs N chips** — one `tailor_plan` chip (clean undo) vs N per-category chips (matches the one-action-per-chip system). MVP picks atomic via the new composite action; verify it coexists with Save-All grouping.
4. **Token budget** — a many-category plan + echoed math against `maxOutputTokens 4096` (`moneyChat.ts:894`) and last-10-history. Verify large plans don't truncate.
5. **Compliance (real risk)** — proposing a spending *plan* may edge from "general information" toward advice under `ADVICE_GUARD` / the no-"should" rule. Keep framing as observation + options the user chooses; get a copy/compliance read (see `memory/legal-regulatory-risk.md`). EPF/PTPTN/zakat math must be framed as "based on common rates", not tax advice.
6. **Step-2 dependency** — this is roadmap Step 3; it must not ship before commitments accuracy (Step 2). A plan on bad commitment data is poison.
7. **Statutory data freshness** — PTPTN/EPF/zakat thresholds change; hardcoding rates is a staleness risk. Treat as configurable defaults.
