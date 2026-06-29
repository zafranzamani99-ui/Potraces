# Referral Install Rewards — Build-Ready Spec

**Reward:** a referrer whose code drives **3 people to install + create an app account and do one real thing** earns **1 month of premium**. Stacks every 3.
**Status:** PRE-LAUNCH. Codes are minted on the waitlist NOW; installs happen at launch. The plan bridges a waitlist code to the referrer's eventual app account and credits installs that happen later.
**Author's note:** synthesized from the original four design memos (attribution / premium-auth / server-fraud / ux-admin) plus six deep build sections, all verified against the live codebase on 2026-06-22.

**Document map:** 0 Ground truth · 1 Architecture · 2 End-to-end flow · 3 Data model (full DDL) · 4 Server RPCs (full spec) · 5 App integration · 6 Attribution implementation · 7 Copy deck (EN+BM) · 8 Fraud guards · 9 Edge cases & failure modes · 10 Test plan · 11 Metrics & analytics · 12 Rollout timeline · 13 PDPA & privacy · 14 MVP vs later · 15 Decisions (D1–D4) · 16 Files touched.

---

## 0. Ground truth (verified, not assumed)

- `premiumStore` (`src/store/premiumStore.ts`) is **100% local AsyncStorage**, binary `tier: 'free' | 'premium'`, **no expiry field**, and `subscribe()` is a one-line client `set({tier:'premium'})`. **Premium today is free, permanent, and fully spoofable.** There is no premium/entitlement/tier column anywhere in `supabase/migrations/*`.
- **Two disconnected referral systems exist and neither does the job:**
  - **Waitlist** (`docs/waitlist.sql`): `public.waitlist` mints an 8-hex `referral_code`, stores `referred_by` (a `waitlist.id`). Live now. The `waitlist_signup` RPC canonicalizes phones/emails. `?ref=CODE` is captured on the site and carried into signup.
  - **App** (`supabase/migrations/20260417300000_referrals.sql`): `user_profiles(user_id, referral_code 6-char, referred_by text)` + `referrals(referrer_user_id, referred_user_id, code)` with `referrals_unique_per_referred unique(referred_user_id)` and a `referrals_party_read` RLS policy. Header comment: *"Bonuses are applied by an edge function (to be built when the bonus logic is decided)."* No edge function. No client INSERT policy on `referrals` (writes are service-role only) — correct.
  - `lookup_referral_code(code)` RPC exists (`20260528000000_…`) — reusable resolver.
- `getDeviceId()` (`src/utils/deviceId.ts`) already mints a stable per-install id and flows as `x-device-id` to `ai-proxy`. Reuse it as a fraud signal — no new tracking.
- **Security pattern to copy:** `ai_proxy_usage` / `ai_usage` — service-role / `security definer` writes, owner-read RLS, **no client INSERT policy**. The premium grant copies this exactly.
- **The `gen_random_bytes` gotcha:** under `set search_path = public`, pgcrypto's `gen_random_bytes` lives in the `extensions` schema and is invisible — this silently broke `waitlist_signup` once. **Every id/code mint in this feature uses `gen_random_uuid()` (in `pg_catalog`, always visible), NEVER `gen_random_bytes()`.**
- **The live site copy was misleading:** `site/index.html:1600` — `'Jump the queue — invite a friend:'`. Referrals do **not** move you up the queue. False-benefit dark pattern the brand forbids. Fix shipped (see §7 of rollout / the interim copy fix).

---

## 1. Architecture (one paragraph)

