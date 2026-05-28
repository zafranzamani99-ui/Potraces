# External Services Trust Boundary Audit

**Audited**: 2026-05-28
**Scope**: All files in `src/services/` that cross a trust boundary (AI APIs, Supabase, FX rates, push notifications, import/export)
**Severity**: Critical / High / Medium / Low

---

## 1. AI Output Validation

### 1.1 Receipt Scanner — Partially Validated (Medium)

**Files**: `receiptScanner.ts`

**What's good**:
- Items are filtered: `typeof i.amount === 'number' && i.amount > 0` rejects non-numeric and negative amounts
- Item names are cast to `String(i.name)`
- Total falls back to `0` via `Number(parsed.total) || 0`
- Seller receipt validates `suggestedCategory` against a `Set` of valid IDs

**What's missing**:
- **No upper bound on amounts**: AI could return `amount: 999999999` and it would be accepted. A receipt item of RM 1 billion passes validation.
- **No sanitization of `vendor` string**: `parsed.vendor` is passed through as-is. If AI returns HTML/script in the vendor name, it could be rendered unsafely in PDF exports (though `pdfExport.ts` does use `esc()` for HTML escaping — so this is mitigated for PDF but should still be sanitized at parse time).
- **`date` field is not validated**: `parsed.date || undefined` passes any string. A date like `"next tuesday"` or `"AAAA"` will flow into the store. The store's `sd()` helper would fall back to `new Date()`, so it won't crash, but the user sees a wrong date silently.
- **`paymentMethod` is not validated against the enum**: Any arbitrary string from AI is accepted. Should validate against the list in the prompt.
- **`suggestedExpenseCategory` is not validated** (personal receipt): Unlike seller receipt which validates against `VALID_COST_CATEGORY_IDS`, the personal receipt accepts any string for `suggestedExpenseCategory`.
- **`location` is not sanitized**: Raw AI string passed through.

### 1.2 AI Service (Anthropic) — Partially Validated (Medium)

**File**: `aiService.ts`

**What's good**:
- `parseTextInput` rejects `amount <= 0`
- `parseReceiptText` rejects `amount <= 0`
- All functions return `null` on failure (never throw)

**What's missing**:
- **No upper bound on parsed amounts**: `Number(json.amount)` of `999999999` passes.
- **No validation of `category` against known categories**: AI could return any string as category.
- **`parseProductList` / `parseParsedProducts` accepts `pricePerUnit: 0`**: A product with zero price passes the filter (only `name.length > 0` is checked). This could create products that can't be sold.
- **`parseProductImage` has no timeout**: The `fetch` call to Gemini has no `AbortController` or timeout. If the server hangs, the app hangs.
- **`parseWhatsAppOrderAI` does not validate quantity bounds**: `Number(w.quantity) || 1` accepts arbitrarily large quantities.
- **`anthropic-dangerous-direct-browser-access` header**: This header is set, which Anthropic explicitly warns against for production use. The API key is exposed in the client bundle.

### 1.3 Chat Actions — AI Can Mutate Store (Critical)

**File**: `chatActions.ts`

**This is the single most dangerous trust boundary in the app.**

**How it works**: The AI (Gemini) returns `[ACTION]{...}[/ACTION]` blocks in chat responses. `parseActions()` extracts JSON and `executeAction()` directly mutates Zustand stores — adding/deleting transactions, debts, wallets, goals, subscriptions, and budgets.

**What's dangerous**:
- **AI controls real financial data**: A hallucinated or manipulated response can add fake expenses, delete real transactions, transfer money between wallets, forgive debts, or delete goals.
- **`delete_transaction` with `deleteAll: true`**: AI can wipe ALL matching transactions with no undo. If AI hallucinates `description: ""` with `deleteAll: true`, it could delete every transaction.
- **`delete_transaction` description matching is too fuzzy**: Uses `.includes()` bidirectionally — a short description like `"a"` would match almost everything.
- **No amount caps on actions**: AI can create a transaction for any amount. `add_expense` with `amount: 99999999` goes straight to the store.
- **No confirmation gate for destructive actions**: `delete_transaction`, `delete_debt`, `delete_goal`, `delete_budget`, `forgive_debt` all execute immediately without user confirmation. The AI prompt says "NEVER include ACTION blocks when the user is just asking questions" but this is a prompt instruction, not a code constraint.
- **`edit_transaction` wallet adjustment is one-sided**: If the edit changes the wallet AND amount simultaneously, the old wallet's balance is adjusted but the new wallet is not considered.

