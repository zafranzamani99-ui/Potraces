# Multi-Business Integration Plan (Version B)

> Scope: one owner runs several businesses; each business owns its **operational** books
> (products, sessions, orders, customers, shop card, business QRs). The owner's **personal**
> money (wallets, transactions, debts, goals, savings) stays a single global instance — every
> business settles into the one owner's personal wallets, exactly as today.

---

## 1. Verdict

**Feasible, and it is a Large job — but a well-fenced one.** The hard part is not the UI; it is
that ~8 Zustand stores must go from a flat singleton shape to a `Record<businessId, Slice>` shape
**without breaking existing single-business installs** (a persist migration wraps all current data
as "Business #1"), and that the **wallet-reconciliation engine must be taught to see every business
at once** or it will silently overwrite real money. The safe estimate: **1 Small foundation phase +
1 Large store-fork phase + 1 Medium switcher/identity phase + 1 Medium money-reconcile phase, then
Small phases for tier-gating and delete.** Local-only stores (stall/business/crm/freelancer/mixed/
onTheRoad/partTime) are pure persist/migrate work with zero sync surface. Only **sellerStore** has
real cloud sync, and true multi-tenant seller sync is explicitly deferred (see §7) — v1 keeps seller
data local-forked and pushes only the active business under the existing single-`user_id` namespace.

---

## 2. Data model

### The Business entity

```ts
// src/types/index.ts (new)
interface Business {
  id: string;              // globally unique, newId(); LEGACY install uses the constant 'biz-1'
  profile: BusinessProfile;// the shop card (shopName, logoUri, cardColor, cardFont, whatsapp…)
  incomeType: IncomeType | null; // MOVES here from businessStore — each business picks its own model
  createdAt: string;       // ISO
}
```

### Registry location — `settingsStore`

The business registry lives in `settingsStore` (`settings-storage`) because that is already where
the owner-level identity (`businessProfile`, `businessPaymentQrs`, `defaultMode`,
`businessModeEnabled`) lives, and it is a global singleton store that must NOT fork.

```ts
// settingsStore additions
businesses: Business[];            // was: a single businessProfile + businessStore.incomeType
activeBusinessId: string | null;   // the switcher pointer
defaultBusinessId: string | null;  // which business the app opens into
// businessPaymentQrs MOVES onto Business? -> NO. See Open Decision D2. v1: keep per-business QR
//   as businesses[i].paymentQrs (forked), because OrderList/NewOrder/SellScreen attach the
//   SHOP's QR — a printing shop and a nasi-lemak stall have different DuitNow QRs.
```

`businessProfile` and `businessPaymentQrs` (today single) become **derived selectors** over
`businesses[activeBusinessId]` so the ~10 identity consumers keep working through one indirection.

### Per-business vs global — the rule

> **Fork if it is an operational book or shop identity. Stay global if it is the owner's money or
> app-wide config.** Derived directly from the inventory `classification` field.

| FORK per `businessId` (operational) | Why |
|---|---|
| `businessStore` — products, sales, suppliers, businessTransactions, clients, riderCosts, incomeStreams, transfers, incomeType, businessSetupComplete | classification `mixed`; every array is one business's book. `incomeType` + `businessSetupComplete` move into the `Business` record. |
| `stallStore` — sessions, activeSessionId, products, regularCustomers, loyalty, preOrders, roundCashTo5 | all 7 fields per-business |
| `sellerStore` — products, orders, seasons, ingredientCosts, sellerCustomers, costTemplates, recurringCosts, stockAdjustments, productOrder, all 6 `_deleted*Ids`, skippedOnboardingSteps, and (per §Open-D3) the taxonomy fields | entire store is one business's book + sync tombstones |
| `crmStore` — customers, orders | both fields |
| `freelancerStore` — clients | forks in lockstep with businessStore (clientId FK) |
| `partTimeStore` — jobDetails | one job config |
| `onTheRoadStore` — roadDetails | one road business config |
| `mixedStore` — mixedDetails, lastUsedStream | forks in lockstep with businessStore (streamLabel FK) |

