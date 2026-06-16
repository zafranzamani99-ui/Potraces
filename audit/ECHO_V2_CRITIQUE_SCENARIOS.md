# Echo V2 — Serious Scenario Critique & Proposals

**Author:** product+robustness critic pass
**Date:** 2026-06-16
**Scope:** Echo (the AI expense chatbox) — `MoneyChat.tsx`, `chatActions.ts`, `moneyChat.ts`, `aiInsightsStore.ts`, `learningStore.ts`, `personalStore.ts`, `ReviewEntriesSheet.tsx`, i18n `moneyChat.*`.

**Sacred invariant (carried through every proposal):** Echo NEVER saves anything itself. It only *prepares* `[ACTION]` blocks → pending chips → owner taps to `executeAction`. Every idea below only *informs* or *prepares*; none auto-saves or blocks. CALM-compliant: no red/alarm, approved vocabulary only, "do not hassle the user."

V1 (shipped) is taken as given. This is the V2 stress-test: where the *current* flow loses data, confuses, or can't express what the user wants.

---

## Part A — Confirmed mechanics (so the gaps are real, not guessed)

1. **`executeAction` is synchronous and has no batch/transaction guarantee.** `handleSaveAll` loops `executeAction` over the array; if the app is killed at item 4 of 8, items 1-3 are saved, the rest are lost, and `clearPendingActions()` never ran (good) — but there is no resume/partial-save record.
2. **`addTransaction` silently drops `amount <= 0` (returns `''`).** `executeAction` `add_expense`/`add_income` never checks the return — it still returns `success:true` with "Added expense…". A zero/blank amount chip therefore reports a phantom save. (Real for "around 20-ish" → parsed as 0, or a user who clears the amount field in the modal.)
3. **Everything is index-keyed.** Chip `key={...-${i}}`, `editingIndex`, `removePendingAction(index)`, review-sheet `onRemoveEntry(i)`. If the array mutates (a new AI reply queues a chip while a modal is open on index 2, or amend replaces by description) indices can point at the wrong entry. There is no stable per-action `id`.
4. **`ActionEditModal` can only express a subset.** Switchable types are expense/income/debt/subscription only. `transfer` (fromWallet/toWallet), `split_bill` (people list, per-head math), `add_bnpl` (creditWallet), `add_goal_contribution` (goalName), date override — none are editable in the chip modal. The owner must trust the AI or discard.
5. **Soft duplicate guard only looks at SAVED `transactions`.** It cannot see other *pending* chips. So "nasi 8, nasi 8, teh 2" in one message yields two un-flagged identical chips.
6. **`isUnusualAmount` covers only `add_expense`/`add_bnpl`.** A fat-fingered `add_income` (RM 26000 salary), a `transfer`, or a `split_bill` total is never flagged.
7. **Editing/deleting an ALREADY-SAVED transaction is AI-fuzzy-matched** (`matches[matches.length-1]`, `includes()` substring). The owner never sees *which* row will be hit before it happens, and the destructive op runs the instant they tap the chip — there is an undo toast for *adds* but the edit/delete chip path (`handleConfirmAction`) does NOT capture a redo/undo snapshot for edits.
8. **Pending chips persist forever.** No staleness concept. A chip prepared "yesterday lunch" sitting for 5 days still saves with `date: now` unless the AI emitted an explicit date.

---

## Part B — Scenario-by-scenario critique & V2 proposals

Format: **Scenario → Gap in V1 → Proposed V2 (CALM + confirmation-first) → Files → Effort → Risk.**
Leverage score = impact ÷ risk, used for the ranked summary.

---

