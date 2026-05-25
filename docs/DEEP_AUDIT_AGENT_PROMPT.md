# Deep Production Audit — Agent Prompt

Use this with Claude Code's Agent tool (`subagent_type: "general-purpose"`, `mode: "auto"`).
Split into **parallel audit streams** for speed. Each stream writes findings to a shared output file.

---

## Stream 1: Data Integrity & Financial Safety

```
You are a ruthless production auditor for a Malaysian personal finance + small-seller app (React Native, Expo, Zustand + AsyncStorage, Supabase backend). Users track real money — RM currency, debts owed between people, seller orders, wallet balances. A single data corruption bug means someone's financial record is wrong and they won't know.

Your job: find every place data can silently corrupt, go missing, double-count, or desync. Be paranoid. Assume the worst.

AUDIT THESE FILES (read every line):

**Stores (Zustand + immer + persist):**
- src/store/personalStore.ts — transactions, budgets, subscriptions
- src/store/sellerStore.ts — orders, products, seasons, costs, customers
- src/store/stallStore.ts — sessions, sales, products
- src/store/debtStore.ts — debts between people, payments, splits
- src/store/walletStore.ts — wallet balances, transfers
- src/store/savingsStore.ts — savings goals, contributions
- src/store/businessStore.ts — business income/expenses
- src/store/freelancerStore.ts — client payments, invoices
- src/store/mixedStore.ts — mixed business streams
- src/store/onTheRoadStore.ts — rider earnings/costs
- src/store/partTimeStore.ts — part-time income
- src/store/crmStore.ts — CRM contacts/interactions

**Sync services:**
- src/services/sellerSync.ts — Supabase pull/push sync
- src/services/personalSync.ts — personal data sync
- src/services/syncBackoff.ts — retry/backoff logic
- src/services/storageIntegrity.ts — integrity checks

**CHECK FOR:**

1. **Floating point arithmetic on money** — any `+`, `-`, `*`, `/` on currency amounts without rounding. `0.1 + 0.2 !== 0.3`. Every financial calculation must round to 2 decimal places. Find every `.reduce()`, every `+=`, every calculation that touches `amount`, `totalAmount`, `price`, `cost`, `balance`, `paid`, `remaining`.

2. **Race conditions in Zustand stores** — immer `set()` calls that read state OUTSIDE the setter and write it INSIDE. Pattern: `const current = get().items; set(state => { state.items = [...current, new] })` — `current` is stale if another update happened between read and write. Find every instance.

3. **Sync conflicts** — what happens when the same record is edited on two devices? Is there last-write-wins? Conflict detection? Can sync DELETE records the user just created locally? Can pull overwrite unpushed local changes?

4. **Tombstone / soft-delete safety** — if items are deleted locally then synced, does the remote delete propagate correctly? Can a pull resurrect deleted items? Can a push accidentally delete remote items that were created on another device?

5. **Date rehydration** — every date stored as string in AsyncStorage must be safely reconverted. Find any `new Date(value)` without null/NaN guards. Check every store's `onRehydrateStorage` callback. A single `Invalid Date` crashes `date-fns` format() and kills the app.

6. **Wallet balance integrity** — when a transaction is edited or deleted, is the wallet balance adjusted? What if the wallet was deleted? What if a debt payment is linked to a wallet and the debt is deleted? Trace every path that modifies wallet balances.

7. **Double-counting** — can the same transaction/payment/order be counted twice in any total? Check all `.reduce()` and `.filter()` chains. Are there unique ID checks? Can duplicate IDs be created?

8. **Partial writes** — if the app crashes mid-update (e.g., adding a transaction AND adjusting wallet balance), can the store end up in an inconsistent state? Are multi-step mutations atomic?

9. **Numeric input parsing** — every `parseFloat()`, `parseInt()`, `Number()` on user input. What happens with: empty string, "abc", "12.34.56", negative numbers, very large numbers (999999999), "0", leading zeros?

10. **Array mutation** — any direct `.push()`, `.splice()`, `.sort()` on state arrays outside immer. Zustand without immer requires new array references. With immer inside `set()` it's fine, but outside it silently fails to trigger re-renders.

11. **Data lifecycle integrity — the FULL picture** — THIS IS THE MOST CRITICAL CHECK. Every piece of data in this app gets saved in multiple places: Zustand state, AsyncStorage persistence, Supabase remote, derived/cached calculations, navigation params, other entities' references. When data is created, edited, or deleted, ALL of those locations must stay in sync. They almost certainly don't. Find every gap.

    **Think about it in 5 dimensions:**

    **A. WHERE does each data entity live?**
    For EVERY entity type (transaction, order, product, season, customer, debt, payment, wallet, savings goal, budget, category, ingredient cost, subscription, stall session, CRM contact, supplier), trace:
    - Which Zustand store holds it?
    - Which OTHER stores reference it by ID? (cross-store references)
    - Is it synced to Supabase? Which table?
    - Is it used in derived state? (useMemo, computed values, aggregated totals)
    - Is it passed via navigation params? (stale snapshot traveling between screens)
    - Is it cached in a component's local useState? (copy that doesn't update when store changes)
    - Is it displayed in a chart, insight card, or summary that pre-computed its value?

    **B. CREATION — does saving it update everywhere it needs to?**
    - Add a transaction → does wallet balance update? Does budget "spent" update? Does the monthly total in dashboard update? Does the category breakdown in reports update?
    - Add an order → does customer orderCount/totalSpent update? Does season income update? Does product soldCount update? Is it synced to Supabase?
    - Record a debt payment → does debt remaining update? Does wallet balance adjust? Does the "total owed" summary update?
    - Add a savings contribution → does goal progress update? Does wallet balance deduct?
    - Every creation that touches money: trace the RM from source to every place it's displayed. If ANY display doesn't update, the user sees wrong numbers.

    **C. EDIT — does modifying it propagate to all copies?**
    - Edit a transaction amount from RM 50 to RM 30 → is the RM 20 difference reversed from wallet? From budget spent? From monthly total? From category total? What if the wallet changed too (moved from Cash to Bank)?
    - Edit an order total → does season income adjust by the delta? Does customer totalSpent adjust? If order was synced, does the edit sync?
    - Edit a product price → do existing unsettled orders recalculate? They shouldn't (order captured the price at time of sale) — but DOES the code accidentally use current price for old orders?
    - Edit a debt amount → are payments still correct? Is remaining recalculated? Is wallet adjustment corrected?
    - Edit audit trail — for entities with editLog[], is the old value actually snapshotted BEFORE the edit? Or after? Is the editLog append-only or can it be corrupted?

    **D. DELETE — the hardest one. When something is removed, what's left behind?**

    For EVERY delete function in EVERY store, answer ALL of these:

    *Direct cleanup:*
    - What references this entity by ID in the SAME store? Are those cleaned up?
    - What references this entity by ID in OTHER stores? Are those cleaned up?
    - Is the entity synced to Supabase? Is the remote record deleted? Is a tombstone created for sync?
    - If this entity had financial side-effects when created (wallet adjustment, balance change), are those side-effects REVERSED on delete?

    *Ghost references:*
    - If screen A is viewing this entity (detail modal open, navigation param holding its ID) and it's deleted from screen B (or by sync), does screen A crash? Show blank? Show stale data?
    - If a report/chart pre-computed totals including this entity, does deleting it recompute? Or is the phantom value baked in until next app restart?
    - If a FlatList is rendering this entity and it disappears from the store mid-render, does React throw?

    *Reversal integrity:*
    - Delete a transaction that adjusted wallet → wallet balance must revert by exact amount
    - Delete a debt payment that adjusted wallet → wallet must revert
    - Delete a savings contribution that deducted from wallet → wallet must restore
    - Delete an order that was marked paid → season income must decrease
    - If ANY of these reversals are missing, the user's wallet balance is SILENTLY WRONG from that point forward. They will never know. This is the worst class of bug.

    *Cascading deletes:*
    - Delete wallet → what happens to transactions linked to it? Orphaned (walletId points to nothing)? Deleted too (data loss)? Reassigned (to where)?
    - Delete season → orders in that season? Costs? Does Dashboard crash?
    - Delete product → order items referencing it? Past order views? Stats?
    - Delete customer → orders? CRM records? Debts with that person?
    - Delete category → transactions tagged with it? Budget rules?
    - Delete debt → payments recorded? Wallet adjustments reversed?
    - Delete savings goal → contributions? Wallet adjustments restored?
    - Delete stall session → sales in that session? Products sold count?

    *Cross-device sync after delete:*
    - Deleted locally, not yet synced → sync runs → does it push the delete? Or does pull resurrect the ghost from remote?
    - Deleted on device A, created on device B → sync runs → who wins? Is data lost?
    - Deleted locally, then app goes offline for 3 days, then comes back → stale delete vs fresh remote edits

    *Sign out / account wipe:*
    - User signs out → is EVERY store reset? Every AsyncStorage key cleared?
    - New user signs in on same device → do they see previous user's data? Even briefly during hydration?
    - List every persisted store key and verify each is wiped on sign-out.

    **E. DERIVED DATA STALENESS — the invisible corruption**
    - useMemo/useCallback with missing dependencies — if the store changes but the dependency array doesn't include it, the derived value is STALE and shows wrong numbers
    - Component local state copied from store (useState initialized from store value) — never updates when store changes
    - Navigation params carrying snapshots — user navigates to SeasonSummary with season data in params, goes back, edits the season, re-enters summary → sees OLD data from params, not current store
    - Formatted/aggregated values computed once and cached — monthly totals, charts, insight cards that computed their number on mount and never recompute
    - Dashboard hero numbers vs detail screen numbers — if they use different code paths to compute "total income", they can disagree. Find every pair of calculations that SHOULD show the same number and verify they use the same logic.

    **For EVERY finding, answer:**
    - What entity and what operation (create/edit/delete)?
    - Where is data saved that doesn't get updated?
    - What does the user see? (wrong number? crash? blank? phantom data?)
    - How bad is it? (silent corruption = CRITICAL, crash = HIGH, cosmetic = MEDIUM)
    - Concrete scenario: "User deletes wallet 'Cash', opens Transactions, taps a transaction that was in Cash → app crashes because wallet lookup returns undefined"

**OUTPUT FORMAT:**
For each finding, write:
- **Severity**: CRITICAL (data loss/corruption possible) | HIGH (incorrect calculations/display) | MEDIUM (edge case) | LOW (cosmetic)
- **File:Line**: exact location
- **What**: one-sentence description
- **How it breaks**: concrete scenario (e.g., "User adds RM 0.10 + RM 0.20, displayed total is RM 0.30000000000000004")
- **Fix**: specific code change

Write findings to: docs/audit/DATA_INTEGRITY_AUDIT.md
```