| STAY global (owner money + config) | Why |
|---|---|
| `walletStore` — wallets, transfers | the owner's real spendable money |
| `personalStore` — transactions, goals, subscriptions, budgets | the one personal ledger; every `transfer-<id>` lands here |
| `debtStore`, `savingsStore` | owner-level personal money |
| `settingsStore` (currency etc.), `categoryStore`, `budgetProfileStore` | app-wide config (also hosts the registry) |
| `authStore` | one auth pair; `lastIncomeType` map stays per-user |
| `tombstoneStore` | personal-sync tombstones |
| `sellerStore.isSyncing` | transient global flag (not persisted) |

---

## 3. The keying pattern (pick ONE)

**Chosen: wrap-the-slice — `Record<businessId, Slice>` + an active-slice selector inside each store.
NOT a store factory.**

Justification (lazy + correct): a store factory (`createStore(businessId)`) means every consumer must
be re-plumbed to the right instance, `persist` keys multiply, and cross-store writes (freelancer→
business, seller→business) get much harder to route. The wrap keeps **one store, one persist key, one
subscribe path** — the only change a consumer sees is that a plain selector `s => s.products` becomes
`s => active(s).products`. Actions mutate `active(s)` instead of the root. Smallest correct diff.

### Minimal shape — `stallStore` example

```ts
type StallSlice = {
  sessions: StallSession[]; activeSessionId: string | null; products: StallProduct[];
  regularCustomers: RegularCustomer[]; loyalty: Loyalty; preOrders: PreOrder[]; roundCashTo5: boolean;
};
const EMPTY_STALL = (): StallSlice => ({ sessions: [], activeSessionId: null, products: [],
  regularCustomers: [], loyalty: { everyN: 0, reward: '' }, preOrders: [], roundCashTo5: false });

interface StallState {
  byBusiness: Record<string, StallSlice>;
  activeBusinessId: string;                 // mirrors settings.activeBusinessId (set on switch)
  // ...all existing actions, unchanged signatures
}

// one helper, top of file:
const cur = (s: StallState): StallSlice => s.byBusiness[s.activeBusinessId] ??= EMPTY_STALL();

// action rewrite is mechanical — old: set({ products: [...get().products, p] })
//                                 new: set(s => patchCur(s, c => ({ products: [...c.products, p] })))
```

Add a `patchCur(state, fn)` helper (5 lines) so each action edits the active slice immutably. A
`setActiveBusiness(id)` action (called by the switcher) seeds an empty slice for a brand-new business.

> Every forking store gets the identical treatment: `byBusiness: Record<id, Slice>` + `activeBusinessId`
> + `cur()`/`patchCur()`. Because the switcher writes `activeBusinessId` into **all** forking stores in
> one call, they always agree on the active business (this is what keeps freelancer↔business and
> mixed↔business FK links coherent).

---

## 4. Persist migration (per store)

**Pattern this repo already uses (cite):** `authStore` (`auth-storage`, `version: 2`,
`migrate: (persisted, version) => …`) is the only real versioned migrate today; `calculatorStore` is
`version: 1`. Everything business-side has **`version: null`** and evolves via `onRehydrateStorage`
backfills. We introduce `version: 1` + `migrate()` on each forking store for the first time.

**THE sequencing trap (applies to every store below):** `migrate` runs on the **partialized,
Date-as-ISO** JSON and runs **BEFORE** `onRehydrateStorage`. `stallStore`/`businessStore`/`sellerStore`
all have heavy `onRehydrateStorage` handlers that read `state.sessions` / `state.products` / etc. to
revive Dates. If migrate nests arrays under `byBusiness['biz-1']` but onRehydrate still reads the flat
paths, rehydrate reads `undefined` and dates stop reviving → `.getTime()` crashes. **`migrate` +
`partialize` + `onRehydrateStorage` must ALL be rewritten to the nested shape in the same commit.**

**USE A STABLE CONSTANT ID.** migrate cannot be async and cannot read another store. Every store must
independently converge on the SAME legacy id. Define once and import:

```ts
export const LEGACY_BUSINESS_ID = 'biz-1';   // src/constants/index.ts
```

Never `newId()` inside migrate — divergent keys would un-align stall/business/crm data for the "same"
business. The `settingsStore` registry separately seeds
`businesses: [{ id: 'biz-1', name/profile from old businessProfile, incomeType: <old businessStore.incomeType>, createdAt }]`,
`activeBusinessId: 'biz-1'`, `defaultBusinessId: 'biz-1'`.

