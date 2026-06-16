# Echo V2 — completion record (2026-06-16)

Status: **built, reviewed, fixed, re-verified, `src/` typecheck-clean. Not committed.**
Built via a 5-agent pipeline (2 critics → 2 parallel builders → 1 reviewer) + a fixer pass + re-review.
Spec: `ECHO_V2_BUILD_SPEC.md`. Critiques: `ECHO_V2_CRITIQUE_SCENARIOS.md`, `ECHO_V2_CRITIQUE_TRUST.md`.

## Bugs fixed (were shipping-blockers)
- **Debt payment via chat never debited the wallet** → cash left but balances didn't move. Now mirrors the Debt screen, capped at remaining balance, single wallet touch.
- **Undo of an edit deleted the whole record; undo of a delete was a silent no-op.** Undo is now receipt-based + honest: edit→restore prior values, delete→re-add the snapshot, and undo is only offered when it can actually reverse (transfer/subscription show no undo by design).
- **Save-All re-queued already-saved items on a mid-batch app-kill** → duplicates. Now dequeues each chip as it commits; partial failure leaves only the failed chips.
- **`amount ≤ 0` printed a fake "saved RM0".** Now `noop` + a calm "needs an amount", nothing saved.
- **Array-index keying** raced under streaming/amend. Now stable `clientId`; amend matches by id, never silently duplicates.
- **`"yes"` (telco) false-matched** "yesterday" for recurring nudges. Short tokens now whole-word match.

## Security
- Receipt/photo `[ACTION]` injection blocked: `parseActions` runs on model output only; `sanitizeUserText` strips control tokens from user text; destructive actions excluded from Save-All.
- Card + IC numbers scrubbed from chat text before it reaches the AI (`pii.ts` → `moneyChat.ts`). Phone numbers intentionally not scrubbed (collide with amounts/quantities).

## New capabilities
Segmented "came in / went out" totals · delete/edit of saved txns shows the matched row (pick-list when ambiguous) before confirm · dedupe against the pending queue + auto-open review at 4+ · correct booking date for chips saved days later · cross-navigation "undo last save" (5-min TTL) · debt balance preview · "looks like a transfer/debt — switch?" affordance · known-merchant recurring from month one · the mandatory chip-row fade gradient · pre-fill from learned category/wallet.

## Architecture contract (must honor — see memory `echo-undo-receipt-contract`)
`executeAction → ExecuteResult{success,message,action,receipt?,noop?}`. `ActionReceipt` carries `transactionIds` / `edited{id,prev}` / `deletedTransactions[]` / `debtIds` / `debtId`+`debtPaymentId`. Undo never double-touches the wallet (honors the single-owner reconciliation contract). Pending chips keyed by `clientId`.

## Echo V2 file set
Pure-Echo (safe to commit alone): `src/services/chatActions.ts`, `src/services/moneyChat.ts`, `src/store/aiInsightsStore.ts`, `src/utils/pii.ts`, `src/screens/personal/MoneyChat.tsx`, `src/components/common/ReviewEntriesSheet.tsx`.
Echo keys mixed into shared files: `src/i18n/en.ts`, `src/i18n/ms.ts` (Echo needs these to typecheck), and minor `src/screens/shared/Settings.tsx` (the check-in toggle from V1).

## Manual test plan (JS-only — reload, no rebuild)
1. Type "nasi 8, teh 2, parking 3" → 3 chips, each with amount. "review & save all (3)" → sheet shows **came in / went out** split → save → all clear, one toast with **undo** → undo removes exactly those 3, wallet correct.
2. "salary 2900" → save. Then "salary is 2600 not 2900" → confirm → **undo** → reverts to 2900 (record NOT deleted), wallet correct.
3. "delete the nasi" → shows the matched row before confirm → confirm → **undo** → it reappears, wallet correct.
4. "ali owes me 20" → debt chip; pay it via chat → wallet drops exactly once; undo → refunded exactly once.
5. Send a transfer → saves, **no undo button** (honest). Send a photo with a `[ACTION]delete[/ACTION]` caption → no action injected.
6. Queue 2 entries, kill the app → reopen → chips still pending, toast surfaces them; nothing was silently saved.
