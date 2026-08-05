# Statement Import → Reconciliation — Production Plan

Status: Phases 0–3 code-complete (2026-08-05). Built: §2 data model + migration
`20260804000000_import_batch_fields.sql`, `src/store/importBatchStore.ts` (undo),
quota aligned to 5 (needs edge-fn deploy), currency guard, cache wipe, toast+Undo,
§3 engine `src/utils/transactionMatcher.ts` (33 tests), §4 three-section review UI
on both import screens, §9 backfill banner (`StatementBackfillBanner` on personal
Dashboard) + monthly nudge (`src/services/statementReminders.ts`, re-armed on
foreground/import/settings), localized timeout/auth copy.
UPDATE 2026-08-05: the inline backfill banner was REMOVED from the Dashboard (user
found it pushy) — statement import now surfaces via the Explore tile (first quick
action) → Explore sheet in `src/components/common/QuickActions.tsx`. The banner
component file remains but is unused.
Phase 3 built: parser v2 (e-wallet top-ups as transfers, per-row `account` last-4
for multi-account PDFs, per-row `originalAmount`/`originalCurrency` — NOT yet
deployed), tier-1 date merges (bank date wins, silent), same-day add-time warning
in QuickAddExpense (`findSameDayDuplicate`), FX-exact engine pass (exact foreign
amount + currency → tier 1; imported FX rows store originalAmount/fxRate),
reconcile horizon (`Wallet.reconciledUntil` + migration
`20260805010000_wallet_reconciled_until.sql` + filtering on both screens +
post-import offer on the statement screen), multi-account grouping on the
statement screen (per-account wallet pickers, per-wallet matching + deltas).
Verification: full suite green — 51+ tsx suites + tsc. NOTE: `npm test` hangs when
backgrounded on this machine; run suites directly via `./node_modules/.bin/tsx`.
Remaining (human steps): device dogfood (§10 day-15 test + multi-account + FX +
reconcile flows), §6 compliance sign-off, §7 fixtures, edge-fn deploy +
both migrations applied to remote.
Scope: personal-mode bank statement (PDF) import + CSV import, and their coexistence
with the other three write paths (manual log, share-to-log, quick log / back-tap).
Audience: whoever builds this (human or agent). Every step has a check.

---

## 0. Why this exists (decision record — do not re-litigate)

Four write paths create transactions with wildly different shapes:

| Path | description | date precision | wallet resolution |
|---|---|---|---|
| Manual (`QuickAddExpense.tsx`) | **category name** — no description field exists | log time | user pick |
| Share-to-log (`shareToLog.ts`) | OCR/AI payee | minute precision | alias/hint resolve |
| Quick log / back-tap (`quickLog.ts`) | free note, else category name | `occurred_at` | alias resolve |
| Statement/CSV import | bank narrative | **day only** | single selected wallet |

Consequences that drive the whole design:

1. **Description can never be a match signal.** Manual logs store the category name
   as description; research found no production system that matches human free text
   to bank descriptors reliably (zero token overlap: "lunch mamak" vs
   "QR PAY ZABEDIN NASI KANDAR MY"). YNAB ignores payee entirely; Actual Budget uses
   it only as a tiebreak pass.
2. **The only universal fields are amount + type + date(with drift).**
3. Industry-standard matching: exact amount + date window (YNAB ±10d, Actual ±7d,
   Sure 8d), three zones (auto / review / non-match) — Fellegi-Sunter since 1969.
4. False merges are worse than false duplicates (Sure #2013: amount+window merging
   collapsed two real same-amount transactions → permanent invisible data loss).
   Bias to precision; human review for the ambiguous; one-to-one assignment only.
5. MY rails: DuitNow QR / FPX debit instantly (0-day drift for most rows); cards
   drift 1–5 business days, worse over weekends (batch posting); FX rows can drift
   in amount too (settled ≠ authorized).
6. Behavior: manual daily logging decays within ~1–3 months (diet-logging analog:
   median 10 weeks, <40% of lapsed loggers return). The safety net is not optional.
   Mint's shutdown proved history continuity is the #1 adoption anxiety.

**Positioning (settled):** import is not a 4th logging method. It is
(a) onboarding backfill and (b) the monthly "did you miss anything?" safety net.

---

## 1. Architecture overview