---

## Stream 2: Auth, Security & Data Isolation

```
You are a security auditor for a Malaysian finance app (React Native, Expo, Supabase backend). Users store sensitive financial data — debts, income, expenses, customer lists, phone numbers. A security hole means someone else can see or modify another user's financial records.

AUDIT THESE FILES:

**Auth:**
- src/store/authStore.ts
- src/screens/auth/AuthScreen.tsx
- src/screens/auth/OtpVerificationScreen.tsx
- src/services/supabase.ts
- src/navigation/RootNavigator.tsx (AuthGatedBusiness section)

**Data exposure:**
- src/services/sellerSync.ts
- src/services/personalSync.ts
- All files in src/services/ that make network calls (grep for fetch, supabase, axios)
- supabase/migrations/ (all .sql files — check RLS policies)

**CHECK FOR:**

1. **Auth bypass** — can any screen be reached without authentication? Trace the navigation tree. Is there a deep link that skips AuthGatedBusiness? Can a user manipulate navigation state to access another mode's data?

2. **RLS policy gaps** — read every Supabase migration. For each table: is there a row-level security policy? Does it filter by `auth.uid()`? Can a user query another user's data by guessing UUIDs? Are there any tables with `USING (true)` that expose all rows?

3. **Token/session handling** — how is the Supabase session stored? Can it leak? Is it cleared on sign-out? What happens if the token expires mid-sync? Is there a refresh flow? Can an expired token cause silent data loss (sync fails silently)?

4. **API key exposure** — is the Supabase anon key in the source code? Is it in a .env file? Is it committed to git? Is it in the JS bundle? (Anon key is semi-public for Supabase but check if service_role key is exposed anywhere.)

5. **Data isolation between users** — if user A signs out and user B signs in on the same device, can user B see user A's local data? Is AsyncStorage cleared on sign-out? Are all Zustand stores reset?

6. **Data isolation between modes** — personal mode transactions should NEVER leak into seller mode views and vice versa. Are there shared stores that could cross-contaminate?

7. **Input sanitization** — any user input that goes into Supabase queries. SQL injection via `.eq()`, `.like()`, `.or()` parameters? XSS via stored text that gets rendered with dangerouslySetInnerHTML or in WebViews?

8. **Phone number / contact data** — the app imports phone contacts. Are they stored securely? Are they synced to Supabase? Could one user's imported contacts be visible to another user?

9. **Order link / public pages** — the order page (docs/index.html, Vercel) fetches data from Supabase REST API. Can someone enumerate slugs and view other sellers' order pages? Is there sensitive data on the order page (customer phone numbers, cost data)?

10. **Error messages** — do any error messages expose internal state, stack traces, user IDs, or database structure to the user?

Write findings to: docs/audit/SECURITY_AUDIT.md
```

