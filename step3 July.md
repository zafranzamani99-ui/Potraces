# Potraces — Step 3 (July 2026): Monetization → Beta

_Follows `step2 July.md` Track D. The 4-tier monetization layer (Phases 1–6) is **built**; billing is **dormant** (local unlock until RevenueCat keys/products exist). Everything is **uncommitted** in a mixed WIP tree. This doc = the two flagged items (both resolved) + what's genuinely left before beta. Last updated 2026-07-18._

---

## ✅ Resolved this pass

### 1. Echo-for-Free — VERIFIED, no change needed
The concern was: after Phase 2, the per-screen Echo FAB opens at **Basic+** — does a Free user still have any way into Echo? **Yes.**

- **Free has a permanent Echo entry: the "Echo" bottom tab** (`MoneyChat`). It is **not** tier-gated at the nav level (`PersonalNavigator.tsx` ~L123) and `MoneyChat.tsx` has **no** tier/`askEcho`/paywall gate. It's gated only by the AI quota: `canUseAI()` → **30 chats/mo** for Free, then a soft "AI limit reached this month — resets next month!" (`moneyChat.ts:855`).
- The **`EchoFab`** (floating button on Wallet/Savings) is the *separate* **"Ask Echo on every screen"** enhancement, correctly gated to **Basic+** (`askEchoPerScreen`).
- This matches `MONETIZATION_AND_PRICING.md` exactly: *Echo chat 30/mo (Free, via the tab)* **+** *Ask-Echo-per-screen (Basic+, via the FAB)*. **No flip to `canUseAI` required — the gates are right as-is.**

> **Optional upsell polish (not a blocker):** when a Free user hits the 30-chat wall *inside MoneyChat*, they get a plain text error, **not the paywall** — a missed high-converting moment (the doc calls metered AI walls the best upsells). Consider surfacing `PaywallModal feature="ai"` on that limit. Small, self-contained MoneyChat change; do it if we want to squeeze conversion.

### 2. Behavior changes — LIVE + grandfathered (handled)
These are now in effect as of the Phase 1–3 work (intended, and safe):

- **Free caps set:** savings 5→3, Echo 100→30/mo, wallets 6→7 (Basic 13, 4/type); **new** goals/shared-subs caps = 3. (Budgets stay 5, scans 15 unchanged.)
- **Cloud sync is now paid** — the AccountScreen toggle is gated on `hasCloudBackup()`. **Existing** free-with-sync users are **grandfathered**: the gate only blocks *turning it on*; a live backup is never force-disabled.
- **Grandfather contract proven** by `test:tiermigration` (70 checks): a legacy count already over a lowered cap blocks *new creation only* — never a delete; `remainingOf` clamps to 0; upgrading lifts the cap without touching data.

> **Optional soft-landing (not required):** a one-time in-app note for existing users whose free limits dropped. Nothing breaks without it — they simply can't add *more* past the new cap, and keep everything they already have.

---

## 🔲 Genuine TODO before / for beta

| # | Do this | Notes |
|---|---|---|
| 1 | **On-device verify** the paywall (Basic-hero, "BEST VALUE", RM14, RM120/yr) + a few gates (wallet/budget/goals/shared-sub/scan/Echo) in **light AND dark**. | Nothing money-facing has been eyeballed on a phone yet — only `tsc` + 51 tsx tests. |
| 2 | **Commit** the monetization layer as **one isolated set**. | It's tangled in a WIP tree (savings/notes/budget-sheet/glass). Cherry-pick the tier/paywall/billing files so it lands clean. |
| 3 | **RevenueCat go-live** (the real money switch). | Full checklist in `src/services/billing.ts` header + Track D: keys → 5 products (App Store Connect + Play) → RC offering + 3 entitlements → native rebuild → sandbox test. Ideally add **server-side entitlement verification** so the tier can't be flipped locally. Until done, Continue = local unlock. |
| 4 | _(Optional)_ AI-limit paywall inside MoneyChat | The upsell polish from §1 above. |
| 5 | _(Optional)_ Existing-user changelog note for lowered free caps | The soft-landing from §2 above. |
| 6 | _(Later)_ Localize the paywall to Malay | `PaywallModal` is English-only (tier names/benefits/BEST VALUE/Continue). The app is bilingual; the paywall should be too before a wide MY launch. |