**Mitigations present**:
- Actions are shown as "confirmation chips" in the UI (MoneyChat screen) before display, but execution happens at parse time, not after user confirmation.
- The prompt tells AI not to guess, but prompt compliance is not guaranteed.

**Recommendation**: Actions should require explicit user confirmation before `executeAction()` is called. The current architecture parses AND executes in the same pass.

### 1.4 Playbook AI — Validated but Truncation Recovery is Fragile (Low)

**File**: `playbookAI.ts`

**What's good**:
- Response is validated with type checks on every field
- Items with `amount <= 0` are rejected
- `confidence` and `source` are validated against allowlists
- Truncated JSON recovery is attempted (appending `]}` or `]}}`), which is reasonable

**What's missing**:
- **No upper bound on item amounts**: A plan item with `amount: 50000` on a RM 2600 salary passes.
- **No validation that plan total does not exceed source amount**: The prompt asks the AI to warn about this, but code does not enforce it.

### 1.5 MoneyChat / QueryEngine / SpendingMirror / ReportNarrative — Read-Only AI (Low)

**Files**: `moneyChat.ts`, `queryEngine.ts`, `spendingMirror.ts`, `reportNarrative.ts`, `explainCategory.ts`

These services only read store data to build context and return AI-generated text for display. They do not mutate stores (except `moneyChat.ts` which delegates to `chatActions.ts` — covered above).

**Risk**: AI hallucination in displayed text (e.g., "you spent RM 500 on food" when the real number is RM 300). There is no ground-truth validation of AI narrative text against actual store data. Users may make financial decisions based on hallucinated numbers.

**Mitigations**:
- `queryEngine.ts` has a local-first answer that computes real numbers from the store, with AI only adding a "natural language" enhancement. Good pattern.
- `spendingMirror.ts` caches for 24 hours, limiting regeneration frequency.

### 1.6 Intent Engine — AI Classification Can Misroute (Medium)

**File**: `intentEngine.ts`

**What's good**:
- Local pre-filter (`manglishParser`) catches obvious patterns without AI
- `VALID_INTENTS` allowlist prevents unknown intent types
- Falls back to local extraction when AI is unavailable
- Premium/quota gating before AI calls

**What's missing**:
- **No amount validation on AI-extracted items**: `Number(item.amount) || 0` accepts 0 and any positive value with no upper bound.
- **Misclassification risk**: If AI classifies an expense note as `debt`, the user's note creates debt records instead of expense records. The chips UI lets users correct this, but the initial extraction is trusted.

---

## 2. API Key Security (Critical)

### 2.1 Keys in Environment Variables

| Key | Variable | Risk |
|-----|----------|------|
| Gemini | `EXPO_PUBLIC_GEMINI_API_KEY` | **In client bundle** — extractable from APK/IPA. `EXPO_PUBLIC_` prefix means it's bundled into the JS. |
| Anthropic | `EXPO_PUBLIC_ANTHROPIC_API_KEY` | **In client bundle** — same issue. Plus the `anthropic-dangerous-direct-browser-access` header confirms direct client-side usage. |
| Google Vision | `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` | **In client bundle** — API key passed in URL query parameter. |
| Supabase URL | `EXPO_PUBLIC_SUPABASE_URL` | In bundle, but this is expected for Supabase (protected by RLS). |
| Supabase Anon Key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | In bundle, expected — anon key is designed to be public. |

**Impact**: Anyone who decompiles the APK can extract the Gemini, Anthropic, and Google Vision API keys and make unlimited calls billed to the developer's account. The `EXPO_PUBLIC_` prefix is the root cause — these should be proxied through a backend.

### 2.2 API Key in URL

**File**: `ocrService.ts` line 20, `aiService.ts` line 370, `geminiClient.ts` line 104

The Gemini and Google Vision API keys are passed as URL query parameters (`?key=...`). These appear in:
- Network logs
- Server access logs
- Proxy/CDN logs
- Crash reports that include URLs

---

## 3. Rate Limiting / Cost Explosion (High)

### 3.1 Gemini Rate Limiting — Good

**File**: `geminiClient.ts`