### Generic migrate shape

```ts
version: 1,
migrate: (p: any, from: number) => {
  if (from < 1 && p && !p.byBusiness) {
    const slice = { /* pull every old top-level field, with defaults */ };
    return { activeBusinessId: LEGACY_BUSINESS_ID, byBusiness: { [LEGACY_BUSINESS_ID]: slice } };
  }
  return p;
},
```

### Per-store gotchas (from inventory)

| Store | version today | Migrate note + the reported gotcha to honor |
|---|---|---|
| `stallStore` | null | Wrap all 6 data fields + `activeSessionId`+`roundCashTo5` under `biz-1`. Rewrite partialize/onRehydrate to walk `byBusiness[*].sessions[].sales[].timestamp`, `.expenses[].timestamp`, session date fields, `preOrders`. `getSessionEconomics/getSessionSummary` call `.getTime()` — a missed Date revive crashes them. Synthetic `custom:<label>` productIds and `costPerUnit` snapshots ride along untouched. |
| `businessStore` | null | Wrap products/sales/suppliers/businessTransactions/clients/riderCosts/incomeStreams/transfers. `incomeType`+`businessSetupComplete` do **not** stay in the slice — they move to the `Business` record in settings (migrate reads them, settings-migrate consumes them). Preserve doubly-nested Dates: `clients[].paymentHistory[].date` + `lastPaid`, `sales[].items[]`, every collection's own Date. `transfers[].linkedBusinessTxId`→businessTransactions ids move **with** the business; `transfers[].walletId`→ **global** personal wallet, stays pointing out. `incomeStreams` has no Date serialization. |
| `sellerStore` | null | **Hardest.** onRehydrate does date coercion + `seenProductIds` product-id dedup + order-id dedup + `paidAmount` backfill + `orderNumber` code backfill + cost-category seeding, all assuming top-level arrays — every one must be pushed down into per-business iteration. All 6 `_deleted*Ids` tombstone queues fork with the business (sync is per-business). `costCategories`/`costCategoriesSeeded`: each new business needs its own seeded copy + flag, not the shared `DEFAULT_COST_CATEGORIES` reference (see Open D3). Cross-entity ids (`order.seasonId`, `ingredientCosts.seasonId`, `order.items.productId`, `stockAdjustments.productId`, `productOrder`) must all land in the **same** bucket or dangle. `order.transferId`→personal `transfer-<id>` + business transfer record survive migration and stay valid only if the whole batch lands in one business. |
| `crmStore` | null | Stamp same `biz-1` on customers + orders; keep `customerId` cascade link. Preserve ISO↔Date contract (`customers.{createdAt,updatedAt}`, `orders.{date,createdAt,updatedAt}`) and don't double-apply the revive that onRehydrate already runs after migrate. |
| `freelancerStore` | null | Trivial shape (flat `clients`) BUT the migrate MUST use the **exact** `biz-1` id businessStore used — `clientId` is a cross-store FK into `businessStore.businessTransactions`; divergent ids silently break every client→payment link. |
| `partTimeStore` | null | One-liner wrap of `jobDetails`. Real work is in businessStore (income is derived live from `businessTransactions` filtered by `incomeStream`) — getters must filter to active business. |
| `onTheRoadStore` | null | One-liner wrap of `roadDetails`. `getRoadTxns` helper must gain a businessId filter in lockstep or road txns pool across businesses. |
| `mixedStore` | null | Wrap `mixedDetails`+`lastUsedStream` under the **same** id as the txns their `streamLabel` strings point at; `renameStream`'s cross-write to businessStore must target the same business. |

