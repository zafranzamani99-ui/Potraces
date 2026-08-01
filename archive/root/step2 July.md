# Potraces — Step 2 Plan (July 2026)

_On `main`, clean tree. **This doc is now HISTORICAL — superseded by `step3 July.md` (monetization→beta) and `AUGUST.md` (v1.0 launch tracker, target 13 Aug).** Nearly everything below is DONE. Last reconciled against the repo 2026-07-29._

> ## 🎯 Status at a glance (verified 2026-07-29)
> **Tracks A, B, C, D are effectively complete.** What's genuinely left from *this* doc:
> - ❌ **Import category name→id mapping** — still open (imported txns store the category NAME, not an id → detached from budgets). The one true orphan; not tracked in the newer docs.
> - ❌ **Track A neu:** only **AccountOverview** + the two **Import** screens are not yet neu'd (Budget/Reports/Pulse/MoneyChat/Goals all done).
> - ⏭️ **Beta secrets** (`BETA_IOS_URL`/`BETA_ANDROID_URL`) — now tracked in `AUGUST.md`.
> - ⏭️ **Migration cleanup:** repoint webhooks (if any) → **delete the Tokyo project last**.
> - ❓ **Factory Reset button** — no dedicated control found; not flagged as a launch blocker (Delete-Account path exists). Verify if still wanted.
>
> Everything else — LWW money fix, tombstone TTL, storageBackup gating, Onboarding Skip, shortcut re-sign, Track C interactive guides, the whole Track D 4-tier paywall — is **built & test-backed**. Detail marked inline below.

Four tracks were in flight: **(A) neu-kit redesign**, **(B) money data-safety**, **(C) ScreenGuide walk-throughs**, **(D) monetization & paywall**. All four are now essentially done; the live launch work has moved to `AUGUST.md`.

---

# ▶ START HERE

**Where it stands (2026-07-29):** everything is on `main`, clean tree, `tsc` 0, test suites green. Active launch work is in `AUGUST.md`. The table below is kept for history — statuses updated inline.

## ✅ Done 2026-07-16 (on `fix/debt-money-integrity`, NEWLY cleared)

- **Track B — wallet whole-row LWW FIXED.** New migration `20260716000000_personal_client_edit_at.sql` + skew-tolerant last-EDIT-wins in `personalSync.ts`; test `test-personal-sync-roundtrip.ts`. **⚠️ Apply the migration to Supabase BEFORE shipping the app build** (see Track B).
- **Track B — savings `currentValue` merge FIXED** (same `client_edit_at` LWW).
- **Onboarding "Skip" FIXED** — now scrolls to the start-choice page instead of committing "start fresh" immediately.
- **Bills data/money/edge-case audit** done (`d139287`) + 5 new tests (billing-advance, subscription-merge, debt-payment-cap, goal-math, expanded wallet-reconcile).

## ✅ Done earlier (2026-07-10…15, already cleared)

- **HIGH money fix committed** — walletReconcile tip bug + 6 files (`ff76023`).
- **Import double-booking fixed** — dedup in `src/utils/importDedup.ts`, wired into both import screens (`82428cf`). *Category name→id mapping still open — see Track B.*
- **Savings & Investments redesign merged** — Savings on the neu kit (`a46f872`).
- **"Onyx" dark-surface standard committed** app-wide (`54337ed`) — **supersedes the old "modal shell = flat" decision**; see CLAUDE.md.
- **Settings split** into App / Personal / Business (`2aaa7bb`).
- **Beta site on `main`** → Singapore. Old "get site onto main" blocker **cleared**; only the two secrets remain.
- **Singapore backend migration** — all live code + all 7 `site/*.html` swept. Only docs/READMEs/applied-migration SQL still *name* Tokyo — harmless history.

## 1. Do these, in order