### 1. Multi-item single message — "nasi 8, teh 2, parking 3"
**Gap:** Works (AI emits 3 chips), but (a) intra-batch duplicates aren't flagged, (b) horizontal chip row + index keys get unwieldy past ~5, (c) no per-item subtotal sanity. Also the AI must *decide* parking=transport vs the user's intent — fine, but there's no "applies to all" affordance.
**V2:** (a) Extend the soft duplicate check to also scan the *current pending queue*, not just saved txns — flag the 2nd identical chip with the existing bronze dot. (b) When 4+ chips pend, auto-open (or strongly surface) the ReviewEntriesSheet as the primary surface instead of the cramped horizontal scroll — the sheet already scales and shows the running total. (c) In the sheet, show a tiny per-row category so mis-categorization is visible at a glance (already shows `category · wallet` — keep). No blocking.
**Files:** `chatActions.ts` (dedupe-vs-pending helper), `MoneyChat.tsx` (auto-surface sheet at N≥4).
**Effort:** S. **Risk:** Low.

---

### 2. Mixed income + expense in one message — "gaji masuk 3000, terus bayar bil 200"
**Gap:** AI *can* emit `add_income` + `add_expense`. But save-all toast says "{n} saved · RM {total}" where total = sum of *all* amounts — mixing +3000 income with −200 expense into "RM 3200" is misleading (it's not money that "went out"). The running total in ReviewEntriesSheet has the same bug: it sums income and expense as one positive number.
**V2:** Make the total *signed/segmented*: "came in RM 3,000 · went out RM 200" instead of one blob. Net it only where it's truly net. This is a CALM-vocabulary win too (came in / went out).
**Files:** `ReviewEntriesSheet.tsx` (total row → two lines by direction), `MoneyChat.tsx` (`handleSaveAll` toast copy), i18n.
**Effort:** S. **Risk:** Low.

---

### 3. Should-be-a-transfer / debt / split, but came in as plain expense
**Scenario:** "bagi adik 50" (could be gift=expense, or loan=debt), "topup tng 100 from maybank" (transfer, not expense), "dinner 120 split with 3".
**Gap:** If the AI guesses `add_expense`, the chip modal lets you switch type to debt — but NOT to transfer or split. And switching expense→debt in the modal doesn't collect the missing fields cleanly (person yes, but split people no). The user is stuck: discard + retype, or save the wrong shape.
**V2:** Two parts. (a) Add `transfer` and `split_bill` to the modal's editable types, rendering their required fields (from/to wallet pickers; people chips with live per-head math). (b) Better: a one-line **"this looks like a transfer / a loan — switch?"** affordance on the chip when the description contains strong signals (topup, pindah, transfer, pinjam, lent, bagi… owe). Inform-only; tap to reshape the pending chip (an amend, not a save).
**Files:** `MoneyChat.tsx` (`ActionEditModal` field rendering for transfer/split), `chatActions.ts` (signal helper), i18n.
**Effort:** L (modal field work is the cost). **Risk:** Medium (more modal states = more iOS modal-stacking care).

---

### 4. "ali owes me 20" then "ali bayar balik 20" later
**Gap:** `add_debt` works. `debt_update` matches person by exact-lowercase name AND `status !== settled`. If there are two "Ali" debts, it pays the *first found* — silently. The chip modal can't show which debt or its balance. And if no active debt exists, the chip *saves nothing* but the flow still removes the chip and prints "Failed" — the prepared intent is lost.
**V2:** (a) When a `debt_update`/`forgive_debt`/`delete_debt` chip is prepared, resolve the target debt at *prepare* time and show "Ali · RM 20 of RM 50 left" on the chip, so the owner confirms against a real balance. (b) If multiple matches, the chip modal shows a small picker ("which Ali debt?"). (c) On a failed match, keep the chip (don't silently drop) and let Echo say "no open debt for Ali — want to log a new one?" Inform-only.
**Files:** `MoneyChat.tsx` (chip subtitle resolver + multi-match picker), `chatActions.ts` (a read-only `resolveDebtTarget`), i18n.
**Effort:** M. **Risk:** Medium (touches destructive-action UX — must stay confirmation-first).

---

### 5. Receipt photo + a typed correction in the SAME turn
**Scenario:** user attaches a Jaya Grocer receipt and types "ignore the plastic bag 0.20, and the total should be 45 not 45.20".
**Gap:** The vision call + text go together; the AI may emit one `add_expense`. But there's no structured link between "what the photo said" and "what I corrected" — the user can't see the line items the photo produced vs their override. If the AI emits multiple line-item chips, the typed correction ("total 45") can't target one.
**V2:** Keep it simple and confirmation-first: when an image is present, prefer ONE summary chip (total) with the photo thumbnail attached to the chip, rather than N line-item chips, unless the user explicitly asked to itemize. The typed text is treated as an override hint in the same prompt turn (already is). Show the photo thumbnail on the resulting chip so the owner can re-open the image while reviewing the amount. Don't build an OCR-reconciliation engine — that's gold-plating.
**Files:** `moneyChat.ts` (prompt: "with a receipt photo + a typed amount, the typed amount wins; prefer one total chip unless asked to itemize"), `MoneyChat.tsx` (carry `imageUri` onto the pending chip → thumbnail).
**Effort:** M. **Risk:** Low.

---

### 6. 10+ entries at once — does the chip UI / save-all scale?
**Gap:** Horizontal chip ScrollView with index keys is bad past ~6 (no fade edge per the mandatory rule is even visible here — the pending row uses a plain horizontal ScrollView with NO right-edge gradient, violating the codebase's own MANDATORY fade rule). Save-all loops synchronously over 10 `executeAction`s on the JS thread — fine for 10, but each does wallet writes + learn writes + budget-impact recompute; at 20+ this can jank. No partial-failure recovery.
**V2:** (a) At N≥4, the sheet becomes the primary path (see #1) — it's a vertical FlatList-able list, not a horizontal squeeze. Convert the sheet's `.map()` to a FlatList per the codebase list rule once it can exceed ~10. (b) Add the mandatory right-edge fade gradient to the pending chip row. (c) `handleSaveAll` should record progress so a mid-save kill is recoverable (see #11).
**Files:** `MoneyChat.tsx` (fade gradient, auto-surface), `ReviewEntriesSheet.tsx` (FlatList when long).
**Effort:** S-M. **Risk:** Low.

---

### 7. Half-finished batch — app killed mid-save
**Gap (data loss):** `handleSaveAll` saves item-by-item; a crash/kill between items leaves a *partial* save with no record of what remained. On next cold start `pendingActions` still holds ALL 8 (they were never removed individually — only `clearPendingActions()` at the very end runs). So the 3 that DID save are now *also* still pending → the owner re-saves them → silent duplicates. This is the most dangerous bug in the whole flow.
**V2:** Save-all must remove each action from the queue *as it succeeds* (per-item `removePendingAction`/dequeue), not clear-all-at-end. Then a mid-batch kill leaves only the un-saved remainder pending — no double-save, no loss. Pair with the existing duplicate flag as a backstop.
**Files:** `aiInsightsStore.ts` (a `dequeueSaved(ids)` or per-item removal), `MoneyChat.tsx` (`handleSaveAll` dequeues incrementally; needs stable ids from #16).
**Effort:** S (once ids exist). **Risk:** Low — pure safety win.

---

### 8. Ambiguous amounts — "around 20-ish", "RM3.50 x2", "rm 1.2k"
**Gap:** AI may parse "20-ish"→20 (fine) but "RM3.50 x2" → could be 3.50 or 7.00; "1.2k" → 1200 or 1.2. There's no echo-back of the *interpreted* number before saving beyond the chip amount, and a parse to 0 produces the phantom-save bug (#2 in Part A). Decimal/comma locale ("3,50" EU-style, or "1.000" thousands) isn't normalized.
**V2:** (a) Fix the phantom save: `executeAction` add_expense/income must check `addTransaction`'s returned id; empty → `success:false`, keep the chip. (b) Prompt: when the user writes "x2" / "kali 2" / a range, do the math and state the interpreted number in the reply ("reading that as RM 7.00 — tap to confirm"). (c) The chip modal amount field is the safety net — it already shows the number; ensure a 0/blank amount disables the Save button (currently it falls back to `action.amount`, which can also be 0).
**Files:** `chatActions.ts` (return-id check), `moneyChat.ts` (prompt), `MoneyChat.tsx` (disable Save on amount≤0).
**Effort:** S. **Risk:** Low.

---

### 9. Malay-slang-only user — "aritu beli baju kt uniqlo dlm 80, pastu mkn 15"
**Gap:** Mostly a prompt/coverage issue. "aritu" (the other day) — does the AI set a past date? "dlm 80" (around 80). Category for "baju" → shopping. The system prompt has good examples but date-relative Malay ("aritu", "minggu lepas", "hujung bulan") isn't explicitly enumerated, and a wrong/missing date silently defaults to today — which corrupts the month's tally.
**V2:** Expand the prompt's Malay date lexicon (semalam/aritu/kelmarin/minggu lepas/awal bulan) → explicit `date` override, and add a calm chip subtitle showing the resolved date when it's NOT today ("for 12 Jun"), so a wrong relative-date guess is visible before saving.
**Files:** `moneyChat.ts` (prompt date lexicon), `MoneyChat.tsx` (chip shows non-today date).
**Effort:** S. **Risk:** Low.

---

### 10. Non-entry question — "how much left this week"
**Gap:** Handled well (prompt scenario 16, no ACTION block). Minor: there's no guard against the AI accidentally emitting an ACTION on a pure question; if it does, a phantom chip appears. Low frequency.
**V2:** No new feature — but add a light client-side guard: if a question-shaped message (ends with "?", or matches "berapa/how much/can i/boleh") yields an `add_*` chip with an amount the user never typed, hold it with a "did you mean to log this?" inform line rather than auto-queuing. Optional; low leverage. **Candidate to CUT** — risks hassling the user with a meta-question and second-guessing a feature that already works. Recommend: just keep the prompt rule, skip the client guard.
**Effort:** S. **Risk:** Medium (false positives = hassle). **Recommendation: cut the guard.**

---

### 11. Pending chips that sit for days
**Gap:** A chip prepared today, saved 4 days later, records with `date: now` (today), not the day it was about — quietly wrong. And there's no gentle "these have been waiting a while" surface beyond the once-on-open toast (which fires every open — mildly naggy).
**V2:** (a) Stamp each pending action with `preparedAt` at queue time. On save, if no explicit `date` was set and `preparedAt` is older than ~36h, use `preparedAt` as the transaction date (the day the user actually mentioned it), not today. (b) The open-toast already exists; make it fire only when the queue is *stale* (oldest > 1 day) OR newly arrived this session, not on every single open — less nag.
**Files:** `aiInsightsStore.ts` (`preparedAt` on enqueue), `chatActions.ts` (date fallback), `MoneyChat.tsx` (toast staleness gate).
**Effort:** M. **Risk:** Low.

---

### 12. Correcting the AI's wrong category/wallet guess
**Gap:** The chip modal lets you fix it, and `learningStore.learnCategory/learnWallet` learn from the confirm — good. BUT learning only happens on `handleConfirmAction` (single chip). **Save-all (`handleSaveAll`) bypasses the modal and never calls `learn*` on a corrected field** — and more importantly, batch-saved entries the user *didn't* open are saved with the AI's raw guess, and there's no learning from the implicit acceptance either. Also: there's no "this category is always wrong for X" fast correction without opening the modal.
**V2:** (a) `executeAction` already calls `learnCategory/learnWallet` for any action with category+wallet set — so batch DOES learn the *accepted* mapping (verify this covers the save-all path; it does, since each action carries its category). (b) The real gap: a corrected category in the modal teaches, but a corrected *type* (expense→income) only teaches in `handleConfirmAction`, not batch. Acceptable. (c) Add a long-press-on-chip → quick category swap without the full modal (fast path for the most common correction). Inform/prepare only.
**Files:** `MoneyChat.tsx` (quick category chip action), verify `chatActions.ts` learn coverage.
**Effort:** M. **Risk:** Low.

---

### 13. Undo after navigating away
**Gap:** The undo toast lives in the Echo screen's `ToastContext`. Save an entry, immediately navigate to Dashboard — the toast (and its undo) is gone. The just-created transaction is committed with no quick reversal. For save-all of 8 entries this is a real "oops" with no recourse except manual deletion across the app.
**V2:** Keep a short-lived **"last save" record** in `aiInsightsStore` (the created transaction ids + a timestamp, ~60s TTL). Surface a small "undo last save" affordance at the top of Echo on return, and/or let Echo answer "undo that" / "cancel benda tadi" by deleting those ids (it's a delete chip the user taps — confirmation-first preserved). This also makes undo survive the toast's lifetime.
**Files:** `aiInsightsStore.ts` (`lastSave: { ids, at }`), `MoneyChat.tsx` (return affordance), `moneyChat.ts` (prompt: "undo that" → delete_transaction for the last-saved ids).
**Effort:** M. **Risk:** Medium (must not let "undo" delete the wrong thing — scope strictly to the recorded ids).

---

### 14. Recurring detection across months
**Gap:** `recurringCandidate` needs the merchant in 3+ *distinct* months of SAVED history before nudging — so a brand-new user paying Netflix monthly won't get the nudge for 3 months, and someone who logs "Netflix" with varying descriptions ("netflix", "netflix bil", "nflx") never trips it (normalized but substring-fuzzy, amount ignored). Also the nudge only fires from single-chip save, not from save-all.
**V2:** (a) Loosen to "2+ months at a similar amount" OR a single known-subscription name match (Netflix/Spotify/Disney/iflix/YouTube Premium/Astro) — a small known-merchant list catches month-1 users without waiting a quarter. (b) Fire the nudge from `handleSaveAll` too (currently only `handleConfirmAction`). Still one-time, still dismiss-tracked, still inform-only.
**Files:** `chatActions.ts` (`recurringCandidate` loosening + known list), `MoneyChat.tsx` (`handleSaveAll` nudge).
**Effort:** S-M. **Risk:** Low (it's a soft toast).

---

### 15. Edit/delete an already-SAVED transaction via chat (the riskiest path)
**Gap:** `edit_transaction`/`delete_transaction` fuzzy-match and act on `matches[matches.length-1]` the instant the chip is tapped. The owner never sees *which* concrete row (date/amount/wallet) will be edited/deleted before confirming, and `deleteAll:true` can wipe up to 5 rows. There's no preview, and (for edit) no undo snapshot. This is destructive and under-surfaced.
**V2:** When a `delete_transaction`/`edit_transaction` chip is prepared, resolve the matched row(s) at prepare-time and show them on the chip / in the modal: "will remove: lunch RM 12 · 14 Jun" so the owner confirms against the *actual* target, not a description. For `deleteAll`, list all N. Add an undo for chat-driven deletes (capture the deleted records, offer toast undo like adds do). Keep confirmation-first (still a tap).
**Files:** `MoneyChat.tsx` (resolve+preview matched txn on chip/modal; undo for deletes), `chatActions.ts` (a read-only `previewMatches(action)`).
**Effort:** M-L. **Risk:** Medium (destructive; preview logic must mirror executor's match logic exactly or it lies).

---

### 16. Stable IDs for pending actions (foundational — unblocks #3, #4, #7, #13, #15)
**Gap:** Everything is index-based; mutation-during-edit and partial-save-dedup are both rooted here.
**V2:** Give every `ChatAction` queued a stable `pendingId` (uuid) at enqueue. Chips/modal/remove/dequeue key off `pendingId`, not array index. This is the single highest-leverage robustness change — it makes incremental dequeue (#7), correct edit targeting, and last-save undo all clean instead of fragile.
**Files:** `aiInsightsStore.ts` (assign id on `addPendingActions`), `MoneyChat.tsx` + `ReviewEntriesSheet.tsx` (key/select by id).
**Effort:** M. **Risk:** Medium (touches every pending-action call site — but mechanical).

---

### 17. Phantom save on zero/blank amount (Part A #2)
**Gap:** Already detailed. A chip with amount 0 (bad parse, cleared field) prints "Added expense … RM 0.00", removes the chip, but nothing persisted (`addTransaction` dropped it). Data silently lost + false confirmation = trust-breaking.
**V2:** `executeAction` checks the returned id for add_expense/add_income (and the wallet-affecting branches); empty id → `success:false`, message "couldn't save — amount looks empty", chip stays. Disable the modal Save button when amount ≤ 0.
**Files:** `chatActions.ts`, `MoneyChat.tsx`.
**Effort:** S. **Risk:** Low. **Pure correctness.**

---

### 18. Mixed-direction running total is misleading (Part B #2 generalized) — see #2.

---

### 19. The pending chip row violates the mandatory fade-gradient rule
**Gap:** Per MEMORY, every horizontal ScrollView L-to-R must have a right-edge LinearGradient fade. The `pendingChipRow` ScrollView has none — chips just get clipped. Small but it's a stated invariant.
**V2:** Add the 40px right-edge `withAlpha(bg,0)`→`bg` gradient (not `'transparent'`).
**Files:** `MoneyChat.tsx`.
**Effort:** S. **Risk:** Low.

---

## Part C — Ideas explicitly CUT (would hassle the user)
- **#10 client-side "did you mean to log this?" guard** — second-guesses a working feature; false positives nag. Keep the prompt rule only.
- **Auto-saving anything after a delay / "save automatically if you don't touch it"** — violates the sacred invariant. Never.
- **Per-line-item OCR reconciliation engine for receipts** (#5) — gold-plating; one total chip + thumbnail is enough.
- **Gamified streaks / pushy daily nags** — V1's rhythm line is the ceiling; anything louder breaks CALM.
- **Blocking on duplicate/large amount** — must stay soft/inform-only forever.

---

## Part D — Ranked by leverage (impact ÷ risk)

| # | Proposal | Effort | Risk | Why it ranks |
|---|----------|--------|------|--------------|
| 7 | Incremental dequeue on save-all (no double-save after mid-batch kill) | S* | Low | Fixes silent duplication / data loss — worst current bug |
| 17 | Fix phantom save on amount ≤ 0 | S | Low | False "saved" + silent loss = trust breach |
| 16 | Stable `pendingId` (unblocks 7,3,4,13,15) | M | Med | Foundational; removes index fragility everywhere |
| 2 | Signed/segmented total (came in vs went out) | S | Low | Misleading money math today; CALM-vocab win |
| 15 | Preview the matched row for chat edit/delete of saved txns | M-L | Med | Riskiest destructive path is currently blind |
| 8 | Echo-back interpreted ambiguous amounts (x2, ranges, k) | S | Low | Prevents wrong/zero amounts at the source |
| 1 | Dedupe against the pending queue + auto-surface sheet at N≥4 | S | Low | Multi-item is the core use case; scales it |
| 11 | `preparedAt` → correct date for stale chips + de-nag open toast | M | Low | Quietly-wrong dates corrupt the month |
| 13 | Last-save undo that survives navigation | M | Med | Removes the "oops, gone" dead-end |
| 4 | Resolve+show debt balance on debt_update/forgive chips | M | Med | Stops paying the wrong/no debt silently |
| 14 | Looser recurring detection + fire from save-all | S-M | Low | Catches month-1 subscribers; small |
| 3 | Editable transfer/split in chip modal + reshape affordance | L | Med | Lets the user express the 3 shapes they can't today |
| 9 | Malay relative-date lexicon + show non-today date on chip | S | Low | Slang-only users; visible date guard |
| 12 | Long-press chip → quick category swap | M | Low | Fast correction without full modal |
| 19 | Add mandatory fade gradient to pending chip row | S | Low | Stated invariant; polish |

*S once #16 (ids) lands.

**Top build order recommendation:** 16 (ids) → 7 + 17 (data-loss/correctness) → 2 + 8 (money honesty) → 1 + 11 (scale + dates) → 15 + 13 + 4 (destructive/undo) → 14, 3, 9, 12, 19 (depth/polish).