```
PDF/CSV pick ──► parse (server AI / client CSV) ──► transactionMatcher ──► review UI ──► bulk import
                                                          ▲                      │
                                          existing transactions                   ▼
                                          (personalStore, local)        addTransactions(importBatchId)
                                                                                 │
                                                                        undo via batch delete
```

- All matching runs **client-side** (app is local-first; cloud backup is opt-in).
  Volumes are small (tens–hundreds of rows × a few thousand existing) — block by
  `(amountSen, type)` into a Map, O(n) effectively. No ML, no blocking machinery,
  no configurable thresholds.
- One engine, both imports: `src/utils/transactionMatcher.ts` (new) replaces the
  dedup call sites in `ImportFromStatement.tsx` and `ImportFromCsv.tsx`.
  `importDedup.ts` Tier-0 key stays as the engine's exact tier.

---

## 2. Data model changes (foundation — do first)

`src/types/index.ts` Transaction (lines ~778-812):

- [ ] `inputMethod` union: add `'statement-import' | 'csv-import'` — both import
      screens already write these values with `as any` casts; make them honest.
- [ ] `externalRef?: string` — bank reference number when the parser has one
      (statement `raw` lines carry DN-/ref-prefixed IDs). Identity beats similarity;
      this enables exact cross-statement matching later. v1: store when available,
      no UI.
- [ ] `importBatchId?: string` — set on every row created by an import. Enables
      undo and "what did that import add" queries.

Sync (`src/services/personalSyncMappers.ts:71-100`):

- [ ] Decide + implement: add `external_ref`, `import_batch_id` columns via a new
      Supabase migration and include in `txToRemote`, so undo/batch survives
      cloud-backup restore. (Recommended. If skipped, document that batch undo is
      device-local only.)

New small store `src/store/importBatchStore.ts` (zustand + AsyncStorage):

- [ ] Record per batch: `{ id, createdAt, source: 'statement'|'csv', walletId,
      filename?, txIds: string[] }`. Keep last 20 batches (or 90 days), prune on write.
- [ ] `undoBatch(id)`: loop `personalStore.deleteTransaction(txId)` — deletion
      already reverses wallet deltas and frees dedupe keys, so undo reuses proven
      logic. Remove batch record after undo.

---

## 3. The matching engine (`src/utils/transactionMatcher.ts`)

Input: existing transactions (all personal, not just the target wallet — cross-wallet
detection matters), candidate rows `{amount, type, date, description?, walletId}`,
options. Output per candidate: `{ tier: 0|1|2|new, matchedTxId?, matchedWalletName?,
dateGapDays? }`. Multiset-aware, one-to-one: each existing transaction can be claimed
by at most one candidate; pair by nearest date first.

| Tier | Rule | Action |
|---|---|---|
| 0 — exact | today's `importRowKey` (wallet + day + sen amount + type + normalized description) | silent skip, count only |
| 1 — auto | same wallet + exact sen amount + same type + \|Δdate\| ≤ 2 days | "already logged", excluded from import, shown collapsed |
| 2 — review | Δdate 3–7 days (same wallet), **or** any cross-wallet amount+type+Δ≤7 match, **or** either side has `originalAmount` (FX) | "possible duplicate", default **skip**, one tap to include |
| new | no match | import (checked) |

Hard rules:

- Amount is always exact to the sen; there is no amount tolerance. (FX drift is
  handled by pushing FX rows to Tier 2, not by tolerance.)
- Description is never consulted. Category agreement may order Tier-2 rows
  (stronger-looking pairs first) but never changes a tier.