---

## Quick reference — what was built (Phases 1–6)

- **Tiers:** `src/constants/tiers.ts` (`TIER_LIMITS`, `tierAtLeast`, `canCreate`, `remainingOf`), re-exported from `constants/premium.ts`.
- **Store:** `premiumStore` tier-aware (`setTier`, `canCreate*`, `has*`); trial retired.
- **Gates:** ~30 sites rewired to `askEchoPerScreen` / finite-cap checks; new Goals + shared-sub caps.
- **Paywall:** `PaywallModal` — Basic-hero, RM14 Pro, `setTier`/`purchaseTier` on Continue, Restore wired, `feature="goals"|"subscription"|"backup"`.
- **Backup:** cloud-backup gate + "this isn't a backup" notice (`SubscriptionCard`, `AccountScreen`).
- **Billing:** `billingMap.ts` (pure) + `billing.ts` (RevenueCat), dormant until keys.
- **Tests:** `test:tierlimits` (31), `test:tiermigration` (70), `test:billingmap` (12), `test:chatmodel` (11) — all in `npm test` (51-file suite green).

---

## 🔴 Multi-device / auto-sync / cloud-backup-toggle audit (2026-07-18)

_Full-codebase audit — 7 parallel auditors, **every finding adversarially re-verified** against the actual code (false positives dropped). Personal cloud sync currently ships **gated OFF** (`personalSyncEnabled` default `false`), so none of these is a live incident today — but this is the **go/no-go review for turning multi-device sync + paid cloud backup ON**. Severities are the verifier's corrected values. Each item is grounded in `file:line`._
_This section **extends/corrects** §2 above ("Cloud sync is now paid"): the manual toggle **is** gated, but the sign-in path that nearly every user takes is **not** — see **T1**._

Legend: 🔴 HIGH · 🟠 MEDIUM · 🟡 LOW

### A. Cloud-backup toggle — the paywall is effectively bypassed

**T1 · 🔴 HIGH · Signing in silently enables backup with NO paywall check** — `src/screens/shared/AccountScreen.tsx:116` (`enableBackup`)
- `enableBackup()` unconditionally calls `setPersonalSyncEnabled(true)` + `syncPersonal()`. It runs right after auth success from `handleGoogle` (:149), `handleApple` (:172), `handlePhoneSubmit` (:211) — **none** check `hasCloudBackup()`. The paywall gate lives ONLY in the manual `Switch` handler (`handleToggleBackup:244`). `syncPersonal`/`PersonalSyncManager` gate on `personalSyncEnabled`+session+schema, never the entitlement.
- **Repro:** signed out, free tier → tap "Continue with Google" → sign-in succeeds → sync enabled → full pull+push runs. Paid cloud backup obtained without ever seeing the paywall. The Google/Apple path is the default flow, so the toggle's paywall is effectively dead.
- **Fix:** gate `enableBackup` on `hasCloudBackup()`; if false, leave sync off after sign-in and show the paywall/upgrade state.

**T2 · 🟠 MEDIUM (was HIGH) · Tier downgrade / cancellation never turns backup off** — `src/store/premiumStore.ts:26`
- `setTier`/`unsubscribe` mutate only `{tier, subscribedAt}` — never `personalSyncEnabled`. No sync gate checks `hasCloudBackup()`. The forced-`false` sites (`personalSync.ts:195/752/802`) are schema-error/explicit-disable only.
- **Repro:** premium → enable backup → Settings → Subscription → Cancel (`SubscriptionCard.tsx:61` → `unsubscribe` → tier `free`). Edit any transaction → the debounced subscriber still pushes to Supabase; the toggle still reads ON.
- **Fix:** on `setTier`/`unsubscribe` when `!hasCloudBackup()`, call `disablePersonalSync(false)`; or add `hasCloudBackup()` to the `syncPersonal` + `PersonalSyncManager` gates.
- _Real impact is low **today** (billing dormant, tier is a self-selected local flag) but this is a **must-fix before RevenueCat go-live** — pairs with TODO #3._