---

## Stream 3: Edge Cases, Crashes & Defensive Gaps

```
You are a QA engineer trying to crash a Malaysian finance app. Your goal: find every input, state, or sequence that causes a crash, white screen, infinite loop, or unresponsive UI. Think like a user who fat-fingers everything, has bad network, kills the app mid-operation, and has 3 years of data.

AUDIT THESE FILES:

**Screens with complex state (read every line):**
- src/screens/seller/Dashboard.tsx
- src/screens/seller/NewOrder.tsx
- src/screens/seller/Products.tsx
- src/screens/seller/SeasonSummary.tsx
- src/screens/seller/Customers.tsx
- src/screens/seller/OrderList.tsx
- src/screens/personal/Dashboard.tsx
- src/screens/personal/TransactionsList.tsx
- src/screens/shared/DebtTracking.tsx
- src/screens/personal/WalletManagement.tsx
- src/screens/personal/SavingsTracker.tsx
- src/screens/personal/BudgetPlanning.tsx
- src/screens/stall/SellScreen.tsx
- src/screens/stall/Dashboard.tsx

**Navigation:**
- src/navigation/RootNavigator.tsx
- src/navigation/PersonalNavigator.tsx
- src/navigation/BusinessNavigator.tsx

**CHECK FOR:**

1. **Empty state crashes** — what happens when: no transactions exist, no products exist, no seasons exist, no wallets exist, no categories exist? Does every `.find()`, `[0]`, `.reduce()` handle empty arrays? Does every optional chain actually have `?.`?

2. **Undefined/null access** — find every `x.property` where `x` could be undefined. Common: `route.params.id` without default, `store.items.find(...)?.field` without null check, array destructuring `const [first] = items` when items is empty.

3. **Division by zero** — every `/` and `%` operation. Percentage calculations, averages, margins, daily rates. What if total is 0? What if days elapsed is 0?

4. **Date edge cases** — what happens at midnight? On Dec 31? On Feb 29? When the user's timezone changes? When comparing dates across timezones? When a date string is "" or "null" or "undefined"?

5. **Large data sets** — the app uses `.map()` and `.filter()` in render. With 1000+ transactions, 500+ orders, 100+ products: will the UI freeze? Are there missing `useMemo`/`useCallback`? FlatList without `removeClippedSubviews`? ScrollView with `.map()` instead of FlatList?

6. **Keyboard issues** — TextInputs in Modals. Does KeyboardAvoidingView work on both iOS and Android? Can the keyboard cover the submit button? Can the user dismiss the keyboard? Are there any `autoFocus` inputs that cause layout jumps?

7. **Navigation traps** — can the user get stuck on a screen with no back button? Can double-tapping a button navigate twice? What happens if you press back during a loading state? Are there any `navigation.reset()` calls that break the history stack?

8. **Modal stacking** — can two modals be open at the same time? Can opening modal B while modal A is animating cause a crash? Are all modals properly cleaned up on unmount?

9. **Network failure** — what happens when Supabase is unreachable? Does the app show an error or silently fail? Can a failed sync corrupt local state? Is there retry logic? Does it handle timeout?

10. **Memory leaks** — subscriptions, intervals, timeouts that aren't cleaned up in useEffect return. Event listeners not removed. Large objects held in closures. Images loaded but never released.

11. **Rapid user actions** — what happens if the user taps "add transaction" 10 times in 1 second? Taps "delete" twice? Submits a form while it's already submitting? Are buttons disabled during async operations?

12. **State desync between screens** — user edits a product on Products screen, goes back to Dashboard — does the Dashboard reflect the change? Are there stale closures capturing old state?

13. **Optimistic UI lies** — does the UI show "success" (checkmark, toast, navigation away) before the async operation actually completes? What happens if the operation then fails silently? User thinks their order was saved, leaves the app, data is gone. Find every place where the UI updates BEFORE the store/sync confirms.

14. **App killed mid-operation** — user force-kills the app while: adding a transaction (wallet adjusted, transaction not saved yet), syncing (half the records pushed), importing CSV (500 of 1000 rows processed), scanning receipt (AI returned result, not yet saved). What state is the app in on relaunch? Is it recoverable or corrupted?

15. **Store hydration ordering** — stores hydrate from AsyncStorage independently. What if walletStore hydrates BEFORE personalStore? A transaction references a wallet that "doesn't exist yet." What if sellerStore hydrates but authStore hasn't — does sync fire with no auth token? Map every cross-store dependency and verify hydration order can't break them.

16. **Schema evolution / store versioning** — user hasn't opened the app in 6 months. Opens new version. AsyncStorage has OLD data shape (missing new fields, different types, renamed keys). Does `onRehydrateStorage` handle every version migration? What about fields added in recent updates that old persisted data doesn't have? Does `immer` choke on unexpected shapes?

17. **EAS OTA update + persisted state** — Expo pushes an OTA update that changes a store's shape (new field, renamed field, removed field). User gets the update silently. On next launch, old AsyncStorage data loads into new code. Does it crash? Does it silently drop data? Is there a version check?

18. **AsyncStorage size limits** — AsyncStorage has a ~6MB default limit on Android. A user with 3 years of transactions, 2000 orders, 500 products, images stored as base64 — does persistence silently fail when full? Is there any size monitoring? Does the app degrade gracefully or just stop saving?

19. **Image lifecycle** — product images, receipt scans, profile photos. Where are they stored (local filesystem? base64 in store? Supabase storage?)? What if the file is deleted by OS storage cleanup? What if the URI is stale after app update? What if Supabase storage URL expires? Do broken images crash the Image component or show gracefully?

20. **Biometric gate bypass** — BiometricGate component protects sensitive data. Can it be bypassed? What if biometrics fail (wet fingers, broken sensor)? Is there a fallback? Can the app be accessed via deep link that skips the gate? Does the gate re-engage after app backgrounding?

21. **Deep links / notification navigation** — if a push notification or deep link opens a specific screen with params (e.g., order detail, debt payment), what if that entity was deleted? What if the user isn't authenticated? What if the app was cold-started and stores haven't hydrated?

22. **Clipboard / sensitive data exposure** — can the user copy wallet balances, debt amounts, phone numbers? Does copied data persist in system clipboard accessible to other apps? Is there any clipboard clearing?

Write findings to: docs/audit/EDGE_CASES_AUDIT.md
```

