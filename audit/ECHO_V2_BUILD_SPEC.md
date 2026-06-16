# Echo V2 — Build Spec (FROZEN CONTRACT)

Synthesized from `audit/ECHO_V2_CRITIQUE_SCENARIOS.md` + `audit/ECHO_V2_CRITIQUE_TRUST.md`.
Two builders work in parallel. **They must never edit the same file.**

## Hard invariants (carry through everything)
1. **Confirmation-first is sacred.** Echo NEVER saves. It only prepares `[ACTION]` blocks → pending chips → owner taps to save via `executeAction`. New behavior may only *inform* — never auto-save, never block.
2. **CALM contract.** No judgment, NO red/alarm. Approved vocabulary only: kept / went out / came in / breathing room. NEVER profit/loss/budget/revenue/inventory. Bronze = in-progress/pending.
3. **Wallet single-owner contract.** On add the CALLER adjusts the wallet; on update/delete the STORE self-reconciles; debt payments/transfers must NOT double-touch the wallet.
4. **Surgical + reuse.** Minimum code. Reuse existing patterns/components/tokens. No speculative abstractions. Match existing style. EN+MS parity, dark-mode tokens, tablet caps on every new surface.
5. **Scroll rules** (memory): ScrollView from `react-native-gesture-handler`; horizontal scrollers need the right-edge `LinearGradient` fade using `withAlpha(color,0)` (never `'transparent'`).

---

## FROZEN CONTRACT (Builder A implements these EXACT signatures; do NOT rename. Builder B consumes them.)

### `src/services/chatActions.ts`
```ts
// 1. Stable id on every action.
interface ChatAction { /* existing fields */ clientId?: string; preparedAt?: number; amend?: boolean; }

// 2. Mutation receipt so undo is exact (replaces the fragile tx-id diff).
export interface ActionReceipt {
  transactionIds?: string[];   // txns created — undo via personalStore.deleteTransaction
  debtId?: string;
  debtPaymentId?: string;      // payment appended (if reversible)
  subscriptionId?: string;
}
export interface ExecuteResult {
  success: boolean;
  message: string;
  action: ChatAction;
  receipt?: ActionReceipt;     // what was mutated
  noop?: boolean;              // true => nothing saved (e.g. amount<=0); success must be false
}
export function executeAction(action: ChatAction): ExecuteResult;  // extended return

// 3. Destructive classification (UI excludes these from Save-All).
export const DESTRUCTIVE_ACTION_TYPES: ReadonlySet<ChatActionType>; // delete_transaction, forgive_debt, deleteAll, etc.
export function isDestructiveAction(a: ChatAction): boolean;

// 4. Input sanitation (strip model-control tokens from user-authored text).
export function sanitizeUserText(text: string): string; // removes [ACTION]/[/ACTION] and stray control markers

// 5. Resolve the saved record a delete/edit action targets, for preview + disambiguation.
export interface ResolvedTarget {
  status: 'one' | 'many' | 'none';
  match?: { id: string; description: string; amount: number; date: Date; type: string };
  candidates?: Array<{ id: string; description: string; amount: number; date: Date; type: string }>; // when 'many', most-recent first
}
export function resolveTargetTransaction(a: ChatAction): ResolvedTarget;

// 6. Soft flags (already exist; harden — fix median-on-empty, expense/income sign, substring false-positives).
export function isLikelyDuplicate(a: ChatAction): boolean;     // now also checks the PENDING queue, not just saved txns
export function isUnusualAmount(a: ChatAction): boolean;
export function isDuplicateOfPending(a: ChatAction, pending: ChatAction[]): boolean; // NEW

// 7. Recurring detection — loosen + known-merchant list so month-1 users get nudged.
export function recurringCandidate(description: string): { months: number; amount: number } | null; // existing, loosened
export function isKnownRecurringMerchant(description: string): boolean; // NEW (netflix/spotify/astro/unifi/maxis/celcom/digi/tnb/air selangor/gym/youtube/icloud...)

// 8. Reshape detection for the "switch?" affordance.
export function looksLikeTransfer(a: ChatAction): boolean; // mentions "transfer/pindah/move to <wallet>"
export function looksLikeDebt(a: ChatAction): boolean;     // "<name> owes / hutang / pinjam / lend"
```

### `src/store/aiInsightsStore.ts` (Builder A)
```ts
// id-based queue ops (replace the index-based ones). addPendingActions stamps clientId+preparedAt if missing.
addPendingActions: (actions: ChatAction[]) => void;            // stamps clientId (uuid-ish) + preparedAt on each
removePendingActionById: (clientId: string) => void;
replacePendingActionById: (clientId: string, action: ChatAction) => void;
clearPendingActions: () => void;
// cross-navigation undo of the most recent save:
lastSave: { receipts: ActionReceipt[]; count: number; at: number } | null;
setLastSave: (receipts: ActionReceipt[], count: number) => void;  // stamp at = Date.now()
clearLastSave: () => void;
// rehydrate: drop/repair pending actions whose walletId/categoryId/debtId no longer exist (stale refs).
```
Keep all new fields in `partialize`. The old `removePendingAction(index)`/`replacePendingAction(index)` are removed; MoneyChat is the only caller (Builder B updates it).

---

## Builder A — logic / store / prompt / security
**Owns ONLY:** `src/services/chatActions.ts`, `src/services/moneyChat.ts`, `src/store/aiInsightsStore.ts`, `src/utils/pii.ts`. May READ debtStore/personalStore/learningStore/aiService/ocrService. Do NOT edit MoneyChat/ReviewEntriesSheet/Settings/i18n.