- Per-model rate limit tracking with `modelBlocked` timestamps
- 429 responses parsed for Google's `retry in Xs` message
- Model fallback chain (flash → flash-lite)
- Blocks capped at 2 minutes
- `isGeminiAvailable()` check before every call

### 3.2 Premium/Quota Gating — Present

Most AI call sites check `usePremiumStore.getState().canUseAI()` before making a call and `incrementAiCalls()` after success. This provides a monthly cap.

### 3.3 No Client-Side Debounce on Receipt Scanner (Medium)

**File**: `receiptScanner.ts`

There is no debounce or in-flight tracking. If a user taps the scan button rapidly, each tap triggers a new `scanReceipt()` call. The `isGeminiAvailable()` check provides some protection (429s block the model), but between the first call and the first 429, multiple calls can fire.

### 3.4 No Client-Side Debounce on MoneyChat (Medium)

**File**: `moneyChat.ts`

`sendChatMessage` has no in-flight guard. Rapid message sending can create parallel Gemini calls. The premium quota gate helps but doesn't prevent rapid-fire within the quota.

### 3.5 Anthropic Has No Rate Limiting (High)

**File**: `aiService.ts`

The `callAnthropic` function has no rate limiting, no retry logic, no cooldown tracking. If the Anthropic API returns 429, it returns `null` (same as any error). Rapid calls are not throttled.

### 3.6 Google Vision Has No Rate Limiting (Medium)

**File**: `ocrService.ts`

No rate limiting, no retry logic, no cooldown. However, this service is rarely called (OCR fallback).

---

## 4. Network Timeout Handling (Medium)

### 4.1 Gemini — Good

**File**: `geminiClient.ts`

- `AbortController` with configurable timeout (default 15s)
- Callers set appropriate timeouts: 30s for receipt scanning, 30s for playbook, 15s for insights
- AbortError is caught and handled gracefully

### 4.2 Anthropic — No Timeout (High)

**File**: `aiService.ts`

`callAnthropic` uses bare `fetch()` with no `AbortController` and no timeout. If the Anthropic API hangs, the app hangs indefinitely. All `askMoneyQuestion`, `askBusinessQuestion`, `askFreelancerQuestion`, `parseProductList` calls are affected.

### 4.3 Google Vision — No Timeout (Medium)

**File**: `ocrService.ts`

Bare `fetch()` with no timeout.

### 4.4 FX Rates — No Timeout (Low)

**File**: `fxRates.ts`

`fetchFromApi()` uses bare `fetch()` with no timeout. However, it has hardcoded fallback rates, so the app won't break — it just might hang on the loading state.

### 4.5 Supabase Edge Functions — No Explicit Timeout (Medium)

**File**: `statementImport.ts`

`supabase.functions.invoke()` has no timeout configuration. Statement parsing with a 10 MB PDF could take a very long time.

### 4.6 Empty Body / Malformed JSON Handling

- **Gemini**: `response.json()` on line 213 of `geminiClient.ts` is not wrapped in try/catch. If the server returns 200 with empty body or invalid JSON, this will throw an unhandled error. The outer try/catch in `callGeminiAPI` catches it, but the error message will be generic.
- **Anthropic**: Same issue — `response.json()` on line 102 of `aiService.ts` is unprotected.
- **FX rates**: `res.json()` is unprotected, but the entire function is in a try/catch that falls back to hardcoded rates.

---

## 5. Partial Sync Corruption (Medium)

### 5.1 Seller Sync

**File**: `sellerSync.ts`

**Pattern**: `pullAll()` first, then `pushProducts/pushOrders/pushSeasons/pushCustomers/...` via `Promise.allSettled()`.

**Risk scenarios**:
- **Network drops mid-push**: `Promise.allSettled` means some tables push successfully and others fail. The app tracks which push functions succeeded and only clears tombstone IDs for those. This is reasonably safe — failed tables retry on next sync.
- **Pull fails → push skipped**: If `pullAll()` throws, the entire sync aborts (line 1196-1205). This prevents the tombstone-wipe scenario where an empty local store deletes all remote data. Good.
- **No transaction/batch semantics**: Each table is pushed independently. If products push but orders fail, the remote state has products without their orders. On next sync, orders will push. Temporary inconsistency only.
- **Tombstone race**: The `syncStart` timestamp guards against deleting records created remotely during sync. Records with `updated_at < syncStart` are candidates for deletion. This is sound.