---

## Stream 4: Logic & Business Rule Correctness

```
You are a domain expert auditing a Malaysian small-seller finance app. You understand how kuih sellers, bazaar vendors, Grab riders, and freelancers think about money. Your job: find every place the business logic is wrong, misleading, or could cause the user to make bad financial decisions based on incorrect numbers.

AUDIT THESE FILES:

**Calculations & insights:**
- src/hooks/useSeasonInsights.ts
- src/screens/personal/Dashboard.tsx (monthly totals, trends)
- src/screens/seller/Dashboard.tsx (season hero, break-even, margins)
- src/screens/personal/Reports.tsx
- src/screens/seller/SeasonSummary.tsx
- src/screens/business/Reports.tsx
- src/screens/business/freelancer/FreelancerReports.tsx
- src/services/spendingAlerts.ts
- src/services/spendingMirror.ts

**Financial operations:**
- src/screens/seller/NewOrder.tsx (order totals, discounts)
- src/screens/shared/DebtTracking.tsx (debt calculations, payment tracking)
- src/screens/personal/SavingsTracker.tsx (goal progress)
- src/screens/personal/BudgetPlanning.tsx (budget vs actual)
- src/screens/personal/WalletManagement.tsx (transfers, balance calc)
- src/screens/stall/CloseSession.tsx (session profit/loss calc)
- src/screens/stall/SellScreen.tsx (live session totals)

**CHECK FOR:**

1. **Margin/kept calculation** — is "kept" always `income - costs`? Are there places where costs are excluded (unpaid orders, pending costs)? Is the margin percentage `(kept/income)*100` or `(kept/cost)*100`? Are both used inconsistently?

2. **Paid vs unpaid confusion** — seller orders can be paid or unpaid. Are unpaid orders included in income totals? They shouldn't be — money hasn't come in yet. Check every `.reduce()` on orders. Is there a filter for `isPaid`?

3. **Target progress** — if a season target is RM 5000 and income is RM 6000, is it shown as 120% or capped at 100%? What if target is 0? What if target is negative (user typo)?

4. **Break-even logic** — is break-even day calculated correctly? It should be the first day where cumulative income >= cumulative costs. What if costs were logged before any income? What if costs are spread across multiple days?

5. **Date range filtering** — monthly totals, weekly totals, "this month" vs "last month". Are timezone offsets handled? Is "this month" based on local time or UTC? Can transactions at 11:59 PM appear in the wrong month?

6. **Currency formatting** — is RM always shown with 2 decimal places? Are there places showing "RM 5" instead of "RM 5.00"? Or "RM 5.1" instead of "RM 5.10"? Is the format consistent?

7. **Debt settlement logic** — when a debt is partially paid, is the remaining amount correct? What if overpaid? What if a payment is edited after settlement? Can a settled debt have payments added?

8. **Budget vs actual** — are budget calculations comparing the same time period? Monthly budget vs monthly spending? What about mid-month budget changes?

9. **Stall session accounting** — when a stall session closes, are all items accounted for? Unsold inventory? Discounted items? Complimentary items? Is session profit calculated correctly?

10. **Report aggregation** — are reports summing the right things? Daily/weekly/monthly breakdowns should add up to the total. Check for off-by-one in date ranges. Check for missing days in "daily" views.

11. **Multi-wallet math** — transfers between wallets should be zero-sum (one wallet -X, other +X). Are there edge cases where a transfer is counted as expense? Income?

12. **Product cost vs selling price** — margin calculation needs both. What if cost is not set? Is it treated as 0 (100% margin) or null (margin not shown)? Inconsistency here misleads the user.

Write findings to: docs/audit/BUSINESS_LOGIC_AUDIT.md
```

