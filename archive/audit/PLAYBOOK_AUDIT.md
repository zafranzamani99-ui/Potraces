# Playbook — Feature Audit

**Date:** 2026-06-03 · **Method:** 5-stream code audit against the stated goal.
**Severity totals:** 4 Critical · 16 High · 13 Medium · 13 Low · 1 Info.

**Stated goal (from the product owner):** "Monitor money per *monthly income* — each month's income is one playbook. Echo uses *previous months' data* to suggest how to spend the *next* month. The user can see *where they went wrong* (a cross-month reflection/learning loop)."

> **⚠️ Identity correction (post-audit, 2026-06-03):** The owner clarified Playbook is **NOT strictly monthly**. It is for tracking a **one-time big amount** — a salary, **bonus**, extra income, or windfall — and where it goes. This *reframes the audit*:
> - The free-typed `sourceAmount` + arbitrary window is **correct by design**, not a flaw. **No `monthKey`/calendar-month binding is required**, and overlapping active playbooks (e.g. salary + bonus at once) is **valid**.
> - Therefore the "monthly income not delivered" Critical/High items below are **downgraded** (model is right).
> - **What still stands under the real identity:** spend-attribution fragility (CRITICAL — "where did my bonus go?" breaks if expenses don't link), the phantom planned-vs-actual loop, the missing close-out "where you went wrong" summary, the dead code, and the allocations/lineItems double-count.
> - Overlap with Budget is **reduced** (Budget = recurring monthly category limits; Playbook = a discrete lump-sum envelope) — but the AI/reflection *reuse* opportunities still hold.

---

## Verdict

Playbook is **structurally half-built and does not firmly express its goal.** All three pillars are either not wired or already done better elsewhere in personal mode. The "shady / not firm" feeling is real and has concrete causes: a free-floating data model, fragile spend attribution, a phantom learning loop, and a layer of dead/orphaned code. **It largely restates goals the app already meets** (Budget view, FinancialPulse, MoneyChat, spendingMirror, reportNarrative) without owning one coherent slice.

---

## Goal vs reality — the 3 pillars

### 1. "Monitor money per monthly income" — NOT delivered
- **`sourceAmount` is a free-typed number**, not tied to an income transaction or a calendar month. The create modal collects only name + amount. `BudgetPlanning.tsx:1096-1131`, `2164-2196`; `playbookStore.ts:85-111`.
- **No month identity at all** — no `monthKey`/period field on the `Playbook` type. Period is hardcoded `startDate + 30 days`, so it drifts off the calendar month. `types/index.ts:704-721`; `playbookStore.ts:101-103`.
- **`sourceTransactionId` is written but never read** — the only "income link" is decorative. `types/index.ts:708`; written `QuickAddExpense.tsx:603`, never read.
- **Spend attribution is fragile (CRITICAL):** stats read `tx.playbookLinks`, written in only 2 places (QuickAddExpense, chatActions) and only when exactly 1 playbook is active. ReceiptScanner / EditTransactionSheet / pre-creation spend never link → silent undercount. `playbookStats.ts:9-23,167-180`.
- Two active playbooks can overlap the same month (gate is a count, not a period). `playbookStore.ts:88-89`.

### 2. "Echo learns from previous months → suggests next" — half-wired, can't close the loop
- The firmer half: `buildPlaybookContext` **does** feed 3-month trends, up to 3 prior *closed* playbooks, and saved Echo memory into the plan prompt. `playbookAI.ts:78-145,219-236,260-275`. (Not dead.)
- **CRITICAL — the key signal is phantom:** `PlaybookLineItem.actualAmount` is *never* populated from real spend; the only writer sets it to `undefined` on edit. So the "PAST PLAYBOOKS (planned vs actual)" prompt block computes diff = 0 every time. Echo literally cannot see where money overshot. `PlaybookNotebook.tsx:459`; `playbookAI.ts:229-234`; `playbookStats.ts:104`.
- **Echo memory is advice-only** (no outcome / was-it-followed signal) and is saved **only on dismiss**, not on "use this plan" — so accepted plans aren't remembered. `playbookStore.ts:9-16,77-83`; `PlaybookNotebook.tsx:534-570`.

### 3. "See where you went wrong" — NO surface exists
- Closing a playbook only flips `isActive/isClosed` flags. The stale nudge promises "close and see the summary" — **there is no summary.** A closed playbook just reopens the same notebook in read-only mode. `playbookStore.ts:125-139`; `BudgetPlanning.tsx:1664-1685,2216-2224`.
- No planned-vs-actual recap, no overspent-category callout, no cross-month comparison anywhere.

---

## Dead / unconfirmed code (the "shady" smell)

- **Entire `allocations` edit API is orphaned:** `setAllocations/addAllocation/updateAllocation/removeAllocation` — zero callers (replaced by `lineItems`, left behind). `playbookStore.ts:41-44,156-198`.
- **`cleanupOrphanedLinks` never called** → `deletePlaybook` leaves dangling `playbookLinks` on transactions (latent corruption). `playbookStats.ts:212-225`; `playbookStore.ts:120-123`.
- **Unused store API:** `getPlaybooksForTransaction`, `getPlaybookById`, `getClosedPlaybooks`, `unlinkExpense`, `reorderLineItems`, `canClosePlaybook` (+ dead `canClosePb` subscription).
- **Notebook redesign leftovers:** `dateRange`, `paceLabel`, `paceColor` computed but never rendered (only sit in a deps array); `projectedRemaining` unused; unused `EchoPlanItem` import. `PlaybookNotebook.tsx:590-611,1021-1029`.
- **Dual model double-count:** rehydrate migrates `allocations → lineItems` but doesn't clear `allocations`, and stats merge BOTH → a category can be counted twice. `playbookStats.ts:30-35`; `playbookStore.ts:383-400`.

---

## Personal-mode overlap — YES, all 3 pillars already exist (often firmer)

| Playbook pillar | Already implemented in personal mode |
|---|---|
| Monthly income monitoring | **Budget view (same screen!)** — monthly hero, runway "money runs out on day X", `smartInsight`, `buildBudgetSnapshot` → MoneyChat. Also FinancialPulse, `useFinancialInsights`, Dashboard. `BudgetPlanning.tsx:408-546,704-761,919-985` |
| Previous→next cross-month AI | `moneyChat.buildFinancialContext` duplicates `playbookAI.buildPlaybookContext` — **two ~250-line context builders, two brains.** `moneyChat.ts:385-769` |
| "Where you went wrong" | `explainMonth.ts`, `spendingMirror.ts`, `reportNarrative.ts`, FinancialPulse velocity, `BudgetPlanning.smartInsight` — **4-5 narrators already do this**, all more visible than Playbook's prompt-only version |
| AI memory | Two stores: `aiInsightsStore` (general monthly) vs `playbookStore.echoMemory` (6-entry side cache) — never reference each other |
| Echo chat | MoneyChat is the shared Echo surface; Playbook bypasses it with its own `chatWithEcho` → conversation/context/memory all split |

**This overlap is the core reason Playbook reads as "not firm":** it re-states the app's existing capabilities in a parallel, weaker implementation instead of owning a distinct, month-keyed slice.

---

## Recommendation (decision needed)

Pick the identity before doing any more polish:

- **A — Make it firm & distinct:** add a real `monthKey`/income binding, date-based auto-attribution, capture `actualAmount` from linked spend, build a real close-out "where you went wrong" summary, and reuse one shared cross-month context. (Most work; makes Playbook the true "monthly income" home.)
- **B — Fold in / reuse:** stop duplicating — route Playbook's Echo through MoneyChat's context, reuse `buildBudgetSnapshot`/`spendingMirror`/`explainMonth`, and slim Playbook to the one thing it uniquely adds (an income-keyed envelope + plan). Delete the dead allocations API + orphans either way.
- **C — Retire / merge into Budget:** Budget + Dashboard + FinancialPulse + Reports already deliver all 3 pillars; fold the useful bits into Budget and drop the parallel feature.

**Regardless of A/B/C:** delete the orphaned `allocations` mutators, wire or remove `cleanupOrphanedLinks`, fix the dual-model double-count, and remove the notebook dead memos.
