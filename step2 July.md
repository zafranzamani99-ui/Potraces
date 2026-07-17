# Potraces — Step 2 Plan (July 2026)

_On `fix/debt-money-integrity` — pushed to origin, **3 commits ahead of `main`, not yet merged**. `tsc` 0, all `tsx` suites green, working tree clean. Last updated 2026-07-16._

Three tracks are in flight: **(A) neu-kit redesign rollout** (cosmetic, per the locked 3-material standard), **(B) money data-safety hardening** (correctness), **(C) ScreenGuide walk-throughs** (first-run UX). Track B's CRITICAL tier is shipped. Tracks A and C roll out screen-by-screen.

---

# ▶ START HERE

**Where it stands (2026-07-16):** all work sits on `fix/debt-money-integrity` (pushed to origin, **3 commits ahead of `main`, unmerged**). Working tree is clean; `tsc` 0; all `tsx` suites green.

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
| 1 | **Merge `fix/debt-money-integrity` → `main`** — apply the `client_edit_at` migration to Supabase FIRST | The whole LWW money fix + Bills audit lives on this unmerged branch. Migration must land before the app build ships. | [Track B](#track-b--money-data-safety-remaining-ranked) |
| 2 | **Device-verify Debt + Receipt, light AND dark** | The un-cleared sign-off gate for that rollout. `tsc`/test-proven, but no human has eyeballed it on a phone. | [What to look at](#what-to-look-at-on-device) |
| 3 | **Track B — remaining sync/backup items** | Tombstone TTL 30d + storageBackup era-mix/account-gate still open (silent cross-device data loss). | [Track B](#track-b--money-data-safety-remaining-ranked) |
| 4 | **Beta go-live — set the 2 secrets** | Site is already live-ready on `main`; only `BETA_IOS_URL` + `BETA_ANDROID_URL` remain. | [Beta](#beta-distribution--secrets-only) |
| 5 | Track A — remaining neu screens | Cosmetic, low risk, mechanical. Savings + (likely) Goals done; Budget/Account/Reports/Pulse/MoneyChat/Import remain. | [Remaining screens](#remaining-screens) |
| 6 | Track C — guide upgrades | UX polish. Debts/Receipts/Savings/Subscriptions still passive. | [Track C](#track-c--screenguide-walk-throughs-first-run-ux) |
| 7 | ✅ ~~Singapore shortcut re-sign (**Mac-only**)~~ — DONE 2026-07-16 | Both shortcuts re-signed on Mac + uploaded to the Singapore `web` bucket; public URLs verified. | [Migration](#supabase-tokyo--singapore-migration--back-tap-shortcut-re-sign-mac-only-deferred-2026-07-14) |

_(Done since this table was first written: Onboarding "Skip" → start-choice page ✅ · Track B wallet/savings LWW ✅ — see the Done sections above.)_

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

Same standard, same process. One screen at a time (Savings is done — removed from this list):
`Goals.tsx` _(in the current WIP)_ · `BudgetPlanning.tsx` · `AccountOverview.tsx` · `Reports.tsx` · `FinancialPulse.tsx` · `MoneyChat.tsx` · `ImportFromCsv.tsx` / `ImportFromStatement.tsx`

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
- ❌ **Tombstone TTL 30d** resurrects deleted records for a device offline >30d — `tombstoneStore.ts:10` (**still 30d, unchanged**).
- ❌ **`restoreDay` era-mix** restores stores from different snapshot dates → reconcile clobbers — `storageBackup.ts` (`src/services/`, `restoreDay`).
- ❌ **Backup restore not account/mode-gated** — can restore another user's snapshot over live data — `storageBackup.ts` (`src/services/`).

### Import cluster
- ✅ **Duplicate detection — DONE (`82428cf`).** CSV + statement re-imports dedup on a content-identity key (wallet + calendar-day + amount-to-the-sen + type + normalized description), so re-importing the same file can't double-book. Lives in `src/utils/importDedup.ts` (`markNewImportRows`), wired into both import screens.
- **Category name→id mapping — STILL OPEN.** Imports store the display NAME, so imported txns are detached from budgets. Resolve to a category id (reuse the learning/category store).
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

### Next: upgrade the Debts + Receipts **guides**, then Savings + Subscriptions

> ⚠️ This is the **ScreenGuide** work for those screens — unrelated to Track A's neu redesign of the same screens.

Debts and Receipts are the cheap two: both already pass a `spotlight={{ targetRef: guideTargetRef, ... }}`, so the target ref exists and is measured — they only need the step machine. Savings and Subscriptions need a target ref wired first.

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

**Go-live = both secrets set.** (Site half is already done.)

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