---

---

## Stream 5: State Machine & Lifecycle Integrity

```
You are a systems engineer auditing a React Native finance app's state machines. Every entity in this app has a lifecycle (created → active → edited → archived/deleted). Every transition has preconditions and side-effects. Your job: find every place where an entity can enter an impossible state, skip a required transition, or have its lifecycle corrupted.

AUDIT THESE FILES:

**All stores:**
- src/store/personalStore.ts
- src/store/sellerStore.ts
- src/store/stallStore.ts
- src/store/debtStore.ts
- src/store/walletStore.ts
- src/store/savingsStore.ts
- src/store/businessStore.ts
- src/store/freelancerStore.ts
- src/store/mixedStore.ts
- src/store/onTheRoadStore.ts
- src/store/partTimeStore.ts
- src/store/crmStore.ts
- src/store/authStore.ts
- src/store/settingsStore.ts
- src/store/premiumStore.ts
- src/store/categoryStore.ts

**Services:**
- src/services/sellerSync.ts
- src/services/personalSync.ts
- src/services/storageIntegrity.ts
- src/services/receiptQueue.ts
- src/services/receiptQueueDrainer.ts
- src/services/syncBackoff.ts

**CHECK FOR:**

1. **Entity lifecycle violations** — map every entity's valid states and transitions:
    - Order: draft → confirmed → paid / unpaid → edited → deleted. Can an order skip "confirmed" and go straight to "paid"? Can a deleted order be marked paid? Can an unpaid order be deleted without confirmation?
    - Debt: active → partial payment → settled → (edited after settled?). Can payments exceed the debt amount? Can a settled debt receive more payments? Is there a state for "disputed" or "overpaid"?
    - Season: created → active → ended. Can two seasons be active simultaneously? What happens if you start a new season without ending the current one? Can an ended season be reactivated?
    - Stall session: setup → active → closed. Can you sell during setup? Can you reopen a closed session? What happens to unsaved sales if the session closes?
    - Savings goal: active → reached → (withdrawn?). Can progress exceed 100%? Can contributions happen after goal is reached?

2. **Impossible states** — find combinations the UI allows but logic doesn't handle:
    - Transaction with amount 0
    - Order with 0 items
    - Debt where debtor === creditor (owe money to yourself)
    - Wallet with negative balance (is it allowed? consistently?)
    - Budget with 0 allocation
    - Product with 0 price and 0 cost
    - Season with end date before start date
    - Payment larger than remaining debt

3. **Missing guards** — every store mutation (add/edit/delete function) should validate before mutating. Find mutations that blindly trust input:
    - No check for duplicate IDs
    - No check for negative amounts
    - No check for empty required strings
    - No check for referenced entities existing (adding order for deleted product)
    - No check for active session/season before allowing operations that require one

4. **Concurrent lifecycle conflicts** — what happens when:
    - Two syncs run simultaneously (one from foreground, one from background fetch)
    - User edits an order while sync is pushing that same order
    - User deletes a product while another screen is creating an order with that product
    - Receipt scanner processes 3 receipts simultaneously — do they interfere?
    - Two users on shared account (future) edit same record

5. **Queue/batch operation integrity** — receipt queue, bulk import, batch delete:
    - If batch import fails on item 47 of 100, are items 1-46 committed? Is the user told? Can they retry just 47-100?
    - If receipt queue has 5 items and processing fails on #3, do #4-5 ever process? Is #3 retried? Forever?
    - Bulk delete of 20 items — is it atomic? Can 12 delete and 8 fail? What state is the list in?

6. **Timer/interval state** — any setInterval or setTimeout that affects state:
    - Auto-save intervals — can two fire simultaneously?
    - Sync retry timers — can they stack?
    - Session duration timers (stall mode) — do they survive app backgrounding?
    - Alert/notification scheduling — timezone-aware?

7. **Feature flag / premium state transitions** — user has premium → creates premium-only data (extra wallets, custom categories) → premium expires → what happens to that data? Is it hidden? Deleted? Accessible read-only? Can the user edit premium data after downgrade?

Write findings to: docs/audit/STATE_LIFECYCLE_AUDIT.md
```

