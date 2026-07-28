# Share-to-Log — plan & edge-case brainstorm

**Feature:** screenshot a payment-success screen → Share → Potraces → ~1–2s later a push "Logged RM 57.40 · LNTHAIFOOD". Two brains: an **intelligent local parser** (offline / AI-limit reached) and **Echo** (online, smarter) reading the screenshot.

Status: PLANNING. No code yet. This doc maps what to reuse, what to build, the edge cases, and the open decisions to settle before building.

---

## 1. The big win — most of the engine already exists

| Need | Reuse | File |
|---|---|---|
| "Log a payment" core (category guess + wallet resolve + txn + wallet deduct) | `logQuickExpense(params)` | `src/services/quickLog.ts:140` |
| Wallet attribution by name/alias/type + fallback | `resolveWallet(raw)` | `quickLog.ts:84` |
| Merchant → category | `guessMerchantCategory()` | `src/services/merchantCategoryGuess.ts:75` |
| On-device OCR + row reconstruction + amount/date regexes | `scanReceiptLocal`, `reconstructRows`, `amountsIn`, `findDate` | `src/services/localReceiptOcr.ts` |
| Echo/Gemini vision path | `aiProxy` → `ai-proxy` edge fn | `src/services/aiProxy.ts` |
| Immediate LOCAL notification | `scheduleNotificationAsync({ trigger: null })` | pattern in `src/services/spendingAlerts.ts:100` |
| Deep-link routing pattern | imperative `navigationRef.navigate` inside `handleUrl` | `App.tsx:482` |
| Share target (accepts ≤4 images) | `ShareExtension.tsx` (deep-links `potraces://share?payload=…`) | repo root + `app.json:174` |

**Genuinely new work:** (a) a **payment-screen parser** (receipts ≠ payment screens), (b) the `potraces://share` handler, (c) a **local "Logged RM…" notification** (existing one is server-only), (d) **dedupe** (none today), (e) the confidence/review UX.

---

## 2. Architecture options

The drawn UX is "app never opens, background 1–2s, push arrives." That collides with the current design, where the share extension just deep-links into the (foregrounded) app. Three flows:

- **Flow B — app opens briefly, client-side log (RECOMMENDED v1).** Share → app opens → local OCR+parse → `logQuickExpense` → local "Logged RM…" notification. Reuses everything, works offline, fully **OTA-updatable** (parser tweaks ship without App Store). Cost: a brief app foreground, not a pure push.
- **Flow C — extension does everything (true background, matches the drawing).** Extension runs ML Kit OCR + parse + writes to a shared App Group + fires the local notification, never opens the app; app reconciles later. Cost: that logic is **NOT OTA-updatable**, needs ML Kit linked into the extension target + App Group + notification entitlement. Best as **v2** once the parser is proven.
- **Flow A — server inbox (like Apple auto-log).** App POSTs parsed data to `quick-log`, server logs + pushes. Reuses the inbox/push, but needs network (no offline) and still opens the app. Skip — Flow B is strictly better for our goals.

**Recommendation:** ship **Flow B** first (offline-first, OTA, reuses the engine), validate parser accuracy on real screenshots, then graduate the hot path to **Flow C** for the pure-background feel.

---

## 3. Pipeline (Flow B)