- **A1** clientId + preparedAt stamping (store, contract #1/#2 above).
- **A2** `executeAction` → `ExecuteResult` with `receipt` + `noop`. If amount is missing/≤0/non-finite → `{success:false, noop:true, message:<calm 'needs an amount'>}`; never report a phantom save. Populate `receipt` for every successful add/edit/delete/debt/subscription/split path.
- **A3 (CRITICAL C1+C2)** `debt_update`/payment via chat must MOVE MONEY: cap the payment at the remaining balance, then debit the wallet per the single-owner contract (create the linked transaction / deduction the same way the Debt screen does — read `debtStore.addPayment` + how DebtTracking deducts). Do NOT double-touch. Receipt = `{debtId, debtPaymentId, transactionIds}`.
- **A4 (C3)** `DESTRUCTIVE_ACTION_TYPES` + `isDestructiveAction`.
- **A5 (C3)** `sanitizeUserText`. Confirm `parseActions` only ever runs on MODEL output (document/guard so user text can't inject an action).
- **A6 (C4)** PII scrub on the Echo send path: apply `scrubCardNumbers` (extend `pii.ts` if a phone/IC scrub is cheap) to chat text before it goes to the model in `moneyChat.ts`; ensure any OCR/extracted text is scrubbed too.
- **A7** `resolveTargetTransaction` (contract #5).
- **A8** amend matches by `clientId` (preferred) or explicit token; on NO match, return a signal so UI can ask — NEVER silently append a duplicate.
- **A9** rehydrate validation: drop/repair pending actions with dangling wallet/category/debt ids.
- **A10** `isDuplicateOfPending` + make `isLikelyDuplicate` also see the pending queue.
- **A11** date honesty: `executeAction` records `action.date ?? action.preparedAt ?? now` so a chip saved days later books on the intended day, not today.
- **A12** loosen `recurringCandidate` + `isKnownRecurringMerchant`.
- **A13** `looksLikeTransfer` / `looksLikeDebt`.
- **A14** prompt depth (`moneyChat.ts`): echo-back interpreted ambiguous amounts ("RM3.50 x2 = RM7", "1.2k = RM1200"); ONE `[ACTION]` per item in a multi-item message; reinforce confirmation honesty (never say "dah record"); mention transfer/debt/split abilities. EN+MS examples.
- **A15** harden duplicate/large flags: guard median on empty/tiny datasets; respect expense vs income sign; tighten substring matching to avoid false positives.
- **A16** tighten the rehydrate error-scrub regex so it only removes genuine error bubbles, not legit replies containing words like "went wrong".

## Builder B — UI / copy
**Owns ONLY:** `src/screens/personal/MoneyChat.tsx`, `src/components/common/ReviewEntriesSheet.tsx`, `src/screens/shared/Settings.tsx` (only if a toggle is needed), `src/i18n/en.ts`, `src/i18n/ms.ts`, and any NEW component files you create under `src/components/common/`. Do NOT edit chatActions/moneyChat/aiInsightsStore/pii. CONSUME the frozen contract above (assume A delivers it exactly).

- **B1** Key chips / editingTarget / remove by `action.clientId` (use `removePendingActionById`/`replacePendingActionById`). No array indices.
- **B2** `handleSaveAll`: dequeue each chip via `removePendingActionById` AS it succeeds (never clear-all at the end). On partial failure leave the failed chips queued + a calm plain message.
- **B3** Save-All EXCLUDES destructive actions (`isDestructiveAction`): they must be tapped individually; show a calm one-liner why.
- **B4** Undo via `ExecuteResult.receipt` (delete `receipt.transactionIds`, reverse debts/subscriptions where ids exist); partial save-all undoes only what succeeded.
- **B5** Delete/edit-of-saved: on chip tap call `resolveTargetTransaction`; show the matched row (desc · amount · date) in the modal before confirm; `status:'many'` → small pick list; deletes carry undo.
- **B6** ReviewEntriesSheet + save-all toast: segmented total — "came in RM X · went out RM Y" (never one summed RM).
- **B7** Make sure the chip clearly shows the computed amount (works with A14's echo-back).
- **B8** Show the dedupe-against-pending flag; auto-open ReviewEntriesSheet when pending ≥ 4.
- **B9** When `preparedAt`/date ≠ today, show the entry's date on the chip/review row.
- **B10** Cross-nav undo: call `setLastSave` after each save; surface a brief "undo last save" affordance that still works after leaving + reopening Echo (read `lastSave`, respect a short TTL ~5 min).
- **B11** Debt chip: show the resolved debt + remaining balance before confirm (uses A3/A7 data).
- **B12** "looks like a transfer/debt — switch?" affordance in the edit modal (uses `looksLikeTransfer`/`looksLikeDebt`); allow switching the chip's action type to transfer/debt/split where it makes sense.
- **B13** Add the mandatory right-edge fade gradient to the pending chip row.
- **B14** Recurring nudge also fires after save-all and uses the loosened detection.
- **B15** All new copy in `en.ts` (typed source) + `ms.ts` (gen-z casual BM), dark-mode tokens, tablet caps.
- **B16** Run `sanitizeUserText` on user input before echoing it into the chat.

## Definition of done (both)
- `npx tsc --noEmit` clean for `src/**` (the only allowed pre-existing error is `docs/archive/ai-drafts/moneyChat.ts` `@env`).
- No file edited by both builders. Nothing committed.