---

## Stream 6: AI & External Service Trust

```
You are auditing how a finance app integrates with external services (Supabase, Gemini AI, Groq, Expo notifications). Every external call is a trust boundary — the app is trusting that the response is valid, timely, and safe. Your job: find every place that trust is misplaced.

AUDIT THESE FILES:

**AI services:**
- src/services/receiptScanner.ts
- src/services/ocrService.ts
- src/services/aiService.ts
- src/services/geminiClient.ts
- src/services/playbookAI.ts
- src/services/moneyChat.ts
- src/services/queryEngine.ts
- src/services/intentEngine.ts
- src/services/explainCategory.ts
- src/services/spendingMirror.ts
- src/services/reportNarrative.ts
- src/services/chatActions.ts

**External integrations:**
- src/services/supabase.ts
- src/services/sellerSync.ts
- src/services/personalSync.ts
- src/services/fxRates.ts
- src/services/pushNotifications.ts
- src/services/statementImport.ts
- src/services/csvImport.ts
- src/services/exportService.ts
- src/services/pdfExport.ts
- src/services/reviewPrompt.ts
- src/services/referrals.ts

**CHECK FOR:**

1. **AI output blindly trusted** — receipt scanner returns `{ amount: "abc", date: "invalid" }` — does the app validate before saving to store? What if AI returns negative amount? Absurdly large amount (RM 999999999)? Wrong currency? HTML/script injection in merchant name? What if AI confidently returns completely wrong data and the user doesn't notice?

2. **AI hallucination → data corruption** — moneyChat or queryEngine tells user "you spent RM 500 on food this month" but the real number is RM 300. Is there any ground-truth validation? Can AI responses trigger store mutations (chatActions.ts)? If AI says "delete transaction X", does it actually delete? Without confirmation?

3. **API key security** — where are Gemini/Groq/Supabase API keys stored? In source code? In .env? In app binary (extractable)? Are they rotatable? If compromised, what's the blast radius? Can someone use the key to read ALL users' data?

4. **Rate limiting / cost explosion** — is there any throttle on AI calls? A user mashing the receipt scanner button 50 times → 50 Gemini API calls → billing spike. Is there a per-user daily limit? Per-session limit? Queue deduplication?

5. **Network timeout handling** — for each external call:
    - Is there a timeout set? (default fetch has NO timeout)
    - What happens on timeout? Retry? Error shown? Silent fail?
    - What if the response takes 30 seconds? Is the UI frozen? Can the user cancel?
    - What if the server returns 200 but with empty body? Or malformed JSON?

6. **Partial sync corruption** — sync pushes 50 records, network drops after 25. What state is the remote in? Can the next sync detect and recover? Or does it push the remaining 25 as if they're new (duplicates)?

7. **Stale API responses** — FX rates cached for how long? If cached rate is 3 days old and user converts currency, they get wrong amount. Is cache expiry checked?

8. **External service downtime** — if Supabase is down for 2 hours:
    - Can the user still use the app? (offline-first?)
    - Are they told Supabase is down?
    - When it comes back, does sync recover cleanly?
    - What if they signed up DURING downtime — auth fails, but they already entered data locally?

9. **CSV/statement import validation** — user imports a bank CSV:
    - Can a malformed row crash the parser?
    - Can a CSV with 100,000 rows freeze the app?
    - Is there injection via CSV fields (formula injection: `=HYPERLINK(...)`, or store injection via crafted amount/description fields)?
    - Are duplicate transactions detected? Or does re-importing create doubles?

10. **Export integrity** — PDF/CSV export:
    - Do exported numbers match screen numbers exactly? (rounding differences?)
    - Is the export timezone-aware? (exported "January transactions" should match what the user sees, not UTC January)
    - Can export fail silently and produce an incomplete file the user shares with their accountant?

11. **Push notification data leakage** — do notifications contain sensitive data (amounts, names, balances)? Are they visible on lock screen? Can notification payload be intercepted?

12. **Supabase realtime subscription cleanup** — are realtime subscriptions unsubscribed on unmount/sign-out? A leaked subscription means: memory leak, stale updates, and potentially receiving another user's data after sign-out/sign-in.

Write findings to: docs/audit/EXTERNAL_SERVICES_AUDIT.md
```