**Attribution = Play Install Referrer on Android (silent, reliable) + a pre-filled "invite code" field everywhere as the universal, always-works floor; the web hand-off copies a tagged token (`POTRACES-REF:CODE`) to the clipboard and shows the code on screen so the field can pre-fill on first open.** iOS has **no** install-referrer API and fingerprinting is banned (enforced May 2024), so deterministic web→install matching is impossible on iOS — the manual/clipboard-prefilled code field **is** the iOS mechanism, not a fallback. **No paid attribution SDK** (Branch's free plan is gone; AppsFlyer/Adjust add an SDK + a PDPA third-party processor for a 3-install counter, and on iOS still fall back to the same trick) — they buy nothing we can't build free. **The single source of truth is a new server-owned `public.entitlements` table** with `premium_until timestamptz`; the client only *reads* it and reconciles its local `tier` from it (server always wins). The referral graph lands rows in the existing `public.referrals` table; a `security definer` `grant_referral_reward` function counts **qualified** referrals and extends `premium_until` by 30 days per 3. **The waitlist code is the permanent shareable token; it resolves to the referrer's eventual app account via a `waitlist.claimed_user_id` bridge** so codes shared for months keep working at launch.

**One unified code per person** (D1, recommended): when a waitlister later installs and signs in, their `waitlist.referral_code` is claimed to their `auth.users.id`. The link shared today keeps working at launch instead of everyone getting a new dead code.

---

## 2. End-to-end flow

### Referrer (waitlister now → app user at launch)
1. Joins the waitlist today → gets `waitlist.referral_code` (e.g. `a1b2c3d4`), shares `https://jejakbaki.my/?ref=a1b2c3d4`.
2. At launch they install, sign in (Google or phone) → get an `auth.users.id` and a `user_profiles` row.
3. App calls **`claim_waitlist_code(p_code)`** (their own waitlist code, matched by contact or pasted) → stamps `waitlist.claimed_user_id = auth.uid()`. Their code now resolves to their app account. (A profile-creation trigger also auto-claims by contact match; manual paste is the recovery path.)
4. Any `pending_referrals` parked under that code are reconciled into `referrals` with `referrer_user_id = auth.uid()`.
5. In-app **"Invite friends"** screen shows code + link + honest progress: *"2 of 3 friends joined — 1 month premium unlocks at 3."* Data from a `referral_progress()` read RPC, never computed client-side.

### Referred friend (installs at launch)
6. Taps `jejakbaki.my/?ref=CODE`. Pre-launch → joins waitlist (`referred_by` seeded). At launch → taps "Get the app": site copies `POTRACES-REF:CODE` to clipboard, shows the code, routes to store (Android URL carries `&referrer=ref%3DCODE`; iOS App Store URL carries nothing).
7. Installs, first open:
   - **Android:** read Play Install Referrer → parse `ref=CODE` → pre-fill (silent).
   - **iOS + Android fallback:** read clipboard via `expo-clipboard`; if it matches `POTRACES-REF:`, pre-fill with a visible "we found your invite code" confirm (PDPA-transparent).
8. Onboarding has one **skippable** "Got an invite code?" step (after mode-pick, never blocks setup), pre-filled. On account creation the client calls **`register_referral(p_code, p_device_id)`**.
9. `register_referral` resolves the code → referrer account (or parks a `pending_referrals` row if the referrer hasn't installed yet), self-referral-guards, inserts a `referrals` row `status='pending'`, and snapshots fraud signals into `referral_account_signals`.

### Reward grant (server-authoritative)
10. When the referred account does **one real thing** — onboarding done + ≥1 transaction surviving 48h — the client calls **`qualify_referral()`**. The function stamps `first_activity_at`, and once that activity is ≥48h old + account-age floor met + fraud gate clean, flips `pending → qualified` (or `rejected`, silently). Because personal sync is dormant by default, the txn existence is **client-asserted** and the 48h survival is enforced by server timestamps.
11. Qualification calls **`grant_referral_reward(p_referrer)`**: counts `qualified` referrals with `counted_for_grant_id IS NULL`; on reaching 3, consumes exactly 3 (stamping `counted_for_grant_id`), writes a `premium_grants` ledger row, and upserts `entitlements.premium_until = greatest(now(), coalesce(premium_until, now())) + interval '30 days'` (stacks, never overwrites).
12. On next launch / sign-in the app reads `entitlements` and `reconcileEntitlement(premium_until)` sets local `tier='premium'` iff `premium_until > now()`. A spoofed local flag is reset to free on the next read.
13. Referrer's "Invite friends" screen flips to *"1 month premium active · until 14 Aug"* and the 3-pip tracker resets to 0/3 to earn again.

---

## 3. Data model — full DDL

`supabase/migrations/20260622000000_referral_rewards.sql`

One idempotent migration. It bridges the waitlist to app accounts, parks pre-claim referral credit, extends `public.referrals` for the qualify/grant lifecycle, snapshots fraud signals, and introduces the two server-owned tables that make premium real: `entitlements` (the single source of truth the client only reads) and `premium_grants` (the append-only audit ledger). This section is **DDL only** — the RPC bodies (`claim_waitlist_code`, `register_referral`, `qualify_referral`, `grant_referral_reward`, `referral_progress`, `admin_referral_leaderboard`) are in §4 and are not repeated here.

### Object inventory: new vs. existing

| Object | Status | Notes |
|---|---|---|
| `public.waitlist` | **EXISTS** (`docs/waitlist.sql`) | We only ADD `claimed_user_id` + indexes. |
| `public.waitlist.claimed_user_id` | **NEW column** | The waitlist→app bridge. |
| `public.referrals` | **EXISTS** (`20260417300000_referrals.sql`) | We ADD columns + indexes. Keep its `referrals_unique_per_referred unique (referred_user_id)` and `referrals_party_read` policy untouched. |
| `referrals.status` / `.qualified_at` / `.counted_for_grant_id` / `.device_id` / `.first_activity_at` | **NEW columns** | Lifecycle + double-spend guard + fraud/activity signals. |
| `public.pending_referrals` | **NEW table** | Parks credit when the referrer hasn't claimed a code yet (D4). |
| `public.referral_account_signals` | **NEW table** | Per-account fraud snapshot. v1 omits `ip_hash`. |
| `public.entitlements` | **NEW table** | THE source of truth for premium. Owner-read, no write policy. |
| `public.premium_grants` | **NEW table** | Append-only reward ledger. No client policy. |
| `public.user_profiles`, `public.ai_usage`, `public.ai_proxy_usage` | EXISTS | Untouched; referenced only as FK/pattern. |

The migration assumes `pgcrypto` and `auth.users` already exist (both guaranteed — `pgcrypto` is created by `docs/waitlist.sql` and `20260417300000`). It re-asserts `create extension if not exists "pgcrypto"` defensively, matching the existing files.

### Full migration (tables, indexes, constraints, RLS, grants)

```sql
-- ============================================================
-- Potraces — Referral install rewards: server-owned entitlements
-- + referral qualify/grant lifecycle.
--
-- Source of truth: docs/research/referral-install-rewards-plan.md
-- Decisions baked in: D1 unify to one code (waitlist code bridges to
-- the app account), D2 qualify on account + first txn surviving 48h,
-- D3 reward stacks every 3 (+30 days), D4 park pending credit.
--
-- This file is DDL + RPCs. The RPCs (claim_waitlist_code, register_referral,
-- qualify_referral, grant_referral_reward, referral_progress,
-- admin_referral_leaderboard) follow the table DDL — see §4.
--
-- Apply via: Supabase dashboard > project iydqeeonaljqapulboaz >
--            SQL Editor, OR `supabase db push`.
-- Idempotent (if not exists / drop policy if exists). Safe to re-run.
-- REQUIRES: docs/waitlist.sql (public.waitlist) and
--           20260417300000_referrals.sql (public.referrals) already applied.
-- ============================================================

create extension if not exists "pgcrypto";

-- Fail fast with a clear message if either prerequisite table is missing,
-- instead of half-creating objects and aborting on the first ALTER.
do $$ begin
  if to_regclass('public.waitlist') is null then
    raise exception 'public.waitlist missing — run docs/waitlist.sql first.';
  end if;
  if to_regclass('public.referrals') is null then
    raise exception 'public.referrals missing — run 20260417300000_referrals.sql first.';
  end if;
end $$;


-- ============================================================
-- 1. Bridge: waitlist.claimed_user_id
--
-- The single load-bearing seam (§1). A waitlist row mints the permanent
-- shareable referral_code today; at launch the waitlister installs, signs
-- in, and claim_waitlist_code() stamps this column so their months-old
-- ?ref=CODE link resolves to their auth account.
-- ============================================================
alter table public.waitlist
  add column if not exists claimed_user_id uuid references auth.users(id) on delete set null;

comment on column public.waitlist.claimed_user_id is
  'auth.users.id of the app account that claimed this waitlist row (and thus owns its referral_code). NULL = not yet claimed. Set by claim_waitlist_code(). ON DELETE SET NULL so deleting an account frees the code rather than the waitlist row.';

-- One app account <-> at most one waitlist row. Partial so the many
-- existing NULL rows (un-claimed waitlisters) never collide.
create unique index if not exists waitlist_claimed_user_uniq
  on public.waitlist (claimed_user_id) where claimed_user_id is not null;

-- Resolve a referral_code -> claimed account fast (register_referral hot path).
create index if not exists waitlist_referral_code_claimed_idx
  on public.waitlist (referral_code, claimed_user_id) where referral_code is not null;


-- ============================================================
-- 2. Extend public.referrals with the qualify/grant lifecycle.
--
-- The table already has: id, referrer_user_id, referred_user_id, code,
-- created_at, and `referrals_unique_per_referred unique (referred_user_id)`
-- (one credit per person, survives reinstalls) + `referrals_party_read`
-- RLS. ALL of that is preserved. We only add lifecycle/signal columns.
-- ============================================================
alter table public.referrals
  add column if not exists status text not null default 'pending';

alter table public.referrals
  add column if not exists qualified_at timestamptz;

alter table public.referrals
  add column if not exists counted_for_grant_id uuid;  -- FK added in §7, after premium_grants exists

alter table public.referrals
  add column if not exists device_id text;

alter table public.referrals
  add column if not exists first_activity_at timestamptz;

-- Constrain status to the three lifecycle states. Drop-then-add so a
-- re-run with a changed value set replaces cleanly.
alter table public.referrals drop constraint if exists referrals_status_chk;
alter table public.referrals
  add  constraint referrals_status_chk
       check (status in ('pending', 'qualified', 'rejected'));

comment on column public.referrals.status is
  'Lifecycle: pending (registered, not yet earned) -> qualified (referred account did one real thing, survived 48h) -> rejected (fraud gate / never qualified). Only qualified rows are countable toward a grant.';
comment on column public.referrals.qualified_at is
  'When status flipped to qualified (or rejected). NULL until then.';
comment on column public.referrals.counted_for_grant_id is
  'The premium_grants.id this qualified referral was consumed by. NULL = qualified but not yet spent toward a reward. Each referral counts toward exactly one grant — the double-spend guard.';
comment on column public.referrals.device_id is
  'getDeviceId() from the referred install, snapshotted at register_referral time. A fraud signal, mirrored into referral_account_signals.';
comment on column public.referrals.first_activity_at is
  'Server time the referred user first asserted real activity (first txn) via qualify_referral. Starts the 48h survival clock. NULL until first qualify call.';

-- Hot path for grant_referral_reward (count qualified-uncounted) and
-- referral_progress (count by status per referrer).
create index if not exists referrals_referrer_status_idx
  on public.referrals (referrer_user_id, status);

-- Partial index over the exact set grant_referral_reward scans:
-- this referrer's qualified-but-unspent referrals.
create index if not exists referrals_grantable_idx
  on public.referrals (referrer_user_id)
  where status = 'qualified' and counted_for_grant_id is null;


-- ============================================================
-- 3. pending_referrals — park credit when the referrer hasn't
-- claimed a code yet (D4: an early referrer must not lose credit
-- for a friend who installs before the referrer does).
--
-- register_referral() inserts here when a code resolves to a waitlist
-- row with NULL claimed_user_id; claim_waitlist_code() drains matching
-- rows into public.referrals once the referrer's account exists.
-- ============================================================
create table if not exists public.pending_referrals (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,
  referred_user_id  uuid not null references auth.users(id) on delete cascade,
  device_id         text,
  created_at        timestamptz not null default now(),
  constraint pending_referrals_unique_per_referred unique (referred_user_id)
);

comment on table public.pending_referrals is
  'Referral credit parked under a shareable code whose referrer has not yet claimed an app account. Drained into public.referrals by claim_waitlist_code() when the referrer signs in. Service/definer-written only.';
comment on column public.pending_referrals.code is
  'The shareable code the friend arrived with (a waitlist.referral_code, since by definition no app account owns it yet).';
comment on column public.pending_referrals.device_id is
  'getDeviceId() from the referred install — carried through to referral_account_signals when the row is reconciled.';

create index if not exists pending_referrals_code_idx
  on public.pending_referrals (code);

alter table public.pending_referrals enable row level security;
-- RLS ON, NO policy -> anon/authenticated get zero access. Only the
-- security-definer RPCs (running as owner) touch it. Same discipline
-- as ai_proxy_usage (20260613000000).
revoke all on public.pending_referrals from anon, authenticated;


-- ============================================================
-- 4. referral_account_signals — per-account fraud snapshot, captured
-- at register_referral time and read by the qualify gate to dedupe
-- phone / email / device across accounts (§8).
--
-- PDPA: reuses the device_id we already collect (x-device-id -> ai-proxy);
-- phone/email stored normalized (not raw) for dedupe only.
-- v1 DELIBERATELY OMITS ip_hash — an RPC cannot see the client IP, and
-- adding raw IP would be a new PDPA data category. Add a `ip_hash text`
-- column + an edge function that hashes IP with a server-only salt LATER,
-- only if abuse appears. The column is intentionally absent now.
-- ============================================================
create table if not exists public.referral_account_signals (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  device_id   text,
  phone_e164  text,        -- normalized phone (E.164-ish), for cross-account dedupe
  email_norm  text,        -- normalized email (gmail dots/+alias stripped), for dedupe
  created_at  timestamptz not null default now()
);

comment on table public.referral_account_signals is
  'Fraud signals snapshotted per referred account at register_referral time. Read by qualify_referral to enforce per-phone / per-email / per-device caps. v1 stores NO ip_hash (RPCs cannot see client IP; that is a v2 edge-function add). Service/definer-written only.';
comment on column public.referral_account_signals.device_id is
  'Stable per-install id from src/utils/deviceId.ts getDeviceId() (the same value sent as x-device-id to ai-proxy). Reused as a fraud signal — no new tracking introduced.';
comment on column public.referral_account_signals.phone_e164 is
  'Phone normalized for cross-account dedupe. NULL for Google-only sign-ups. Never the raw typed value.';
comment on column public.referral_account_signals.email_norm is
  'Email canonicalized (lowercased; for gmail.com the local-part has dots removed and any +alias stripped) so burner aliases collapse to one identity for the qualify cap.';

create index if not exists referral_signals_device_idx on public.referral_account_signals (device_id) where device_id is not null;
create index if not exists referral_signals_phone_idx  on public.referral_account_signals (phone_e164) where phone_e164 is not null;
create index if not exists referral_signals_email_idx  on public.referral_account_signals (email_norm) where email_norm is not null;

alter table public.referral_account_signals enable row level security;
-- RLS ON, NO policy. Definer-only. (Even the owner cannot read their own
-- fraud signals — there is no product reason to expose them.)
revoke all on public.referral_account_signals from anon, authenticated;


-- ============================================================
-- 5. entitlements — THE source of truth for premium.
--
-- Premium today is a spoofable local AsyncStorage flag with no expiry
-- (src/store/premiumStore.ts). This table replaces that as authority:
-- the client only READS it (owner-read RLS) and reconciles its local
-- `tier` from premium_until (reconcileEntitlement). The server always
-- wins; a spoofed local flag is reset on the next read.
--
-- Written ONLY by grant_referral_reward (and, later, a real IAP webhook)
-- via security-definer / service role. NO write policy — copies the
-- ai_usage owner-read / no-client-write pattern verbatim in spirit.
-- ============================================================
create table if not exists public.entitlements (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  premium_until  timestamptz,                       -- NULL = never had premium; past = lapsed
  source         text not null default 'none'
                 check (source in ('none', 'referral', 'iap', 'manual')),
  updated_at     timestamptz not null default now()
);

comment on table public.entitlements is
  'Single source of truth for premium. Client reads only (owner-read RLS); never writes. The app reconciles its local premiumStore.tier from premium_until on every launch/sign-in — server always wins, spoofed local flags are overwritten.';
comment on column public.entitlements.premium_until is
  'Premium active iff premium_until > now(). Extended (never overwritten) by grant_referral_reward: greatest(now(), coalesce(premium_until, now())) + interval ''30 days'' per reward, so rewards stack (D3).';
comment on column public.entitlements.source is
  'How the current premium was obtained: referral (this feature), iap (real billing, future), manual (founder grant / support), none (default). Lets IAP write the same row without a schema migration.';

-- Owner-read so the app can read its own premium_until.
-- Verbatim-in-spirit copy of ai_usage_owner_read (20260417200000).
drop policy if exists "entitlements_owner_read" on public.entitlements;
create policy "entitlements_owner_read" on public.entitlements
  for select using (auth.uid() = user_id);

-- NO insert/update/delete policy on purpose — writes are service-role /
-- security-definer only (grant_referral_reward, future IAP webhook).
alter table public.entitlements enable row level security;

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;  -- still gated to owner by RLS


-- ============================================================
-- 6. premium_grants — append-only reward ledger.
--
-- Every reward (or future manual/IAP grant) writes one immutable row
-- here for dispute resolution and audit. referrals.counted_for_grant_id
-- points back here, so each grant records exactly which 3 referrals it
-- consumed (in meta). Append-only by convention + RLS (no UPDATE/DELETE
-- policy and no client write at all).
-- ============================================================
create table if not exists public.premium_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text not null default 'referral_3'
              check (reason in ('referral_3', 'manual', 'iap')),
  days        integer not null default 30 check (days > 0),
  granted_at  timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb
);

comment on table public.premium_grants is
  'Append-only ledger: one immutable row per premium grant. Full audit trail for disputes (referrer claims "I invited 3 but got nothing"). Written by grant_referral_reward only. No clawback rows — a churned referred account does not reverse a grant (§8).';
comment on column public.premium_grants.reason is
  'referral_3 = 3 qualified referrals consumed; manual = founder/support grant; iap = real purchase (future).';
comment on column public.premium_grants.days is
  'Days of premium this grant added (default 30 = one month / 3 referrals).';
comment on column public.premium_grants.meta is
  'Audit detail, e.g. { "referral_ids": [uuid,uuid,uuid] } — exactly which referrals this grant consumed (cross-checkable against referrals.counted_for_grant_id).';

create index if not exists premium_grants_user_idx
  on public.premium_grants (user_id, granted_at desc);

alter table public.premium_grants enable row level security;
-- RLS ON, NO policy. Definer/service-role only — clients get zero access.
-- (The user-facing "premium active until X" comes from entitlements.)
revoke all on public.premium_grants from anon, authenticated;


-- ============================================================
-- 7. Close the referrals.counted_for_grant_id FK now that
-- premium_grants exists. Deferred to here so column order in §2 reads
-- naturally; the constraint is what actually enforces the link.
-- ============================================================
alter table public.referrals drop constraint if exists referrals_counted_grant_fk;
alter table public.referrals
  add  constraint referrals_counted_grant_fk
       foreign key (counted_for_grant_id)
       references public.premium_grants(id) on delete set null;
-- ON DELETE SET NULL: if a grant row is ever removed (it shouldn't be —
-- the ledger is append-only), the consumed referrals revert to
-- qualified-uncounted rather than being orphaned to a dangling id.
```

### Design rationale (load-bearing choices)

- **`claimed_user_id` is `on delete set null`, not `cascade`.** Deleting an app account must NOT delete the waitlist row (a separate, admin-owned dataset with its own retention). It just frees the code to be re-claimed. The partial unique index `waitlist_claimed_user_uniq` enforces one-account-per-waitlist-row (the other half of D1); the existing `waitlist_referral_code_uniq` (in `docs/waitlist.sql`) enforces one-code-per-row.
- **`referrals.status` defaults `'pending'` not null.** No prod rows exist (no edge function ever inserted), so the back-fill is moot; the `referrals_status_chk` is drop-then-add so re-runs are clean.
- **Two indexes on `referrals`.** `referrals_grantable_idx` (partial) is the tight scan `grant_referral_reward` does on every qualify; `referrals_referrer_status_idx` (full) serves `referral_progress`'s per-status counts. Cheap at referral volume; keeps each hot path index-only.
- **`counted_for_grant_id` FK is added last** (§7) because Postgres can't reference a table not yet created. The column is added plain in §2 so the table reads in logical order; the constraint enforces the double-spend guard. `on delete set null` keeps the ledger and the referral graph from orphaning each other.
- **Both `pending_referrals` and `referrals` carry `unique (referred_user_id)`.** One person = one credit, parked or live. `claim_waitlist_code` deletes the pending row in the same transaction it inserts the live one, so the two uniques never conflict.
- **Only `entitlements` is client-readable** (`grant select to authenticated`, still RLS-gated to owner). `pending_referrals`, `referral_account_signals`, `premium_grants` get `revoke all` and no grant — pure server-internal, reached only via security-definer RPCs, exactly like `ai_proxy_usage`. `referrals` keeps its existing `referrals_party_read` grant/policy untouched.
- **`source`/`reason` enums include `'iap'`/`'manual'` now** even though only `'referral'`/`'referral_3'` fire in v1 — the one forward-looking schema choice, so real billing ships without a migration.
- **No `ip_hash` column anywhere.** An RPC can't see the client IP, so a v1 `ip_hash` would always be NULL and is a new PDPA data category for no benefit. v2 edge-function add. Intentionally absent so a developer doesn't "helpfully" add it.

---

## 4. Server RPCs — full spec

All six functions live in the same migration, after the table DDL. Every function is `security definer` and pins `set search_path = public` so it runs as the table owner and bypasses RLS deterministically — the discipline of `waitlist_signup`, `lookup_referral_code`, `add_ai_proxy_usage`. **Every UUID mint uses `gen_random_uuid()` (`pg_catalog`), never `gen_random_bytes()`.** Functions return JSON (opaque-outcome discipline: callers learn their own result, never enumerate others). Business failures return `{ ok:false, reason:… }`; only `auth_required` (28000) / `forbidden` (42501) raise. Grants follow the `add_ai_proxy_usage` template.

### Shared internal normalizer

```sql
-- INTERNAL: gmail-dot/plus-alias collapse + e164-ish phone canonicalization.
-- Mirrors waitlist_signup's logic so the same human dedupes across both systems.
create or replace function public._norm_contact(p_contact text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare v text := lower(btrim(coalesce(p_contact,'')));
begin
  if v = '' then return null; end if;
  if v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    -- email: strip +alias, and dots in the gmail/googlemail local part
    declare local text := split_part(v,'@',1); dom text := split_part(v,'@',2);
    begin
      local := split_part(local,'+',1);
      if dom in ('gmail.com','googlemail.com') then
        local := replace(local,'.','');
        dom   := 'gmail.com';
      end if;
      return local || '@' || dom;
    end;
  else
    -- phone: digits only, leading '60' country code -> '0' (same as waitlist_signup)
    v := regexp_replace(v, '\D', '', 'g');
    if left(v,2) = '60' then v := '0' || substr(v,3); end if;
    if char_length(v) < 3 then return null; end if;
    return v;
  end if;
end;
$$;
revoke all on function public._norm_contact(text) from public, anon, authenticated;
grant execute on function public._norm_contact(text) to service_role; -- definer-internal only
```

### 4.1 `claim_waitlist_code(p_code text) → json`

**Purpose.** Binds the caller's `auth.uid()` to the waitlist row owning `p_code`, so the link they shared resolves to their app account (D1). Idempotent; rejects a code already claimed by someone else. **Role:** `authenticated`.

```sql
create or replace function public.claim_waitlist_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := btrim(coalesce(p_code, ''));
  v_row   public.waitlist%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  if v_code = '' then
    return json_build_object('ok', false, 'reason', 'empty_code');
  end if;

  -- Row-lock the target so two concurrent claims can't both win.
  select * into v_row
    from public.waitlist
   where referral_code = v_code
   limit 1
   for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');  -- opaque
  end if;

  if v_row.claimed_user_id = v_uid then
    return json_build_object('ok', true, 'reason', 'already_yours', 'code', v_code);
  end if;

  if v_row.claimed_user_id is not null then
    return json_build_object('ok', false, 'reason', 'claimed_by_other');
  end if;

  -- One app account <-> one waitlist row.
  if exists (select 1 from public.waitlist
              where claimed_user_id = v_uid and id <> v_row.id) then
    return json_build_object('ok', false, 'reason', 'already_claimed_another');
  end if;

  update public.waitlist
     set claimed_user_id = v_uid
   where id = v_row.id;

  -- Reconcile any pending credit parked under this code now that it has an owner.
  perform public._reconcile_pending_for_code(v_code, v_uid);

  return json_build_object('ok', true, 'reason', 'claimed', 'code', v_code);
end;
$$;

revoke all on function public.claim_waitlist_code(text) from public, anon;
grant execute on function public.claim_waitlist_code(text) to authenticated;
```

**Return:** `{ ok, reason: 'claimed'|'already_yours'|'not_found'|'empty_code'|'claimed_by_other'|'already_claimed_another', code? }`. The `for update` row-lock + the partial-unique index on `claimed_user_id` make concurrent claims race-free.

### 4.2 `register_referral(p_code text, p_device_id text) → json`

**Purpose.** Called by the referred friend on account creation with the pre-filled code. Resolves the code; if the referrer hasn't installed, parks a `pending_referrals` row. Self-referral guarded. Inserts a `referrals` row `status='pending'` and snapshots fraud signals. **Role:** `authenticated`.

**Resolution order:** app code (`user_profiles.referral_code`) → else waitlist code with a non-null `claimed_user_id` → else waitlist code unclaimed (park pending). A unified user always resolves through the app account first.

```sql
create or replace function public.register_referral(p_code text, p_device_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_code      text := btrim(coalesce(p_code, ''));
  v_dev       text := nullif(btrim(coalesce(p_device_id,'')), '');
  v_referrer  uuid;
  v_wl        public.waitlist%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  -- Always snapshot signals for this account, even if the code is junk — the
  -- account-level dedupe (phone/email/device) needs this row regardless.
  insert into public.referral_account_signals (user_id, device_id, phone_e164, email_norm)
  values (
    v_uid,
    v_dev,
    public._norm_contact(auth.jwt() ->> 'phone'),
    public._norm_contact(auth.jwt() ->> 'email')
  )
  on conflict (user_id) do update
    set device_id   = coalesce(excluded.device_id,  referral_account_signals.device_id),
        phone_e164  = coalesce(excluded.phone_e164, referral_account_signals.phone_e164),
        email_norm  = coalesce(excluded.email_norm, referral_account_signals.email_norm);

  if v_code = '' then
    return json_build_object('ok', false, 'reason', 'empty_code');
  end if;

  -- This person is already attributed (unique(referred_user_id) on both tables).
  -- First attribution wins; survives reinstalls.
  if exists (select 1 from public.referrals where referred_user_id = v_uid)
     or exists (select 1 from public.pending_referrals where referred_user_id = v_uid) then
    return json_build_object('ok', true, 'reason', 'already_attributed');
  end if;

  -- 1) App code
  select user_id into v_referrer
    from public.user_profiles
   where referral_code = v_code
   limit 1;

  -- 2) Waitlist code claimed to an app account
  if v_referrer is null then
    select * into v_wl
      from public.waitlist
     where referral_code = v_code
     limit 1;
    if found and v_wl.claimed_user_id is not null then
      v_referrer := v_wl.claimed_user_id;
    end if;
  end if;

  if v_referrer = v_uid then
    return json_build_object('ok', false, 'reason', 'self_referral');
  end if;

  -- 3) Real waitlist code but unclaimed referrer -> park pending.
  if v_referrer is null then
    if v_wl.id is not null then
      insert into public.pending_referrals (code, referred_user_id, device_id)
      values (v_code, v_uid, v_dev)
      on conflict (referred_user_id) do nothing;
      return json_build_object('ok', true, 'reason', 'parked_pending');
    end if;
    return json_build_object('ok', false, 'reason', 'unknown_code');  -- quiet miss
  end if;

  insert into public.referrals (referrer_user_id, referred_user_id, code, status, device_id)
  values (v_referrer, v_uid, v_code, 'pending', v_dev)
  on conflict (referred_user_id) do nothing;

  return json_build_object('ok', true, 'reason', 'registered');
end;
$$;

revoke all on function public.register_referral(text, text) from public, anon;
grant execute on function public.register_referral(text, text) to authenticated;
```

**Internal reconciliation helper** (called from `claim_waitlist_code` and the profile auto-claim trigger):

```sql
-- INTERNAL: when a waitlist code finally gets an owner, promote every parked
-- pending_referrals row under that code into a real pending `referrals` row.
create or replace function public._reconcile_pending_for_code(p_code text, p_referrer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.referrals (referrer_user_id, referred_user_id, code, status, device_id)
  select p_referrer, pr.referred_user_id, pr.code, 'pending', pr.device_id
    from public.pending_referrals pr
   where pr.code = p_code
     and pr.referred_user_id <> p_referrer        -- self-referral guard at promote time
  on conflict (referred_user_id) do nothing;       -- already attributed elsewhere -> skip

  delete from public.pending_referrals
   where code = p_code;
end;
$$;
revoke all on function public._reconcile_pending_for_code(text, uuid) from public, anon, authenticated;
grant execute on function public._reconcile_pending_for_code(text, uuid) to service_role;
```

**Return:** `{ ok, reason: 'registered'|'parked_pending'|'already_attributed'|'self_referral'|'unknown_code'|'empty_code' }`. Phone/email come from `auth.jwt()` claims (server-trusted), never client args; `device_id` is the existing `ai-proxy` fraud signal. First-attribution-wins + `unique(referred_user_id)` block reinstall re-attribution.

### 4.3 `qualify_referral() → json`

**Purpose.** Called by the **referred** user's client after onboarding + first transaction. Stamps `first_activity_at` on their own referral row; once that activity is ≥48h old AND the fraud gate passes, flips `pending → qualified` and triggers the grant. **Role:** `authenticated` (acts on `referred_user_id = auth.uid()`).

**Why activity is client-asserted:** personal cloud sync is **dormant by default** (`personalSyncEnabled` defaults false), so `public.personal_transactions` is usually empty even for active users. The server cannot prove a txn exists by reading that table. Instead the first call stamps `first_activity_at = now()` (the client only calls *after* a real local first transaction), and the flip happens only on a later call where `now() >= first_activity_at + 48h` AND account age ≥ floor. The 48h "survival" is enforced by server timestamps, not trusted from the client.

```sql
create or replace function public.qualify_referral()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_ref        public.referrals%rowtype;
  v_acct_age   interval;
  v_min_age    constant interval := interval '48 hours';
  v_sig        public.referral_account_signals%rowtype;
  v_dupe       boolean := false;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into v_ref
    from public.referrals
   where referred_user_id = v_uid
   limit 1
   for update;

  if not found then
    return json_build_object('ok', true, 'status', 'none');   -- not a referred user
  end if;
  if v_ref.status <> 'pending' then
    return json_build_object('ok', true, 'status', v_ref.status); -- already qualified/rejected
  end if;

  -- Stamp the activity clock on first call.
  if v_ref.first_activity_at is null then
    update public.referrals set first_activity_at = now() where id = v_ref.id;
    return json_build_object('ok', true, 'status', 'pending', 'reason', 'activity_recorded');
  end if;

  -- 48h survival window not elapsed yet.
  if now() < v_ref.first_activity_at + v_min_age then
    return json_build_object('ok', true, 'status', 'pending', 'reason', 'too_soon');
  end if;

  -- Account-age floor.
  select * into v_sig from public.referral_account_signals where user_id = v_uid;
  v_acct_age := now() - coalesce(v_sig.created_at, v_ref.created_at);
  if v_acct_age < v_min_age then
    return json_build_object('ok', true, 'status', 'pending', 'reason', 'too_soon');
  end if;

  -- Dedupe: an earlier QUALIFIED referral sharing this account's phone/email/device
  -- blocks a second same-identity account from qualifying.
  select exists (
    select 1
      from public.referrals r2
      join public.referral_account_signals s2 on s2.user_id = r2.referred_user_id
     where r2.status = 'qualified'
       and r2.referred_user_id <> v_uid
       and (
            (v_sig.phone_e164 is not null and s2.phone_e164 = v_sig.phone_e164)
         or (v_sig.email_norm is not null and s2.email_norm = v_sig.email_norm)
         or (v_sig.device_id  is not null and s2.device_id  = v_sig.device_id)
       )
  ) into v_dupe;

  if v_dupe then
    update public.referrals set status = 'rejected', qualified_at = now() where id = v_ref.id;
    return json_build_object('ok', true, 'status', 'rejected', 'reason', 'duplicate_identity');
  end if;

  update public.referrals set status = 'qualified', qualified_at = now() where id = v_ref.id;

  -- Trigger the grant (definer-internal; safe to call inline within this definer fn).
  perform public.grant_referral_reward(v_ref.referrer_user_id);

  return json_build_object('ok', true, 'status', 'qualified');
end;
$$;

revoke all on function public.qualify_referral() from public, anon;
grant execute on function public.qualify_referral() to authenticated;
```

**Return:** `{ ok:true, status: 'qualified'|'pending'|'rejected'|'none', reason?: 'activity_recorded'|'too_soon'|'duplicate_identity' }`. Always `ok:true` for business outcomes — rejection is silent. `for update` makes the pending→qualified transition idempotent under concurrent calls. Fraud gate = (a) 48h survival via `first_activity_at`, (b) account-age floor, (c) phone/email/device dedupe; IP clustering is v2.

### 4.4 `grant_referral_reward(p_referrer uuid) → json` — definer-internal / service_role only

**Purpose.** Counts the referrer's `qualified` referrals with `counted_for_grant_id IS NULL`; for every batch of 3, consumes exactly those 3, writes a `premium_grants` row, and extends `entitlements.premium_until` by 30 days (stacking, D3). Loops so 6 unconsumed → 2 months. **Not client-callable** — granted only to `service_role`; invoked inline by `qualify_referral`.

```sql
create or replace function public.grant_referral_reward(p_referrer uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_key   bigint := hashtextextended(p_referrer::text, 0);
  v_avail      int;
  v_grants     int := 0;
  v_grant_id   uuid;
  v_until      timestamptz;
begin
  if p_referrer is null then
    return json_build_object('ok', false, 'reason', 'no_referrer');
  end if;

  -- Serialize all grant attempts for THIS referrer so two concurrent qualify calls
  -- can't each count the same 3 -> double grant. Transaction-scoped advisory lock.
  perform pg_advisory_xact_lock(v_lock_key);

  select count(*) into v_avail
    from public.referrals
   where referrer_user_id = p_referrer
     and status = 'qualified'
     and counted_for_grant_id is null;

  while v_avail >= 3 loop
    insert into public.premium_grants (user_id, reason, days, meta)
    values (p_referrer, 'referral_3', 30,
            jsonb_build_object('granted_for', 'referral_install_reward'))
    returning id into v_grant_id;

    update public.referrals
       set counted_for_grant_id = v_grant_id
     where id in (
       select id from public.referrals
        where referrer_user_id = p_referrer
          and status = 'qualified'
          and counted_for_grant_id is null
        order by qualified_at asc, id asc
        limit 3
       for update
     );

    v_grants := v_grants + 1;
    v_avail  := v_avail - 3;
  end loop;

  if v_grants = 0 then
    select premium_until into v_until from public.entitlements where user_id = p_referrer;
    return json_build_object('ok', true, 'granted_months', 0, 'premium_until', v_until);
  end if;

  insert into public.entitlements (user_id, premium_until, source, updated_at)
  values (p_referrer, greatest(now(), now()) + (v_grants * interval '30 days'), 'referral', now())
  on conflict (user_id) do update
    set premium_until = greatest(now(), coalesce(entitlements.premium_until, now()))
                        + (v_grants * interval '30 days'),
        source        = case when entitlements.source = 'iap' then entitlements.source
                             else 'referral' end,        -- never downgrade a paid source
        updated_at    = now()
  returning premium_until into v_until;

  return json_build_object('ok', true, 'granted_months', v_grants, 'premium_until', v_until);
end;
$$;

revoke all on function public.grant_referral_reward(uuid) from public, anon, authenticated;
grant execute on function public.grant_referral_reward(uuid) to service_role;
```

**Return:** `{ ok, granted_months, premium_until?, reason?: 'no_referrer' }`. **Stacking math:** `premium_until = greatest(now(), coalesce(premium_until, now())) + (n * interval '30 days')` — restarts from now if lapsed, appends if still future (D3). **Double-grant defenses:** (1) `pg_advisory_xact_lock(hashtextextended(referrer))` serializes per-referrer grant work; (2) `update … where id in (select … limit 3 for update)` consumes specific rows by stamping `counted_for_grant_id`; (3) `where counted_for_grant_id is null` makes count and consume see the same population. **No clawback** — a churned referred account does not reverse a granted month.

### 4.5 `referral_progress() → json`

**Purpose.** Feeds the InviteScreen tracker: the caller's qualified/pending counts, threshold, cycle progress (mod 3), entitlement expiry, and shareable code. Definer so it cleanly aggregates across all their referred rows. **Role:** `authenticated`.

```sql
create or replace function public.referral_progress()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_qualified  int;
  v_pending    int;
  v_consumed   int;
  v_until      timestamptz;
  v_code       text;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select
    count(*) filter (where status = 'qualified'),
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'qualified' and counted_for_grant_id is not null)
    into v_qualified, v_pending, v_consumed
    from public.referrals
   where referrer_user_id = v_uid;

  select premium_until into v_until from public.entitlements where user_id = v_uid;

  -- The shareable code: prefer the app code, fall back to the claimed waitlist code.
  select referral_code into v_code from public.user_profiles where user_id = v_uid;
  if v_code is null then
    select referral_code into v_code from public.waitlist where claimed_user_id = v_uid limit 1;
  end if;

  return json_build_object(
    'code',             v_code,
    'qualified_count',  v_qualified,            -- lifetime qualified
    'pending_count',    v_pending,              -- in flight, not yet 48h/clean
    'rewards_earned',   floor(v_consumed / 3),  -- months ever granted via referral
    'cycle_progress',   v_qualified % 3,        -- 0..2 toward the NEXT month
    'needed',           3,
    'premium_until',    v_until,
    'is_premium',       (v_until is not null and v_until > now())
  );
end;
$$;

revoke all on function public.referral_progress() from public, anon;
grant execute on function public.referral_progress() to authenticated;
```

**Return:** `{ code, qualified_count, pending_count, rewards_earned, cycle_progress(0..2), needed:3, premium_until, is_premium }`. The client builds `share_url` as `https://jejakbaki.my/?ref={code}`. The 3-pip tracker uses `cycle_progress`/`needed`; the premium line uses `premium_until`/`is_premium`.

### 4.6 `admin_referral_leaderboard() → json` — is_admin gated

**Purpose.** Powers the admin.html "Referrals" tab: one row per referrer (and pre-launch, per waitlister with downstream invites) with contact, code, waitlist-graph invite count, qualified-install count, reward flag, entitlement expiry. Gated by `public.is_admin()`. **Role:** granted to `authenticated`, body hard-rejects non-admins.

```sql
create or replace function public.admin_referral_leaderboard()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_out json;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with app_ref as (
    select
      r.referrer_user_id                                          as referrer,
      max(up.referral_code)                                       as code,
      count(*) filter (where r.status = 'pending')                as installs_pending,
      count(*) filter (where r.status = 'qualified')              as qualified_installs
      from public.referrals r
      left join public.user_profiles up on up.user_id = r.referrer_user_id
     group by r.referrer_user_id
  ),
  wl_invites as ( -- pre-launch waitlist graph: how many people each code brought in
    select w.referral_code as code, count(child.id) as waitlist_referrals
      from public.waitlist w
      left join public.waitlist child on child.referred_by = w.id
     where w.referral_code is not null
     group by w.referral_code
  )
  select json_agg(row_to_json(t) order by t.qualified_installs desc nulls last,
                                          t.waitlist_referrals  desc nulls last)
    into v_out
    from (
      select
        coalesce(ar.code, wl.code)                                as code,
        coalesce(sig.phone_e164, sig.email_norm, wlrow.contact)   as contact,
        coalesce(wl.waitlist_referrals, 0)                        as waitlist_referrals,
        coalesce(ar.qualified_installs, 0)                        as qualified_installs,
        coalesce(ar.installs_pending, 0)                          as installs_pending,
        (coalesce(ar.qualified_installs,0) >= 3)                  as reward_earned,
        floor(coalesce(ar.qualified_installs,0) / 3)              as months_earned,
        e.premium_until
      from wl_invites wl
      full join app_ref ar on ar.code = wl.code
      left join public.referral_account_signals sig on sig.user_id = ar.referrer
      left join public.entitlements e on e.user_id = ar.referrer
      left join public.waitlist wlrow on wlrow.referral_code = coalesce(ar.code, wl.code)
    ) t;

  return coalesce(v_out, '[]'::json);
end;
$$;

revoke all on function public.admin_referral_leaderboard() from public, anon;
grant execute on function public.admin_referral_leaderboard() to authenticated;  -- body enforces is_admin
```

**Return:** JSON array of `{ code, contact, waitlist_referrals, qualified_installs, installs_pending, reward_earned, months_earned, premium_until }`, sorted by `qualified_installs desc` then `waitlist_referrals desc`. The `full join` unifies app-referrer and waitlist-invite populations on `code`. Pre-launch all `qualified_installs` are 0 → the tab shows the waitlist graph; post-launch the same query surfaces real credits without a code change. `exportReferralsCsv` derives directly from this array.

### Profile-creation auto-claim trigger (supports these RPCs)

On first `user_profiles` insert, a trigger attempts a contact-match auto-claim of the waitlist code, then reconciles parked pending rows — reusing `_norm_contact` so the match is identical to `waitlist_signup`.

```sql
create or replace function public._autoclaim_waitlist_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public._norm_contact(auth.jwt() ->> 'phone');
  v_email text := public._norm_contact(auth.jwt() ->> 'email');
  v_code  text;
begin
  select referral_code into v_code
    from public.waitlist
   where claimed_user_id is null
     and ( (v_phone is not null and public._norm_contact(contact) = v_phone)
        or (v_email is not null and public._norm_contact(contact) = v_email) )
   limit 1
   for update skip locked;

  if v_code is not null then
    update public.waitlist set claimed_user_id = new.user_id where referral_code = v_code;
    perform public._reconcile_pending_for_code(v_code, new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_autoclaim_waitlist on public.user_profiles;
create trigger trg_autoclaim_waitlist
  after insert on public.user_profiles
  for each row execute function public._autoclaim_waitlist_on_profile();

revoke all on function public._autoclaim_waitlist_on_profile() from public, anon, authenticated;
```

The manual `claim_waitlist_code` remains the recovery path when the install contact differs from the waitlist contact — the single load-bearing seam (§15 / D1).

### Cross-cutting rules applied to all RPCs

- **`gen_random_uuid()` only** — never `gen_random_bytes()` (invisible under `search_path=public`).
- **`set search_path = public`** on every function so resolution is deterministic and definer privileges can't be hijacked.
- **Opaque outcomes** — business failures return `{ ok:false, reason:… }`; only `auth_required`/`forbidden` raise.
- **Grants** — client-facing fns: `revoke all from public, anon` then `grant execute to authenticated`. Internal fns (`grant_referral_reward`, `_reconcile_pending_for_code`, `_norm_contact`): `revoke all from public, anon, authenticated` then `grant execute to service_role`.
- **Trust the JWT, not arguments, for identity** — phone/email from `auth.jwt()`; the only client-supplied values are the code string and `device_id`.
- **Locking** — `claim_waitlist_code` row-locks the waitlist row; `qualify_referral` row-locks the caller's referral row; `grant_referral_reward` holds a per-referrer `pg_advisory_xact_lock` + `for update` on consumed rows.

---

## 5. App integration — RN wiring

The React Native changes connecting the client to the server-owned `entitlements`/`referrals` machinery. Consistent with D1–D4. The client only **reads** entitlements and **calls RPCs**; it never writes premium state to the server.

### 5.0 Files touched (complete list)

| File | Change |
|---|---|
| `src/services/entitlements.ts` | **NEW** — `refreshEntitlement()`, `registerReferral()`, `claimWaitlistCode()`, `qualifyReferral()`, `fetchReferralProgress()` |
| `src/store/premiumStore.ts` | Add `premiumUntil`, `reconcileEntitlement()`, derived `isPremium()`; route `tier` reads through `isPremium()`; persist/rehydrate `premiumUntil` |
| `src/types/index.ts` | Extend `PremiumState` (`premiumUntil`, `reconcileEntitlement`, `isPremium`); add `ReferralProgress` type |
| `App.tsx` | Call `refreshEntitlement(userId)` at the two `authStore.setUserId` sites (`:120` startup, `:261` SIGNED_IN); reset on SIGNED_OUT; call `captureReferralOnLaunch()` on boot |
| `src/screens/shared/Onboarding.tsx` | New skippable referral page after mode-pick; capture/prefill code; stage `register_referral` from `handleComplete` |
| `src/screens/shared/Settings.tsx` | Add `'invite'` to the `section` union; add Invite hub row; render `InviteScreen` under `section === 'invite'` |
| `src/screens/shared/InviteScreen.tsx` | **NEW** — component rendered by Settings |
| `src/store/personalStore.ts` | `addTransaction` fires the one-shot qualify trigger via a side-effect helper |
| `src/services/referralAttribution.ts` | **NEW** — deep-link, clipboard (`POTRACES-REF:`), Android install-referrer read; persists pending code to AsyncStorage (see §6) |
| `src/utils/deviceId.ts` | Reuse `getDeviceId()` — no change |
| `src/i18n/en.ts`, `src/i18n/ms.ts` | New `referral` namespace (§7) |
| `app.json` | `react-native-play-install-referrer` autolinks (no plugin); confirm `potraces://` scheme + `expo-clipboard` plugin |

### 5.1 `src/services/entitlements.ts` (new)

Owns every Supabase call related to entitlements/referrals. Imports `{ supabase } from './supabase'` and `{ getDeviceId } from '../utils/deviceId'`.

```ts
export async function refreshEntitlement(userId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('entitlements')
      .select('premium_until')
      .eq('user_id', userId)        // owner-read RLS already scopes this; eq is belt-and-braces
      .maybeSingle();
    if (error) return;              // transient failure -> keep last known state, never downgrade
    const until = data?.premium_until ? new Date(data.premium_until) : null;
    usePremiumStore.getState().reconcileEntitlement(until);
  } catch {
    // offline / cold cache — leave local state untouched
  }
}
```

Rules: reads the single source of truth (`entitlements.premium_until`); no row → `until = null` → store reconciles to `free` (resets a spoofed local `tier`). **Independent of `personalSyncEnabled`** — called directly from the auth hook points, never from `syncPersonal`. **Fail-soft** — a transient error must never flip a paying user to free; `reconcileEntitlement` is called only on a definitive read (including the definitive "no row" → null).

Thin RPC wrappers (opaque-response discipline):

```ts
export async function registerReferral(code: string): Promise<void> {
  const deviceId = await getDeviceId();
  await supabase.rpc('register_referral', { p_code: code.trim().toLowerCase(), p_device_id: deviceId });
  // fire-and-forget; invalid code resolves to a quiet no-op server-side
}
export async function claimWaitlistCode(code: string): Promise<void> {
  await supabase.rpc('claim_waitlist_code', { p_code: code.trim().toLowerCase() });
}
export async function qualifyReferral(): Promise<void> {
  await supabase.rpc('qualify_referral');   // no args — server reads auth.uid()
}
export async function fetchReferralProgress(): Promise<ReferralProgress | null> {
  const { data, error } = await supabase.rpc('referral_progress');
  if (error || !data) return null;
  return data as ReferralProgress;
}
```

> **Code-case note:** the attribution layer (§6) normalizes captured codes to **lowercase**, and the RPC wrappers send lowercase. Keep the whole client pipeline lowercase end-to-end so it matches the canonical waitlist code form. (If any UI shows codes uppercased for readability, uppercase only at display time, never at send time.)

`ReferralProgress` (`src/types/index.ts`):

```ts
export interface ReferralProgress {
  code: string | null;        // the unified shareable code (app code or claimed waitlist code)
  qualified_count: number;
  pending_count: number;
  rewards_earned: number;     // months ever granted
  cycle_progress: number;     // 0..2 toward the next month
  needed: number;             // always 3
  premium_until: string | null;
  is_premium: boolean;
}
```

The client builds `share_url = https://jejakbaki.my/?ref=${code}` from `code`.

### 5.2 `premiumStore` refactor — route ~32 gate sites without editing ~32 files

Every gate flows through the store's own methods (`canUseAI()`, `canCreateWallet()`, `canCreateBudget()`, `canScanReceipt()`, `getRemainingScans()`, `getRemainingAiCalls()`, `isInTrial()`), each branching on `state.tier === 'premium'`. **The premium decision is already centralized in the store** — changing how the store computes "am I premium" reroutes every gate with no consumer edits. The few sites that read `tier` directly (`BudgetPlanning.tsx`, `SubscriptionList.tsx`, `WalletManagement.tsx`, `ReceiptScanner.tsx`, `Settings.tsx`) are display-only and keep working because `reconcileEntitlement` keeps the persisted `tier` field in sync with `premiumUntil`.

Add one private helper and route every `state.tier === 'premium'` through it:

```ts
isPremium: () => {
  const s = get();
  if (s.tier !== 'premium') return false;
  if (!s.premiumUntil) return true;             // legacy/manual premium with no expiry -> honoured
  return s.premiumUntil.getTime() > Date.now(); // time-boxed referral reward — actually enforced now
},
```

Then in each `can*` method swap the literal check, e.g.:

```ts
canUseAI: () => {
  const state = get();
  if (state.isPremium()) return true;           // was: state.tier === 'premium'
  if (state.isInTrial()) return true;
  state.resetAiCallsIfNeeded();
  return get().aiCallsCount < FREE_TIER.maxAiCallsPerMonth;
},
```

Same single-line swap in `canCreateWallet`, `canCreateBudget`, `canScanReceipt`, `getRemainingScans`, `getRemainingAiCalls`, and the early `tier === 'premium'` check in `isInTrial`. **This makes expiry actually enforced** (today the local flag never expires).

`reconcileEntitlement` — server overwrites:

```ts
reconcileEntitlement: (premiumUntil) => {
  const active = !!premiumUntil && premiumUntil.getTime() > Date.now();
  set({ premiumUntil, tier: active ? 'premium' : 'free' });  // SERVER WINS — resets spoofed 'premium'
},
```

`subscribe()` stays optimistic (`set({ tier: 'premium', subscribedAt: new Date() })`) but is overwritten on the next `refreshEntitlement` → so an optimistic flip the server didn't grant self-corrects to `free`, and a real grant survives.

Persistence: extend `partialize` + `onRehydrateStorage` for `premiumUntil`, mirroring `subscribedAt`'s Date↔ISO handling (reuse the existing `sd()` guard). `PremiumState` (`src/types/index.ts`) gains `premiumUntil: Date | null`, `reconcileEntitlement: (premiumUntil: Date | null) => void`, `isPremium: () => boolean`.

### 5.3 App.tsx hook points

`refreshEntitlement` is called at the exact two existing `authStore.setUserId` sites — no new lifecycle, no dependence on sync. Also call `captureReferralOnLaunch()` on boot (§6).

```ts
// Startup (App.tsx:118–120, inside if (session)):
authStore.setUserId(session.user.id);
refreshEntitlement(session.user.id);          // fire-and-forget, independent of personalSyncEnabled

// SIGNED_IN listener (App.tsx:259–261):
auth.setUserId(session.user.id);
refreshEntitlement(session.user.id);          // runs alongside seller syncAll, not gated by it

// SIGNED_OUT (App.tsx:270), after auth.reset():
usePremiumStore.getState().reconcileEntitlement(null);  // drop to free on sign-out
```

Imports: `import { refreshEntitlement } from './src/services/entitlements';` and `import { usePremiumStore } from './src/store/premiumStore';`.

### 5.4 Onboarding referral step

`ALL_PAGES` (line 536) is `[welcome, ...slides, mode]`. The referral page goes **after** the mode page so it's the last, fully-skippable step:

```ts
type PageItem = { type:'welcome' } | { type:'slide'; data:OnboardingPage } | { type:'mode' } | { type:'referral' };
const ALL_PAGES: PageItem[] = useMemo(() => [
  { type:'welcome' }, ...PAGES.map(p => ({ type:'slide' as const, data:p })),
  { type:'mode' as const }, { type:'referral' as const },
], [PAGES]);
```

`DOT_COLORS` gains one entry (`sky.accent`). The page is inherently skippable — leaving the field blank and tapping "let's go" finishes with no code (no separate skip control needed; matches "never blocks setup").

State + prefill (from `referralAttribution`, §6):

```ts
const [referralCode, setReferralCode] = useState('');
const [codeSource, setCodeSource] = useState<'manual'|'clipboard'|'play_referrer'|'deeplink'>('manual');
const [codeInvalid, setCodeInvalid] = useState(false);

useEffect(() => {
  getCapturedReferralCode().then((cap) => { if (cap) { setReferralCode(cap.code); setCodeSource(cap.source); } });
}, []);
```

**Field style:** reuse the existing glass-field / sky-palette TextInput from the welcome name field exactly (same `placeholderTextColor`, glass bg ≥0.5 white alpha per `docs/DARK_MODE_READABILITY.md`, `selectionColor = withAlpha(accent, 0.25)`). Show a calm bronze sub-line `referral.onboard.foundTitle` when `codeSource !== 'manual'`.

Calling register (the user is usually not yet signed in at onboarding, so the call is staged and replayed post-sign-in):

```ts
const handleComplete = useCallback(() => {
  if (name.trim()) setUserName(name.trim());
  setLanguage(selectedLang);
  applyModeChoice(selectedMode);
  setHasCompletedOnboarding(true);
  const code = referralCode.trim().toLowerCase();
  if (code) stageReferralForRegistration(code);   // persists; replayed at SIGNED_IN / startup-session
}, [name, selectedLang, selectedMode, referralCode]);
```

A replay at the SIGNED_IN hook and the startup `if (session)` branch: if a staged code exists and `auth.uid()` is present, call `registerReferral(code)` then clear the staged value. Invalid code = quiet bronze hint via a cheap shape check (`setCodeInvalid(!/^[a-z0-9]{4,16}$/.test(code))`), never red, never blocking. Server-side rejection is silent.

### 5.5 InviteScreen (Settings `section:'invite'`)

`section` union at `Settings.tsx:473` gains `'invite'`. Add a hub row (after `money`, before `data`), reusing `SettingRow`:

```tsx
<SettingRow
  icon="i/gift" chipColor="#B2780A" label={t.referral.invite.title}
  onPress={() => { lightTap(); navigation.navigate({ name:'SettingsDetail', params:{ section:'invite' } } as never); }}
/>
```

Render the body inline: `{section === 'invite' && <InviteScreen />}` (body lives in `src/screens/shared/InviteScreen.tsx`).

Reuses: `Card` + `SettingRow` (hub), the site `shareBlock` copy verbatim, `Share.share` / `expo-clipboard.setStringAsync`. Progress is a **3-pip CALM-olive** tracker (`CALM.accent #4F5104`), pips fill from `cycle_progress`. Honest "what counts" line below. When `premium_until > now`, show *"premium active · until {date}"* and reset the pip tracker. Data on mount via `fetchReferralProgress()` — **never computed client-side**; `code` + the derived `share_url` come from the same payload (the unified, claimed code). If `progress === null` (offline / not-yet-signed-in), show a calm placeholder, not zeros.

```tsx
const [progress, setProgress] = useState<ReferralProgress | null>(null);
useEffect(() => { fetchReferralProgress().then(setProgress); }, []);
```

Self-claim: the profile-creation trigger (§4) auto-claims by contact server-side, so the screen normally just reads. Manual paste-to-claim ("I have an older invite link" → `claimWaitlistCode(pasted)` then re-fetch) is the recovery path.

### 5.6 `qualify_referral()` trigger — first-transaction path

Fire **once**, after the referred user's first real transaction (D2). Hook `addTransaction` in `src/store/personalStore.ts` (the single funnel for personal expense/income). Do **not** call the RPC inline in the store; fire a guarded one-shot side-effect:

```ts
// personalStore.ts addTransaction, after the set(...) that prepends the txn:
maybeFireQualify();
return id;
```

```ts
let fired = false;  // in-memory guard for this session
export async function maybeFireQualify(): Promise<void> {
  if (fired) return;
  const done = await AsyncStorage.getItem('potraces.qualifyFired');
  if (done) { fired = true; return; }
  const session = await getAuthSession();
  if (!session) return;
  fired = true;
  await AsyncStorage.setItem('potraces.qualifyFired', '1');
  qualifyReferral().catch(() => {});          // fire-and-forget; server runs the 48h + fraud gate
}
```

The 48h-survival gate (D2) is server-enforced; the client merely signals "a first transaction now exists". Calling early is safe (deleting the txn before 48h → server flips `rejected`). The `qualifyFired` flag plus the server-side idempotency (no-op once `qualified`/`rejected`) are belt-and-braces. Personal-mode only (the reward graph is app-account scoped).

### 5.7 Ordering & invariants (build-critical)

1. **`premiumStore.reconcileEntitlement` + `entitlements.ts` ship BEFORE any grant fires** — otherwise granted users see nothing and the client still trusts its spoofable flag.
2. `refreshEntitlement` is wired to the **auth-uid hook points, never to `personalSyncEnabled`**.
3. The ~32 gate sites are rerouted by changing **only** `premiumStore.ts` internals (`isPremium()` swap) — zero consumer-file edits.
4. `subscribe()` stays optimistic; the **server always overwrites** on the next `refreshEntitlement`.
5. Referral capture/clipboard reads are **PDPA-transparent** (install-referrer silent/Android-permitted; clipboard read only behind visible onboarding UI).

---

## 6. Attribution implementation

The concrete mechanism by which an `?ref=CODE` link on `jejakbaki.my` becomes a pre-filled invite code in Onboarding so `register_referral(p_code, p_device_id)` can fire. Three layers, in strict precedence: **(1) Android Play Install Referrer (silent, deterministic), (2) the `POTRACES-REF:` clipboard hand-off (iOS + Android fallback, behind a PDPA confirm), (3) the manual-paste floor (always works, both platforms).** Attribution NEVER writes to Supabase by itself; it only seeds the field. The server write happens once, from Onboarding, via `register_referral`.

### 6.0 Shared contract

```ts
// src/services/referralAttribution.ts
export type AttributionSource = 'play_referrer' | 'clipboard' | 'deeplink' | 'manual';
export interface AttributionResult {
  code: string;                  // normalized, e.g. "a1b2c3d4" (lowercase, trimmed)
  source: AttributionSource;
  needsConfirm: boolean;         // true => UI must show "we found your invite code" first (clipboard)
  rawTimestampSeconds?: number;  // Android only
}
```

Persistence: the resolved candidate is written once to AsyncStorage `potraces.pendingReferralCode` as `{ code, source, capturedAt }` (survives an app kill between first-launch and account creation). **Read-once-then-cleared:** deleted the moment `register_referral` returns a definitive outcome, so a re-install or code change can't replay a stale code. NOT cleared on a transient network error.

Normalization (every source before storage): `code.trim().toLowerCase()`. Both code spaces are alphanumeric (waitlist = 8-hex lowercase, app `user_profiles` = 6-char), so lowercasing is safe and deterministic. Reject anything failing `/^[a-z0-9]{4,16}$/` — a failed match becomes "no code" silently. Precedence when multiple fire: **play_referrer > deeplink > clipboard > manual**.

### 6.1 Android — Play Install Referrer (silent, deterministic)

**Library: `react-native-play-install-referrer`** (`uerceg/play-install-referrer-react-native`) — a thin wrapper over Google's official Play Install Referrer Library. The correct free choice; it's the same primitive paid MMPs read under the hood.

Verified facts (web-researched June 2026):
- **Autolinking, not a config plugin.** Added as a Gradle dependency; it auto-adds the manifest permission on build. No Expo config plugin needed/wanted. Native code → needs a **custom dev client / prebuild** (not Expo Go) — already true for this project (EAS + native modules), so no new constraint.
- **New Architecture / RN 0.81 / SDK 54.** A `NativeModules`-bridge wrapper with no Fabric/TurboModule surface; runs through the RN 0.81 interop layer. No New-Arch changes required. **Build-verify on the first EAS dev build** (native add — confirm autolink resolves and the app boots).
- **API (exact):** `PlayInstallReferrer.getInstallReferrerInfo(callback)` where callback is `(installReferrerInfo, error)`. On success `error` is `null`; `installReferrerInfo` has keys `installReferrer` (raw query string), `referrerClickTimestampSeconds`, `installBeginTimestampSeconds`, `referrerClickTimestampServerSeconds`, `installBeginTimestampServerSeconds`, `installVersion`.

Add to `package.json`: `"react-native-play-install-referrer": "^1.x"` (pin a concrete version at install). No `app.json` plugin entry.

> **Decision:** do NOT adopt a paid MMP. The autolinking + free Google primitive confirms no functional gap to buy.

**Site builds the Play Store URL** (the `referrer` value is delivered verbatim to the app):

```js
const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=my.jejakbaki.app';
function androidStoreUrl(code) { return STORE_ANDROID + '&referrer=' + encodeURIComponent('ref=' + code); }
// => …details?id=my.jejakbaki.app&referrer=ref%3Da1b2c3d4   (%3D = '=')
```

Confirm the real `android.package` before launch. Keep the `ref=` prefix inside the referrer payload so the app parses one grammar across web and install-referrer paths. Referrer max length is 256 chars; our payload is ~12.

**First-launch read + parse** (once, gated):

```ts
const PLAY_DONE_KEY = 'potraces.playReferrerRead';

async function readPlayReferrer(): Promise<AttributionResult | null> {
  if (Platform.OS !== 'android') return null;
  if (await AsyncStorage.getItem(PLAY_DONE_KEY)) return null;
  const { PlayInstallReferrer } = require('react-native-play-install-referrer'); // lazy: iOS never touches it
  return new Promise((resolve) => {
    PlayInstallReferrer.getInstallReferrerInfo((info: any, err: any) => {
      AsyncStorage.setItem(PLAY_DONE_KEY, '1').catch(() => {});
      if (err || !info || !info.installReferrer) return resolve(null);
      const code = parseRefFromQuery(info.installReferrer);   // "ref=a1b2c3d4&.." -> "a1b2c3d4"
      if (!code) return resolve(null);
      resolve({ code, source:'play_referrer', needsConfirm:false, rawTimestampSeconds: info.referrerClickTimestampSeconds });
    });
  });
}

export function parseRefFromQuery(raw: string): string | null {
  const q = raw.startsWith('?') ? raw.slice(1) : raw;
  for (const part of q.split('&')) {
    const [k, v] = part.split('=');
    if (k === 'ref' && v) {
      const code = decodeURIComponent(v).trim().toLowerCase();
      return /^[a-z0-9]{4,16}$/.test(code) ? code : null;
    }
  }
  return null;
}
```

Organic installs return `installReferrer: "utm_source=google-play&utm_medium=organic"` → `parseRefFromQuery` returns `null` (nothing pre-fills) — correct. **No PDPA confirm for the Play path:** the user clicked our link, we routed them to the store, and Google delivers the referrer to the app that requested it — first-party install metadata, so `needsConfirm:false` (it pre-fills silently; disclose in `site/privacy.html`).

### 6.2 iOS — the `POTRACES-REF:CODE` clipboard protocol

**iOS has no install-referrer API; Apple bans fingerprinting for attribution (enforced May 2024). No deterministic, free, policy-compliant web→install matching exists on iOS — and no paid SDK changes that (they fall back to the same clipboard/manual trick).** On iOS the clipboard hand-off **is** the attribution mechanism. Since iOS 14 a pasteboard read shows a system toast, so the read must be **expected** (we tell the user we'll look). Some legitimate iOS referrals are simply unattributable if the user clears their clipboard first — an Apple-platform limitation, not papered over. The manual-paste floor (§6.3) is the guaranteed iOS recovery path.

**Token grammar (exact):** `POTRACES-REF:<code>` — literal ASCII prefix `POTRACES-REF:` (uppercase, single colon, no spaces) + the raw code (e.g. `a1b2c3d4`), no URL-encoding, no trailing newline. The whole clipboard string equals the token. Parser: `token := "POTRACES-REF:" [A-Za-z0-9]{4,16}` (validated, then lowercased for storage). Anything else = "no invite code" silently.

**Site writes it** (iOS branch of "Get the app", inside the user-gesture click handler, HTTPS origin):

```js
async function getTheApp(code, isIOS) {
  if (code) {
    try { await navigator.clipboard.writeText('POTRACES-REF:' + code); } catch (_) {}
    showInviteCodeLine(code);              // visible floor: "Your invite code: a1b2c3d4"
  }
  location.href = isIOS ? STORE_IOS : androidStoreUrl(code);   // do the write BEFORE navigating away
}
```

**App Store URL carries nothing:** `https://apps.apple.com/app/id0000000000` (fill the numeric ID post-approval). Apple has no `&referrer` equivalent; all iOS attribution rides on the clipboard token + the visible code line.

**First-launch read** (`expo-clipboard@~8.0.8`, already a dependency), behind a visible confirm:

```ts
const CLIP_DONE_KEY = 'potraces.clipReferrerRead';
const TOKEN = 'POTRACES-REF:';

async function readClipboardReferrer(): Promise<AttributionResult | null> {
  if (await AsyncStorage.getItem(CLIP_DONE_KEY)) return null;
  await AsyncStorage.setItem(CLIP_DONE_KEY, '1');
  if (!(await Clipboard.hasStringAsync())) return null;        // cheap guard before the toast-triggering read
  const raw = (await Clipboard.getStringAsync())?.trim() ?? '';
  if (!raw.startsWith(TOKEN)) return null;
  const code = raw.slice(TOKEN.length).trim().toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(code)) return null;
  return { code, source:'clipboard', needsConfirm:true };       // Onboarding shows the confirm before storing
}
```

The confirm (copy lives in i18n `referral.onboard.found*`): *"We found an invite code — Looks like {code} was shared with you. Use it?"* → "use this code" stores it; "not now" discards (the `CLIP_DONE_KEY` guard prevents re-asking). A clipboard code is **never** persisted/sent without the explicit tap.

### 6.3 Universal manual-paste floor (both platforms)

The Onboarding referral step renders a text field styled to match the existing glass/sky field exactly. If `potraces.pendingReferralCode` exists, the field is **pre-filled** (calm bronze hint "from your invite link" for clipboard; silent for Play). If nothing was attributed, it's empty with placeholder *"Got a code from a friend? (optional)"* — the floor that recovers iOS-misses and ad-blocked-clipboard cases, the only path that always works on both platforms. Skippable, never blocks setup. On submit the value is normalized and passed to `register_referral(p_code, p_device_id)` with `p_device_id = await getDeviceId()`. Invalid/unknown code → quiet bronze hint, never red.

### 6.4 Boot wiring

```ts
export async function captureReferralOnLaunch(): Promise<void> {
  if (await AsyncStorage.getItem('potraces.pendingReferralCode')) return;  // already pending/consumed
  const play = await readPlayReferrer();          // Android only
  if (play) { await storePending(play); return; } // silent, no confirm
  const clip = await readClipboardReferrer();      // iOS + Android fallback
  if (clip) { stageForConfirm(clip); return; }     // needs visible confirm before storePending
  // else: the Onboarding manual field handles it.
}
```

`storePending` writes `{ code, source, capturedAt: Date.now() }`. `stageForConfirm` holds the clipboard candidate and signals Onboarding to render the confirm; only "use this code" calls `storePending`. Deep links (`potraces://add?ref=CODE` / `https://jejakbaki.my/?ref=CODE`) are read via `Linking.getInitialURL()` + the `url` event, parsed by `parseRefFromQuery`, and stored as `{ source:'deeplink' }` (wire alongside the existing `potraces://add` quick-add link). After a successful post-sign-in `registerReferral`, Onboarding clears `potraces.pendingReferralCode` (read-once) but leaves the `*_DONE_KEY` run-once guards.

### 6.5 Launch-blocking placeholders to resolve
- Real Android `applicationId` (the `id=` in the Play URL) — read from `app.json`.
- Real numeric iOS App Store ID (the `id…` in the App Store URL) — from App Store Connect after approval.
- Pin a concrete `react-native-play-install-referrer` version and **build-verify** on the first EAS dev build.
- `site/privacy.html` discloses: Android install-referrer read, iOS clipboard read on first open (own-Supabase only, no third-party MMP).

**Sources (web-verified June 2026):** [react-native-play-install-referrer — npm](https://www.npmjs.com/package/react-native-play-install-referrer) · [uerceg/play-install-referrer-react-native — GitHub](https://github.com/uerceg/play-install-referrer-react-native) · [Expo SDK 54 changelog (RN 0.81, New Arch)](https://expo.dev/changelog/sdk-54) · [Expo New Architecture interop](https://docs.expo.dev/guides/new-architecture/).

---

## 7. Copy deck — EN + casual BM

All app strings live under a new `referral` namespace in `src/i18n/en.ts` (typed source — add keys here first or TypeScript errors) and `src/i18n/ms.ts` (implements `Translations`). Placeholders use the existing `{token}` convention (`{currency}`, `{date}`, `{n}`, `{code}`). BM follows the casual/gen-z register (jom, nak, dah, member, share, cek) — never stiff textbook BM. No banned vocab (no profit/loss/revenue). Honest framing — "joined" / "started using it", never "installed" (install is not observable).

### 7.1 Onboarding — "got an invite code?" step (`referral.onboard`)

| key | EN | BM (casual) |
|---|---|---|
| `referral.onboard.title` | Got an invite code? | Ada kod jemputan? |
| `referral.onboard.subtitle` | If a friend shared Potraces with you, pop their code in. Totally optional. | Kalau member share Potraces dekat kau, masukkan kod dia. Optional je. |
| `referral.onboard.label` | invite code | kod jemputan |
| `referral.onboard.placeholder` | e.g. a1b2c3 | cth. a1b2c3 |
| `referral.onboard.foundTitle` | We found an invite code | Kami jumpa kod jemputan |
| `referral.onboard.foundBody` | Looks like {code} was shared with you. Use it? | Macam ada orang share kod {code} dekat kau. Nak guna? |
| `referral.onboard.foundUse` | use this code | guna kod ni |
| `referral.onboard.foundDismiss` | not now | tak payah |
| `referral.onboard.skip` | skip | langkau |
| `referral.onboard.continue` | continue | teruskan |
| `referral.onboard.success` | Nice — your friend gets credit once you start using Potraces. | Ok dah — member kau dapat kredit bila kau start guna Potraces. |
| `referral.onboard.invalidHint` | We don't recognise that code — you can skip this and add it later. | Kod tu kami tak cam — boleh langkau dulu, masukkan nanti pun boleh. |
| `referral.onboard.selfHint` | That's your own code — invite a friend with it instead. | Itu kod kau sendiri — guna untuk ajak member je. |
| `referral.onboard.alreadyHint` | You've already used an invite code. | Kau dah pakai satu kod jemputan. |

### 7.2 InviteScreen (`referral.invite`) — data from `referral_progress()`

Header + code/link:

| key | EN | BM |
|---|---|---|
| `referral.invite.title` | Invite friends | Jemput kawan |
| `referral.invite.subtitle` | Bring 3 friends who start using Potraces and you get 1 month of Premium — free. | Bawa 3 member yang start guna Potraces, kau dapat 1 bulan Premium — free. |
| `referral.invite.yourCodeLabel` | your invite code | kod jemputan kau |
| `referral.invite.yourLinkLabel` | your invite link | link jemputan kau |
| `referral.invite.tapToCopyCode` | tap to copy | tekan untuk salin |
| `referral.invite.codeCopied` | Code copied | Kod disalin |
| `referral.invite.linkCopied` | Link copied | Link disalin |

Action buttons:

| key | EN | BM |
|---|---|---|
| `referral.invite.shareBtn` | Share | Share |
| `referral.invite.copyBtn` | Copy link | Salin link |
| `referral.invite.whatsappBtn` | Share on WhatsApp | Share di WhatsApp |
| `referral.invite.shareFailed` | Couldn't open the share sheet — try copying the link instead. | Tak boleh buka share — cuba salin link je. |

Progress tracker (`{n}` = `cycle_progress`):

| key | EN | BM |
|---|---|---|
| `referral.invite.progressLabel` | {n} of 3 friends joined | {n} dari 3 member dah join |
| `referral.invite.progress0` | No one yet — share your link to get started. | Belum ada lagi — share link kau, jom mula. |
| `referral.invite.progress1` | 1 friend's in. 2 more to unlock 1 month Premium. | 1 member dah masuk. 2 lagi nak unlock 1 bulan Premium. |
| `referral.invite.progress2` | 2 down, 1 to go — almost there. | 2 dah, tinggal 1 — dah nak sampai. |
| `referral.invite.progress3` | 3 friends joined — Premium unlocked. | 3 member dah join — Premium dah unlock. |
| `referral.invite.pendingNote` | {n} more invited but not counted yet — they count once they start using Potraces. | {n} lagi dah dijemput tapi belum dikira — dikira bila dia orang start guna Potraces. |

"What counts" explainer:

| key | EN | BM |
|---|---|---|
| `referral.invite.whatCountsTitle` | What counts | Apa yang dikira |
| `referral.invite.whatCountsBody` | A friend counts when they install Potraces with your code and log their first real entry that sticks for a couple of days. That keeps it fair — no empty accounts. | Member dikira bila dia install Potraces guna kod kau dan catat entri betul pertama yang kekal dua tiga hari. Supaya adil — takde akaun kosong. |
| `referral.invite.whatCountsIos` | On iPhone, friends just enter your code when they set up — that's all it takes. | Untuk iPhone, member just masukkan kod kau masa setup — itu je. |
| `referral.invite.whatCountsStacks` | It stacks: every 3 friends is another month. | Boleh tambah: setiap 3 member, sebulan lagi. |

Reward-unlocked celebration:

| key | EN | BM |
|---|---|---|
| `referral.invite.unlockedTitle` | 1 month of Premium, unlocked | 1 bulan Premium, dah unlock |
| `referral.invite.unlockedBody` | 3 friends started using Potraces because of you. Thank you — that genuinely helps us grow. | 3 member start guna Potraces sebab kau. Terima kasih — betul-betul tolong kami berkembang. |
| `referral.invite.unlockedCta` | Nice | Best |
| `referral.invite.keepGoing` | Invite 3 more for another free month. | Ajak 3 lagi untuk sebulan free lagi. |

Premium-active state (`{date}` device-locale):

| key | EN | BM |
|---|---|---|
| `referral.invite.premiumActive` | Premium active · until {date} | Premium aktif · sampai {date} |
| `referral.invite.premiumActiveLong` | Your Premium is on until {date}. Earn more months by inviting friends. | Premium kau on sampai {date}. Dapat lagi bulan dengan ajak member. |
| `referral.invite.premiumEndingSoon` | Premium ends {date} — invite 3 friends to keep it going. | Premium habis {date} — ajak 3 member untuk sambung. |

Sign-in gate:

| key | EN | BM |
|---|---|---|
| `referral.invite.signInTitle` | Sign in to get your code | Log masuk untuk dapat kod kau |
| `referral.invite.signInBody` | Your invite code is tied to your account so we can credit you. Sign in once and it's yours for good. | Kod jemputan kau terikat dengan akaun supaya kami boleh kredit kau. Log masuk sekali, kekal selamanya. |
| `referral.invite.signInCta` | Sign in | Log masuk |

### 7.3 WhatsApp / share message (`referral.share`)

Replaces the hardcoded EN `referralMessage(code)` in `src/services/referrals.ts` — pull via `useT()` at call time so it follows `settingsStore.language`. `{code}` = invite code, `{url}` = `https://jejakbaki.my/?ref={code}`.

| key | EN | BM |
|---|---|---|
| `referral.share.message` | I'm using Potraces — a calm money app made for Malaysia (RM, wallets, receipts, all in BM or English). Use my code {code} when you set up: {url} | Aku guna Potraces — app duit yang calm, buat khas untuk Malaysia (RM, wallet, resit, semua dalam BM ke English). Guna kod aku {code} masa setup: {url} |
| `referral.share.subject` | Try Potraces | Cuba Potraces |

### 7.4 Admin "Referrals" tab — `site/admin.html` (EN only)

Maps to `admin_referral_leaderboard()` columns. Plain `data-en` / static EN, no `data-bm`.

| Element | EN |
|---|---|
| Tab label | Referrals |
| Stat — total referrers | Referrers |
| Stat — qualified installs | Qualified installs |
| Stat — rewards earned | Rewards earned |
| Stat — avg per referrer | Avg per referrer |
| List title | Top referrers |
| Column — contact/code | Referrer |
| Column — waitlist invites | Waitlist invites |
| Column — qualified | Qualified |
| Column — reward chip (≥3) | Reward earned |
| Column — premium until | Premium until {date} |
| Row drill-down header | Friends brought in |
| Empty (pre-launch) | No installs yet — showing waitlist invites. Real reward credits appear after launch. |
| Empty (no data) | No referrals yet. |
| Export button | Export CSV |
| CSV header | referral_code,referred_count,qualified_installs,reward_earned |
| Loading | Loading referrals… |
| Error | Couldn't load referrals — refresh to try again. |

### 7.5 Site launch "Get the app" CTA + premium-promise line (`site/index.html`, `data-en`/`data-bm`)

The honest interim share line (`shareLblEn`/`shareLblBm`) stays pre-launch. Launch-time additions:

| var | EN | BM |
|---|---|---|
| `getAppLbl` | Get the app | Dapatkan app |
| `getAppCodeNote` | Your invite code {code} is copied — paste it when you set up the app. | Kod jemputan kau {code} dah disalin — tampal masa setup app nanti. |
| `getAppCodeManual` | Didn't auto-fill? Enter {code} in the app yourself. | Tak auto-isi? Masukkan {code} dalam app sendiri. |
| `storeAndroid` | Get it on Google Play | Dapatkan di Google Play |
| `storeIos` | Download on the App Store | Muat turun di App Store |

Optional premium-promise line (add only once D1 settled + reward committed):

| var | EN | BM |
|---|---|---|
| `premiumPromise` | Bring 3 friends who start using it and you get 1 month of Premium, free. | Bawa 3 member yang start guna, kau dapat 1 bulan Premium, free. |
| `premiumPromiseFine` | Friends count once they sign in and log their first entry. | Member dikira bila dia log masuk dan catat entri pertama. |

### 7.6 Implementation notes
- Add the `referral` namespace to **both** files; `en.ts` first (typed source).
- `referral.share.message` must be pulled via the i18n object at call time; change `referralMessage(code)` in `src/services/referrals.ts` to accept the translated template and interpolate `{code}`/`{url}`.
- Align the URL form: `referrals.ts` currently builds a `/r/{code}` path — change to the single `?ref=` form (`https://jejakbaki.my/?ref={code}`) the launch CTA's `&referrer=ref%3D{code}` parse expects.
- `{date}` is formatted by the caller in device locale before interpolation (consistent with `seller.endedOn`).
- "entry" / "real entry" is used instead of "transaction" in user-facing reward copy — calm and plain, still accurate.

---

## 8. Fraud guards (pragmatic set — deter casual abuse, no enterprise stack)

| Vector | Guard | Where |
|---|---|---|
| Self-referral | resolved referrer `= auth.uid()` → reject (both register and pending-promote paths) | `register_referral`, `_reconcile_pending_for_code` |
| Double-counting one person | `referrals_unique_per_referred` + `pending_referrals_unique_per_referred` | schema |
| Double-spending the same 3 | `counted_for_grant_id` — a referral counts toward exactly one grant | `grant_referral_reward` |
| Empty-account farming | qualify only on first txn + 48h survival (`first_activity_at`) + min account age | `qualify_referral` |
| N accounts, one phone | dedupe `phone_e164` — Nth same-phone account can't *qualify* | `qualify_referral` |
| Burner gmail aliases | normalize gmail (`.`/`+alias` stripped) into `email_norm`; same can't qualify twice | `qualify_referral` |
| Device farm | dedupe `device_id` (already collected) against qualified referrals | `qualify_referral` |
| Grant race (two qualify at once) | `pg_advisory_xact_lock(hashtextextended(referrer))` + `for update` on consumed rows | `grant_referral_reward` |
| IP cluster | soft flag only (don't auto-reject) — v2, needs edge fn for IP | review |
| Code harvesting | opaque outcomes (`{ok:false,reason}`), never enumerate | all RPCs |
| Churn after credit | grant consumes the referral; **no clawback** if referred deletes account later | grant logic |

**Out of scope (overbuild pre-launch):** Play Integrity / App Attest, velocity ML, paid fingerprint SDKs. The device+phone+email+txn-survival quad makes farming tedious; a 1-month payout is low motivation. Add a soft cap / manual review only if a single referrer crosses many credits fast. IP-cluster detection is explicitly v2 (RPCs can't see client IP).

---

## 9. Edge cases & failure modes

"Silent" = the user never sees an error; the system recovers or no-ops. Nothing here contradicts D1–D4.

### 9.1 Attribution seam (the load-bearing bridge)

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A1 | Referrer installs with a different contact than they waitlisted with | Auto-claim matches `waitlist` by canonicalized phone/email; a different contact = no match | Auto-claim silently finds nothing — not an error. InviteScreen offers "I have an older invite link" → `claim_waitlist_code(p_code)` manual. A fresh app `user_profiles.referral_code` is always minted, so the referrer is never code-less. | `claim_waitlist_code`, InviteScreen |
| A2 | Referred friend installs before the referrer (D4) | `register_referral` resolves a waitlist code whose `claimed_user_id IS NULL` | Park `pending_referrals`, no `referrals` row yet. When the referrer runs `claim_waitlist_code`, `_reconcile_pending_for_code` drains it into `referrals` `status='pending'`. The friend's own qualification proceeds independently. | `register_referral`, `claim_waitlist_code` |
| A3 | Referrer never installs | Parked credit has no destination | `pending_referrals` rows sit harmlessly; convert only on a successful claim. No grant can fire (grant counts `referrals`, not `pending_referrals`). | schema |
| A4 | Code claimed by the wrong account | A pastes B's waitlist code | Claim succeeds only when `claimed_user_id IS NULL`; once claimed, later attempts return opaque "claimed_by_other". The partial-unique index guarantees one app account ↔ one waitlist row. A manual mis-paste transfers a graph position, not money; self-referral guard still protects. | `claim_waitlist_code` |
| A5 | Two people legitimately waitlisted with the same shared contact | Canonicalized contact collides | Auto-claim binds the first; the second falls to manual paste of their own printed code. Rare, recoverable. | auto-claim, manual |

### 9.2 Identity, reinstall, deletion

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A6 | Referred user reinstalls | New `getDeviceId()` after uninstall | `referrals_unique_per_referred` keys on `auth.users.id`, not device. Same account → insert is a no-op on conflict. New device_id is an additional signal, not a second credit. | schema |
| A7 | Referred user deletes account after referrer was credited | `on delete cascade` removes the referral row | **No clawback.** `premium_grants` + `entitlements` are untouched (no FK from ledger to live referral). The earned month stands. | grant logic |
| A8 | Referrer deletes account | cascade wipes their `referrals`, `entitlements`, `premium_grants` | Expected; entitlement dies with the account. Pending friends' rows survive but resolve to a deleted-then-claimed waitlist row → harmlessly orphaned. | schema |
| A9 | One person makes N accounts on one phone to farm | Multiple `auth.users.id` from one device/phone | Each can register (pending), but **qualification** dedupes on `phone_e164`/`email_norm`/`device_id`. The Nth same-identity account flips to `rejected` silently. | `qualify_referral` |
| A10 | Reinstall re-fires `register_referral` with a stale clipboard code | Fresh-install clipboard re-read | Idempotent per `referred_user_id`. A second call (any code) is a silent no-op; first attribution wins. | `register_referral` |

### 9.3 Entitlement & premium clock

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A11 | Clock skew on `premium_until` | Client compares `premiumUntil > now()` locally | The **server** is the only writer (`now()` = trusted). Local `tier` is advisory between reads; the next online read re-pins to server. Never *write* expiry from the client. | `entitlements`, `reconcileEntitlement` |
| A12 | Entitlement read fails offline | `refreshEntitlement()` can't reach Supabase | Keep the last-reconciled `premiumUntil` from AsyncStorage. `isPremium()` evaluates against the cached date so a paid user keeps premium offline. A failed read **never** downgrades — only a *successful* read showing expiry does. | `refreshEntitlement`, persistence |
| A13 | Spoofed local `tier='premium'` (the pre-launch reality) | Edited AsyncStorage / old build | First successful `refreshEntitlement()` → no row or past `premium_until` → `reconcileEntitlement(null)` resets to free. Server wins on a successful read. | `reconcileEntitlement` |
| A14 | Granted user sees nothing | Grant fired before reconcile shipped | **Hard rule (§5.7 / §12):** `premiumStore` reconcile MUST be live before any grant RPC is enabled. The rollout gate enforces ordering. | rollout |
| A15 | `premium_until` stacks wrong / overwrites (D3) | Naive `set premium_until = now()+30d` | Upsert math is `greatest(now(), coalesce(premium_until, now())) + interval '30 days'`. Idempotency: grant is driven off consuming `counted_for_grant_id IS NULL` in the same txn as the ledger insert — a replay finds no uncounted triple and no-ops. | `grant_referral_reward` |

### 9.4 Reward grant integrity

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A16 | Reward grant race (two qualify, both see 3) | Concurrent `qualify_referral` → grant | `pg_advisory_xact_lock(hashtextextended(referrer))` serializes per referrer; `for update` on candidate rows + stamping `counted_for_grant_id` means each referral is consumed once. The loser finds <3 uncounted and no-ops. | `grant_referral_reward` |
| A17 | 6 qualified at once | Batch qualification | Loop while `count(uncounted qualified) >= 3` → one `premium_grants` row + 30 days per triple → 6 = 2 grants = 60 days; remainder uncounted. | `grant_referral_reward` |
| A18 | Qualify fires but row is `rejected` by fraud gate | Same-phone/device farm caught | `qualify_referral` flips `pending→rejected` and returns **before** calling the grant. Silent to both parties. | `qualify_referral` |
| A19 | Progress shows 2/3 then drops to 1/3 | A qualified referral reversed | Cannot happen — once `qualified`, never un-qualified (no clawback). Progress is monotonic to a grant, then resets to 0/3 (consumed rows carry `counted_for_grant_id`); copy explains the reset. | by design |

### 9.5 Transaction-survival gate (D2)

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A20 | User edits the qualifying txn within 48h | Edit changes content, row persists | Qualification keys on *existence* of an asserted first activity surviving 48h, not content. An edit is immaterial. | `qualify_referral` |
| A21 | User deletes the qualifying txn within 48h | The one real action undone | The client only re-asserts after onboarding + a real local txn; if deleted, the client doesn't re-call and the server stays `pending`. A later surviving txn qualifies then. Defeats add-then-delete farming. | client + `qualify_referral` |
| A22 | Personal sync disabled (`personalSyncEnabled=false`, default) so the server never sees the txn | Txn lives only locally | `qualify_referral` does **not** depend on synced txn rows. The client asserts "onboarding done + ≥1 local txn aged 48h"; the server gates on `first_activity_at` ≥48h + account-age + fraud quad rather than reading a synced txn table. Matches "entitlement refresh independent of `personalSyncEnabled`". | `qualify_referral` |
| A23 | User qualifies but onboarding referral entry was skipped | Referral step is skippable | Skipping *code entry* ≠ skipping onboarding. A referred user who skipped entering a code has no `referrals` row and credits no one — expected (the iOS reality). | by design |

### 9.6 Clipboard / pre-fill

| # | Situation | Cause | Expected handling | Owner |
|---|---|---|---|---|
| A24 | Clipboard holds a stale `POTRACES-REF:` token | Old token still on clipboard | Pre-fill is suggestive, behind a visible confirm; user can clear it. A wrong-but-real code is low-harm; an unresolvable code = quiet hint, never blocks. | `referralAttribution`, Onboarding |
| A25 | Clipboard holds unrelated text | User copied something else | Only exact `POTRACES-REF:<code>` strings are offered; non-matching content is ignored entirely. | token guard |
| A26 | Play referrer and clipboard disagree | Referrer says X, clipboard says Y | Prefer **Play referrer** on Android (deterministic). Order: play_referrer → deeplink → clipboard → manual. | `captureReferralOnLaunch` |
| A27 | iOS "pasted from" banner on clipboard read | iOS 14+ paste transparency | Expected and acceptable *because* the read is user-initiated behind the confirm UI. Never read clipboard silently at launch on iOS. | `readClipboardReferrer` |

---

## 10. Test plan

### 10.1 Unit tests (store logic / pure functions)

`premiumStore`:
- `reconcileEntitlement(null)` → `tier='free'`, `premiumUntil=null` (spoof reset, A13).
- `reconcileEntitlement(future)` → `tier='premium'`, `isPremium()===true`.
- `reconcileEntitlement(past)` → `tier='free'`, `isPremium()===false` (expiry enforced — new behavior).
- `isPremium()` is `tier==='premium' && (!premiumUntil || premiumUntil > now())`; offline path with a cached future date + `refreshEntitlement()` throwing stays true (A12); a *successful* past-date read downgrades.
- `partialize`/`onRehydrateStorage` round-trips `premiumUntil` ISO↔Date without NaN (`sd()` guard).
- CI grep assertion: all ~32 gate sites resolve through `isPremium()`, not a raw `tier==='premium'`.

Parsing:
- `parseRefFromQuery('ref=a1b2c3d4&x=1')==='a1b2c3d4'`; rejects organic `utm_*`.
- Clipboard guard accepts `POTRACES-REF:a1b2c3d4`, rejects empty/random/bare-code.
- Resolution order returns play_referrer over clipboard over manual (A26).

### 10.2 Integration tests (RPCs, pgTAP / test project)

`claim_waitlist_code`: auto-match by canonicalized phone (`+60123…`/`0123…`/`012 3…` all bind); manual paste binds when `claimed_user_id IS NULL`; second claim by another uid → opaque "claimed_by_other" (A4); drains `pending_referrals` (A2); idempotent re-run.
`register_referral`: app code → referrer; claimed waitlist code → `claimed_user_id`; unclaimed → parks pending (A2); self-referral → rejected; duplicate per `referred_user_id` → no-op (A6/A10); unknown code → opaque; snapshots `device_id`.
`qualify_referral`: first call stamps `first_activity_at` ('activity_recorded'); <48h → 'too_soon'; ≥48h + clean → `qualified`, calls grant; same `phone_e164` as a qualified account → `rejected` (A9); gmail-alias collision → `rejected`; deleted-only-txn (client stops re-calling) stays `pending` (A21); idempotent on already-qualified.
`grant_referral_reward`: exactly 3 → 1 grant, +30d, 3 stamped (A16); 6 → 2 grants, +60d (A17); 2 → no grant; stacking adds on top of a future `premium_until` (A15); concurrency: two parallel grants for one referrer with 4 qualified → exactly one grant, one left uncounted; grant audit: callable only by `service_role`, not `anon`/`authenticated`.
`referral_progress`: returns `{ code, qualified_count, pending_count, cycle_progress, needed:3, premium_until, is_premium }`; `cycle_progress` resets after a grant (A19).
RLS/security: `anon`/`authenticated` cannot `select` `entitlements` (except own), `premium_grants`, `pending_referrals`, `referral_account_signals`; direct `insert`/`update` on `referrals` from a client is denied; minting uses `gen_random_uuid()` (never `gen_random_bytes()`).

### 10.3 Fraud cases from §8 as explicit tests

| §8 vector | Test |
|---|---|
| Self-referral | own code → rejected |
| Double-count one person | second register for same `referred_user_id` → no-op |
| Double-spend same 3 | replay grant → no second grant |
| Empty-account farming | qualify with no surviving txn → stays pending |
| N accounts one phone | 2nd same-`phone_e164` qualify → rejected |
| Burner gmail aliases | normalized collision → rejected |
| Device farm | (N+1)th qualify same `device_id` → rejected |
| Code harvesting | unknown/own-contact probe → opaque outcome |
| Churn after credit | delete referred account post-grant → entitlement/grant untouched (A7) |

### 10.4 End-to-end (two devices/accounts)
1. **Happy Android:** R waitlists → shares → F1 installs via Play (referrer URL) → silent pre-fill → onboards + 1 txn → wait 48h → qualify → repeat F2, F3 → on F3, R's `premium_until` = now+30d, InviteScreen flips, tracker resets.
2. **Happy iOS:** same via clipboard token + visible confirm (no install referrer).
3. **Pending-then-reconcile (D4):** F1 installs+qualifies before R installs → parked → R claims → grant re-evaluates.
4. **Manual-paste recovery (A1):** R installs with a different contact → auto-claim misses → R pastes printed code → claim succeeds.
5. **Spoof reset (A13):** sideload `tier='premium'` with no `entitlements` row → launch → downgrades to free.
6. **Offline hold (A12):** earn premium, airplane mode, relaunch → still premium against cached date.
7. **Stacking (A17):** drive 6 qualified → 2 months.

### 10.5 Manual pre-launch script (real Android + real iOS)
1. Fresh install, no code → referral step skippable, setup completes. ✔
2. Install via a real `?ref=` link on Android → silent pre-fill from install referrer. ✔
3. iOS: copy `POTRACES-REF:CODE`, open app → "We found an invite code" confirm; accept pre-fills, decline clears. ✔
4. Enter an invalid code → quiet bronze hint, no red, setup completes. ✔
5. Onboard + add one txn → referrer's InviteScreen shows pending → after 48h + qualify, qualified count ticks up. ✔
6. Reach 3 → calm unlock celebration + "premium active until <date>"; premium gates (extra wallets/budgets, unlimited AI/scans) actually unlock. ✔
7. Kill app, relaunch offline → premium persists. ✔
8. Sign out / into a fresh account → entitlement re-reads, no premium leakage. ✔
9. Admin: open `site/admin.html` Referrals tab → pre-launch empty state; after a test grant, leaderboard + CSV show the referrer. ✔
10. BM toggle → every referral string translated, casual tone, no banned vocab. ✔

---

## 11. Metrics & analytics

All metrics are derived **server-side** from the new tables (no third-party MMP SDK — §13). The funnel is reconstructable from `waitlist`, `referrals`, `pending_referrals`, `premium_grants`, `entitlements`, `referral_account_signals`, surfaced via `admin_referral_leaderboard()` + ad-hoc admin queries.

### 11.1 Funnel

| Stage | Definition | Source |
|---|---|---|
| Codes minted | distinct `waitlist.referral_code` + `user_profiles.referral_code` | waitlist + user_profiles |
| Link shares | *not server-observable* (client-side share sheet) — optional client count, directional only | client (optional) |
| Installs (attributed) | `register_referral` calls that resolved a code | `referrals` + `pending_referrals` inserts |
| Installs (unattributable) | iOS installs with no code entered — **structurally invisible**; report as "unknown", never zero | — |
| Sign-ins with code | `referrals` rows created (any status) | `referrals` |
| Qualified | `referrals.status='qualified'` | `referrals` |
| Rejected (fraud) | `referrals.status='rejected'` | `referrals` |
| Pending (parked) | `pending_referrals` not yet drained | `pending_referrals` |
| Rewards granted | `premium_grants` rows (`reason='referral_3'`) | `premium_grants` |
| Active premium from referral | `entitlements where source='referral' and premium_until > now()` | `entitlements` |

Headline ratios: attributed-install → signed-in-with-code; signed-in → qualified (the D2 gate's pass rate); qualified ÷ 3 → grants; rejected ÷ signed-in (fraud pressure).

### 11.2 Per-referrer view

From `admin_referral_leaderboard()` (gated by `is_admin()`): `contact/code`, `waitlist_referrals`, `qualified_installs`, `installs_pending`, `reward_earned` (≥3), `months_earned`, `premium_until`, sorted desc. CSV: `referral_code, referred_count, qualified_installs, reward_earned`.

### 11.3 Abuse review signals (not auto-rejects)
- One referrer crossing many qualified installs fast (e.g. >9 in a short window) → soft flag for manual review.
- `device_id` repeated across many referred accounts → device-farm signal.
- `phone_e164` / `email_norm` clusters → multi-account-one-person.
- High `rejected` rate for a single referrer → farming attempt.
- `pending_referrals` pile-up under one unclaimed code → popular pre-install referrer (good) or seeded farm (review on claim).
- Grant velocity vs qualify velocity divergence → reconcile against the `premium_grants` ledger.

IP-cluster detection is deferred to v2 (needs an edge function for IP; RPCs can't see client IP) — soft flag only when added.

---

## 12. Rollout timeline

The cardinal rule: **server entitlement + `reconcileEntitlement` ship and are live before any grant RPC is enabled**, or grants are cosmetic and the spoofable flag still rules.

### Phase 0 — Pre-launch foundation (build now, no user-visible reward yet)
1. **Migration `20260622000000_referral_rewards.sql`** — `entitlements`, `premium_grants`, `pending_referrals`, `referral_account_signals`, `waitlist.claimed_user_id` bridge + partial unique index, `referrals` lifecycle columns; RLS-on/no-client-policy per `ai_proxy_usage`; all minting via `gen_random_uuid()`. *Verify:* pgTAP RLS + §10.2 green.
2. **`premiumStore` reconciliation** — `premiumUntil`, `reconcileEntitlement`, derived `isPremium()`, route ~32 gate sites through store internals, persist `premiumUntil`. *Verify:* §10.1; spoof-reset + offline-hold pass. **Must be live in a shipped build before Phase 1 step 7.**
3. **`refreshEntitlement()`** wired at `App.tsx:120` and `:261`, **independent of `personalSyncEnabled`**. *Verify:* signed-in launch reads `entitlements`; failure path keeps cache.
4. **Interim site copy fix** (already shipped) — "jump the queue" → honest share copy. *Verify:* live site.
5. **`claim_waitlist_code` + profile auto-claim trigger + `register_referral`** (parks pending when referrer absent). *Verify:* §10.2 claim/register/pending tests.

### Phase 1 — At launch
6. **Onboarding referral step** + Android **Play Install Referrer** + **`expo-clipboard`** confirm read. *Verify:* §10.5 steps 1–4 on real devices.
7. **`qualify_referral` + `grant_referral_reward`** enabled, **after** Phase 0 steps 2–3 are confirmed live (the cardinal gate). Qualify trigger wired into the first-txn path. *Verify:* §10.4 scenarios 1–3, 7.
8. **InviteScreen** with `referral_progress()` 3-pip tracker + honest "what counts" + calm celebration. *Verify:* §10.5 steps 5–6, 10.
9. **i18n** EN+BM for all of the above. *Verify:* BM toggle, §10.5 step 10.
10. **`site/privacy.html`** discloses referral tracking + clipboard read. *Verify:* legal copy present before any clipboard read ships.

### Phase 2 — Post-launch (operability, not blocking)
11. **Admin Referrals tab + CSV** (reads `admin_referral_leaderboard()`), pre-launch empty-state. *Verify:* §10.5 step 9.
12. iOS clipboard auto-fill UX polish.
13. **`ip_hash` via edge function** — only if abuse appears.
14. **Play Integrity / App Attest** — only if real farming emerges.
15. **IAP path** writes the same `entitlements` row with `source='iap'` when billing ships (no migration — `source` already exists).

**Dependency graph:** `migration → premiumStore reconcile → refreshEntitlement (live in a shipped build) → register/claim/pending → [LAUNCH] → onboarding+attribution → qualify+grant (gated on reconcile being live) → InviteScreen → i18n+privacy → admin/IP/attestation (post)`.

---

## 13. PDPA & privacy

Anchored to the legal-regulatory-risk memo (PDPA 2024) and the deliberate choice to stay on **own-Supabase only, no third-party MMP SDK**.

- **Clipboard read disclosure.** Read via `expo-clipboard.getStringAsync()` **only** on the onboarding referral step (never silently at launch), and only the `POTRACES-REF:` token is acted on, behind a visible "We found an invite code — use it?" confirm. `site/privacy.html` + in-app copy disclose: *we may read your clipboard once, during sign-up, to detect an invite code you copied — nothing else is read, stored, or sent.* No background polling.
- **`device_id` reuse (data minimization).** Reuse the already-collected `getDeviceId()` (`potraces.deviceId`, already `x-device-id` → ai-proxy). **No new identifier, no tracking SDK, no advertising ID** — the referral feature collects zero new device data. `device_id` is snapshotted into `referral_account_signals` (RLS-on, no client policy), used solely to cap farming.
- **IP-hash deferral.** v1 skips `ip_hash` (RPCs can't see client IP). If added later, hashed with a **server-only salt, never raw**. The most privacy-invasive signal, deliberately last.
- **Data retention.** `referral_account_signals`: normalized contents, access-locked to service/admin; recommend a periodic purge older than the dispute window (~12 months). `premium_grants`: append-only audit, lifetime of account. `pending_referrals`: cheap, until drained/deleted; orphans swept periodically. `entitlements`: lives with the account. On **account deletion**, `on delete cascade` removes the user's `referrals`, `entitlements`, `premium_grants`, signal rows — a clean "right to erasure" path (counterparties' rows unaffected; no clawback, A7).
- **Consent copy (casual EN+BM).** Onboarding: *"Got an invite code from a friend? Pop it in — they get a thank-you, and you're set. (You can skip this.)"* / *"Ada kod ajak dari kawan? Letak je kat sini — diorang dapat ganjaran kecik. (Boleh skip pun.)"* Clipboard confirm: *"We found an invite code on your clipboard. Use it?"* / *"Kami jumpa kod ajak dalam clipboard. Nak guna?"* Reward copy credits *"a friend who installs and gets started,"* not "an install."
- **Why staying off third-party MMP SDKs simplifies consent.** A paid MMP (Branch/AppsFlyer/Adjust) is a third-party data processor under PDPA 2024: it needs a processor disclosure, a cross-border transfer basis, and consent for a new tracking SDK — all for a 3-install counter. Keeping everything on our own Supabase (`iydqeeonaljqapulboaz`) keeps the flow inside the processor we already disclose, with the same RLS/security-definer discipline as `ai_proxy_usage`. The consent story collapses to one sentence ("own backend, no outside trackers"); no IDFA/GAID, no fingerprinting — which is *why* iOS web→install attribution is genuinely impossible rather than "fixable with an SDK."

---

## 14. MVP vs later

### MVP (smallest version that works AND is honest)
1. **Server entitlement** (`entitlements` + `reconcileEntitlement`) — required regardless; without it the grant is cosmetic and spoofable.
2. **Manual/pre-filled invite-code field** at onboarding + `register_referral` — the universal floor (both platforms).
3. **Android Play Install Referrer** pre-fill — free silent win.
4. **Qualify on first transaction** + `grant_referral_reward` (3 → 30 days, stacks).
5. **`claim_waitlist_code` bridge** + profile auto-claim so pre-launch shares survive launch.
6. **InviteScreen** with honest 0/3 → 3/3 progress; interim site copy fix (already shipped).
7. Self-referral + unique-per-referred + 48h-survival fraud guards.

### Later
- iOS clipboard auto-fill polish (`POTRACES-REF:` token + visible confirm — partly MVP).
- `ip_hash` via an edge function (only if abuse appears).
- Admin Referrals tab + CSV (operability, not user-facing).
- Two-sided reward (friend also gets something) — doubles cost + fraud surface; only if the founder wants it.
- IAP path writes the same `entitlements` row with `source='iap'` when real billing ships.
- Play Integrity / App Attest if farming becomes real.

---

## 15. Decisions (D1–D4)

**Genuinely-hard parts (be honest):**
- **iOS web→install attribution is impossible** by Apple policy (no referrer API; fingerprinting banned May 2024). Some legit iOS referrals are unattributable unless the friend uses the code. No free fix; a paid SDK doesn't change the iOS reality.
- **The waitlist→app bridge is the single load-bearing seam.** If the referrer/friend installs with a different contact than they waitlisted with, auto-claim fails — recovered only by manual paste (`claim_waitlist_code`). Must be tested explicitly (A1, §10.4 scenario 4).
- **`premiumStore` reconciliation must ship before any grant fires**, or granted users see nothing and the client still trusts its local flag (A14, the cardinal rollout gate).
- **"Install" is not observable** — the trustworthy unit is "referred user signed in + did one real thing." Reward copy says so, or referrers dispute uncredited installs.

| # | Decision | Resolution |
|---|---|---|
| **D1** | One unified code per person (waitlist code carried into app account) vs. two parallel code spaces? | **Unify.** The link shared for months keeps working at launch. Implemented via `waitlist.claimed_user_id` + `claim_waitlist_code` + profile auto-claim trigger. |
| **D2** | What counts as a "qualified install"? | **Account + first txn surviving 48h.** Client asserts the txn (sync is dormant); server enforces 48h via `first_activity_at` + account-age + fraud quad. |
| **D3** | Does the reward stack / repeat (6 friends = 2 months)? | **Yes, every 3.** `grant_referral_reward` loops; `premium_until = greatest(now(), coalesce(premium_until, now())) + n*30d` stacks cleanly. |
| **D4** | Credit referrals whose referrer hasn't installed yet? | **Yes, park pending.** `pending_referrals` drained at claim time, so an early referrer never loses credit. |

Secondary (low stakes): **no clawback** if a referred user churns after the month is granted; **reward unlocks the full premium tier**, time-boxed, not a weaker subset (one `tier` value, no extra tier complexity).

**Interim copy fix (shipped).** `site/index.html:1600` claimed referrals move you up the queue — they don't. Replaced with honest copy that still surfaces the link: EN `Like Potraces? Share it with a friend:` / BM `Suka Potraces? Share dekat kawan:`. (Add the premium-promise line only once D1 is settled and the reward is committed to ship — §7.5.)

---

## 16. Files touched

**New (Supabase):**
- `supabase/migrations/20260622000000_referral_rewards.sql` — all DDL (§3) + all RPCs (§4) + the profile auto-claim trigger.

**Reuse/alter (Supabase):**
- `supabase/migrations/20260417300000_referrals.sql` (extend `referrals`), `docs/waitlist.sql` (add `claimed_user_id`), `supabase/migrations/20260528000000_…` (`lookup_referral_code`).
- Pattern to copy: `supabase/migrations/20260417200000_ai_usage.sql` + `…ai_proxy_usage.sql`.

**App (RN, Expo SDK 54):**
- New: `src/services/entitlements.ts`, `src/services/referralAttribution.ts`, `src/screens/shared/InviteScreen.tsx`.
- Edit: `src/store/premiumStore.ts` (`premiumUntil` + `reconcileEntitlement` + `isPremium`), `src/types/index.ts` (`PremiumState` += `premiumUntil`/`reconcileEntitlement`/`isPremium`; add `ReferralProgress`), `App.tsx:120`/`:261`/`:270` (refresh + capture hooks), `src/screens/shared/Onboarding.tsx` (referral step), `src/screens/shared/Settings.tsx` (`section:'invite'` + hub row), `src/store/personalStore.ts` (`maybeFireQualify` in `addTransaction`), `src/services/referrals.ts` (locale-aware share message + `?ref=` URL form), `src/i18n/en.ts` + `ms.ts` (`referral` namespace).
- Reuse: `src/utils/deviceId.ts` (`getDeviceId()`), `expo-clipboard@~8.0.8` (installed).
- Add dep: `react-native-play-install-referrer` (autolinked, no config plugin; needs dev/prod build, not Expo Go).
- `app.json`: confirm `potraces://` scheme + `expo-clipboard`; confirm `android.package` for the Play referrer URL.

**Site:**
- `site/index.html` (interim copy fix done; launch "Get the app" CTA + premium-promise line later — §7.5/§6), `site/privacy.html` (clipboard + install-referrer disclosure — §13), `site/admin.html` (Referrals tab + CSV — §4.6/§7.4).
