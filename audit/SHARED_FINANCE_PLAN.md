# Shared / Collaborative Finance — Planning Doc (PLANNING ONLY, no code)

> Feature: multiple users track expenses together, track shared goals together, and "contribute"
> (household account, trip pool, couple budget). Potraces / jejakbaki — Expo SDK54 / RN 0.81,
> Supabase (auth + Postgres + RLS + Realtime + Storage), Zustand + AsyncStorage, local-first.
> Date: 2026-06-17. Author: product architecture pass.

## The one question this doc answers
**What part of shared finance is NATIVE-BUILD-GATED (must be baked into the imminent EAS dev build) vs backend/JS that ships later via EAS Update with NO rebuild?**

**Verdict up front:** The *core* shared-finance feature (spaces, RLS, realtime, invites, split/contribution/goal UI, settle-up, notifications) is **100% OTA — needs nothing new in the build.** The only net-new native items are *optional enhancements* (iOS home-screen widget, calendar deadlines). They are genuinely build-gated but should **NOT** block the imminent build — add them in a later cycle.

---

## 1. Architecture & data model

### 1.1 How the leaders do it (competitive study)

| App | Model | Key idea we borrow |
|---|---|---|
| **Splitwise** | Cloud ledger: `User`, `Group`, `Expense`, `Split`. "Simplify Debts" graph engine collapses N debts into ~3 payments; per-pair "buckets" reset on settle-up. Tracks money, **never moves it**. | Group entity + per-pair net balance + settle-up *suggestion* engine. ([Medium LLD](https://medium.com/@riyag283/splitwise-an-lld-approach-c87e149af438), [DEV schema](https://dev.to/fightclub07/database-schema-design-of-splitwise-application-2ef0)) |
| **Tricount (bunq)** | Per-occasion "tricount" group, **no account required**, offline-first, custom shares (couple = "2"), multi-currency, color-coded balances. | Lightweight group = a *space*; offline-first matches our local-first store; flexible share weights. ([tricount](https://tricount.com/en-us/), [guide](https://tecnobits.com/en/How-Tricount-works-and-how-to-get-the-most-out-of-it/)) |
| **Honeydue** | **Linked-account tracking** — partners link existing accounts, choose per-account what the partner sees (both / balance-only / hidden). Tracks; doesn't custody. | **Granular per-record visibility** is the headline feature for couples. ([Experian](https://www.experian.com/blogs/ask-experian/honeydue-app-review/), [CNBC](https://www.cnbc.com/select/honeydue-budgeting-app-review/)) |
| **Zeta** | Actual **joint bank account** + personal accounts; can also split a shared bill without a joint account. | The "move money" model = *being a bank*. Out of scope for us (see §2). |
| **YNAB / Monarch** | Household = invite partner into the *same* budget/household; shared categories & goals; roles. | Space-scoped budgets + goals + role (owner/member/viewer). |
| **SEA / Malaysia** | No dominant local shared-tracker; users improvise WhatsApp + DuitNow. Splitwise/Tricount used by expats. DuitNow QR is the settlement rail people already use bank-to-bank. | Opportunity: a Malay-first tracker that hands off settlement to **DuitNow QR** (bank-to-bank, we never touch funds). |

**Takeaway:** the winning, *safe*, shippable model = **Splitwise/Tricount ledger ("track") + Honeydue granular visibility**, settlement handed to DuitNow QR. NOT Zeta (custody).

### 1.2 The Supabase model — a "space" layered over existing per-user tables

Core principle: **do not rebuild the single-user stores.** Add a *space* layer beside them. A record is either private (today's behavior, `space_id IS NULL`) or shared (`space_id` set). This keeps the wallet single-owner reconciliation contract intact (see §1.5).

```
spaces                         -- the household / trip / couple budget
  id uuid pk
  name text
  type text       check (type in ('household','trip','couple','custom'))
  currency text   default 'MYR'
  created_by uuid references auth.users
  created_at, updated_at

space_members                  -- membership + role (the RLS pivot table)
  space_id uuid references spaces on delete cascade
  user_id  uuid references auth.users on delete cascade
  role text check (role in ('owner','admin','member','viewer'))
  display_name text            -- name shown in the space (NOT a phone-book name)
  joined_at timestamptz
  primary key (space_id, user_id)

space_invites                  -- link + magic-link + QR + (optional) email
  id uuid pk
  space_id uuid references spaces on delete cascade
  token text unique            -- random; encodes into potraces:// deep link + QR
  invited_email text           -- nullable (magic-link path)
  role text default 'member'
  expires_at timestamptz
  accepted_by uuid
  created_by uuid

space_expenses                 -- the shared ledger entry (Splitwise "Expense")
  id uuid pk
  space_id uuid references spaces on delete cascade
  payer_user_id uuid           -- who paid
  amount numeric(14,2)
  description text
  category text
  date timestamptz
  split_mode text check (split_mode in ('equal','exact','percent','shares'))
  edit_log jsonb default '[]'  -- reuse the append-only Edit Audit Trail pattern
  created_by uuid
  created_at, updated_at

space_expense_shares           -- per-member portion of one expense
  expense_id uuid references space_expenses on delete cascade
  member_user_id uuid
  share_amount numeric(14,2)
  primary key (expense_id, member_user_id)

space_contributions            -- "contribute" = pool/goal funding ledger (TRACK only, see §2)
  id uuid pk
  space_id uuid references spaces on delete cascade
  goal_id uuid                 -- nullable: a pool contribution vs a goal contribution
  member_user_id uuid
  amount numeric(14,2)
  date timestamptz
  note text

space_goals                    -- shared goal (mirrors personal_goals shape)
  id uuid pk
  space_id uuid references spaces on delete cascade
  name text
  target_amount numeric(14,2)
  deadline timestamptz
  created_by uuid

space_settlements              -- a recorded settle-up event (still TRACK only)
  id uuid pk
  space_id uuid references spaces on delete cascade
  from_user_id uuid
  to_user_id uuid
  amount numeric(14,2)
  method text                  -- 'cash','duitnow','other' (informational; we don't move funds)
  settled_at timestamptz
```

**Net balance per pair** is *derived* (sum of shares owed − contributions − settlements), then run through a Splitwise-style **simplify-debts** pass in JS to suggest minimal transfers. Never stored as a mutable source of truth — derived, like the Playbook planned-vs-actual model already used in the app.

### 1.3 RLS — multi-tenant isolation + shared visibility

The pattern (validated against production Supabase guidance): **membership pivot table + `SECURITY DEFINER` helper to avoid recursive RLS and per-row subquery cost.** ([makerkit](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices), [SupaExplorer](https://supaexplorer.com/dev-notes/10-real-world-rls-patterns-for-supabase-with-policy-snippets.html), [DEV](https://dev.to/whoffagents/supabase-row-level-security-in-production-patterns-that-actually-work-2l78))

```sql
-- SECURITY DEFINER so it can read space_members without re-triggering RLS (no infinite recursion)
create function public.is_space_member(sid uuid, min_role text default 'viewer')
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = sid and m.user_id = auth.uid()
  );
$$;

-- every space_* table:
create policy "space_read"  on public.space_expenses
  for select using (public.is_space_member(space_id));
create policy "space_write" on public.space_expenses
  for all using (public.is_space_member(space_id, 'member'))
  with check (public.is_space_member(space_id, 'member'));
```

- **`space_members` self-policy:** a user may `select` rows where `user_id = auth.uid()` OR same `space_id` as a row they're in (via the definer fn) — careful to avoid recursion; the definer function is the escape hatch.
- **Index every RLS-referenced column** (`space_members(user_id)`, `space_members(space_id)`, `space_expenses(space_id)`) — missing index on the pivot is the #1 RLS performance killer.
- **Roles:** `viewer` = read; `member` = add/edit own expenses; `admin` = manage members; `owner` = delete space. Mirrors `seller_orders_link_read` subquery precedent already in this repo.

### 1.4 Invites (all four rails are already-native or OTA)
- **Link / QR:** `potraces://join?token=…` deep link (scheme already native) + QR rendered in-app, scanned by the already-native camera. **OTA.**
- **Magic link / email:** Supabase auth magic link (backend, already enabled). **OTA.**
- **Contact:** `expo-contacts` already native — but **see §2 PDPA**: invite by user-typed phone/share sheet, do **not** bulk-sync contact PII to the server. **OTA.**

### 1.5 Composition with existing stores — *protect the wallet single-owner contract*
The repo's **wallet reconciliation contract** (single-owner: add=caller adjusts, update/delete=store self-reconciles, transfers/debt-payments never double-touch) must not break. Rule for shared finance:

> **A `space_*` ledger entry NEVER touches any member's personal wallet automatically.**
> Shared expenses live only in the shared ledger. If a user wants a shared expense to also hit
> their personal wallet, that is an *explicit, separate* personal transaction they create — exactly
> like today's debt/split → transaction linking, which already follows "initiator handles the wallet
> adjustment." This keeps zero double-counting and zero cross-user wallet writes.

New Zustand store: `sharedStore` (spaces, members, expenses, contributions, goals, settlements) — same `persist` + tombstone + `local_id` + `updated_at` last-write-wins conventions as `personal*`/`seller*` stores. Realtime: subscribe per active `space_id` (Realtime already enabled).

### 1.6 Multi-user edit conflict handling
- Reuse the **append-only `edit_log` Edit Audit Trail** pattern (already in `personal_debts`, `personal_goals`).
- **Last-write-wins on `updated_at`** at the row level (matches existing sync), BUT for `space_expenses` make each `space_expense_shares` row independently editable so two members editing different shares don't clobber each other.
- Show a bronze "edited by {name} {time}" badge (existing pattern) so changes are *honest*, not silent.
- Deletes are tombstoned (existing `tombstoneStore`); a deleted shared expense reverses its derived balances — no wallet writes to unwind (per §1.5).

---

## 2. The "contribute" fork — FLAG: choose (a) TRACK, not (b) MOVE

| | (a) TRACK contributions | (b) MOVE money between members |
|---|---|---|
| What | Ledger of who put in what; shares; settle-up *suggestions*; record a settlement as done. | Actual P2P transfer / settlement inside the app. |
| Rail | None — funds flow bank↔bank (DuitNow QR), we only record. | Requires a licensed payment rail. |
| MY regulation | **Safe.** Pure record-keeping. No funds held/moved. | Operating a **payment system** (FSA s.11, BNM approval) and/or issuing **e-money** (EMI licence, RM1M+ capital). Holding a pooled "contribution" balance you owe back = **stored value = e-money**. |
| PDPA | Manageable (members consent on join; keep third-party PII off-server). | Same + heavier KYC/AML (AMLA 2001) once funds move. |
| Verdict | **RECOMMENDED.** | **OUT OF SCOPE as an app feature.** |

**Why (b) is out of scope (from `docs/research/legal-regulatory-risk-malaysia.md` §B):** Potraces is safe *only because it never holds or moves customer funds*. A pooled trip/household "contribution" balance the app is liable to pay back is textbook **e-money** (needs a BNM EMI licence). Routing member→member settlement makes Potraces a **payment system operator / merchant-acquirer** (FSA + PayNet rules). Both are Critical-severity lines in the risk register.

**The safe settlement path (recommended):**
1. Track contributions/shares; compute Splitwise-style **minimal settle-up suggestions**.
2. To settle, **hand off to the bank-to-bank rail**: generate an **exact-amount DuitNow QR** (the Phase-1 pattern already shipped — buyer's bank → payee's bank directly, Potraces never in the money path) or deep-link to the payee's banking app. Then the user taps **"mark as settled"** → writes a `space_settlements` row (informational `method`). Money moved *outside* the app; we only recorded it.
3. Copy discipline: "settle up", "record a payment", "who owes who" — never "we'll transfer/hold/manage your money."

This gives 95% of the felt value of (b) with none of the licensing exposure.

---

## 3. NATIVE-BUILD-GATED checklist for THIS feature

Already in the build (so anything built on these is OTA, NOT listed as needing a build): `expo-notifications` + `aps-environment: production`, `expo-contacts`, `potraces://` scheme + iOS `associatedDomains` + Android App Links for jejakbaki.my, inbound share extension, `expo-secure-store`, `expo-local-authentication`, Google/Apple sign-in, `react-native-purchases`, camera (QR). Supabase is the backend.

| Net-new native item | Build-gated? | Effort | Pre-bake now vs later |
|---|---|---|---|
| **iOS home-screen widget** (shared balance / goal progress) via `@bacons/apple-targets` | **YES** — new Apple target + App Group + entitlements; needs Xcode 16 / SDK53+; data shared via App Group `NSUserDefaults`. Genuinely native, CNG-regenerated. ([apple-targets](https://www.npmjs.com/package/@bacons/apple-targets), [Bacon](https://evanbacon.dev/blog/apple-home-screen-widgets)) | **High** (new target, layout in SwiftUI, App Group wiring, Android widget is a *separate* effort) | **LATER.** Pure enhancement; the feature is fully usable without it. Don't gate the imminent build on this. |
| **App Group entitlement** (needed by the widget to share data) | **YES** if widget ships. Note: a share-extension App Group is **not auto-shared** with a new widget target — must be explicitly declared on both targets. ([forums](https://developer.apple.com/forums/thread/66752)) | Low (config) but only meaningful *with* the widget | **LATER**, with the widget. If you wanted to be safe, you *could* pre-declare a shared App Group id now (cheap insurance), but it's optional. |
| **`expo-calendar`** (shared goal deadline / contribution due-date → user's calendar) | **YES** — config plugin sets `NSCalendarsUsageDescription`; "requires building a new app binary." ([Expo docs](https://docs.expo.dev/versions/latest/sdk/calendar/)) | Low–Med | **LATER, OR pre-bake cheaply.** If you want calendar integration eventually, adding the plugin + permission string to *this* build is ~5 min and saves a future rebuild. Low-risk pre-bake candidate. Otherwise reminders via push cover it. |
| **`expo-background-task`** (background reminder/sync) | YES (config plugin) | Med | **SKIP.** Server-side **push** (already native) covers due-date/settle-up reminders without it. Don't add. |
| **Richer notification categories/actions** ("Settle up" / "View" buttons on a reminder) | **NO** — `setNotificationCategoryAsync` is a **runtime JS** call; ships via EAS Update. (Known caveat: action buttons can be flaky in killed/background state on Android — content-only fallback.) ([Expo docs](https://docs.expo.dev/versions/latest/sdk/notifications/)) | Low | **OTA — no build needed.** |
| New permission/entitlement for invites/QR/links | **NO** — scheme, associatedDomains, App Links, camera, contacts all already in the build. | — | **OTA.** |

---

## 4. What's explicitly OTA (no rebuild) — the bulk of the feature

All of this ships via **EAS Update** on the existing runtime:
- `spaces` / `space_members` / `space_*` **schema + migrations** (server-side; not app-native).
- **RLS policies** + `is_space_member` SECURITY DEFINER helper + indexes.
- **Realtime** per-space subscriptions (Realtime already enabled).
- **Invite flows:** deep link `potraces://join?token`, in-app QR generate/scan, Supabase magic-link/email, share-sheet — all on already-native primitives.
- **Split / contribution / goal UI**, the new `sharedStore`, dashboards, a "Spaces" tab.
- **Settle-up logic** (derived net balances + Splitwise simplify-debts) and DuitNow-QR settlement hand-off (Phase-1 QR pattern already in app).
- **Notification content + categories/actions** (runtime `setNotificationCategoryAsync`).
- All copy (EN + BM), empty states, role management, edit-audit badges.

---

## 5. Recommended build order
1. **OTA:** migrations (spaces + RLS + indexes) → `sharedStore` → Realtime → invite (link/QR first) → expense+share UI → derived balances + settle-up → DuitNow-QR hand-off → push reminders (content + runtime categories). Ship the whole feature with **zero new native build**.
2. **Next native cycle (optional):** `expo-calendar` (cheap pre-bake if desired) → iOS widget + App Group (high-effort enhancement).

## 6. Compliance gates before shipping (from the risk register)
- **No money movement / no pooled balance** (keeps BNM e-money/payment-system lines closed — §2).
- **Members consent on join**; show who can see what (Honeydue-style visibility). Do **not** bulk-sync contact PII to the server (PDPA A2 — third-party contact data). Invite by user-typed handle/share sheet.
- EN + BM privacy notice must name the new shared-data processing.
- Settle-up copy = "record"/"mark settled", never "transfer/hold/manage funds."

---

## Sources
**Competitive:** [Splitwise LLD](https://medium.com/@riyag283/splitwise-an-lld-approach-c87e149af438) · [Splitwise schema](https://dev.to/fightclub07/database-schema-design-of-splitwise-application-2ef0) · [Tricount](https://tricount.com/en-us/) · [Tricount guide](https://tecnobits.com/en/How-Tricount-works-and-how-to-get-the-most-out-of-it/) · [Honeydue (Experian)](https://www.experian.com/blogs/ask-experian/honeydue-app-review/) · [Honeydue (CNBC)](https://www.cnbc.com/select/honeydue-budgeting-app-review/)
**Supabase RLS:** [makerkit best practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) · [SupaExplorer patterns](https://supaexplorer.com/dev-notes/10-real-world-rls-patterns-for-supabase-with-policy-snippets.html) · [DEV production RLS](https://dev.to/whoffagents/supabase-row-level-security-in-production-patterns-that-actually-work-2l78)
**Native/build:** [@bacons/apple-targets](https://www.npmjs.com/package/@bacons/apple-targets) · [Bacon widgets](https://evanbacon.dev/blog/apple-home-screen-widgets) · [expo-calendar docs](https://docs.expo.dev/versions/latest/sdk/calendar/) · [expo-notifications docs](https://docs.expo.dev/versions/latest/sdk/notifications/) · [App Group not auto-shared](https://developer.apple.com/forums/thread/66752)
**Regulatory:** repo `docs/research/legal-regulatory-risk-malaysia.md` (§B BNM e-money/payments, §A2 PDPA third-party contacts).