**settingsStore is NOT versioned** (uses `onRehydrateStorage` backfills). Add the registry there the
same way: an `onRehydrateStorage` guard `if (!state.businesses) { state.businesses = [{ id:'biz-1',
profile: state.businessProfile ?? EMPTY_BUSINESS_PROFILE, incomeType: null /* backfilled from
businessStore on first switch */, createdAt: … }]; state.activeBusinessId = 'biz-1'; state.defaultBusinessId='biz-1'; }`.
(businessStore's `incomeType` can't be read from settings' rehydrate; backfill it once on first active-business resolve.)

---

## 5. Identity + switcher

### settingsStore surface

```ts
businesses: Business[]; activeBusinessId: string | null; defaultBusinessId: string | null;
createBusiness(profile, incomeType): Business  // gated — see §8; sets active+default if first
setActiveBusiness(id)                            // writes activeBusinessId into settings AND every forking store
setDefaultBusiness(id)
deleteBusiness(id)                               // see §9
// businessProfile / businessPaymentQrs become selectors over businesses[activeBusinessId]
```

`setActiveBusiness(id)` is the single choke point: it sets `settings.activeBusinessId` **and** calls
each forking store's `setActiveBusiness(id)` (stall/business/seller/crm/freelancer/partTime/onTheRoad/
mixed), seeding an empty slice if absent. It must also **clear seller sync caches** (see §7).

### Switcher hotspots that must read the active business (from consumers inventory)

| File | Today reads | Change |
|---|---|---|
| `src/store/businessStore.ts` | root state | fork; `incomeType` now from active `Business` record |
| `src/store/settingsStore.ts` | `businessProfile`, `businessPaymentQrs` | become selectors over active business |
| `src/store/authStore.ts` | `lastIncomeType` per-user | unchanged (stays per-user, not per-business) |
| `src/services/businessSetup.ts` | reads/writes single `incomeType` | write into active `Business`; restore per-user still ok |
| `src/services/sellerSync.ts` | `income_type` server row | v1 unchanged (single user_id); see §7 caveat |
| `src/navigation/BusinessNavigator.tsx` | `incomeType` (master tab switch) | read active business's `incomeType` |
| `src/navigation/RootNavigator.tsx` | `businessSetupComplete \|\| incomeType` gate | read active business |
| `src/screens/business/Setup.tsx` | **writer** `setState({incomeType, businessSetupComplete:true})` | must `createBusiness`/select, not overwrite the one |
| `src/screens/business/Dashboard.tsx` | `incomeType` variant switch | active business |
| `src/screens/business/LogIncome.tsx` | `incomeType` | active business |
| `src/screens/business/BusinessSettings.tsx` | `incomeType`, `businessProfile` | active business (+ add switcher/business-list entry here) |
| `src/screens/business/BusinessProfile.tsx` | `businessProfile` (edit/share card) | active business's profile |
| `src/screens/seller/Dashboard.tsx` | `incomeType`, `businessPaymentQrs` | active business |
| `src/screens/seller/Manage.tsx` | `incomeType` | active business |
| `src/screens/seller/OrderList.tsx` | `businessPaymentQrs` | active business's QRs |
| `src/screens/seller/NewOrder.tsx` | `businessPaymentQrs` | active business's QRs |
| `src/screens/stall/SellScreen.tsx` | `businessPaymentQrs` | active business's QRs |
| `src/screens/shared/DebtTracking.tsx` | `businessPaymentQrs` (business mode) | active business's QRs |
| `src/components/settings/PaymentQrCard.tsx` | `businessPaymentQrs` write path | active business's QRs |
| `src/services/moneyChat.ts` | `biz.incomeType` (Echo context) | active business |
| `src/utils/explainBusinessMonth.ts` | `incomeType` param | already agnostic — no change (caller passes active) |

**Switcher UI**: one row in `BusinessSettings.tsx` — a business list + "add business" (gated) + active
radio + set-default. No new screen needed in v1.

---

## 6. Money boundary (stays global — and how it stays correct)

**Unchanged bridge.** Business revenue becomes the owner's money only through:
`businessStore.addTransfer(transfer)` (paper trail) **+** `personalStore.addTransferIncome(transfer)`
(the one place money lands — creates the deterministic `transfer-<id>` personal tx and, if
`transfer.walletId`, calls `walletStore.addToWallet` once). Three settlement paths keep working as-is:
Stall (per-session lump, SessionSummary), Seller (per-batch, SeasonSummary — the only one with
reconcile-on-edit), Generic/LogIncome (per-log, covers freelancer/partTime/road/mixed).

### Reconciliation risks + the guard for each

