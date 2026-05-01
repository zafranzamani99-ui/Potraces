# Potraces — Post-Audit Implementation Plan

**Scope:** everything from the audit's "what's missing" list except Zakat.
**Timeline:** ~7 weeks solo. Phase-by-phase. Ship in thin vertical slices.

---

## Guiding Principles

- **Vertical slices, not horizontal**: one feature end-to-end (store → service → screen → i18n → test) before starting the next. No half-finished features.
- **Every schema change gets its own migration** (timestamped, descriptive).
- **Every new string goes into `en.ts` + `ms.ts` day one.** No "translate later."
- **Every wallet-mutating action writes a rollback path** (we fixed this; don't regress).
- **Test on both personal and business modes** before marking done.
- **No new Zustand stores unless truly orthogonal.** Merge into `personalStore` / `walletStore` where possible.
- **Offline-first mentality**: every write queues; sync is best-effort and idempotent.

---

## Phase 0 — Prerequisites (half a week)

Before any feature work, knock out items that block store submission or pollute every PR.

### 0.1 Privacy policy page
- `docs/privacy.html` — static HTML hosted on Vercel at `potraces.vercel.app/privacy`.
- Cover: what data is collected (personal transactions, receipts, phone, location?), where it's stored (Supabase, AWS ap-southeast-1), retention, deletion flow, contact email.
- `src/screens/shared/Settings.tsx` — "Privacy Policy" row that opens the URL in system browser via `WebBrowser.openBrowserAsync`.

### 0.2 iOS App Tracking Transparency (ATT)
```
npx expo install expo-tracking-transparency
```
- `app.json` plugins → add `expo-tracking-transparency`.
- `App.tsx` — request after onboarding completes. If any analytics/ads SDK is added later, this prompt must already exist.

### 0.3 i18n hardcoded-string guard
- `scripts/check-hardcoded-strings.sh` — grep `>Save<`, `>Cancel<`, `>Delete<`, `>Confirm<` etc. inside `src/**/*.tsx` JSX text nodes.
- Hook into `husky` pre-commit or GitHub Actions. Block PRs that regress.

**Effort:** 4–6 hours total.

---

## Phase 1 — Foundation (Week 1)

The load-bearing infrastructure. Nothing else ships reliably without this.

### 1.1 Personal-mode Supabase sync

Mirror `sellerSync.ts` architecture for personal data. Your auth infra already exists.

**Migration** — `supabase/migrations/YYYYMMDD_personal_sync.sql`:
```sql
CREATE TABLE public.personal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  local_id text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  category text,
  description text,
  wallet_local_id text,
  date timestamptz NOT NULL,
  input_method text,
  receipt_url text,
  edit_log jsonb,
  playbook_links jsonb,
  linked_debt_id text,
  linked_payment_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
-- RLS: auth.uid() = user_id; full CRUD for owner only.
-- Unique index on (user_id, local_id) for upsert.

-- Repeat pattern for:
CREATE TABLE public.personal_wallets (...);
CREATE TABLE public.personal_budgets (...);
CREATE TABLE public.personal_goals (...);
CREATE TABLE public.personal_subscriptions (...);
CREATE TABLE public.personal_debts (...);  -- debts + payments (nested jsonb or second table)
CREATE TABLE public.personal_receipts (...);
```

**New service** — `src/services/personalSync.ts`:
- `pullAll()` with error throws (match the sellerSync pattern we fixed).
- `pushTransactions()`, `pushWallets()`, `pushBudgets()`, `pushGoals()`, `pushSubscriptions()`, `pushDebts()`, `pushReceipts()`.
- `syncAllPersonal()` — pull first, then push. Defensive empty-local guard. Mirror the tombstone fix.

**Auth approach** — two options:
- **A: Phone-auth personal mode** (same as business). Requires onboarding change: phone + OTP before the app is usable.
- **B: Anonymous auth personal mode** (easier adoption). Auto sign-in as `supabase.auth.signInAnonymously()`. Later user can "link" a phone to claim their anon session's data.

**Recommendation: B.** Friction-free + backup still happens. Add a Settings action "Claim this account with your phone" that later promotes anon → phone.

**Wire-up:**
- `src/store/personalStore.ts` — every mutation triggers a debounced sync push (via Phase 5.2 queue).
- `App.tsx` — on startup (after store hydration), call `syncAllPersonal()`. On foreground, same.

**Risks:**
- Must not trigger the tombstone bug we just fixed. Add the same empty-local guard on push functions.
- `editLog` grows unbounded. Add 100-entry cap per transaction in the migration (`jsonb_array_length`).

**Effort:** 2 days. **Priority: critical.**

### 1.2 Biometric lock
```
npx expo install expo-local-authentication
```

- `settingsStore`: add `biometricLockEnabled: boolean`, `biometricLockTimeoutMinutes: number` (default 5).
- New component: `src/components/BiometricGate.tsx` — wraps the root view. On foreground (AppState change → active), if `biometricLockEnabled` and time since last unlock > timeout, show blocking prompt.
- Settings UI: "Security" section with toggle + timeout picker.
- i18n: `security.biometric*` keys.

**Effort:** 3 hours.

### 1.3 Account deletion flow (user-facing)

Both Apple and Google require this.

**New edge function** — `supabase/functions/clear-personal-data/index.ts`:
- Auth required.
- Delete from all `personal_*` tables for `user_id`.
- Revoke session, delete auth user (optional — some users want to delete data but keep account).

**Settings UI:**
- "Danger Zone" section.
- Two paths: "Delete business data only" (already exists) and "Delete all my data".
- 2-step confirmation: type "DELETE" into a text field + biometric confirm if Phase 1.2 done.
- On confirm: call edge function → reset all local stores → log out → show "account deleted" final screen.

**Effort:** 4 hours.

### 1.4 Wallet balance reconciliation

After the C1/C2 fixes, some users may already have drifted balances. Add a reconciliation tool.

- `src/store/walletStore.ts` — new action:
  ```ts
  recalculateBalance: (walletId: string) => void
  ```
  reads all transactions for that wallet from `personalStore` + `businessStore`, sums (income - expense), sets `balance`.
- `src/screens/personal/WalletManagement.tsx`:
  - Per-wallet context menu: "Recalculate balance".
  - If mismatch detected on mount (difference > RM0.01), show top-of-list banner: "We detected a balance mismatch. [Auto-fix all]".
- One-time auto-run on first app open after this version ships (silent unless mismatch is > RM1).

**Effort:** 4 hours.

### 1.5 AsyncStorage corruption recovery

- New service — `src/services/storageIntegrity.ts`:
  - On app start (before Zustand hydration), try `JSON.parse` on each persisted blob.
  - If any fails, don't crash. Set a `corruptionDetectedFor: string[]` flag.
- `App.tsx`:
  - If `corruptionDetectedFor` is non-empty AND the user is signed in AND personal sync is working: silently recover from cloud via `pullAll()`. Done.
  - If not signed in or no cloud data: show a blocking modal "Your local data appears corrupted. [Restore from cloud] [Start fresh — I'll lose my data]".
- Logs the incident (anonymized) so you can track frequency.

**Effort:** 4 hours. **Depends on 1.1.**

**Phase 1 total: ~1 week.**

---

## Phase 2 — Data Portability (Week 2)

Trust-building. Users need to know they can get their data OUT.

### 2.1 CSV export

- New service — `src/services/exportService.ts`:
  - `exportTransactionsCsv(filter?)` — builds CSV string, writes to `FileSystem.cacheDirectory`, calls `Sharing.shareAsync`.
  - `exportWalletsCsv()`, `exportSubscriptionsCsv()`, `exportReceiptsCsv()`, `exportAllCsv()` (zip via `expo-file-system` or ship separate files).
  - Escape quotes, handle newlines, include BOM for Excel.
- Settings → "Export Data" section with type pickers (range, categories, wallets).

**Effort:** 4 hours.

### 2.2 PDF export (two templates)

```
npx expo install expo-print
```

- `src/templates/pdfMonthly.html.ts` — monthly statement: summary (income/expense/kept), transaction table grouped by category, wallet balances snapshot.
- `src/templates/pdfTaxYear.html.ts` — pre-cursor to LHDN export (Phase 3.1).
- `src/services/pdfExport.ts` — feeds template → `Print.printToFileAsync` → `Sharing.shareAsync`.

**Effort:** 1 day.

### 2.3 PDF bank statement parser

The magic-moment feature for new users.

- `supabase/functions/parse-statement/index.ts` (new) — accepts PDF upload, extracts text via `pdf-parse` (Deno) or passes to Gemini multimodal, prompts with MY bank format awareness (Maybank, CIMB, Public Bank, RHB).
- Returns `{ transactions: PartialTransaction[] }`.
- `src/screens/personal/ImportFromStatement.tsx` (new):
  - Pick PDF → upload → loading state → review screen with checkboxes per row (default all checked) → category assignment per row (AI-suggested or manual) → wallet assignment → bulk-add.
- Groq/Gemini API cost: cap at 5 imports per user per month for free tier, tracked server-side.

**Effort:** 2 days. **Risk: high** — AI accuracy varies.

### 2.4 CSV import

- `src/services/csvImport.ts` — parse CSV with `papaparse` (pure JS, no native deps).
- `src/screens/personal/ImportFromCsv.tsx` — upload → preview → column mapping UI (user tags "this column is amount", etc.) → bulk-add.
- Support common MY bank CSV exports: Maybank2u, CIMB Clicks, MAE.

**Effort:** 1 day.

### 2.5 Single-receipt image export

- `src/services/receiptImageExport.ts` — use `react-native-view-shot` on a hidden styled `<View>` to capture as PNG. Include receipt image + parsed metadata overlay.
- `src/screens/shared/ReceiptDetail.tsx` — "Share as image" button (useful for claiming work expenses).

**Effort:** 3 hours.

**Phase 2 total: ~1 week.**

---

## Phase 3 — Malaysian Market Fit (Week 3)

Where Potraces becomes "the Malaysian one" vs "another finance app."

### 3.1 LHDN tax export

- Already have `MYTAX_CATEGORIES` in constants — good.
- `src/templates/pdfLhdn.html.ts` — grouped by `myTaxCategory`, subtotals, year-end grand total.
- `src/screens/personal/TaxYearExport.tsx` — year picker → preview → export PDF + CSV.
- Quick-link from Settings → Reports section.
- Cross-check LHDN category wording (`PENGURANGAN PERIBADI DAN KELUARGA`, etc.) against the 2025 e-Filing categories — if off, tax export is useless.

**Effort:** 1 day.

### 3.2 Preset Malaysian wallets

- New: `src/constants/malaysianWallets.ts`:
  ```ts
  export const MY_WALLET_PRESETS = [
    { name: 'Maybank',     icon: 'credit-card', color: '#FFCC00', type: 'bank' },
    { name: 'CIMB',        icon: 'credit-card', color: '#C8102E', type: 'bank' },
    { name: 'Public Bank', icon: 'credit-card', color: '#00529C', type: 'bank' },
    { name: 'RHB',         icon: 'credit-card', color: '#0055A4', type: 'bank' },
    { name: 'HL Bank',     icon: 'credit-card', color: '#003A70', type: 'bank' },
    { name: 'Bank Islam',  icon: 'credit-card', color: '#006936', type: 'bank' },
    { name: 'Bank Rakyat', icon: 'credit-card', color: '#004B87', type: 'bank' },
    { name: 'AmBank',      icon: 'credit-card', color: '#D11A32', type: 'bank' },
    { name: 'TNG eWallet', icon: 'smartphone',  color: '#005CAA', type: 'ewallet' },
    { name: 'GrabPay',     icon: 'smartphone',  color: '#00B14F', type: 'ewallet' },
    { name: 'ShopeePay',   icon: 'smartphone',  color: '#EE4D2D', type: 'ewallet' },
    { name: 'BigPay',      icon: 'smartphone',  color: '#FF0045', type: 'ewallet' },
    { name: 'Boost',       icon: 'smartphone',  color: '#EE3D56', type: 'ewallet' },
    { name: 'MAE',         icon: 'smartphone',  color: '#FFCC00', type: 'ewallet' },
    { name: 'DuitNow',     icon: 'smartphone',  color: '#2E3192', type: 'ewallet' },
    { name: 'Cash',        icon: 'dollar-sign', color: '#4F5104', type: 'cash' },
  ];
  ```
- `src/screens/personal/WalletManagement.tsx` — on "Add wallet" modal, render preset chips at top. Tap → prefill name/icon/color/type.

**Effort:** 3 hours.

### 3.3 Recurring bill notifications that actually fire

```
npx expo install expo-notifications
```

- `src/services/subscriptionNotifications.ts` (new):
  - `scheduleAll()` — reads active subscriptions, schedules `Notifications.scheduleNotificationAsync` 3 days before `nextBillingDate`. Cancels and re-schedules on every sub CRUD.
  - `ensurePermission()` — ask on first subscription add, not on app open.
- Hook into `personalStore.addSubscription/update/delete`.
- Settings: "Bill reminders" toggle (master on/off) + "Days before" picker.
- Default 3 days; critical bills (TNB, Unifi) commonly cut on the day after due.
- **Android gotcha:** OEMs like Xiaomi/Oppo/Huawei aggressively kill scheduled notifications. Document in Settings: "If reminders stop working, whitelist Potraces in your phone's battery optimizer."

**Effort:** 1 day.

### 3.4 WhatsApp CTA onboarding for sellers

- `src/screens/seller/Dashboard.tsx` — when user first creates shop link, mandatory (not optional) WhatsApp number field.
- Helper text: "Customers tap this to WhatsApp you after ordering."
- Existing order page already uses `phone` for WA link — wire the missing trigger.

**Effort:** 2 hours.

**Phase 3 total: ~1 week.**

---

## Phase 4 — Power Features (Week 4)

### 4.1 Transaction search

- `src/screens/personal/TransactionsList.tsx` — add `<TextInput>` at top bound to a `filter` state.
- `src/utils/searchTransactions.ts` (new) — fuzzy match across `description`, `category`, `amount.toString()`, formatted date.
- Debounce 200ms. Highlight matched substring with accent color.
- Same search in seller order list, debt list.

**Effort:** 3 hours.

### 4.2 Transfer between wallets with visible history

- Audit current `transferBetweenWallets` behavior. If it creates "ghost" expense + income rows, fix — transfers should NOT show in the transactions list as expenses/incomes (they're neither).
- `src/screens/personal/WalletManagement.tsx` — new "Transfers" tab or section showing transfer list with source → dest, amount, note, date.
- Transfer detail modal: edit amount, delete (with rollback to both wallets).
- Migration note: if existing "fake" transfer-expenses are detected (by category === 'transfer' or similar heuristic), offer a one-time migration: convert to real Transfer records.

**Effort:** 1 day.

### 4.3 Duplicate transaction detection

- `src/store/personalStore.ts` — `addTransaction` optionally returns `{ id, duplicateHint: Transaction | null }`.
- "Duplicate" heuristic: same amount (± RM0.01), same wallet, within last 10 minutes.
- Caller (`QuickAddExpense`, `ReceiptScanner`, `MoneyChat`) — if hint present, show toast: "Similar transaction 5 min ago — [Keep both] [Undo]".

**Effort:** 4 hours.

### 4.4 Multi-currency basic support

- `Transaction` type: add optional `originalAmount: number`, `originalCurrency: string`, `fxRate: number`.
- `src/services/fxRates.ts` — fetch from a free API (e.g. `https://open.er-api.com/v6/latest/MYR`), cache 24h in AsyncStorage.
- `QuickAddExpense` — currency selector (defaults to MYR). If non-MYR selected, store both original and MYR-equivalent.
- Display policy: show MYR by default, tap amount to flip to original currency.
- Supported: MYR, SGD, USD, THB, IDR, VND, PHP, JPY.

**Effort:** 1 day.

### 4.5 Spending alerts

- `src/services/spendingAlerts.ts`:
  - Daily check (on foreground, if not run today): compute this-week spend per category vs trailing 4-week avg.
  - If any category > 150% and absolute diff > RM20, fire a local notification.
- Settings: "Spending alerts" toggle + threshold.

**Effort:** 1 day.

**Phase 4 total: ~1 week.**

---

## Phase 5 — Shared Household + Offline (Week 5)

### 5.1 Shared household expenses (couple mode)

MVP scope: one shared wallet between two users. More complex family/roommate sharing can wait.

**Schema:**
```sql
CREATE TABLE public.shared_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.shared_wallet_members (
  wallet_id uuid REFERENCES public.shared_wallets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',  -- member | owner
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (wallet_id, user_id)
);

CREATE TABLE public.shared_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES public.shared_wallets(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  description text,
  date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: only members can SELECT/INSERT/UPDATE; only creator or owner can DELETE their rows.
```

**Invite flow:**
- Owner generates a 6-digit invite code (tied to wallet, expires in 1 hour, single-use).
- Invitee enters code in their app → server-side edge function validates → adds to `shared_wallet_members`.

**Files:**
- `supabase/functions/create-shared-invite/index.ts`
- `supabase/functions/redeem-shared-invite/index.ts`
- `src/store/sharedStore.ts` (new)
- `src/screens/personal/SharedWalletSetup.tsx` (new) — invite flow UI.
- `src/screens/personal/SharedWallet.tsx` (new) — usage.

**Conflict handling:** optimistic writes with `updated_at` last-write-wins. Good enough for MVP.

**Risks:**
- Partner removal: what happens to transactions they created? Keep them, mark with "(removed)" on the name.
- Offline concurrent edits: Phase 5.2 sync queue + idempotent IDs help.

**Effort:** 1 week. **Consider deferring to v1.1 if timeline tight.**

### 5.2 Offline-first sync queue

- `src/services/syncQueue.ts`:
  - Persistent queue in AsyncStorage: `[{ id, kind, payload, attempts, lastAttemptAt }]`.
  - Every personal/seller sync push becomes an enqueue.
  - Worker drains on: app foreground, network-online event (from `@react-native-community/netinfo`), periodic 30s timer while app is in foreground.
  - Exponential backoff on failure (1s, 5s, 30s, 2m, give up after 5 attempts).
  - Deduplicate by `local_id` on enqueue (collapse multiple updates to the same record).

**Hook into:**
- `personalSync.syncAllPersonal()` — writes go through queue.
- `sellerSync.syncAll()` — same.

**Effort:** 1 day. **Depends on 1.1.**

### 5.3 Receipt scan offline cache

- `src/services/receiptQueue.ts` — if offline, store image + timestamp in local queue.
- On connectivity, auto-run scans in sequence. Show toast: "Processing 3 receipts now that you're online."
- Receipts UI — show "pending scan" state rows.

**Effort:** 4 hours. **Depends on 5.2.**

**Phase 5 total: ~1 week (or 3 days if shared wallet deferred).**

---

## Phase 6 — Growth & Polish (Week 6)

### 6.1 In-app "rate us" prompt

```
npx expo install expo-store-review
```

- `src/services/reviewPrompt.ts` — trigger rules:
  - User has logged ≥ 10 transactions.
  - App installed ≥ 2 days.
  - No prompt in last 90 days.
  - Prompt fires on a "delight" moment: after saving a receipt, after hitting a milestone.
- Always use `StoreReview.requestReview` (which respects OS cooldowns).

**Effort:** 2 hours.

### 6.2 Referral mechanism

**Schema:**
```sql
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id),
  referred_user_id uuid NOT NULL REFERENCES auth.users(id),
  code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

**Flow:**
- Each user gets a static `referral_code` in their profile (6-char).
- "Invite friends" card in Settings → shares URL: `https://potraces.vercel.app/r/{code}`.
- Landing page = short Vercel page that deep-links back to app install + passes `code`.
- On first sign-up, if `code` present, create `referrals` row + apply bonus (e.g., 30-day premium trial for both).

**Effort:** 1 day.

### 6.3 AI categorization explanation

- `src/services/aiService.ts` — add `explainCategorization(transactionDescription, assignedCategory): Promise<string>`.
- Call only on-demand (user taps "Why?" on a transaction); never on every transaction.
- Cache the explanation in the transaction record so repeated taps don't re-call AI.
- `src/screens/personal/TransactionDetail.tsx` — new "Why this category?" chip.

**Effort:** 3 hours.

### 6.4 Complete dark mode migration

Fix the 6 screens still using `CALM.` directly (identified in AUDIT.md):
- `src/screens/personal/BudgetPlanning.tsx`
- `src/screens/personal/Dashboard.tsx`
- `src/screens/seller/OrderList.tsx`
- `src/screens/stall/SessionHistory.tsx`
- `src/screens/business/CRM.tsx`
- `src/screens/business/IncomeStreams.tsx`

Pattern: replace top-level `const styles = StyleSheet.create(...)` with `const makeStyles = (C: typeof CALM) => StyleSheet.create(...)` + `const C = useCalm()` + `const styles = useMemo(() => makeStyles(C), [C])`.

**Effort:** 4 hours.

### 6.5 i18n complete coverage

- 57 screens currently hardcoded in English. Prioritize in order:
  1. Dashboard
  2. QuickAddExpense + ExpenseEntry flow
  3. WalletManagement
  4. DebtTracking
  5. MoneyChat
  6. ReceiptScanner + ReceiptDetail + ReceiptHistory
  7. Seller Dashboard + OrderList + NewOrder
  8. Remaining
- Each screen: extract every user-facing string to `en.ts`, translate to `ms.ts`, replace with `t.<section>.<key>`.
- Automate with the Phase 0.3 guard.

**Effort:** 2 days (tedious, can parallelize).

**Phase 6 total: ~1 week.**

---

## Phase 7 — Technical Debt (in parallel with 6)

### 7.1 RootNavigator refactor (UX-C2 from audit)

- Extract `makeBackHeader(C, mode, title)` helper that returns the shared `options` object.
- Collapses 1,744 → ~400 lines.
- Nest per-income-type screens (`freelancer/mixed/ontheroad/parttime` setup screens) under `BusinessNavigator` dynamic stacks keyed on `incomeType`. Prevents dead routes at runtime.
- Test every navigation path before merging.

**Effort:** 1 day.

### 7.2 Kill orphaned `ExpenseEntry.tsx` (UX-C1)

- Not registered in any navigator. Dead code.
- Delete the file + any lingering imports.
- Verify no navigation calls reference it (only GettingStarted did, and that's already fixed).

**Effort:** 30 minutes.

### 7.3 Collapse side-hustle income types

Currently 4 separate income types (freelancer/mixed/ontheroad/parttime), each with own Setup/AddIncome/AddCost/History screens = ~25 screens. User friction.

- Consolidate into one generic `SideHustleTracker` with per-stream metadata (`streamType: 'freelancer' | 'gig' | 'delivery' | 'parttime' | 'mixed'`).
- Migrate existing stored data by tagging streams.
- Saves ~20 screens + simplifies navigation.

**Effort:** 3–4 days. **Defer if Phase 5 shared wallet scope is tight.**

---

## Cross-cutting concerns

### AI cost management
Multiple features (receipt scanner, statement parser, MoneyChat, category explanation) hit Groq/Gemini. Add:
- Server-side per-user rate limits (via edge function + usage tracking table).
- Clear "Free tier: X scans left this month" indicator in Settings.
- Track AI spend per user in an `ai_usage` table.

### Test devices & OS fragmentation
- **iOS:** iPhone SE (small screen), iPhone 15 (notch), iPad (optional).
- **Android:** Samsung (best-behaved), Xiaomi (notification killer), Oppo (background killer). Pick 2 mid-range devices.
- Test offline/flaky-network scenarios deliberately. Airplane mode toggle while mid-sync.

### App Store / Play Store submission checklist
Before submitting:
- [ ] 0.1 Privacy policy live
- [ ] 0.2 ATT prompt working
- [ ] 1.3 Deletion flow visible in Settings
- [ ] All SDK permission rationales (`NSPhotoLibraryUsageDescription`, etc.) written in plain Malay + English
- [ ] Screenshots: 6.5" iPhone + 6.7" iPhone + iPad + all Android sizes
- [ ] Demo account credentials (Apple reviewers will use)
- [ ] Support email + website URL
- [ ] Export compliance (no encryption beyond HTTPS)

### Analytics & crash reporting
- Add Sentry (`@sentry/react-native`) before launch.
- Add PostHog or Amplitude (with ATT gating) for feature-usage metrics.
- Scrub PII (phone, name) from all events.

---

## Priorities if timeline shrinks

| If you have | Do at minimum |
|---|---|
| 2 weeks | Phase 0 + 1 + 2.1 + 2.2 + 3.3. Ship. |
| 3 weeks | Above + 3.1 + 3.2 + 4.1 + 4.2. |
| 4 weeks | Above + 2.3 + 2.4 + 4.3 + 4.4 + 4.5. |
| 5 weeks | Above + 5.2 + 5.3 + 6.1 + 6.4. |
| 6 weeks | Add 5.1 (shared wallet). |
| 7 weeks | Add 6.2 + 6.3 + 6.5 + Phase 7. |

### What absolutely cannot be dropped
**1.1 (personal sync), 1.2 (biometric), 1.3 (deletion), 1.4 (reconciliation), 1.5 (corruption), 2.1 (CSV export), 2.2 (PDF export), 3.3 (bill notifications).**

Without those, the app either can't ship to stores or can't be trusted with money.

### What's safe to drop or v1.1
- 4.4 Multi-currency (only affects travellers)
- 5.1 Shared household (large; warrants its own sprint)
- 6.3 AI explanation (nice-to-have)
- 6.2 Referral (only valuable after product works)

---

## Final note on scope

A 7-week plan is aggressive for solo work. **Expect to slip 20–30%.** Build in slack by dropping the deferred items early rather than overcommitting.

If this is part-time (<20 hrs/week), double the timeline to ~14 weeks and focus on Phases 0–3 as the MVP.

The #1 rule: **don't start Phase 4 features until Phase 1 is rock-solid.** Fancy features on a shaky foundation is how apps die.