| # | Do this | Why | Detail |
|---|---|---|---|
| 1 | ✅ ~~Merge `fix/debt-money-integrity` → `main`~~ **DONE (`c0b6b99`)** — but **confirm the `client_edit_at` migration is applied to Supabase** before the next app build (deploy-order rule; can't verify server-side from repo). | LWW money fix + Bills audit are now on `main`. | [Track B](#track-b--money-data-safety-remaining-ranked) |
| 2 | Device-verify Debt + Receipt, light AND dark | App is now in launch prep (EAS builds) — presumed seen on device; not separately logged. | [What to look at](#what-to-look-at-on-device) |
| 3 | ✅ ~~Track B — remaining sync/backup~~ **DONE** | Tombstone TTL raised 30→**180d** + budget-dedup backstop; storageBackup restore now blocks cross-account snapshots (`currentIdentity()`/`planRestoreDay`). | [Track B](#track-b--money-data-safety-remaining-ranked) |
| 4 | ⏭️ **Beta — set the 2 secrets** | `BETA_IOS_URL` + `BETA_ANDROID_URL` still unset — **now tracked in `AUGUST.md`**. | [Beta](#beta-distribution--secrets-only) |
| 5 | Track A — remaining neu screens | ✅ Budget/Reports/Pulse/MoneyChat/Goals done. ❌ **Only AccountOverview + Import (Csv/Statement) left.** | [Remaining screens](#remaining-screens) |
| 6 | ✅ ~~Track C — guide upgrades~~ **DONE** | Debts/Receipts/Savings/Subscriptions all now interactive (`steps={…}`). | [Track C](#track-c--screenguide-walk-throughs-first-run-ux) |
| 7 | ✅ ~~Singapore shortcut re-sign (**Mac-only**)~~ — DONE 2026-07-16 | Both shortcuts re-signed on Mac + uploaded to the Singapore `web` bucket; public URLs verified. | [Migration](#supabase-tokyo--singapore-migration--back-tap-shortcut-re-sign-mac-only-deferred-2026-07-14) |

_The only genuinely-open item from this table is the **Import category name→id mapping** (Track B, Import cluster) + the cosmetic **AccountOverview/Import neu**. Beta secrets + Tokyo-project deletion moved to `AUGUST.md`._

## 2. Decisions only you can make

| Decision | Context | Cost of "yes" |
|---|---|---|
| **Echo FAB + greeting bubble (#15)?** | Still non-neu. Cross-screen element — migrate **app-wide in one pass**, never per-screen. | 1 pass, touches many screens |
| **Fix the `NeuButton`/`NeuPressable` flex footgun in the shared components?** | See [footgun](#known-footgun-shared-buttons-and-flex). Worked around locally in `SelectionActionBar`. | Blast radius = wallet + commitment + calculator (locked look) |

---

# Track A — neu-kit redesign

## Status (2026-07-09/10)

**Done:** navbar · Dashboard/home · Wallet (+ its modals, WalletPicker) · **Commitment/Bills** (`SubscriptionList` + `CommitmentForm`) · **Debt** (`DebtTracking` + all 17 `components/debt/*`) · **Receipt ×3** (`ReceiptHistory`, `ReceiptDetail`, `ReceiptScanner`) · **Savings & Investments** (S&I redesign, merged `a46f872`) · shared `CategoryPicker` / `TransactionItem` / `NeuButton` / `NeuPressable` / `FAB`.

**Onyx** (dark-surface standard) is now committed app-wide (`54337ed`) — see CLAUDE.md for the LOCKED checklist. Screens not yet Onyx'd are listed there (BudgetPlanning, AccountOverview, Reports, FinancialPulse, MoneyChat, Import, Receipt modals, seller/*).

Debt + Receipt were converted by a 21-agent workflow (166 surfaces), then Debt got a 37-agent adversarial audit (6 task-divided lenses + 3 refuters per finding). **All 11 verified findings fixed.**

> ⚠️ **Nothing is device-verified.** `tsc`-clean and test-backed, but nobody has looked at Debt/Receipt on a phone in **both** themes.

### What to look at on device

- **The two glass toggles** (pending/settled; i-owe/they-owe). **Dark is *deliberately* a subtle frosted capsule** — glass lenses the background and the theme is near-black, so there is nothing to refract. **Physics, not a bug** (see `liquid-glass-tab-bar` memory). Light mode shows the material properly; the selected pill is a colored tint + colored border.
- **`record payment` / `record all payment`** are now the **solid olive `NeuButton`** (matching the bills screen's "mark as paid"). Two knock-ons: the button is **taller** (`minHeight: 52`), and its fill moved `C.positive` → `C.accent`.
- **Bulk-selection bar** (long-press a debt): the destructive *delete* button should now be **equal-width** with edit/archive.

### Known footgun: shared buttons and flex

`NeuButton` **and** `NeuPressable` apply the caller's `style` to their **inner `Animated.View`**, not the outer `Pressable`. So a passed `flex:1` never reaches the real flex child — inside a `flexDirection:'row'` parent the button **collapses to content width**. It only works everywhere else because those parents are default-stretch columns.

Worked around **locally** in `SelectionActionBar` (wrapped in a `flex:1` View). **Prefer wrapping at the call site** over changing the shared component.

### Remaining screens

Same standard, same process. **Mostly done now** — ✅ Goals, BudgetPlanning, Reports, FinancialPulse, MoneyChat (+ Savings earlier) all use the neu kit. **Still not neu'd:**
`AccountOverview.tsx` · `ImportFromCsv.tsx` / `ImportFromStatement.tsx`

Each: spread `useNeu().raised/inset/well/raisedSoft` into existing rows/cards (keep all logic), swap CTAs to `NeuButton`, FABs to shared `FAB`, respect container-tone + clipping. Verify light+dark on device.

### Housekeeping notes

- `DebtTracking.tsx` is now **9,352 lines** (from 10,675 — 214 orphaned StyleSheet keys purged). Still the biggest file; further extraction optional.
- **Never range-delete in this repo.** Delete by verified symbol only (a range-delete once removed live code sitting between two dead blocks).

---

# Track B — money data-safety (remaining, ranked)

CRITICAL tier already fixed (Echo transfer/goal/withdraw guards, corruption-quarantine, reconcile debt-erase + regression test, import wallet-balance/EU-parsing/Dr-Cr). Remaining, from memory `money-data-safety-audit`:

> **Fixed 2026-07-09 (debt audit) — for context, not a TODO:** business-mode overpayment **tips** were silently erased by `walletReconcile` on every sync. `processPayment` charges the wallet `amount+tip`, but `addPayment` stores `amount` capped to the debt with the tip kept separately as `payment.tipAmount`; a business payment links to a **business** tx (not in `personalStore.transactions`), so reconcile's skip never fired and it replayed only `payment.amount` → `autoReconcileWallets` overwrote the balance and deleted the tip (or refunded an `i_owe` tip you really paid). Reconcile now mirrors the delete path (`+ (mode !== 'personal' ? tipAmount : 0)`), with 3 new scenarios in `scripts/test-wallet-reconcile.ts`. Also fixed: `updateMonthAmounts` clobbering a shared-sub's *current* price when adjusting a past month; and the "equal split" button producing a form its own validator rejects (33.33×3 ≠ 100).

### Sync / backup cluster
- ✅ **Wallet whole-row LWW + reconcile double-apply — DONE** (on `fix/debt-money-integrity`). Root cause: a `handle_updated_at` trigger overwrote `updated_at` with server `now()` on every push, degrading conflict resolution to **last-PUSH-wins** (a stale device could clobber a genuinely newer edit). Fix: new migration `20260716000000_personal_client_edit_at.sql` adds a client-authoritative `client_edit_at` (no server trigger touches it) across all 10 personal tables; `personalSync.ts` now resolves on `client_edit_at` (last-EDIT-wins) with a skew-tolerant near-tie window. Regression test `scripts/test-personal-sync-roundtrip.ts`. **⚠️ Deploy order: apply the migration to Supabase BEFORE shipping the app build that writes `client_edit_at` — schema preflight keeps sync safely disabled on an un-migrated DB.**
- ✅ **Savings `currentValue` merge — DONE** (same `client_edit_at` LWW; `personal_savings_accounts` got the column).
- ✅ **Tombstone TTL — DONE.** Raised 30→**180 days** (a spare device offline for weeks re-uploading a since-deleted item is realistic), with a second backstop: `personalSync` budget-dedup collapses a resurrected duplicate-category budget on the next sync. `tombstoneStore.ts`.
- ✅ **`restoreDay` era-mix + account/mode gate — DONE.** `storageBackup.ts` now writes a per-day identity manifest; `restoreDay`/`planRestoreDay` compare `meta.userId` against `currentIdentity()` and return `{ blocked: true }` rather than restore another account's snapshot over live data.

### Import cluster
- ✅ **Duplicate detection — DONE (`82428cf`).** CSV + statement re-imports dedup on a content-identity key (wallet + calendar-day + amount-to-the-sen + type + normalized description), so re-importing the same file can't double-book. Lives in `src/utils/importDedup.ts` (`markNewImportRows`), wired into both import screens.
- ❌ **Category name→id mapping — STILL OPEN (the one true orphan from this doc).** Imports store the display NAME (`csvImport.ts`/`statementImport.ts` — 0 categoryId resolution), so imported txns are detached from budgets. Resolve to a category id (reuse the learning/category store). Not tracked in `step3 July.md` or `AUGUST.md`, so it lives here.
- _(Deferred, needs UI/deploy):_ single-column positive-Amount sign toggle; supabase `parse-statement` own-account-transfer double-count.

Each sync/backup fix gets a regression test (extend the `scripts/test-wallet-reconcile.ts` pattern) before it's called done.

---

# Track C — ScreenGuide walk-throughs (first-run UX)

**Engine:** `src/components/common/ScreenGuide.tsx` — one component, two modes.
- **Legacy (passive):** `title`/`description`/`points`/`spotlight` props. Intro card → optional spotlight. The whole overlay is one dismiss-Pressable, so tapping the highlighted button just closes the guide (you tap twice). No `payoff`.
- **Walk-through (interactive):** `steps={[...]}` of `intro | spotlight | doWithMe | payoff`. `doWithMe` cuts a **tappable** hole and advances only when the user really does the thing, via `whenStore(store, select→number, done(cur, base))` (baseline captured on step entry).

### Status (2026-07-10)

| Screen | Guide id | Mode |
|---|---|---|
| Wallets | `guide_wallets` | interactive |
| Budget | `guide_budget` | interactive |
| Goals | `goals-guide` | interactive |
| Echo / chat | `guide_chat` | interactive |
| Notes landing | `guide_notes_start` | interactive |
| Note editor | `guide_note_editor` | interactive (2 steps) |
| Debts | `guide_debts` | **passive** (spotlight wired) |
| Receipts | `guide_receipts` | **passive** (spotlight wired) |
| Savings | `guide_savings` | **passive** (intro only) |
| Subscriptions | `guide_subscriptions` | **passive** (intro only) |
| Pulse | `guide_pulse` | passive — **stays passive** (read-only screen, nothing to do) |
| Notes (old) | `guide_notes` | legacy, dormant — retired by `dismissHint` on first note; only reachable if a note arrives without `handleNewNote` (share extension, Echo) |

### ✅ DONE — Debts + Receipts + Savings + Subscriptions guides are now interactive

> **Cleared 2026-07.** All four were upgraded from passive to interactive `steps={…}` walk-throughs — verified: `DebtTracking`, `ReceiptScanner`, `SavingsTracker`, `SubscriptionList` all carry a step machine (10 screens total now interactive). The status table above is pre-upgrade; treat this note as authoritative.

_(Original plan kept below for reference.)_

Debts and Receipts were the cheap two: both already pass a `spotlight={{ targetRef: guideTargetRef, ... }}`, so the target ref exists and is measured — they only needed the step machine. Savings and Subscriptions needed a target ref wired first.

Per screen:
1. `import ScreenGuide, { whenStore } from '../../components/common/ScreenGuide'`.
2. Replace the legacy props with `steps={[intro, doWithMe, payoff]}`, memoized (`useMemo`) so the measure effect runs once per step, not per keystroke.
3. `watch:` must count only what the **user** does. Echo counts `chatMessages.filter(m => m.role === 'user').length` precisely so an assistant auto-message can't fast-forward the step.
4. Add 3 i18n keys per screen (`<x>Walk`, `<x>PayoffTitle`, `<x>PayoffBody`) to **both** `en.ts` and `ms.ts`.
5. `tsc` clean → device-test on iPhone.

### Gotchas (each one cost a debugging session)

- **The spotlight target must be mounted when the guide runs.** If a screen shows an empty-state CTA *or* a FAB depending on data, put the same `guideTargetRef` on **both** branches — they're mutually exclusive, so the guide always finds one. Goals does this; **Budget did not, and silently broke** (fixed 2026-07-10, `BudgetPlanning.tsx:1401`): with demo data loaded there are budgets, so the empty-state button is gone, the target never measures, and the `doWithMe` step is skipped straight to the payoff card. Anyone running demo data never saw the spotlight.
- **A target that never measures skips its step** (5 rAF retries, then `advance()`). Fails soft and silent — always device-test with data present, not just on an empty screen.
- **Refs must land on a touchable or a `collapsable={false}` View**, else Android flattens it away and `measureInWindow` returns 0×0. `EmptyState` takes an optional `actionRef` for exactly this (the container is full-height, so the ref has to land on the button).
- **iOS hole-tap:** RNSVG's iOS hit test ignores `fillRule="evenodd"`, so the scrim swallowed taps meant for the hole. Fixed by wrapping the `<Svg>` in a plain `pointerEvents="none"` View. Only the walk-through path has this — legacy still swallows the tap.
- **i18n:** `export type Translations = typeof en`, so every new EN key breaks `tsc` until `ms.ts` has its twin.
- **Guides are one-shot** via `settingsStore.dismissedHints`. Reset paths: `clearPersonalData` and the demo-data "clear & start fresh" both set `dismissedHints: []`. Nothing enumerates guide ids, which is why Goals' odd `goals-guide` id is harmless — renaming it would just re-show the guide to existing users.

### Naming standard — "demo data"

User-facing copy says **demo data** everywhere (Settings, banner, toasts, en+ms). Code identifiers (`sampleDataLoaded`, `clearSampleData`, `SampleDataBanner`) deliberately still say `sample` — renaming them is risky churn and invisible to users. Don't "fix" this.

---

# Track D — Monetization & Paywall (NEW, 2026-07-18)

**Where it stands — design DONE, tier system NOT.** Shipped in-tree: the new `PaywallModal`
(3-tier neu paywall, Onyx-clean, light+dark), `SubscriptionCard` rewired to open it (Neu
Select CTA, no more instant-unlock at a stale price), and **`docs/MONETIZATION_AND_PRICING.md`
is LOCKED** (tiers, per-feature gates, cloud-backup/data model, the "device-only unless you
subscribe" rule). That doc is the source of truth for everything below.

### Audit — do the screens follow the new plan? (2026-07-18)
**No. Every gate is still the old 2-tier `premium`/`free`.** Nothing enforces Basic/Pro/
Premium, and the paywall's Continue still flips a local `premium` flag (no billing).
Enforcement points found (all need rewiring in Phase 2):
- **Count caps:** wallets (`WalletManagement` `canCreateWallet`), budgets (`BudgetPlanning`,
  `chatActions`), savings (`SavingsTracker`, `chatActions`). **Goals + shared-subs have NO cap yet.**
- **Metered:** scans (`ReceiptScanner`, `CostManagement`, `DebtTracking`), AI (`moneyChat`,
  `intentEngine`, `playbookAI`, `reportNarrative`, `spendingMirror`, `queryEngine`,
  `useIntentEngine`, `NoteEditor`, `SavingsSheets`).
- **Capability (premium-gated all-or-nothing today):** Echo FAB/panel (`EchoFab`,
  `BudgetPlanning:1260`, `SubscriptionList`) → must split into **Basic** (Ask-Echo enabled) +
  **Pro** (smart model).
- **Model routing:** `chatModel.ts` already routes `pro`/`premium` → smart. ✅ *(only file that
  knows the new tiers.)*
- **Cloud backup:** `personalSyncEnabled` is a **free** toggle — not gated to a paid tier.

### Decisions locked this round
- **Pro RM15 → RM14** (annual **RM120/yr → RM10/mo**, −28%, save RM48). Premium stays RM25;
  Basic RM7.99 monthly-only.
- **Basic (RM7.99) is the hero** — pre-selected + "Most Popular", the volume play. *(Trade-off:
  more subscribers, lower ARPU, and it weakens the decoy vs. "Pro is hero" — accepted.)*
- **Free Echo 100 → 30/mo** so the 5×/10×/20× AI ladder actually converts (at 100 nobody hit it).
- **"This isn't a backup"** — free users get a device-only notice; **Export stays free** as the
  safety valve.
- **Grandfather** existing users who are already over a lowered cap — block *new* creation only,
  never delete/lock existing data.
- **RevenueCat billing is LAST** — keep the local unlock until the tier system + gates are proven.

### Build order (ranked — this is the Phase plan)

> **✅ Phase 1 DONE (2026-07-18).** Pure `src/constants/tiers.ts` (4-tier `TIER_LIMITS` + `tierAtLeast`/`canCreate`/`remainingOf`, doc numbers); `premium.ts` re-exports it (dropped stale `FREE_TIER`/`PREMIUM_TIER`/`TRIAL_DAYS`/`PREMIUM_CONFIG`); `PremiumTier` → 4 tiers; `premiumStore` rewritten tier-aware + `setTier`/`canCreateGoal`/`canCreateSharedSub`/`hasCloudBackup`/`hasAskEcho`/`hasPhotoIcon`; trial retired; grandfather automatic (legacy `premium` users unchanged). New `test:tierlimits` (31 checks) in `npm test`; `tsc` clean. **Live now:** free caps set (savings 5→3, Echo 100→30, wallets 6→7; budgets stay 5; new goals/subs caps 3; Basic wallets 13 + 4/type) and Premium metered is CAPPED (scans 300, AI 600) — no real premium users yet (local flag). Screens still hold inline `=== 'premium'` checks → **Phase 2**.

> **✅ Phase 2 DONE (2026-07-18).** All ~30 gate sites rewired to the 4-tier model (8-agent workflow, each diff human-verified): Echo gates → `!TIER_LIMITS[tier].askEchoPerScreen` (Echo opens at **Basic+**), "is-unlimited" checks + display counters → `TIER_LIMITS[tier]` finite-aware — EchoFab, BudgetPlanning, WalletManagement, SavingsTracker, ReceiptScanner, CostManagement, SubscriptionList, playbookStore (DebtTracking scan gates were already tier-aware). **NEW caps:** Goals (`canCreateGoal` — replaced a hardcoded `MAX_GOALS=10` toast with the tier paywall, gated at form-open) and shared subs (`canCreateSharedSub`, gated at the DebtTracking `handleOpenSharedForm` entry). `PaywallModal` gained `goals` + `subscription` features. `tsc` clean; **51 tsx tests pass**; zero leftover `=== 'premium'` gates. (eslint debt in DebtTracking/Goals is pre-existing WIP, not a CI gate.)
>
> **⚠️ Decide — Echo for Free:** the per-screen Echo FAB/buttons now open at **Basic+** (were premium-only, so this is strictly *more* access, not less). But the doc promises Free "30 Echo chats/mo". Free still reaches Echo *chat* via MoneyChat (`canUseAI`, 30/mo) — **verify on-device that Free has a real Echo entry**; if the FAB itself should work for Free within their quota, gate those sites on `!canUseAI()` instead of `!askEchoPerScreen`.
>
> **✅ Phase 3 DONE (2026-07-18).** Paywall wired to the tier system: **Pro RM15→RM14** (annual **RM120/yr = RM10/mo**, −28%, save RM48); **Basic-hero** layout (Option A) — Basic pre-selected + **"BEST VALUE"** + raised, **monthly-leads** default (keeps the RM7.99→RM14 gap visible; yearly would make Pro ~RM10/mo and cannibalise Basic); **Continue → `setTier(selected)`** (basic/pro/premium) instead of the hardcoded premium unlock. Knock-ons fixed: `SubscriptionCard` now shows the subscribed state for ANY paid tier (+ shows the tier name, not always "Premium"); `BudgetPlannerSheet`'s Echo-planner budget cap is now tier-aware via `remainingOf` (a Phase-2 gate site I'd MISSED — Pro was getting the free cap). `tsc` clean; tier test green; zero stray `=== 'premium'` is-subscribed checks (only `chatModel`'s pro/premium smart-model routing remains, which is correct).
>
> **✅ Phase 4 DONE (2026-07-18).** Cloud-backup gate + the "this isn't a backup" notice. (1) **Notice** — a tappable `cloud-off` row in `SubscriptionCard`'s free state (every free user sees it in Settings): *"Saved on this phone only — subscribe for cloud backup so you never lose your data."* → opens the paywall. (2) **Gate** — `AccountScreen`'s cloud-backup toggle now checks `hasCloudBackup()`; a free user turning it on gets the paywall (new capability `feature="backup"`, no-quota headline *"Never lose your money"*, `reason` = the paid-feature line) instead of enabling sync. New i18n `notBackedUp` + `cloudBackupPaid` (en+ms). `tsc` clean; i18n check clean (only pre-existing violations remain). **Note:** the gate only blocks *turning sync on*; an existing free user who already had sync enabled keeps it (grandfathered) — we never force-disable a live backup.
>
> **✅ Phase 5 DONE (2026-07-18).** `test:tiermigration` (70 checks) proves the grandfather contract: a legacy count already OVER a lowered cap blocks CREATE only (never deletes), across every resource × tier; `remainingOf` clamps to 0 (never negative); legacy persisted tiers (`free`/`premium`) stay valid keys so rehydration can't crash; upgrading lifts the cap without touching data.
>
> **✅ Phase 6 SCAFFOLDED (2026-07-18) — dormant until keys+products exist.** RevenueCat wired: pure `src/services/billingMap.ts` ((tier,billing)→package id; active entitlements→store tier, highest wins; `test:billingmap` 12 checks) + native `src/services/billing.ts` (`initBilling`/`purchaseTier`/`restorePurchases`, entitlement→`setTier` sync via a customer-info listener). Paywall **Continue → `purchaseTier`** when configured (else the local unlock, so dev still works); **Restore** button wired; `initBilling()` called on app launch (App.tsx). `isBillingConfigured()` is **false until API keys are set**, so every native path returns early and the app stays on the local unlock — safe to ship as-is. `tsc` clean (billing.ts validated against the react-native-purchases types).
>
> **GO-LIVE checklist for billing** (also in `billing.ts` header): (1) RevenueCat project → PUBLIC SDK keys into `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY`; (2) create the 5 products in App Store Connect + Play Console (ids in `billingMap.PACKAGE_ID`); (3) add them to a RevenueCat offering + create 3 entitlements (`basic`/`pro`/`premium`); (4) native rebuild (react-native-purchases is installed but needs a build); (5) sandbox-test purchase + restore. Ideally add server-side entitlement verification so the tier can't be flipped locally.
>
> **Monetization layer status: Phases 1–6 all landed** (billing dormant). Pre-beta: on-device verify (paywall + a few gates, light+dark), resolve the Echo-for-Free flag, then commit as an isolated set.

1. **Tier foundation.** `PremiumTier` → `free|basic|pro|premium` (`types/index.ts`); a tier-rank
   helper (`tierAtLeast`); per-tier limit tables + capability flags in `constants/premium.ts`
   (wallets/budgets/savings/goals/sharedSubs/scans/aiCalls + `askEchoPerScreen`, `cloudBackup`,
   `photoCategoryIcons`); rewrite `premiumStore` gates to read the active tier's limits (+ new
   `canCreateGoal`, `canCreateSharedSub`, `hasCloudBackup`, `hasAskEcho`, `hasPhotoIcon`);
   persisted-tier migration (old `premium` → `premium`) + grandfather; retire trial logic.
   **+1 tier-limits tsx test.**
2. **Rewire enforcement.** Every `tier === 'premium'` site → tier-aware; add goals + shared-subs
   caps; split the Echo gate (Basic = Ask-Echo, Pro = smart model); per-tier scan/AI remaining.
3. **Paywall wiring.** Continue sets the *selected* tier (not hardcoded premium); RM14 + Basic-hero
   layout + final per-tier feats; headline reflects the gate that opened it.
4. **Cloud-backup gate + "not a backup" notice.** Gate `personalSyncEnabled` behind `hasCloudBackup`;
   device-only notice for free users (en+ms).
5. **Grandfather migration test** + device-verify light/dark.
6. **RevenueCat billing** — separate, store-config-heavy milestone (App Store Connect + Play +
   RevenueCat products → `purchasePackage()` in `handleContinue` → entitlement → tier; verify
   server-side). The real money switch.

### Open decision (need your call before Phase 3)
- **Basic-as-hero placement:** keep ascending price `[Basic⭐][Pro][Premium]` with Basic
  pre-selected + raised, **or** physically center it `[Pro][Basic⭐][Premium]` (breaks price
  order). **Recommend the former** — Basic emphasized in place, price stays logical.

---

# Guardrails

- All money fixes are JS-only where possible (reload, no native rebuild), `tsc`-clean, and test-backed.
- Neu changes verified on device in **both** light and dark before sign-off.
- Guides verified on device **with data present**, not just on an empty screen — a missing spotlight target fails silently.
- Don't re-invent per screen — reuse the shared kit/components.
- Never range-delete. Delete by verified symbol, grep-proven to have 0 references.

---

# Beta distribution — SECRETS ONLY

> ✅ **Site is on `main`** pointing at Singapore (verified 2026-07-15: `site/index.html` → `jngmanwvhbpkpkeklfiv.supabase.co`). The old "get `site/index.html` onto `main`" blocker is **cleared**. Vercel deploys from `main`. **Only the two secrets below remain.**

The beta welcome-email + the site's on-screen download buttons read two links from **Supabase secrets**. Until set, both show a calm "download links on the way — check your email" state (no dead buttons). Setting a secret is live — **no redeploy**.

**Set both secrets:**
- **iOS (TestFlight):** `eas build` → `eas submit` → App Store Connect → TestFlight → enable the **public link** → copy `https://testflight.apple.com/join/XXXX`, then:
  ```
  npx supabase secrets set BETA_IOS_URL="https://testflight.apple.com/join/XXXX"
  ```
- **Android (APK):** `eas build -p android --profile preview` → download the `.apk` → host it on storage + wire `jejakbaki.my/dl/android`, then:
  ```
  npx supabase secrets set BETA_ANDROID_URL="https://jejakbaki.my/dl/android"
  ```

> ~~Step 2 — get `site/index.html` onto `main`~~ — ✅ **DONE.** The feature branch was merged; `site/index.html` is on `main` pointing at Singapore. (Historical: the wiring was commit `ecf88e8`; the old `64677d6` reference was an orphaned object — both moot now.)

The `beta-signup` edge fn (wraps `waitlist_signup` + Resend welcome email + returns links, hourly-capped, falls back to raw RPC if down) and the `waitlist.welcomed_at` migration are **already deployed**.

**Go-live = both secrets set.** (Site half is already done.) → **Now tracked live in `AUGUST.md`** (line ~76: "Set `BETA_IOS_URL` / `BETA_ANDROID_URL`"); still unset as of 2026-07-29.

---

# Factory Reset — TODO (deferred, decided 2026-07-09)

A **separate, clearly-labeled** "Factory Reset" / "Reset app" button (Settings, near Delete Personal Data) that wipes **everything** and returns the app to a true first-install state:
- **Personal data** — reuse the now-complete `wipePersonalStores` (settingsStore).
- **Business data** — reuse `clearBusinessData` (settingsStore) → all seller/CRM/stall/freelancer/partTime/mixed/onTheRoad stores + business QRs + business cloud rows.
- **All settings → defaults** — theme, language, currency, haptics, notifications, business-mode flag, defaultMode, everything (unlike Delete Personal Data, which keeps the business-mode flag + business QRs).
- **Signed-in users** — this is the App-Store "Delete Account" obligation: use the existing `planDelete` + `deleteAccountRemote`/`clear*DataRemote` path (AccountScreen already does the smart shared-vs-solo account logic) so the auth user is fully deleted when not shared. Confirm Apple 5.1.1(v) compliance is satisfied by one reachable control.
- **UX** — double confirmation like Delete Personal Data ("continue" → "reset everything"); land on first-run Onboarding.

Context: **Delete Personal Data** is complete and resets device prefs, but it deliberately still preserves business data + the business-mode flag. Factory Reset is the missing "nuke it all" option.

Done (personal-delete hardening): `wipePersonalStores` now also clears `budgetProfileStore` + `pendingPaymentsStore` + `calculatorStore` (+ their AsyncStorage keys), but ONLY on a user-initiated wipe — these three are UNSYNCED, so the sign-in guard must never touch them. `clearPersonalData` resets device prefs (theme/language/haptics/notifications/echoDailyCheckin, and `currency` only when there is no business data). Delete-warning copy updated (en+ms).

### Known limitations (found by adversarial review 2026-07-09, deliberately NOT fixed)

1. **`bak:category-storage:*` snapshots retain deleted personal categories.** `category-storage` is in `PROTECTED_KEYS` (snapshotted daily) but excluded from `PERSONAL_BACKUP_KEYS`, because the same key ALSO holds business categories — purging it would nuke business backups. So a deleted personal custom category can reappear via Backups & Restore. **Right fix: split `category-storage` into `category-storage` (personal) + `business-category-storage`.** That would also let the wipe drop the personal key outright, removing today's workaround (we now skip removing the shared key and rely on the persist write-back, since deleting it destroyed business categories).

2. **Demo data appended onto a real account has no targeted undo.** Settings → Load Demo Data appends (and says so). The banner's one-tap "clear & start fresh" is deliberately NOT armed for non-empty accounts (it would wipe real data). The worst part is fixed — seeded wallets no longer steal the user's default wallet — but removing ~10 demo wallets / ~40 demo txns still means deleting rows by hand. **Right fix: tag seeded rows (e.g. `source: 'sample'`) so a targeted "remove demo data" can delete exactly those.**

---

# Supabase Tokyo → Singapore migration — Back-Tap shortcut re-sign (Mac-only, DEFERRED 2026-07-14)

Part of moving the Supabase backend from **Tokyo (`iydqeeonaljqapulboaz`)** → **Singapore (`jngmanwvhbpkpkeklfiv`)** for PDPA. App, schema (43 migrations), 14 edge functions, secrets, Google+Apple auth, and `.env` are all migrated and **sign-in is device-verified**. This is the one migration item that needs a Mac.

**Why it's stuck on Windows:** the two Back-Tap shortcuts hosted in the `web` storage bucket bake the Supabase `quick-log` endpoint *inside* the shortcut. That endpoint changed Tokyo → Singapore, so the shortcuts must be rebuilt + **re-signed**, and `shortcuts sign` is macOS-only.

**State (2026-07-14):**
- New Singapore `web` bucket is **empty** (verified via `supabase storage ls ss:///web/` → `{"paths":[]}`).
- `scripts/build-quick-log-shortcut.py` + `scripts/build-autolog-shortcut.py` endpoint → already swept to Singapore.
- `shortcut/*-unsigned.shortcut` → already swept to the Singapore URL.
- `shortcut/Potraces Quick Log.shortcut` + `Potraces Auto Log.shortcut` (the **signed** files, dated Jul 10) → still carry the **old Tokyo** URL. They're AEA-encrypted, so a text find/replace can't touch them — **do NOT upload these as-is.**

**Do this on a Mac (in the repo):**
```bash
python3 scripts/build-quick-log-shortcut.py
shortcuts sign --mode anyone -i shortcut/PotracesQuickLog-unsigned.shortcut -o "shortcut/Potraces Quick Log.shortcut"
python3 scripts/build-autolog-shortcut.py
shortcuts sign --mode anyone -i shortcut/PotracesAutoLog-unsigned.shortcut  -o "shortcut/Potraces Auto Log.shortcut"

npx supabase link --project-ref jngmanwvhbpkpkeklfiv
# --content-type is REQUIRED: the web bucket only allows images + application/x-apple-shortcut
# (migration 20260708000000_web_bucket_shortcut_mime.sql); auto-detect sends octet-stream → 415.
npx supabase storage cp "shortcut/Potraces Quick Log.shortcut" ss:///web/PotracesQuickLog.shortcut --experimental --content-type application/x-apple-shortcut
npx supabase storage cp "shortcut/Potraces Auto Log.shortcut"  ss:///web/PotracesAutoLog.shortcut  --experimental --content-type application/x-apple-shortcut
```

**Verify** (should download a shortcut, not an error JSON):
`https://jngmanwvhbpkpkeklfiv.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut`

**Blocker:** do NOT delete the old Tokyo project until this is done — the shortcut download links (`jejakbaki.my/shortcut`, `/autolog`) and any already-installed shortcuts still hit Tokyo until re-signed + re-uploaded.

**Rest of the migration still pending (NOT Mac-gated):**
1. ✅ ~~Redeploy `site/` to Vercel~~ — the site sweep is committed and `main` points at Singapore; Vercel deploys from `main`. _(Confirm the live URL shows the Singapore build.)_
2. Repoint any Telegram / DuitNow-QR provider webhooks from the old Tokyo function URLs to Singapore (only if used).
3. **Delete the Tokyo project** — LAST, after the above + this shortcut re-sign.
4. ✅ ~~Commit this session's changes~~ — the migrations + Singapore sweep + AccountScreen/AuthScreen fixes are committed to `main` (`bd0f86f`, `a0afd82`, `73fc108`). _(Remaining Tokyo `iydqeeonaljqapulboaz` refs are docs/READMEs/already-applied migration SQL only — harmless history.)_

> **Shortcut re-sign status (2026-07-16): ✅ DONE.** Rebuilt (Singapore URL confirmed, zero Tokyo refs), signed on Mac (`--mode anyone`), and uploaded to the Singapore `web` bucket (needed `--content-type application/x-apple-shortcut` — auto-detect 415'd). Verified: both public URLs return HTTP 200 `application/x-apple-shortcut`, byte-identical to the freshly signed local files. This unblocks Tokyo project deletion (item 3 below) once webhooks (item 2) are checked.

---

# Onboarding — Skip should land on the start-choice page (FIXED 2026-07-15)

> **Fixed 2026-07-15:** Skip's `onPress` is now `handleSkip` (`Onboarding.tsx`), which jumps to the final start-choice page via the same advance pattern as `handleNext` (`settleIndex(last)` + `scrollTo`) instead of calling `handleComplete`. `canSkip=false` on the last page hides Skip there, so the StartChoicePage CTA is the only commit — no dead-end. The original write-up follows for context.

**Idea:** The onboarding pager's **last page IS the "start fresh vs demo data" choice** (`StartChoicePage`; `StartChoice = 'fresh' | 'demo'`, `Onboarding.tsx:67-72`). Today **Skip** (`Onboarding.tsx:925-928`) calls `handleComplete(null, sampleBracket)` — it **commits immediately as "start fresh"** and drops the user into an empty app, bypassing the choice. Change Skip to **jump to the last page** instead, so every user makes the explicit fresh-vs-demo decision. Demo data is the main first-run engagement lever — Skip shouldn't hide it.

**Change (one handler).** Skip's `onPress` scrolls the pager to the final page rather than completing — reuse the pager's own advance pattern (`Onboarding.tsx:889-890`):
```js
// was: onPress={() => handleComplete(null, sampleBracket)}
onPress={() => {
  const last = PAGE_COUNT - 1;
  settleIndex(last);
  scrollRef.current?.scrollTo({ x: last * listW, animated: true });
}}
```

**Why it's safe / already consistent:**
- `canSkip = !isLastPage` (`:905`) → landing on the last page hides the Skip button; only the fresh/demo CTA remains. **No dead-end.**
- Skip no longer commits, so the "Skip must mean fresh even if user picked demo then swiped back" note (`:867-869`) no longer applies to Skip — the **StartChoicePage CTA is the only commit** and it already passes the explicit choice.
- Welcome name/language persist on change (FIRSTRUN-H6), so jumping past them loses nothing.
- `settleIndex` / `PAGE_COUNT` / `scrollRef` / `listW` are all already in scope at the Skip handler.

**Watch:**
- **Copy:** "Skip" now means "skip the tour," not "skip onboarding." Consider relabel (e.g. "Skip tour") — en **and** ms.
- One extra tap for pure fresh-start users (Skip → "start fresh") — accepted trade for surfacing demo data to everyone.

**Verify (device):** first-run → tap Skip on any slide → lands on the start-choice page → "start fresh" = empty app, "demo" + persona = seeded sample dataset (same as Settings → Load Demo Data). Light + dark.