| Risk (from money inventory) | Guard |
|---|---|
| **Reconcile blindness (2×/erase class).** `walletReconcile.loadSharedState()` reads a SINGLE `useBusinessStore.getState().transfers` + `.businessTransactions`. After fork it sees only the active business → any wallet touched by a non-active business is recomputed short and `autoReconcileWallets()` silently overwrites real money. | **This is the #1 blocker. Change `loadSharedState()` to UNION `transfers` + `businessTransactions` across `Object.values(byBusiness)`.** Must land in the SAME phase as the businessStore fork, before any second business can exist. Ship a test that reconciles a wallet touched by two businesses. |
| **`transfer-<id>` collision / cross-business mis-route.** Deterministic `transfer-${id}`; if a fork re-seeds ids or a "duplicate business" feature copies transfers, two businesses emit the same id. | Transfer ids stay globally unique (`newId()`/`Date.now+random`), never per-fork sequential. **No "duplicate business" feature in v1** (YAGNI, §11). |
| **`reconcileTransferIncome` crosses the boundary.** `sellerStore.reconcileTransferIncome` finds the global `transfer-<id>` then calls `useBusinessStore.getState().deleteTransfer(transferId)` — post-fork must delete from the OWNING business, not the active one. | Thread `businessId` through `reconcileTransferIncome`; `deleteTransfer` looks up which slice owns the transfer id (or search all slices). Covered by the same union change. |
| **Double-tap transfer × N screens.** N business summary screens all credit the one shared wallet; a double-fire on A inflates the wallet B reads. | Keep `useSubmitGuard` per screen; rely on deterministic `transfer-<id>` (a repeat tap makes the same id → reconcile de-dups). No new surface. |
| **Cross-store non-atomicity (set tx THEN addToWallet).** Crash window; net is reconcile — only correct once fork-aware. | Fix the union FIRST (row 1); non-atomicity net then holds for all businesses. |
| **Stall unrounded parseFloat drift.** SessionSummary uses raw `parseFloat` (no rounding, unlike seller/LogIncome) — sub-sen drift into the shared wallet, faster with more businesses. | Cheap win: round in `SessionSummary.handleTransfer` (`Math.round(x*100)/100`) — fold into the money phase. |

---

## 7. Sync + tombstones

**Only `sellerStore` has real cloud sync** (`services/sellerSync.ts` → `supabaseBusiness`, tables
`seller_*`, keyed `(user_id, local_id)`, **no `business_id` dimension** — one auth user == one implicit
business). All other stores are local-only, so keying them by `businessId` is **pure persist/migrate
with zero sync surface**.

**v1 decision (lazy, honest): do NOT make seller sync multi-tenant.** True multi-tenant needs a
`business_id` column on every `seller_*` table + `onConflict:'user_id,business_id,local_id'` + a
backfill migration + per-business `seller_profiles` — that is its own project. In v1:

- Seller data forks **locally** by businessId (so the UI is correct per business).
- Sync **only pushes/pulls the ACTIVE business** under the existing single `user_id`.
- **The killers to fence** (from multiTenantRisks):
  - **Cross-business tombstone wipe (biggest risk).** `pullAll` uses `.eq('user_id',…)` and the push
    diff-delete hard-deletes any remote row whose `local_id` isn't in the LOCAL (active) set. With
    only the active business's rows local, **every other business's remote rows look deleted and get
    wiped.** → **v1 guard: gate seller sync to run for `biz-1` only (the legacy business).** Any
    business created after `biz-1` is **local-only, not synced**, until real multi-tenant lands. A
    business marked "not synced" never triggers a diff-delete against the shared namespace. This is
    the single guard that makes forking safe without touching the server.
  - **`ensureProfile()`/`_cachedProfileId` singleton** — cached module-level; clear it in
    `setActiveBusiness` so a switch can't serve the wrong profile.
  - **Realtime channel `order_link_${profileId}`** — leave keyed to `biz-1`'s profile in v1.
- **Deleting a business must leave tombstones** — but since only `biz-1` syncs in v1, a deleted
  **synced** business (only `biz-1`) routes its rows through the existing per-entity `_deleted*Ids`
  queues + `seller_deleted_cost_categories` server tombstone before wipe. A deleted **unsynced**
  business just drops its local slice (nothing on the server to orphan). When real multi-tenant lands,
  add a `deleted_businesses` server tombstone (mirror `seller_deleted_cost_categories` at business
  granularity) — tracked as the follow-up, not v1.