### B. Multi-device correctness

**M1 · 🔴 HIGH · Deleting anything except a transaction/receipt resurrects across devices (split-brain + wallet corruption)** — `src/services/personalSync.ts:582`
- `SOFT_DELETE_TABLES` = `{personal_transactions, personal_receipts}` **only**. Every other money table (wallets, goals, debts, budgets, subscriptions, savings, splits, contacts, notes) hard-deletes via `deleteTombstones`; the only zombie guard is the **local** durable tombstone on the deleting device. A second device that still holds the row re-upserts (resurrects) it on push, and `autoReconcileWallets` then re-applies its wallet effect.
- **Repro:** Devices A+B both hold goal G with a wallet-linked contribution. A deletes G → cloud row hard-deleted, A refunds its wallet + keeps a 180-day local tombstone. B (never tombstoned G) syncs → keeps G locally, **re-upserts G to the cloud**, stays debited. A pulls G back but its tombstone skips it. **Permanent split-brain:** A = no goal / higher balance, B = goal / lower balance; a fresh device C pulls the zombie and its reconcile **re-deducts** the wallet again.
- **Fix:** extend the `deleted_at` soft-delete tombstone (already built for tx/receipts) to **all** money tables, or add an authoritative cloud tombstone table every device consults on pull. The code comment at `personalSync.ts:216-218` already flags this as a "later phase" — **it is a shippable-blocking multi-device gap.**

**M2 · 🟠 MEDIUM (was HIGH) · Take-home income + must-pay commitments + budget model never sync** — `src/store/budgetProfileStore.ts:18`
- `budgetProfileStore` (takeHome, manual commitments, modelId) is never imported by `personalSync`. Budgets themselves DO sync, but the **income baseline they're planned against does not**. The codebase already documents this at `settingsStore.ts:344-348`.
- **Repro:** A sets take-home RM5000 + rent/car commitments + generates a budget. B pulls the budgets, but `budgetProfileStore` stays default → BudgetPlanning + Echo derive "available to spend" from a null income (graceful fallback: `BudgetPlannerSheet.tsx:120` uses transaction-derived income) → different numbers, and re-prompts for income the user already set. Silent divergence, no error.
- **Fix:** add a `personal_budget_profile` table (or fold takeHome/commitments/modelId into a synced profile blob) with LWW by `updatedAt`; wire into `pullAll`/`pushAll`.

**M3 · 🟠 MEDIUM · Custom categories / renames / colors / order never sync** — `src/store/categoryStore.ts:25`
- `categoryStore` (customExpense/Income categories, name/icon overrides, ordering) is AsyncStorage-local only. Transactions/budgets key on the category **id** (`custom_<ts>`) and DO sync.
- **Repro:** A creates custom category "Supplier-Ali" + logs under it. On B the synced transactions carry that id but `categoryStore` has no entry → the label/icon/color degrade (shows the description or an em-dash, **not** the custom name) and the category is **absent from B's Category Manager** (can't rename/recolor/reorder there). No money math breaks — amounts/wallets are correct and budget-vs-txn matching still works on the shared id. Cross-device **display + management** inconsistency.
- **Fix:** sync the custom-category definitions (+ overrides + order) so every referenced category resolves on every device.

### C. Auto-sync robustness