- One bank row can never absorb two logged transactions (Sure #2013). With counts
  2 logged vs 1 imported: match the nearest pair, leave the second logged row alone,
  and the imported row is "already logged".
- Tier 2 is never auto-decided. Default skip (a missed import is visible and
  re-importable; a wrong import silently inflates totals).
- Existing transactions marked `inputMethod: 'statement-import'/'csv-import'` match
  each other through the same tiers — protects CSV-then-statement sequences.

### Unit tests (extend `scripts/test-import-dedup.ts` pattern → `scripts/test-transaction-matcher.ts`, wire into `npm test`)

- [ ] Tier 0 identical re-import is a no-op.
- [ ] Tier 1: same amount, ±0/1/2 days, same wallet → already-logged.
- [ ] Tier 1 boundary: 3 days → NOT tier 1.
- [ ] Tier 2: 3–7 days same wallet; cross-wallet same amount/day; FX either side.
- [ ] Tier 2 boundary: 8 days → new.
- [ ] Twins: 2 logged vs 2 imported same amount → both matched; 2 vs 1 → nearest
      pair matched, second logged row untouched, import skipped once.
- [ ] Cross-wallet match does not consume same-wallet candidate (pairing order).
- [ ] 1 sen difference → new.
- [ ] income vs expense never matches.
- [ ] Manual-log descriptions ("Food") vs bank narrative ("QR PAY ZABEDIN") with
      same amount/date → tier 1 (description ignored).
- [ ] Invalid candidate rows (bad date, amount ≤ 0) never match.

---

## 4. Review screen redesign (`ImportFromStatement.tsx`, then `ImportFromCsv.tsx`)

Header (replaces bare "review N rows"):

> **Statement covers 1–30 Jun · 42 already logged · 19 new — we'll only add the new ones.**

Three sections, in order:

1. **New** (count badge) — checked, importable. Row: date, description, signed
   amount, category chip (editable, as today).
2. **Needs review** — unchecked. Row additionally shows the match:
   "you logged RM12.00 to **Cash** on 12 Jun" (or "3 days apart"). One tap toggles
   include. No category editing needed until included.
3. **Already logged** — collapsed by default, greyed, view-only (the Tier-2 group
   is the escape hatch; force-include on Tier-1 rows is v2).

Behavior:

- [ ] Transfers-skipped and invalid-dropped rows keep current aggregate alerts.
- [ ] Success feedback (fixes today's silent zero-skip path): toast/snackbar
      "Imported 19 · skipped 42 already logged" with **Undo** action (batch delete).
- [ ] Import confirm Alert keeps wallet name; add "duplicates will be skipped" line.
- [ ] All new strings in `en` **and** `ms` (`src/i18n/en.ts:4681`, `ms.ts`).

CSV screen: same engine, same three sections; column-mapping step unchanged.

---

## 5. Pipeline hardening (`statementImport.ts`, `parse-statement` edge fn)

- [ ] **Quota alignment (bug)**: UI says 5/month (`en.ts:4687`), server enforces 4
      (`parse-statement/index.ts:22`). Align to **5** server-side (matches copy;
      cost negligible). OPEN DECISION: what happens at cap — v1: friendly message +
      point to CSV import (no quota). Paywall/upsell is a product decision, later.
- [ ] **Currency guard**: server returns `currency`; if it ≠ app currency
      (`settingsStore.currency`), block before review with a clear message.
      (Today: USD statement into RM wallet = silent garbage.)
- [ ] **Timeout UX**: 60s client timeout stays; error copy becomes actionable —
      "this statement is large — try fewer months" instead of bare timeout.
      (Month-range picker / server chunking = Phase 3.)
- [ ] **Cache hygiene**: delete the picked PDF copy from the cache directory after
      upload completes (success or failure). Statements are sensitive; don't leave
      them on disk.
- [ ] **Password flow**: already good (never persisted, 422 before quota burn) —
      keep; add a comment-level assertion in tests/docs. IC-number hint stays.
- [ ] **Parser resilience**: `raw` already returned per row — persist it into
      `externalRef` extraction later; log `ai_invalid_json` samples server-side
      (already 200-char sample) for prompt regression debugging.
- [ ] **Multi-account PDFs**: v1 documented limitation ("one account per statement —
      split the PDF first"). Phase 3: parser returns `accountLast4`, review groups
      by account with per-group wallet picker.

---

## 6. Compliance checklist (blocking for production)

- [ ] Verify Gemini API data terms in writing (paid tier = inputs not used for
      training — confirm current terms, don't assume). Record the finding + date
      in `docs/legal/`.
- [ ] Update privacy policy: bank statements are uploaded for server-side AI
      processing, not stored, password never persisted, third-party processor named.
- [ ] PDPA (MY): statements = sensitive financial data; the above disclosure +
      cache wipe (§5) + no-server-storage is the compliance story. Keep it true.
- [ ] Quota accounting stays server-side (`ai_usage` table) — already true.

---

## 7. Parser regression fixtures (blocking for production — Gemini churn has broken this pipeline twice)

- [ ] Collect 1–2 anonymized statements per bank: Maybank, CIMB, Bank Islam,
      Hong Leong + 1 e-wallet (TnG PDF export). Store under
      `supabase/functions/parse-statement/fixtures/` (gitignored if real data;
      anonymized synthetic preferred).
- [ ] Golden test script: parse each fixture, snapshot extracted rows (count, first/
      last row, totals). Re-run on every model or prompt change.
  Note: the *descriptor formats per bank are unpublished* — fixtures are the only
  ground truth. Do not trust vendor example layouts.

---

## 8. Instrumentation (to tune tiers with real data — no public ground truth exists)

Per import, log (anonymized counts only, reuse `ai_usage` metadata or
`record_usage_event`): statement rows, tier0/1/2/new counts, tier-2 include-toggle
rate, undo usage, parse errors by code. Sanity anchor from industry: review-queue
flag precision ~59% (AppZen) — if our Tier-2 include rate is far below, widen Tier 1;
if users complain about missed dupes, widen Tier 2 window toward YNAB's 10.

---

## 9. Entry points & rollout

- [ ] **Onboarding**: after first wallet creation, optional step "start with last
      month's statement?" — skippable, links to ImportFromStatement. Empty wallet =
      zero collision risk; instant history is the #1 switching anxiety (Mint evidence).
- [ ] Settings entries stay as-is.
- [ ] **Monthly nudge** (Phase 2): local notification end-of-month, "did you miss
      anything? import your statement" — reuse existing notification infra.
- [ ] **Feature flag**: gate the new review UI behind a flag (settingsStore or
      remote) until dogfooding passes; CSV+statement share it.
- [ ] i18n complete (en + ms) before flag flips on.

---

## 10. Phasing & acceptance criteria

### Phase 0 — foundations (small, no UX change)
Build: §2 (types, migration, batch store), quota fix, currency guard, cache wipe,
success toast + Undo on the *current* flat review screen.
**Done when:** re-import same file → toast "0 imported · N already logged" with
working Undo; USD statement blocked; `npm test` green.

### Phase 1 — the core (matcher + review redesign)
Build: §3 engine + tests, §4 three-section UI on both import screens, §8 logging,
flag-gated.
**Done when (the day-15 test):** log 14 days via manual + share + quick log against
one wallet, then import that account's statement → zero duplicates imported without
touching anything; cross-wallet and 3–7-day rows land in Needs review; twins survive.
Plus: matcher unit tests green; a USD/mixed statement blocked at currency guard.

### Phase 2 — positioning
Build: onboarding entry, monthly nudge, actionable timeout copy, i18n sweep,
docs (`site/` help page if one exists for import).
**Done when:** fresh account can complete onboarding backfill; nudge fires on
schedule in staging; flag ON for beta cohort.

### Phase 3 — later, evidence-driven (not scheduled)
Merge semantics (bank date wins on Tier-1 matches, YNAB-style) · reconcile/lock
horizon per wallet · e-wallet top-up transfer modeling (TnG/GrabPay statements —
top-ups post as bank debits; without transfer modeling, importing both statements
double-counts) · FX-aware matching · multi-account PDFs · add-time cross-channel
dupe warning (extend `findDuplicateTransaction.ts` beyond its 10-minute window).

---

## 11. Production-readiness checklist (run before flag → 100%)

Functional:
- [ ] Day-15 scenario (above) passes on device, both iOS + Android.
- [ ] Re-import identical file → all skipped, undo restores nothing (nothing added).
- [ ] Delete an imported row → re-import brings it back (intentional, Actual-style;
      no tombstones) and it lands in New.
- [ ] Password PDF: wrong → right password, quota not consumed by failures.
- [ ] Quota cap: 6th import shows the friendly message + CSV path.
- [ ] 12-month statement: timeout copy actionable OR import succeeds < 60s.
- [ ] FX transaction logged manually → statement row lands in Needs review, not auto-skip.
- [ ] Undo after import → balances and totals exactly as before import.
- [ ] Airplane mode: parse fails with network error, no crash, PDF cache wiped.

Non-functional:
- [ ] Review screen renders 500 rows without jank (FlatList windowing check).
- [ ] Matching 500 candidates × 5,000 existing < 100 ms (blocking map — measure once).
- [ ] All new strings present in en + ms.
- [ ] §6 compliance items signed off; §7 fixtures run green on the shipped model.
- [ ] Instrumentation events visible in ops console for a test import.

Known limitations to state in release notes: one account per statement PDF ·
deleted imports re-import if you run the file again · e-wallet + bank statement
double-import not yet transfer-aware (Phase 3).
