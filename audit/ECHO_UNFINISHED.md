# Echo — plan-vs-shipped audit (2026-07-28)

Cross-checked every Echo planning doc against the actual code. **What shipped is large; the unfinished list is mostly deliberate deferrals + a few real gaps.** Grouped by priority below.

## SHIPPED (confirmed in code)
- **Echo's Notebook** (the flagship) — `learningStore.ts`/`learningPure.ts` (4 count-weighted rule tables, trust≥2, cap 100, self-healing conflict demote), the visible+editable `EchoNotebook.tsx` screen (add/fix/forget/reset — *exceeds* the "read-only" plan), provenance "sebab you ajar" (`getCategorySuggestion` carries keyword+count), ~11 auto-population sites, cloud sync via `personal_learning`, and prompt injection via `getPromptHints()`.
- **One-brain debt knowledge** — all 3 phases done: `myDebtInstruments.ts` + `echoKnowledgeContext.buildKnowledgePromptHints()` wired into `moneyChat.ts:944/954`; `critic.ts` reads the same `INSTRUMENT_FAILURE_MODES`.
- **Budget engine** — `budgetModels.ts` (6 models), `planner.ts`, `critic.ts`, `budgetReality.ts` shipped and reused by `BudgetPlannerSheet` + Playbook.
- **Echo V2 contract** — id-based pending queue, ActionReceipt + honest undo, debt-payment-moves-money, PII scrub, dedupe-vs-pending, segmented totals.
- **Echo Voice** — went *past* plan: live streaming STT (Soniox/Gemini-Live) on top of `expo-speech-recognition`.

---

## REAL GAPS worth deciding on

### Safety (from ECHO_MEMORY_COST_SAFETY.md — open decisions)
- **[UNBUILT] On-device crisis-keyword check + help card.** Zero crisis/self-harm handling anywhere (grep: no Befrienders / Talian Kasih / 15999). ~30 lines, no server, stays private. Open decision #2. **Highest-value safety gap.**
- **[OPEN] Trim the ~5k-token rulebook** (`moneyChat.ts:38–317` untrimmed) — cheapest per-message cost win. Open decision #1.

### Safety gate that was built but never wired
- **[PARTIAL] `critic.ts` `reviewReply`/`reviewPlan` are fully written but imported by nothing on the chat path.** The compliance/honesty gate (no "you should", banned words, orphan-confirmation) does NOT actually enforce on Echo replies — `moneyChat`'s own prompt guards instead. Wiring it between `parseActions`→`addPendingActions` was Planner-Critic Phase 2. (`critic.ts` only runs inside the deterministic budget engine.)

### Money-math correctness (Echo V2 leftovers)
- **[PARTIAL] A8/H4 amend-by-clientId is effectively dead** — the prompt still tells the model to amend by *description* and never exposes `clientId`, so the dedupe path can silently append a duplicate. Flagged the highest-value remaining V2 correctness gap.
- **[UNBUILT] M3 split_bill rounding remainder** — `perPerson = round(amount/(n+1))` for everyone, no remainder assigned → debts can under/over-sum vs the expense.
- **[UNBUILT] M1 string-amount coercion** — `parseActions` silently drops non-number amounts.
- **[UNBUILT] M5** stream-guard not bumped on clear/load-conversation (in-flight reply can resurrect a cleared thread); **M6** context cache keyed on time only, not mode/scope (2s wrong-scope leak).

### Notebook polish
- **[PARTIAL] `typeCorrections` + `skippedKeywords` feed the prompt but aren't shown/editable** in EchoNotebook (only category/wallet/person rules are).

---

## FLAGSHIP STRATEGY not yet built (MAKIN_KENAL.md §6)
- **[UNBUILT] "Kept, not Profit" one signature number across both books** — `getTotalTransferredToPersonal` exists but nothing combines business take-home + personal spend into a single "you kept RM1,820" surface. The install hook.
- **[UNBUILT] "Take-Home Truth" in personal Echo** — inject transferred-this-month + unpaid-order total into personal-scope Echo for affordability (bridge plumbing exists; injection missing; `moneyChat.ts:789` gates business context on `mode==='business'`).
- **[UNBUILT] Collectz join-page install nudge** — no "track your own money" CTA for anonymous payers (the acquisition funnel).
- **[PARTIAL] Monthly check-in citing a learned notebook fact + ringgit figure** — a *generic* daily check-in shipped (`checkinReminders.ts`); the notebook-fact/ringgit content wasn't built.

---

## Budget re-balance loop (budget-models-echo-spec.md) — mostly unbuilt
- **[UNBUILT] Concrete pull/stretch/flag action chips** ("at RM700, 9 days left — pull RM200 or stretch") emitting `edit_budget`. Today's over/pace nudges are greeting variants that route to NL chat, not tappable moves.
- **[UNBUILT] Re-balance triggers** on payday-lands and new-commitment.
- **[PARTIAL] Statutory auto-items (EPF/PTPTN/zakat)** — helpers built but `estimateFromGross` is never called (not wired into the sheet).

---

## Voice polish (ECHO_VOICE_*) — feature works; a11y/caption details open
- **[UNBUILT] a11y `announceForAccessibility`** state-transition announcements (missing on all 3 voice screens).
- **[UNBUILT] two-tone interim/settled caption + cross-fade + auto-scroll region** (single-tone shipped).
- **[PARTIAL] LogIncome is hold-to-talk with no Cancel** (spec wanted tap-toggle + Cancel everywhere).
- **[UNBUILT] `voiceOffline` copy** defined but never triggered (no NetInfo check); **60s auto-stop** safety cap absent.

---

## Deferred BY DESIGN (not gaps — plans said "later"/"won't build")
- Planner-Critic Phase 3: LLM critic (KEEP/REVISE/ESCALATE), two-pass metering, `insightPipeline.ts`, versioned KB refresh, opt-in population calibration.
- CRITIC_PERSONAS / engine test harness (PERSONAS data exists in-source; nothing runs it).
- "Echo remembers you" chat-content training half (needs PDPA consent + server).
- Delivering the budget planner via chat chips — **superseded** by BudgetPlannerSheet + Playbook surfaces.