**A1 · 🟠 MEDIUM · Last-write-wins trusts the device clock** — `src/services/personalSync.ts:430`
- `remoteWinsScalar`/`newer` order all scalar conflicts on `updatedAt`/`client_edit_at`, both **client-stamped** in the `*ToRemote` mappers; `SKEW_MS=2000` only cushions ≤2s ties. Migration `20260716…client_edit_at` deliberately uses the client column (the server `updated_at` trigger is push-time, not edit-time), so **no server-authoritative edit-time exists**.
- **Repro:** B's clock runs 30 min fast → any B edit outranks A's genuinely-later edit → A's newer money change is lost on the next pull, silently. Affects scalar-LWW tables (budgets, wallets, transfers, transactions). _iOS clocks are NTP-synced, so large skew is uncommon._
- **Fix:** prefer a server edit-time source or per-field version counters for money-critical scalars; at minimum surface large clock skew.

**A2 · 🟡 LOW · Schema check is cached for the whole session** — `src/services/personalSync.ts:669`
- `_schemaVerified` is module-level and cached for BOTH true and false; `resetPersonalSchemaCheck` has **zero call sites** (clears only on app restart). A transient probe blip caches `false` **and auto-disables sync** for the rest of the session; "Sync Now" resets backoff but not the schema cache.
- **Repro:** transient network error during the preflight → sync stuck OFF until the app is restarted. No data loss, self-heals on restart.
- **Fix:** re-probe on connectivity-restored / on the first later failure; don't cache a `false` verdict.

**A3 · 🟡 LOW (UNCERTAIN) · A permanent "poison row" would wedge ALL sync** — `src/services/personalSync.ts:628`
- **Mechanism confirmed:** a persistently-failing upsert on any table → `pushAll` returns false → `syncPersonal` marks the push "incomplete" → the clock never advances, tombstones never clear (pending deletes re-fire every cycle), `autoReconcileWallets` is skipped — forever, with only a `console.warn`. No per-row/per-table quarantine.
- **But reachability is low:** the current schema has **no** `CHECK`/length constraints a mapper leaves unguarded; the only realistic trigger is a `numeric(14,2)` magnitude overflow (≥1e12, a money column guarded for NaN but not magnitude). Treat as **defense-in-depth hardening**, not a demonstrated blocker.
- **Fix:** track per-table success (advance/clear the tables that succeeded, retry only the failed ones); quarantine + surface a row that fails N consecutive cycles.

### Considered & dismissed (adversarially refuted — listed so they're not re-raised)
- **Contacts/transfers carry no edit timestamp** → cross-device edits never win the merge. *(Refuted: merge path handles it.)*
- **One-budget-per-category dedup discards the loser's allocation cross-device.** *(Refuted.)*
- **Toggle reads ON but never syncs when the persisted auth flag outlives the Supabase session.** *(Refuted: the session-expired path surfaces a `'session'` error in the UI.)*

### Related findings NOT in scope of this section (answers to the other two review questions)
_These are money-logic-connectivity + Echo-coverage findings from the same audit; reported to the team but tracked outside this sync doc:_
- **Cross-screen "kept" contradiction (🔴 HIGH):** `useKeptNumber.ts:35` (Dashboard "Kept" card) does **not** exclude `transfer-` txns, but the Reports math sheet it deep-links into (`Dashboard.tsx:865 → openMath:'kept'`) does — the two connected screens show different "kept" for the same month. Echo's builders (`moneyChat.ts:445`, `queryEngine`, `spendingMirror`) have the same gap.
- **Goal contributions counted as spending (🔴 HIGH):** `insights.ts:135` — goal contributions are booked as `category:'savings'` expenses and aren't excluded from cash-flow/spend, so Reports + Pulse treat saving as spending, contradicting the Goals screen.
- **Note-driven debt over-payment (🟠 MED):** `useIntentEngine.ts:287` caps the recorded payment but deducts the wallet by the full amount.
- **Echo coverage (🟠 MED):** Goals' Echo is **not** tier-gated (monetization bypass, `Goals.tsx:2465`); Debt + TransactionsList have no per-screen Echo.