1. **Share extension** (`ShareExtension.tsx`) — already deep-links `potraces://share?payload={image,text,url}`. Keep thin.
2. **`handleUrl` gains a `share` branch** (`App.tsx`, before the `isAdd` guard at :530) — `JSON.parse(decodeURIComponent(params.payload))`, `setMode('personal')`, route to the share pipeline.
3. **OCR** the image locally (ML Kit via the `localReceiptOcr` probe) → rows.
4. **`parsePaymentScreenshot(rows)`** (NEW) → `{ amount, merchant, refId, datetime, method, direction, currency, confidence, isPaymentScreen }`.
5. **Guard:** if `!isPaymentScreen` or `confidence` low or `!amount` → open a review/confirm sheet instead of silent-logging (don't log garbage).
6. **Dedupe:** compute `dedupeKey` (refId, else `amount|merchant|roundedDatetime`). If seen (incl. Apple-auto-log path) → skip + "already logged" toast.
7. **Log:** `logPaymentFromShare(parsed)` → wraps `logQuickExpense` (income vs expense from `direction`), tags provenance.
8. **Notify:** local `scheduleNotificationAsync({ trigger:null })` "Logged RM 57.40 · LNTHAIFOOD". Tap → open the txn (editable).
9. **(Online + quota) Echo enrich:** optionally re-read image via `aiProxy` for better merchant/category; patch the txn. Never blocks the instant local log.

---

## 4. Functions / modules to build

Parser (pure, testable — build & validate FIRST, no native needed):
- `parsePaymentScreenshot(rows: string[]): ParsedPayment` — orchestrator.
- `classifyPaymentScreen(rows): { ok: boolean; direction: 'out'|'in'|null; confidence }` — is this even a payment screen, and paid vs received?
- `pickPaymentAmount(amounts, rows): number | null` — disambiguate the PAYMENT amount from balance / fee / cashback / reward.
- `extractPayee(rows): string | null` — merchant or P2P person name.
- `extractRefId(rows): string | null` — reference / transaction id.
- `extractPaymentDateTime(rows): Date | null` — reuse/extend `findDate`; add time.
- `detectCurrency(rows): 'MYR'|string`.
- `extractWalletHint(rows): string | null` — the paying app/wallet from brand text / balance labels / DuitNow source; fed to `resolveWallet` (→ default wallet when null). [decision #2]

Pipeline / glue:
- `ocrImageToRows(uri): Promise<string[]>` — ML Kit wrapper (reuse `getRecognizeText` + `reconstructRows`).
- `echoParsePayment(uri): Promise<ParsedPayment>` — Gemini via `aiProxy` (enrichment).
- `logPaymentFromShare(parsed): { txnId, walletId } | null` — thin wrapper over `logQuickExpense` adding direction + provenance + dedupe.
- `paymentDedupeKey(parsed): string` and `isDuplicatePayment(key): boolean` + a small persisted set of recent keys (new tiny store, or extend an existing one; must also cover the Apple-auto-log path).
- `presentLoggedNotification(txn): Promise<void>` — local `trigger:null` banner + deep link to the txn.
- Share deep-link handler in `handleUrl` + a route target (silent-log path and/or a `ShareReview` confirm sheet).
- Provenance: add `inputMethod: 'share'` (extend the union in `types/index.ts:754`) or a `tags` marker — needed for dedupe/audit and to distinguish from manual.

---

## 5. Parser design — payment screen ≠ receipt

Receipts have line items + subtotal + tax + total. Payment-success screens have: a status word ("Payment successful" / "Pembayaran berjaya"), ONE hero amount, a payee, a ref id, a datetime, a method ("Scan & Pay"). Different heuristics:
- **Amount:** usually the largest / hero-styled RM value — BUT beware the screen also showing **wallet balance** and **fee/cashback**. Prefer the amount adjacent to the status word / top; exclude values on "balance/baki/reward/cashback/fee" rows.
- **Payee:** the ALL-CAPS merchant (`LNTHAIFOOD`) or a person name for P2P (`NOOR AZEANA BINTI AZLAN`).
- **Direction:** "successful/paid/Scan & Pay/DuitNow to" → expense; "received/masuk/DuitNow from" → income.
- **Ref:** `QR…`, "Reference ID", "Transaction ID", "Ref No".
- Keep per-app profiles (TnG, MAE/Maybank, DuitNow, CIMB, Boost, GrabPay, ShopeePay, Setel) — a small table of anchors/labels, not fixed coordinates.

---

## 6. Edge cases (brainstorm)

### Parsing
- Multiple RM values on one screen (payment + new balance + fee/cashback/reward) → must pick the payment, not the balance. **Highest-risk failure.**
- Amount formats: `RM 57.40`, `RM57.40`, `MYR 57.40`, `57.40`, thousands `RM 1,234.56`, no-decimal `RM 60`, OCR `57.4O`/`5?.40`.
- Payee: ALL-CAPS, truncated, generic ("DUITNOW", "QR PAYMENT"), or a **person** (P2P transfer — is that an expense? a transfer? see wallet).
- Direction: received/refund/reversal screens (income), failed payment shared by mistake (**must not log**).
- Not a payment screen at all (random photo, receipt → different parser, chat, meme) → guard, don't log.
- Malay / other-language screens; foreign currency (SGD/USD).
- Old screenshot shared → use the screenshot's date, warn if far in the past.
- Datetime missing → fall back to now (but that breaks dedupe-by-time).

### Flow / UX
- **Double-log vs Apple Wallet auto-log:** same payment auto-logged AND shared → double txn + double wallet deduct. Cross-path dedupe is mandatory.
- Same screenshot shared twice → dedupe by refId (or amount+payee+time hash when no ref).
- 2–4 images shared at once (activation max 4) → batch all, or first only? (extension currently takes first.)
- Logged out / app not installed → can't log; extension should message, not silently fail.
- Offline → local parse + local notification + queue sync; server "Logged RM…" push won't fire (must use the LOCAL notification, not rely on server).
- Wrong parse (amount/payee) → tap notification opens editable txn; provide Undo (like `undoQuickExpense`, `App.tsx:562`).
- Low confidence → confirm sheet instead of silent log (confidence-gated: silent for high, review for low).
- 1–2s budget: local OCR ~0.3–1s OK; Gemini 2–5s → enrichment only, never the instant path.

### Wallet / money-math
- Screenshot rarely names the source wallet → default wallet? dedicated "QR / Scan & Pay" wallet? remember last? ask once?
- Wrong wallet → balance drift (self-heals via `autoReconcileWallets` but user sees a wrong number first).
- P2P person payment → expense vs wallet↔wallet transfer? If transfer, must NOT use a `transfer-` id or it drops from spend math (`insights.ts:102`); if it's paying a friend back, it's an expense/debt repayment.

### Privacy / trust
- OCR is on-device (fine). **Echo path sends the image to Gemini** (`aiProxy`) → PII (names, account digits) leaves the device. Default local-only; make AI enrichment explicit/opt-in.
- Sensitive digits in the screenshot — don't store the raw image longer than needed.

---

## 7. Decisions — LOCKED (2026-07-23)

1. **Silent log, always.** No confirm sheet. If we have a valid amount → log silently + fire the "Logged RM…" notification (tappable → editable txn, with Undo). **Guard still applies:** if we CANNOT extract a confident amount / it's clearly not a payment screen → do NOT log a wrong number; instead a "couldn't read that one — tap to add manually" notification. Silent ≠ log-garbage.
2. **Read the source wallet off the screenshot; default only when unsure.** Add `extractWalletHint(rows)` — detect the paying app/wallet from brand text ("Touch 'n Go", "MAE", "GXBank", "Boost", balance labels, DuitNow source) → feed into existing `resolveWallet`. If no confident hint → `resolveWallet` falls back to the default wallet (its current behavior). No new "Scan & Pay" wallet, no ask.
3. **Both parsers.** Local ML Kit parser is the instant + offline + AI-limit path; **Echo (Gemini via `aiProxy`) enriches when online + within quota** (better merchant/category, and can override a low-confidence local amount). Sending the image to Gemini is consistent with the existing receipt-scan flow (same PII posture) — not a new exposure.
4. **iOS AND Android from the start.** iOS: `expo-share-extension` (installed). Android: share `intent-filter` (`SEND` + `image/*`) → same `potraces://share` handoff. Same `parsePaymentScreenshot` + `logPaymentFromShare` reused on both; ML Kit text recognition already works cross-platform.

Still to design (not blockers): **dedupe** strategy incl. the **Apple-auto-log cross-path** (shared recent-key store keyed by refId, else `amount|payee|roundedTime`) — decide during P1.

---

## 8. Suggested phases

- **P0 — parser (no native):** `parsePaymentScreenshot` + fixtures from real screenshots (TnG/MAE/DuitNow/CIMB/Boost). Pure function + tests. Validate accuracy before touching the extension. **Start here.**
- **P1 — Flow B wiring:** `share` deep-link handler → OCR → parse → `logPaymentFromShare` → local notification → editable txn + Undo. Dedupe. Offline-first.
- **P2 — Echo enrich:** online + within quota, re-read via `aiProxy`, patch merchant/category.
- **P3 — Flow C:** move OCR+parse+notify into the extension for the pure-background push; App Group handoff; app reconciles.

---

## Key files
- `src/services/quickLog.ts` (`logQuickExpense`, `resolveWallet`), `src/services/quickLogInbox.ts` (drain/dedupe pattern)
- `src/services/localReceiptOcr.ts` (OCR primitives to reuse), `src/services/receiptScanner.ts` (local-vs-Gemini decision)
- `src/services/merchantCategoryGuess.ts`, `src/store/personalStore.ts` (`addTransaction`), `src/store/walletStore.ts` (deduct/reconcile)
- `App.tsx` (`handleUrl` deep-link routing), `ShareExtension.tsx` + `app.json` (share extension)
- `src/services/spendingAlerts.ts` (local `trigger:null` notification pattern), `src/services/pushNotifications.ts`
- `src/types/index.ts:736` (`Transaction`, `inputMethod` union at :754)

---

## Field note (2026-07-27): the "dead extension" pattern

**Symptom:** share a screenshot → **no popup card, no "Logged RM…" banner — yet the payment still appears in Transactions later.** Cause: in dev builds the extension loads its JS from Metro (`ShareExtensionViewController.swift` → `bundleURL()`), while its native half stages the file into the app group *regardless*. If Metro is unreachable (hardcoded IP stale after a DHCP re-lease, sharing from the office machine's network, Metro down), the card and banner never happen — and the app's reconcile logs the staged file **silently**, because it assumes the extension already notified.

**Fixes shipped (2026-07-27):**
- `src/utils/shareExtBridge.ts` — in `__DEV__` the app records its Metro host to `metro-host.txt` in the app-group root; the extension's Swift reads it and follows the SAME Metro on any network/machine (hardcoded IP kept as fallback). Takes effect after one dev-client rebuild; the app must have been opened once on the current network.
- Notified-file markers (`notified-files.json`, same bridge): the extension marks each staged image it fired the banner for; the app reconcile fires the outcome notification itself for unmarked images (and opens the receipt review for unmarked receipts) instead of a silent log. Duplicate banner is possible only if the marker write fails — preferred over silence.