### 5.2 Personal Sync

**File**: `personalSync.ts`

**Same pattern**: Pull all tables in parallel, merge by `updatedAt` (newest wins), then push all tables, then delete missing.

**Risk**:
- **`deleteMissing` can delete remote records on first sync**: Guarded by `if (lastSync)` check — only runs after the first successful sync. First sync is pull+push only, no deletions. Good.
- **All 11 tables pulled in parallel**: If one table fails (`pullTable` returns `null`), the entire pull aborts and push is skipped. This prevents partial state corruption.
- **Merge conflict resolution is last-write-wins by `updatedAt`**: If two devices edit the same record at the same time, the one with the later `updatedAt` wins. The loser's edits are silently overwritten. No conflict detection or user notification.

---

## 6. Stale FX Rates (Medium)

**File**: `fxRates.ts`

- **Cache TTL**: 24 hours (`CACHE_TTL_MS = 24 * 60 * 60 * 1000`)
- **Fallback rates**: Hardcoded from "approximately Jan 2026" — these are used when the API fails AND no cached rates exist.
- **Stale fallback trick**: When API fails, fallback rates are set with `fetchedAt: Date.now() - CACHE_TTL_MS + 60_000` — making them "soft stale" so they'll be retried in 1 minute. Clever.

**Risk**:
- If the user is offline for days, they use rates from their last successful fetch. For MYR→SGD, a 3-day-old rate could be off by 1-2%. For volatile currencies (VND, IDR), the error could be larger.
- **No staleness indicator shown to user**: The UI does not display when rates were last fetched. Users have no way to know they're seeing stale rates.
- **Hardcoded fallback rates could be very wrong**: If the app ships with Jan 2026 rates and the user first opens the app in Dec 2026 without internet, they get 11-month-old rates with no warning.

---

## 7. External Service Downtime Resilience (Low)

### 7.1 Supabase Down

- **Seller mode**: Sync fails silently (logged in `__DEV__`). Local data remains intact. User can continue using the app offline. Orders, products, etc. are all in Zustand + AsyncStorage. Next sync will reconcile.
- **Personal mode**: Same — sync fails silently, local data intact.
- **Auth**: If Supabase is down during sign-in/sign-up, the auth functions throw. The UI should show an error. Existing sessions continue working (token cached in AsyncStorage).
- **Statement import**: Fails — the edge function is server-side. User gets an error.

### 7.2 Gemini/Anthropic Down

- All AI functions return `null` or `{ ok: false, error: '...' }`. The app degrades gracefully — chat shows error messages, receipt scanner shows error, intent engine falls back to local parsing.

### 7.3 FX Rate API Down

- Falls back to cached rates, then to hardcoded rates. App never hard-errors.

**Overall**: The app is well-designed for offline resilience. All external services degrade gracefully.

---

## 8. CSV / Statement Import Validation (Medium)

### 8.1 CSV Import

**File**: `csvImport.ts`

**What's good**:
- BOM stripping (`0xFEFF`)
- Proper RFC-4180 CSV parsing with quoted fields, escaped quotes, embedded newlines
- `parseDateCell` handles multiple date formats with `NaN` checking
- `parseAmountCell` handles negative amounts, parenthetical negatives, currency markers

**What's missing**:
- **No row count limit**: A CSV with 1,000,000 rows will be read entirely into memory as a string, then parsed into arrays. This could freeze the app or cause an OOM crash.
- **No field length limit**: A cell with 10 MB of text passes through.
- **No file size check before reading**: Unlike `statementImport.ts` which checks 10 MB limit, `csvImport.ts` reads any file size.

### 8.2 Statement Import

**File**: `statementImport.ts`

**What's good**:
- 10 MB file size limit enforced before upload
- Discriminated union for error vs success (`isParseError`)
- Edge function response errors are parsed and displayed

**What's missing**:
- **No validation of returned transactions**: The edge function returns `ParsedTransaction[]` but the client trusts it completely. No amount validation, no date validation.
- **No timeout on edge function call**: Large PDFs could take minutes to parse.

---

## 9. CSV Export Injection Protection (Good)

**File**: `exportService.ts`