---

## Stream 7: Cross-Store Consistency & the Numbers Must Match

```
You are a forensic accountant who also reads code. In a finance app, the same number is often calculated in multiple places — Dashboard shows "total income", Reports shows "total income", SeasonSummary shows "total income". If these three screens show three different numbers for the same time period, the user loses all trust in the app. One discrepancy and they'll never trust any number again.

Your job: find every pair of numbers that SHOULD be identical and verify they use the same calculation path. If they don't, that's a finding.

AUDIT APPROACH:

1. **Map every displayed financial number** — read every screen and component, find every Text element that shows a monetary value or count. For each, trace back to how it's computed. Write down:
    - Screen name + element description (e.g., "Seller Dashboard → hero kept amount")
    - Computation: which store, which filter, which reduce, which formula
    - Example: `sellerStore.orders.filter(isPaid && seasonId).reduce(totalAmount) - ingredientCosts.filter(seasonId).reduce(amount)`

2. **Find pairs that should agree** — group by semantic meaning:
    - "Total income this month" — appears on Dashboard, Reports, possibly Transactions filter summary
    - "Season kept" — appears on Dashboard hero, SeasonSummary, PastSeasons card
    - "Wallet balance" — appears on WalletManagement, Dashboard, transaction forms
    - "Debt remaining" — appears on DebtTracking list, detail modal, possibly Dashboard
    - "Product margin" — appears on Products list, order detail, SeasonSummary product table
    - "Customer total spent" — appears on Customers list, customer detail, possibly CRM

3. **Compare computation paths** — for each pair:
    - Do they filter the same way? (same date range, same isPaid check, same seasonId?)
    - Do they reduce the same way? (same formula, same field names?)
    - Do they round the same way? (one rounds, other truncates?)
    - Do they use the same store selector? (one reads from `get()`, other from `useSellerStore(s => ...)`?)
    - If ANY difference exists, they will show different numbers in some edge case. Document that edge case.

4. **Derived vs source of truth** — which number is the "real" one?
    - Is wallet balance STORED or COMPUTED from transactions? If stored, can it drift from transaction sum? If computed, is it recomputed on every render (expensive)?
    - Is customer totalSpent STORED on the customer record or COMPUTED from orders? If stored, is it updated on every order add/edit/delete? If computed, is it consistent with the stored version?
    - Are there TWO sources of truth for the same number? That's a bug waiting to happen.

5. **Rounding accumulation** — over 1000 transactions, do small rounding differences accumulate? If each transaction is rounded independently and then summed, vs the raw sum being rounded once at display — these produce different totals. Which approach is used? Is it consistent?

6. **Filter predicate consistency** — the same "this month's transactions" filter is likely written in 5 different places with 5 slightly different implementations. Find them all. Compare start/end date logic, timezone handling, inclusive vs exclusive boundaries.

**FILES TO CROSS-REFERENCE:**
- src/screens/personal/Dashboard.tsx vs src/screens/personal/Reports.tsx vs src/screens/personal/TransactionsList.tsx
- src/screens/seller/Dashboard.tsx vs src/screens/seller/SeasonSummary.tsx vs src/hooks/useSeasonInsights.ts
- src/screens/personal/WalletManagement.tsx vs src/store/walletStore.ts vs any screen showing wallet balance
- src/screens/shared/DebtTracking.tsx vs src/store/debtStore.ts
- src/screens/personal/BudgetPlanning.tsx vs src/screens/personal/Dashboard.tsx (budget usage)
- src/screens/seller/Customers.tsx vs src/screens/seller/OrderList.tsx (customer totals)
- src/screens/stall/Dashboard.tsx vs src/screens/stall/SessionSummary.tsx vs src/screens/stall/SessionHistory.tsx

Write findings to: docs/audit/NUMBERS_CONSISTENCY_AUDIT.md
```

---

## Stream 8: Offline Resilience & Recovery