**Personal `tombstoneStore` is untouched** (global, personal sync only).

---

## 8. Tier gating

**One gate, one call site** (from tiers inventory — do NOT build a whole feature here):

1. `src/constants/tiers.ts`: add `maxBusinesses` to `TierLimits` (`free:1, basic:1, pro:Infinity,
   premium:Infinity`) and `'maxBusinesses'` to the `CountKey` union.
2. `src/store/premiumStore.ts`: add `canCreateBusiness(count) => canCreate(get().tier,
   'maxBusinesses', count)` — mirrors `canCreateWallet`/`canCreateBudget` exactly. `canCreate`
   grandfathers legacy over-cap users automatically.
3. Call it at the **single** `createBusiness` call site (the switcher's "add business"); on false,
   show the existing paywall modal.

Business mode itself stays a free boolean (`businessModeEnabled`) — unchanged. Free/basic keep exactly
one business (their existing `biz-1`), so **nobody is broken by the cap**.

> **LOCKED project rule:** this touches `TIER_LIMITS`/tiers → you MUST update
> `Potraces_Subscription_and_Echo_Guide.docx` in the SAME change. Fast path: edit
> `scripts/subscription_docx/data.json`, then
> `python scripts/subscription_docx/make_docx.py scripts/subscription_docx/data.json Potraces_Subscription_and_Echo_Guide.docx`
> (see `docs/SUBSCRIPTION_DOC_MAINTENANCE.md`).

---

## 9. Delete a business

Reuse the existing **scoped-reset** machinery — do not invent a new wipe.

1. **Block if a session is open** for that business: `stallStore.byBusiness[id].activeSessionId != null`
   → refuse with "close the session first". (Also block if it's the last remaining business, and if
   it's `activeBusinessId`, force-switch first.)
2. **Type-to-confirm** the shop name (same pattern as `clearBusinessData`'s Delete-Account flow).
3. **Scoped local reset**: drop `byBusiness[id]` from all 8 forking stores + remove
   `businesses.find(id)` + null `activeBusinessId`/`defaultBusinessId` if they pointed at it (re-point
   to another business). Route this through the **thorough** reset set (`clearBusinessLocalData`'s
   coverage, which also clears seller `_deleted*` tombstones, `costCategories`, `productOrder`,
   `stockAdjustments`, module caches) — the inventory flags that `clearBusinessData` is a **weaker**
   reset that leaves stale seller tombstones/caches; use the thorough path per-business.
4. **Leave sync tombstones**: if the deleted business is the synced `biz-1`, its deleted rows go
   through the existing `_deleted*Ids` queues + `seller_deleted_cost_categories` before removal so a
   fresh reinstall doesn't resurrect them. Unsynced businesses need no server tombstone in v1.
5. **Never touch personal**: no wallet/transaction/debt/goal is deleted — those are the owner's, shared.
   Existing `transfer-<id>` personal income from the deleted business **stays** (it's real money the
   owner received); only the business-side `transfers[]` records go with the slice.

---

## 10. Phased rollout

Ordered so single-business users are never broken; risky money/sync work sits behind a tested
foundation. Each phase is independently shippable.

| # | Phase | What | Effort | Ships safely because |
|---|---|---|---|---|
| 0 | **Foundation: registry + constant** | Add `LEGACY_BUSINESS_ID`, `Business` type, `businesses[]`/`activeBusinessId`/`defaultBusinessId` in settings via `onRehydrateStorage` backfill seeding `biz-1` from existing `businessProfile`+`businessStore.incomeType`. `businessProfile`/`businessPaymentQrs` become selectors. No store forks yet — one business only, fully backward-compatible. | **S** | Pure additive; existing single business becomes `biz-1` transparently. |
| 1 | **Fork the LOCAL stores + migrate** | Convert stall/business/crm/freelancer/partTime/onTheRoad/mixed to `byBusiness` + `version:1` migrate (§4). Rewrite each partialize/onRehydrate to the nested shape. `incomeType`/`businessSetupComplete` move to `Business`. **Still one business** — `setActiveBusiness` exists but UI creates none. Includes the FK-lockstep tests (freelancer↔business, mixed↔business). | **L** | Migrate wraps existing data as `biz-1`; behavior identical for the sole business. Gated by tests before Phase 2. |
| 2 | **Make reconcile fork-aware (money)** | Union `walletReconcile.loadSharedState()` across `byBusiness`; thread `businessId` through `reconcileTransferIncome`/`deleteTransfer`; round stall transfer. **Must land before any 2nd business can be created.** Test: wallet touched by two businesses reconciles correctly. | **M** | No behavior change for one business; correctness proven before multi-business is switched on. |
| 3 | **Fork sellerStore + sync fence** | sellerStore `byBusiness`+migrate (the hard onRehydrate rework); gate sync to `biz-1` only; clear `_cachedProfileId` on switch; new businesses are local-only-unsynced. | **L** | Sync still runs exactly as today for `biz-1`; new businesses can't wipe the shared namespace. |
| 4 | **Switcher UI + create/switch/default** | Business list + gated "add business" + active/default in `BusinessSettings`; wire every §5 hotspot to active business; `setActiveBusiness` fans out to all stores + clears seller cache. | **M** | First time >1 business is possible — but foundation (0–3) already correct. |
| 5 | **Tier gate** | `maxBusinesses` in tiers + `canCreateBusiness` + paywall at create site + docx update. | **S** | One gate; grandfathers legacy. |
| 6 | **Delete a business** | §9 flow. | **S** | Reuses scoped reset; blocked on open session. |

**Rough total: S+L+M+L+M+S+S.** Phases 0–2 are the spine; 3 is the sync-heavy risk; 4–6 are UI/policy.

---

## 11. Non-goals / YAGNI

- **No per-business personal wallets.** One owner, one set of wallets — that is the whole Version B thesis.
- **No cross-business consolidated / roll-up reports in v1.** Reports read the active business only.
- **No true multi-tenant seller cloud sync in v1.** New businesses are local-only-unsynced; server
  `business_id` column + composite key + backfill is a separate future project (§7).
- **No "duplicate/clone business" feature** — it's the fastest way to collide deterministic
  `transfer-<id>` and seed-ids (§6). Skip.
- **No store factory / per-instance stores** — the wrap pattern is smaller and keeps cross-store writes sane.
- **No per-business currency / settings / categories split** beyond what forks (currency, budget
  profile stay global).
- **No moving `businessPaymentQrs` off the 2-item cap or de-duping shared QR image files** — leave the
  shared-directory behavior as-is.
- **No new switcher screen** — one row in BusinessSettings is enough for v1.

---

## 12. Open decisions (owner's call before coding)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Does `incomeType` move into the `Business` record, or stay one global model?** | (a) per-business (a printing shop + a stall differ) — matches "each business owns its books"; (b) keep global single model. | **(a) per-business.** The whole point is different businesses. This is the biggest structural fork decision — it changes BusinessNavigator/RootNavigator/Dashboard routing to read active business. |
| D2 | **Business QRs: per-business or one shared set?** | (a) `businesses[i].paymentQrs` (each shop its own DuitNow); (b) one shared `businessPaymentQrs`. | **(a) per-business.** OrderList/NewOrder/SellScreen attach the SHOP's QR; different shops need different QRs. Small extra migrate. |
| D3 | **Seller taxonomy (units, productCategories, costCategories) — fork or share across businesses?** | (a) fork per business (nasi-lemak vs printing want different categories); (b) one shared owner taxonomy. | **(a) fork** — the safe default per inventory. Each business seeds its own `DEFAULT_COST_CATEGORIES` copy + `costCategoriesSeeded` flag. Revisit only if the owner explicitly wants one shared list. |
| D4 | **New (post-`biz-1`) businesses: local-only in v1, or block creation until multi-tenant sync ships?** | (a) allow, local-only-unsynced (data safe, not backed up); (b) don't ship create-2nd until server `business_id` lands. | **(a) allow local-only**, clearly labeled "not backed up yet". Ships the feature now; sync upgrade is additive later. Owner must accept the no-cloud-backup caveat for extra businesses. |
| D5 | **Tier cap numbers.** | `free/basic:1, pro/premium:∞` vs some finite cap (e.g. pro:3). | **`free/basic:1, pro/premium:Infinity`** — simplest, grandfathers legacy, matches house pattern. Confirm the price tier boundary. |