**What's good**:
- **CSV formula injection protection**: `if (/^[=+\-@]/.test(s)) s = "'" + s;` — cells starting with `=`, `+`, `-`, or `@` are prefixed with a single quote to prevent Excel formula injection. This is correct.
- **Proper RFC-4180 quoting**: Fields with commas, quotes, or newlines are quoted.
- **UTF-8 BOM**: Added for Excel compatibility.

**What's missing**:
- **Transaction amounts are formatted with `toFixed(2)`**: This is fine for display but could introduce floating-point rounding differences vs. what's shown on screen. In practice, the difference is sub-cent.

---

## 10. PDF Export Integrity (Good)

**File**: `pdfExport.ts`

**What's good**:
- **HTML escaping**: `esc()` function properly escapes `&`, `<`, `>`, `"`, `'` for all interpolated values.
- **Date formatting**: Uses `date-fns` `formatDate` with explicit format strings. Timezone-aware via local Date objects.
- **Numbers**: Uses `toLocaleString('en-MY')` for consistent formatting.
- **Transaction cap**: Limited to 500 transactions in monthly statement to prevent PDF generation from hanging.

**What's missing**:
- **Wallet balances are "as of now"**, not as of the report period end date. The PDF header says this (`as of now`), so it's disclosed, but could be confusing.

---

## 11. Push Notification Data Leakage (Low)

**File**: `pushNotifications.ts`

**Current state**: The file only registers for push notifications and saves the Expo push token to `seller_profiles`. It does not send notifications — that would be done server-side.

**What's configured**:
- Foreground notifications respect `settingsStore.notificationsEnabled`
- Android channel named `Pesanan` (Orders) with default sound
- Badge count is explicitly disabled (`shouldSetBadge: false`)

**Risk**: Depends on what the server sends. If the server sends order details (customer name, phone, amounts) in the notification body, this would be visible on the lock screen. The client-side code does not control notification content — this is a server-side concern.

**Recommendation**: Ensure server-side push notifications use data-only payloads (no visible body) or generic messages like "New order received" without customer PII.

---

## 12. Supabase Realtime Subscription Cleanup (Low)

**File**: `sellerSync.ts`

**Pattern**: `subscribeToOrderLinkOrders()` returns an unsubscribe function:
```
return () => {
  supabase.removeChannel(channel);
};
```

**Risk**: Whether this unsubscribe function is actually called on unmount/sign-out depends on the component that calls it. This audit covers services only — the component lifecycle management should be checked separately.

**Observation**: The `clearProfileCache()` function is exported and should be called on sign-out to clear the cached profile ID. If not called, the next user on the same device could inherit the previous user's profile ID briefly.

---

## 13. Additional Findings

### 13.1 Anthropic Direct Browser Access (High)

**File**: `aiService.ts` line 88

The header `'anthropic-dangerous-direct-browser-access': 'true'` is set. Anthropic explicitly states this is "dangerous" and intended only for development/prototyping. In production, API calls should be proxied through a backend to avoid exposing the API key.

### 13.2 Context Caching Without Invalidation (Low)

**File**: `moneyChat.ts` line 281-282

Financial context is cached for 2 seconds (`CONTEXT_CACHE_MS = 2000`). If a user adds a transaction and immediately asks "how much did I spend?", the cached context may not include the new transaction. The cache TTL is short enough that this is unlikely to cause issues in practice.

**File**: `playbookAI.ts` line 49

`_lastPlanContext` is cached at module level with no TTL. If the user modifies their financial data between generating a plan and chatting about it, the chat uses stale context. This could lead to Echo giving advice based on outdated numbers.

### 13.3 Sync Does Not Paginate on Personal Sync (Medium)

**File**: `personalSync.ts`

Unlike `sellerSync.ts` which uses `pullPaged()` to handle >1000 rows, `personalSync.ts` uses a single `supabase.from(table).select('*').eq('user_id', userId)` call. Supabase PostgREST has a default row limit (typically 1000). Users with >1000 transactions would have their older transactions silently dropped during pull, and the subsequent `deleteMissing` step would delete those "missing" records from remote storage.

**This is a data loss risk for heavy users.**

### 13.4 No Retry Logic on Sync (Low)

Both `sellerSync.ts` and `personalSync.ts` are fire-and-forget with no retry. If sync fails, it waits until the next app foreground. For sellers with time-sensitive order data, this could mean delayed sync.