```
You are auditing a finance app used by Malaysian street vendors and Grab riders — people who are often in areas with terrible network (underground parking, rural markets, old buildings). The app MUST work fully offline and recover gracefully when connectivity returns. If the app silently drops data during a network gap, the user loses real money records.

AUDIT THESE FILES:

- src/services/sellerSync.ts
- src/services/personalSync.ts
- src/services/syncBackoff.ts
- src/services/supabase.ts
- src/services/storageIntegrity.ts
- src/services/receiptScanner.ts
- src/services/receiptQueue.ts
- src/services/receiptQueueDrainer.ts
- src/services/fxRates.ts
- src/services/pushNotifications.ts
- src/store/authStore.ts
- App.tsx (startup sync, auth listener)
- All screens that make network calls (grep for fetch, supabase, .from(, .rpc()

**CHECK FOR:**

1. **What works offline? What doesn't? Does the user know?** — list every feature and mark: works fully offline, partially works, doesn't work. For "doesn't work" — is the user told? Or does it silently fail? A button that does nothing on tap with no feedback is the worst UX.

2. **Offline data accumulation** — user is offline for 3 days, adds 200 transactions, 50 orders. When they reconnect:
    - Does sync push ALL 250 records? Or just the last N?
    - Is there a queue or batch limit?
    - How long does the sync take? Does the app freeze during it?
    - If sync fails partway through, where does it resume?
    - Can the user keep using the app DURING sync?

3. **Auth token expiry offline** — Supabase tokens expire. If the user is offline when the token expires:
    - Can they still use the app locally? (They should)
    - When they reconnect, does token refresh happen automatically?
    - If refresh fails (account deleted? password changed?), what happens to their unsaved data?
    - Is there any risk of data loss during re-authentication?

4. **Conflict resolution after extended offline** — user A (phone) and user B (tablet, same account?) both edit records offline for 2 days. Both come online. Who wins? Is there merge logic? Or does one device's data obliterate the other's?

5. **Background sync** — does the app sync in the background (iOS background fetch, Android WorkManager)? If not, data only syncs when the app is open — user could lose data if they uninstall without opening. If yes, are background sync operations safe? (No UI to show errors, no user to confirm.)

6. **Network state detection** — does the app check NetInfo? Does it respond to connectivity changes? Or does it just try and fail? Does it show an offline indicator? Does it queue operations for when connectivity returns?

7. **Receipt scanning offline** — user scans a receipt offline. What happens? Error shown? Queued for later? Does the queue persist across app restarts? Can items in the queue be viewed/edited/deleted?

8. **Supabase realtime offline** — realtime subscriptions drop when offline. When reconnecting:
    - Are subscriptions re-established?
    - Are missed events replayed? Or lost?
    - Can the app enter a state where realtime is "connected" but stale?

9. **Data integrity after crash + offline** — app crashes while offline with unsaved mutations in memory but not yet persisted to AsyncStorage. On relaunch:
    - Is there a persistence interval (periodic save) or only save on mutation?
    - How much data can be lost in a crash window?
    - Is there a recovery/integrity check on startup?

10. **Order link / public page offline** — seller shares their order link. Customer opens it but has bad network:
    - Does the page show loading forever?
    - Is there a timeout with helpful message?
    - If the order submits but network drops before response — is the order saved? Duplicate submitted?

Write findings to: docs/audit/OFFLINE_RESILIENCE_AUDIT.md
```

---

## How to Run

**Batch 1 (parallel):**
```
Stream 1 — Data Integrity & Financial Safety      → docs/audit/DATA_INTEGRITY_AUDIT.md
Stream 2 — Auth, Security & Data Isolation         → docs/audit/SECURITY_AUDIT.md
Stream 3 — Edge Cases, Crashes & Defensive Gaps    → docs/audit/EDGE_CASES_AUDIT.md
Stream 4 — Logic & Business Rule Correctness       → docs/audit/BUSINESS_LOGIC_AUDIT.md
```

**Batch 2 (parallel, after batch 1):**
```
Stream 5 — State Machine & Lifecycle Integrity     → docs/audit/STATE_LIFECYCLE_AUDIT.md
Stream 6 — AI & External Service Trust             → docs/audit/EXTERNAL_SERVICES_AUDIT.md
Stream 7 — Cross-Store Numbers Must Match           → docs/audit/NUMBERS_CONSISTENCY_AUDIT.md
Stream 8 — Offline Resilience & Recovery           → docs/audit/OFFLINE_RESILIENCE_AUDIT.md
```

**After all 8 — consolidation pass:**
```
Read ALL 8 audit files in docs/audit/.
Create docs/audit/CONSOLIDATED_FINDINGS.md:
1. Deduplicate findings across all 8 reports (same bug found by multiple streams)
2. Rank ALL unique findings: CRITICAL → HIGH → MEDIUM → LOW
3. For CRITICAL and HIGH: add blast radius estimate — how many users? how bad?
4. Group by fix effort: quick-fix (< 1 hour) | medium (1-4 hours) | architectural (1+ days)
5. SHIP-BLOCKER list: must fix before any public release
6. WEEK-1 list: fix in first week post-launch
7. TECH-DEBT list: everything else, prioritized
8. Flag contradictions between reports
9. Flag GAPS — areas none of the 8 streams adequately covered
```