### 13.5 FX Rate API Has No Authentication (Low)

**File**: `fxRates.ts`

Uses `https://open.er-api.com/v6/latest/MYR` — a free, unauthenticated API. This API could:
- Be rate-limited or shut down without notice
- Return manipulated rates if DNS-hijacked
- No HTTPS certificate pinning

### 13.6 Review Prompt — No Privacy Issue (Good)

**File**: `reviewPrompt.ts`

Clean implementation with proper cooldown tracking, minimum usage gates, and OS-level review API usage. No external data sent.

### 13.7 Referrals — Safe (Good)

**File**: `referrals.ts`

Uses `crypto.getRandomValues` for code generation with fallback to `Math.random`. Code uniqueness is enforced by database unique constraint with 5-retry loop. No PII in referral URLs.

---

## Summary by Severity

### Critical (2)

| # | Finding | File | Impact |
|---|---------|------|--------|
| C1 | AI chat actions execute store mutations without user confirmation | `chatActions.ts` | AI hallucination or prompt injection can add/delete/modify financial records |
| C2 | API keys (Gemini, Anthropic, Google Vision) embedded in client bundle via `EXPO_PUBLIC_` prefix | `geminiClient.ts`, `aiService.ts`, `ocrService.ts` | Keys extractable from APK, enabling unlimited billing abuse |

### High (4)

| # | Finding | File | Impact |
|---|---------|------|--------|
| H1 | Anthropic API calls have no timeout | `aiService.ts` | App hangs indefinitely on slow/dead server |
| H2 | Anthropic API calls have no rate limiting | `aiService.ts` | Cost explosion from rapid calls |
| H3 | `delete_transaction` with fuzzy matching + `deleteAll` can wipe unrelated records | `chatActions.ts` | Data loss from AI mismatch |
| H4 | `anthropic-dangerous-direct-browser-access` header in production | `aiService.ts` | Anthropic explicitly warns against this |

### Medium (10)

| # | Finding | File | Impact |
|---|---------|------|--------|
| M1 | No upper bound on AI-parsed amounts (receipt, transaction, product) | `receiptScanner.ts`, `aiService.ts`, `intentEngine.ts` | Absurd amounts pollute financial data |
| M2 | Personal sync does not paginate — >1000 rows silently truncated | `personalSync.ts` | **Data loss** for heavy users |
| M3 | No file size limit on CSV import | `csvImport.ts` | OOM crash on large files |
| M4 | No timeout on statement import edge function | `statementImport.ts` | App hangs on large PDFs |
| M5 | FX rates show no staleness indicator to user | `fxRates.ts` | User converts currency with stale rates unknowingly |
| M6 | Receipt `paymentMethod` and personal `suggestedExpenseCategory` not validated against enum | `receiptScanner.ts` | Invalid category/payment method in store |
| M7 | No debounce on receipt scanner or chat send | `receiptScanner.ts`, `moneyChat.ts` | Multiple parallel API calls from rapid tapping |
| M8 | Sync uses last-write-wins with no conflict notification | `personalSync.ts`, `sellerSync.ts` | Silent data loss on multi-device edit conflicts |
| M9 | Statement import returns are not validated client-side | `statementImport.ts` | Malformed edge function response accepted blindly |
| M10 | `parseProductImage` has no timeout (bare fetch) | `aiService.ts` | Hang on slow Gemini response |

### Low (7)

| # | Finding | File | Impact |
|---|---------|------|--------|
| L1 | AI narrative text not validated against ground truth | `moneyChat.ts`, `spendingMirror.ts` | User sees hallucinated financial numbers |
| L2 | Playbook plan items have no total-vs-source validation | `playbookAI.ts` | Plan suggests spending more than salary |
| L3 | FX fallback rates hardcoded to Jan 2026 | `fxRates.ts` | Very wrong rates if API unreachable for months |
| L4 | `_lastPlanContext` cached without TTL | `playbookAI.ts` | Echo chat uses stale financial context |
| L5 | No retry logic on sync | `sellerSync.ts`, `personalSync.ts` | Sync waits until next foreground on failure |
| L6 | Push notification content is server-controlled | `pushNotifications.ts` | Lock screen PII leakage depends on server implementation |
| L7 | Realtime subscription cleanup depends on caller | `sellerSync.ts` | Potential channel leak if caller doesn't unsubscribe |
