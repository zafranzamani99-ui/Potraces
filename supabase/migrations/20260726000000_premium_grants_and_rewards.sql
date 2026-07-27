-- ============================================================
-- Potraces — Premium grants ledger ("membership book"), redeem
-- codes, referral rewards, and Collectz install milestone.
--
-- Design discussion + decisions: docs/plans/premium-grants-and-rewards.md
-- Builds on patterns from: docs/research/referral-install-rewards-plan.md
--
-- WHY: premium today is a client-only flag (src/store/premiumStore.ts).
-- This migration creates the SERVER-AUTHORITATIVE record of who has
-- which paid tier until when, and every way that state is granted:
-- redeem codes (admin-minted), referral rewards (double-sided), the
-- Collectz share milestone, beta promise, manual/admin, future IAP.
--
-- THE GATE: during beta the app is deliberately open (no gating).
-- `app_config` carries `premium_gate_on` (false now) and
-- `premium_gate_start` (when the free-day clocks start ticking).
-- A grant redeemed during beta gets starts_at = premium_gate_start,
-- so free days NEVER burn during beta — they activate at launch.
-- The app reads gate state via my_entitlement() and keeps current
-- beta behavior until premium_gate_on = true.
--
-- Idempotent (create ... if not exists / drop policy if exists /
-- create or replace). Safe to re-run.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 0. Tunable parameters (no migration needed to change them).
--    Values are TEXT; parsed by the helpers below.
-- ------------------------------------------------------------
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Server-only feature knobs (premium gate, reward amounts, fraud thresholds). RLS on, no policies — read/written only by security-definer functions.';

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- Older environments created app_config with a json/jsonb value column. Normalize to
-- text (the shape this migration declares and all helpers expect) so the seed insert
-- below works everywhere. Idempotent: no-op where the column is already text.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_config' and data_type in ('json', 'jsonb')
  ) then
    alter table public.app_config alter column value type text using value #>> '{}';
  end if;
end $$;

insert into public.app_config (key, value) values
  -- Launch gate. gate_on=false = beta behaviour (app stays open).
  ('premium_gate_on',           'false'),
  -- Free days never start counting before this timestamp. When a grant
  -- is created before it, starts_at = this date. Move it (BEFORE launch)
  -- via admin_set_gate() if the launch date slips.
  ('premium_gate_start',        '2026-09-01T00:00:00+08:00'),
  -- Double-sided referral reward.
  ('reward_tier',               'pro'),
  ('reward_welcome_days',       '30'),  -- referee, instant on claim
  ('reward_referrer_days',      '30'),  -- referrer, on qualification
  ('reward_cap_per_year',       '12'),  -- max referrer rewards / rolling 365d
  -- Collectz milestone: N qualified collectz-sourced referrals -> one-time grant.
  ('milestone_collectz_count',  '3'),
  ('milestone_collectz_days',   '30'),
  -- Referral claim rules.
  ('claim_window_days',         '14'),  -- account must be younger to claim a code
  ('qualify_account_age_days',  '7'),
  ('qualify_active_days',       '3'),   -- distinct app-open days (server-tracked)
  -- Redeem-code brute-force guard: N failed attempts per window -> locked out.
  ('redeem_max_attempts',       '5'),
  ('redeem_attempt_window_min', '15')
on conflict (key) do nothing;

-- Config helpers. internal only.
create or replace function public._config_text(p_key text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select value into v from public.app_config where key = p_key;
  return v;
exception when others then
  return null;
end $$;

create or replace function public._config_int(p_key text)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public._config_text(p_key)::integer, 0);
exception when others then
  return 0;
end $$;

create or replace function public._config_bool(p_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(public._config_text(p_key), 'false') = 'true';
exception when others then
  return false;
end $$;

create or replace function public._config_ts(p_key text)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
begin
  return public._config_text(p_key)::timestamptz;
exception when others then
  return null;
end $$;


-- ------------------------------------------------------------
-- 1. entitlement_grants — THE membership book.
--    One immutable row per grant. Effective entitlement =
--    highest-tier row covering now() (and not revoked).
--    Stacking: sequential per tier — a new grant starts at the
--    latest active same-tier grant's ends_at (days truly add up).
-- ------------------------------------------------------------
create table if not exists public.entitlement_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tier       text not null check (tier in ('basic', 'pro', 'premium')),
  days       integer not null check (days > 0 and days <= 3700),
  source     text not null check (source in (
               'redeem_code',        -- admin-minted gift code
               'referral_welcome',   -- referee's instant welcome grant
               'referral_reward',    -- referrer's qualified-invite grant
               'collectz_milestone', -- organizer's 3-joins milestone
               'beta_promise',       -- promised 1 month for beta installers
               'admin_manual',       -- founder/support one-off
               'iap'                 -- future: store purchase webhook
             )),
  source_id  text,                  -- redeem code / referral id / session share_code / product id
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,           -- admin kill-switch; NULL = active
  meta       jsonb not null default '{}'::jsonb,
  check (ends_at > starts_at)
);

comment on table public.entitlement_grants is
  'Server-authoritative premium ledger (append-only; revoke via revoked_at, never delete). The app reads effective entitlement via my_entitlement() only — server always wins over the local premiumStore flag once premium_gate_on=true.';
comment on column public.entitlement_grants.starts_at is
  'When the free days start counting = greatest(grant time, premium_gate_start, latest active same-tier grant end). Grants made during beta therefore activate at launch, not before.';

create index if not exists entitlement_grants_user_active_idx
  on public.entitlement_grants (user_id, tier, ends_at)
  where revoked_at is null;

create index if not exists entitlement_grants_source_idx
  on public.entitlement_grants (source, source_id);

alter table public.entitlement_grants enable row level security;

-- Owner-read so the app can show "my rewards" history. No client writes.
drop policy if exists "entitlement_grants_owner_read" on public.entitlement_grants;
create policy "entitlement_grants_owner_read" on public.entitlement_grants
  for select using (auth.uid() = user_id);
revoke all on public.entitlement_grants from anon, authenticated;
grant select on public.entitlement_grants to authenticated;

-- One-time guards (idempotency at the DB level, not just in code):
-- a user can only ever receive one welcome grant and one collectz milestone.
create unique index if not exists entitlement_grants_welcome_once
  on public.entitlement_grants (user_id) where source = 'referral_welcome';
create unique index if not exists entitlement_grants_milestone_once
  on public.entitlement_grants (user_id) where source = 'collectz_milestone';


-- grant_premium — the single write path into the ledger.
-- Internal: called by redeem_code / _lazy_qualify / admin RPCs / future IAP webhook.
create or replace function public.grant_premium(
  p_user_id uuid,
  p_tier    text,
  p_days    integer,
  p_source  text,
  p_source_id text default null,
  p_meta    jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gate  timestamptz;
  v_start timestamptz;
  v_id    uuid;
begin
  if p_user_id is null then raise exception 'grant_premium: user required'; end if;
  if p_tier not in ('basic','pro','premium') then raise exception 'grant_premium: bad tier %', p_tier; end if;
  if p_days is null or p_days <= 0 or p_days > 3700 then raise exception 'grant_premium: bad days %', p_days; end if;

  -- Serialize grants per user so concurrent calls can't double-stack.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_gate := public._config_ts('premium_gate_start');

  select greatest(now(), v_gate, max(g.ends_at))
    into v_start
    from public.entitlement_grants g
   where g.user_id = p_user_id
     and g.tier = p_tier
     and g.revoked_at is null
     and g.ends_at > now();

  insert into public.entitlement_grants
    (user_id, tier, days, source, source_id, starts_at, ends_at, meta)
  values
    (p_user_id, p_tier, p_days, p_source, p_source_id,
     v_start, v_start + make_interval(days => p_days), coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

comment on function public.grant_premium is
  'Internal write path for the entitlement ledger. Sequential stacking per tier: starts at the later of now / premium_gate_start / latest active same-tier ends_at.';

-- ------------------------------------------------------------
-- 2. Redeem codes — admin-minted gift vouchers.
--
-- code is stored CANONICAL: uppercase, no dashes, campaign prefix
-- + 8 random chars (e.g. 'BETA7K4Q9M2X'). The admin page displays
-- it grouped ('BETA-7K4Q-9M2X'); redeem_code() normalizes any
-- user input (spaces/dashes/case) back to canonical form.
-- Alphabet: no 0/O/1/I — same charset as src/services/referrals.ts.
-- ------------------------------------------------------------
create table if not exists public.redeem_codes (
  code       text primary key,
  campaign   text not null default 'GIFT',
  tier       text not null check (tier in ('basic', 'pro', 'premium')),
  days       integer not null check (days > 0 and days <= 3700),
  max_uses   integer not null default 1 check (max_uses > 0),
  use_count  integer not null default 0,
  expires_at timestamptz,           -- code becomes unredeemable after this
  note       text,                  -- admin's own reminder ("June testers batch")
  created_by text,                  -- admin email (from JWT)
  created_at timestamptz not null default now(),
  disabled_at timestamptz           -- admin kill-switch; NULL = live
);

comment on table public.redeem_codes is
  'Admin-minted gift codes. One row per code; redemptions tracked in redeem_redemptions. Codes are free grants only — NEVER sold (App Store 3.1.1: selling codes that unlock app features outside IAP gets apps rejected).';

alter table public.redeem_codes enable row level security;
revoke all on public.redeem_codes from anon, authenticated;

create table if not exists public.redeem_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.redeem_codes(code) on delete cascade,
  campaign    text not null,        -- denormalized for the per-campaign unique below
  user_id     uuid not null references auth.users(id) on delete cascade,
  grant_id    uuid references public.entitlement_grants(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (code, user_id),
  unique (campaign, user_id)        -- one code per person PER CAMPAIGN (leak containment)
);

comment on table public.redeem_redemptions is
  'Audit trail of every code redemption. unique(campaign, user_id) stops one account farming a leaked batch of single-use codes from the same campaign.';

alter table public.redeem_redemptions enable row level security;

-- Owner-read: the app can show "codes you have redeemed".
drop policy if exists "redeem_redemptions_owner_read" on public.redeem_redemptions;
create policy "redeem_redemptions_owner_read" on public.redeem_redemptions
  for select using (auth.uid() = user_id);
revoke all on public.redeem_redemptions from anon, authenticated;
grant select on public.redeem_redemptions to authenticated;

-- Failed-attempt log for the brute-force guard (successes are NOT logged).
create table if not exists public.redeem_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  code_tried   text,
  attempted_at timestamptz not null default now()
);

create index if not exists redeem_attempts_user_idx
  on public.redeem_attempts (user_id, attempted_at desc);

alter table public.redeem_attempts enable row level security;
revoke all on public.redeem_attempts from anon, authenticated;


-- redeem_code — user-facing. Validates and grants in ONE transaction.
-- Opaque-outcome discipline: unknown codes return generic 'invalid_code'
-- (no enumeration help); a real code with a real problem (expired, used…)
-- gets a specific reason so legit users aren't confused.
create or replace function public.redeem_code(p_code text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid;
  v_input    text;
  v_code     public.redeem_codes%rowtype;
  v_fails    integer;
  v_max_att  integer;
  v_window   interval;
  v_grant_id uuid;
  v_existing uuid;
  v_until    timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  -- Normalize: uppercase, strip everything that isn't A-Z0-9.
  v_input := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_input) < 6 then
    return json_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  -- Brute-force guard: N failed attempts inside the window -> locked out.
  v_max_att := greatest(public._config_int('redeem_max_attempts'), 1);
  v_window  := make_interval(mins => greatest(public._config_int('redeem_attempt_window_min'), 1));
  select count(*) into v_fails
    from public.redeem_attempts
   where user_id = v_uid and attempted_at > now() - v_window;
  if v_fails >= v_max_att then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Serialize concurrent redemptions by the same user (double-click / retry
  -- storms): the loser of the race then sees the winner's committed redemption
  -- below and exits cleanly with already_redeemed, instead of double-granting
  -- on a multi-use code. Re-entrant with grant_premium's per-user lock.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select * into v_code from public.redeem_codes where code = v_input;

  if not found then
    insert into public.redeem_attempts (user_id, code_tried) values (v_uid, left(v_input, 32));
    return json_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  -- Real code, specific problems (no attempt-log: holder is legit).
  if v_code.disabled_at is not null then
    return json_build_object('ok', false, 'reason', 'code_disabled');
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    return json_build_object('ok', false, 'reason', 'code_expired');
  end if;
  if v_code.use_count >= v_code.max_uses then
    return json_build_object('ok', false, 'reason', 'code_exhausted');
  end if;

  select id into v_existing from public.redeem_redemptions
   where code = v_input and user_id = v_uid;
  if v_existing is not null then
    return json_build_object('ok', false, 'reason', 'already_redeemed');
  end if;

  select id into v_existing from public.redeem_redemptions
   where campaign = v_code.campaign and user_id = v_uid;
  if v_existing is not null then
    return json_build_object('ok', false, 'reason', 'campaign_already_used');
  end if;

  -- Race-safe consume: only one concurrent redeemer can bump use_count.
  update public.redeem_codes
     set use_count = use_count + 1
   where code = v_input and use_count < max_uses
  returning code into v_input;
  if v_input is null then
    return json_build_object('ok', false, 'reason', 'code_exhausted');
  end if;

  v_grant_id := public.grant_premium(v_uid, v_code.tier, v_code.days, 'redeem_code', v_code.code,
                                     jsonb_build_object('campaign', v_code.campaign));

  begin
    insert into public.redeem_redemptions (code, campaign, user_id, grant_id)
    values (v_code.code, v_code.campaign, v_uid, v_grant_id);
  exception when unique_violation then
    -- Lost a concurrent same-user race (double-click/retry): the unique
    -- constraints fired. Return the friendly reason, not a raw 23505.
    if exists (select 1 from public.redeem_redemptions
                where code = v_code.code and user_id = v_uid) then
      return json_build_object('ok', false, 'reason', 'already_redeemed');
    end if;
    return json_build_object('ok', false, 'reason', 'campaign_already_used');
  end;

  -- Furthest live end for this tier (includes earlier stacked grants).
  select max(ends_at) into v_until from public.entitlement_grants
   where user_id = v_uid and tier = v_code.tier and revoked_at is null and ends_at > now();

  return json_build_object(
    'ok', true,
    'tier', v_code.tier,
    'days', v_code.days,
    'premium_until', v_until
  );
end $$;

comment on function public.redeem_code is
  'Redeem an admin-minted gift code. Validates (exists/live/not-expired/not-exhausted/not-used-by-me/campaign-not-used), consumes one use race-safely, writes the grant, all in one transaction.';

-- ------------------------------------------------------------
-- 3. Referral rewards (invite friends) + Collectz milestone.
--
-- Flow: existing user shares jejakbaki.my/r/{code} (or a Collectz
-- link carrying ?r={code}). New user signs up, enters the code
-- (or it arrives via deep link / clipboard token) ->
-- claim_referral() records it and pays the referee's WELCOME grant
-- immediately. When the referee proves real (verified email +
-- account age + distinct active days), _lazy_qualify() pays the
-- REFERRER. Collectz-sourced qualified referrals additionally
-- count toward the organizer's one-time milestone grant.
-- ------------------------------------------------------------
alter table public.referrals
  add column if not exists status text not null default 'pending';
alter table public.referrals
  add column if not exists source text not null default 'link';   -- 'link' | 'collectz'
alter table public.referrals
  add column if not exists session_code text;                     -- collectz share_code, when source='collectz'
alter table public.referrals
  add column if not exists device_id text;                        -- referee install id snapshot
alter table public.referrals
  add column if not exists qualified_at timestamptz;
alter table public.referrals
  add column if not exists rewarded_grant_id uuid references public.entitlement_grants(id) on delete set null;
alter table public.referrals
  add column if not exists reject_reason text;

alter table public.referrals drop constraint if exists referrals_status_chk;
alter table public.referrals
  add constraint referrals_status_chk
      check (status in ('pending', 'qualified', 'rewarded', 'rejected'));

-- One-time backfill: rows that predate this rewards system never passed the
-- claim-time fraud gates and paid no welcome grant, so they are retired and
-- can never pay out. The app_config marker keeps re-runs safe — new 'pending'
-- rows from claim_referral are untouched.
do $$
begin
  if not exists (select 1 from public.app_config where key = 'referrals_legacy_retired') then
    update public.referrals set status = 'rejected', reject_reason = 'legacy_pre_rewards'
     where status = 'pending';
    insert into public.app_config (key, value) values ('referrals_legacy_retired', now()::text);
  end if;
end $$;

create index if not exists referrals_referrer_status_idx
  on public.referrals (referrer_user_id, status);

comment on column public.referrals.status is
  'pending = claimed, referee not yet proven real; qualified = proven, referrer grant pending cap check; rewarded = referrer paid (rewarded_grant_id); rejected = fraud/cap (reject_reason).';

-- Fraud signals, one row per account (device id reused from the
-- existing x-device-id header the app already sends — no new tracking).
create table if not exists public.referral_account_signals (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  device_id  text,
  created_at timestamptz not null default now()
);
create index if not exists referral_signals_device_idx
  on public.referral_account_signals (device_id) where device_id is not null;
alter table public.referral_account_signals enable row level security;
revoke all on public.referral_account_signals from anon, authenticated;

-- Server-tracked activity: one row per user per calendar day, upserted
-- by my_entitlement() on every app launch. Feeds the qualify gate.
create table if not exists public.user_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;


-- claim_referral — the new user claims a referrer's code.
create or replace function public.claim_referral(
  p_code    text,
  p_device_id text default null,
  p_source  text default 'link',
  p_session text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid;
  v_input     text;
  v_referrer  uuid;
  v_created   timestamptz;
  v_window    interval;
  v_device    text;
  v_ref_id    uuid;
  v_days      integer;
  v_tier      text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  v_input := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_input) < 4 then
    return json_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if p_source not in ('link', 'collectz') then
    p_source := 'link';
  end if;
  v_device := nullif(left(coalesce(p_device_id, ''), 128), '');

  -- Codes are for NEW accounts only — otherwise two existing users can
  -- cross-enter each other's codes and farm rewards with zero growth.
  select created_at into v_created from auth.users where id = v_uid;
  v_window := make_interval(days => greatest(public._config_int('claim_window_days'), 1));
  if v_created is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  if v_created < now() - v_window then
    return json_build_object('ok', false, 'reason', 'account_too_old');
  end if;

  select user_id into v_referrer from public.user_profiles
   where referral_code = v_input;
  if v_referrer is null then
    return json_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if v_referrer = v_uid then
    return json_build_object('ok', false, 'reason', 'self_referral');
  end if;

  -- Record this install's device for future cross-checks, then enforce
  -- "referrer and referee must not share a device".
  -- First-seen device is kept so a second device can't erase shared-device evidence.
  insert into public.referral_account_signals (user_id, device_id)
  values (v_uid, v_device)
  on conflict (user_id) do nothing;

  if v_device is not null and exists (
    select 1 from public.referral_account_signals
     where user_id = v_referrer and device_id = v_device
  ) then
    return json_build_object('ok', false, 'reason', 'same_device');
  end if;

  -- One referral per referred account, ever (DB-enforced).
  if exists (select 1 from public.referrals where referred_user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'already_referred');
  end if;

  begin
    insert into public.referrals (referrer_user_id, referred_user_id, code, status, source, session_code, device_id)
    values (v_referrer, v_uid, v_input, 'pending', p_source,
            case when p_source = 'collectz' then nullif(p_session, '') end, v_device)
    returning id into v_ref_id;
  exception when unique_violation then
    -- Concurrent claim race: v_ref_id stays null, so the welcome grant
    -- below must NOT fire — return the friendly reason instead.
    return json_build_object('ok', false, 'reason', 'already_referred');
  end;

  -- Double-sided, part 1: referee's instant welcome grant.
  v_tier := coalesce(nullif(public._config_text('reward_tier'), ''), 'pro');
  v_days := greatest(public._config_int('reward_welcome_days'), 0);
  if v_days > 0 then
    perform public.grant_premium(v_uid, v_tier, v_days, 'referral_welcome', v_ref_id::text,
                                 jsonb_build_object('referrer', v_referrer, 'source', p_source));
  end if;

  return json_build_object('ok', true, 'welcome_tier', v_tier, 'welcome_days', v_days);
end $$;

comment on function public.claim_referral is
  'New user claims a referral code: records the referral (pending), snapshots device fraud signals, pays the referee welcome grant immediately. Referrer is paid later by _lazy_qualify once the referee proves real.';


-- _lazy_qualify — runs inside my_entitlement() on every app launch.
-- (a) qualifies the CALLER's own pending referral if they now look real,
--     then pays the referrer (respecting the yearly cap);
-- (b) pays the CALLER's one-time Collectz milestone when reached.
-- No cron needed: the referee is the active party by definition, and the
-- referrer's milestone is checked whenever the referrer opens the app.
create or replace function public._lazy_qualify(p_uid uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r            record;
  v_created_at timestamptz;
  v_verified   boolean;
  v_act_days   integer;
  v_need_age   interval;
  v_need_days  integer;
  v_cap        integer;
  v_used       integer;
  v_days       integer;
  v_tier       text;
  v_grant_id   uuid;
  v_ms_need    integer;
  v_ms_days    integer;
  v_ms_have    integer;
begin
  -- Caller as REFEREE: evaluate their pending referral.
  select u.created_at, (u.email_confirmed_at is not null)
    into v_created_at, v_verified
    from auth.users u where u.id = p_uid;

  v_need_age  := make_interval(days => greatest(public._config_int('qualify_account_age_days'), 0));
  v_need_days := greatest(public._config_int('qualify_active_days'), 1);
  select count(*) into v_act_days from public.user_activity where user_id = p_uid;

  for r in
    select id, referrer_user_id from public.referrals
     where referred_user_id = p_uid and status = 'pending'
  loop
    if v_verified
       and v_created_at is not null and v_created_at <= now() - v_need_age
       and v_act_days >= v_need_days then

      update public.referrals set status = 'qualified', qualified_at = now()
       where id = r.id;

      -- Pay the referrer, unless they hit the rolling-year cap.
      v_cap := greatest(public._config_int('reward_cap_per_year'), 0);
      select count(*) into v_used from public.entitlement_grants
       where user_id = r.referrer_user_id and source = 'referral_reward'
         and granted_at > now() - interval '365 days';

      if v_cap > 0 and v_used >= v_cap then
        update public.referrals set status = 'rejected', reject_reason = 'referrer_cap', qualified_at = null
         where id = r.id;
      else
        v_tier := coalesce(nullif(public._config_text('reward_tier'), ''), 'pro');
        v_days := greatest(public._config_int('reward_referrer_days'), 0);
        if v_days > 0 then
          v_grant_id := public.grant_premium(r.referrer_user_id, v_tier, v_days,
                                             'referral_reward', r.id::text,
                                             jsonb_build_object('referred', p_uid));
          update public.referrals set status = 'rewarded', rewarded_grant_id = v_grant_id
           where id = r.id;
        else
          update public.referrals set status = 'rewarded' where id = r.id;
        end if;
      end if;
    end if;
  end loop;

  -- Caller as ORGANIZER: one-time Collectz milestone.
  v_ms_need := greatest(public._config_int('milestone_collectz_count'), 1);
  v_ms_days := greatest(public._config_int('milestone_collectz_days'), 0);
  if v_ms_days > 0 then
    select count(*) into v_ms_have from public.referrals
     where referrer_user_id = p_uid and source = 'collectz'
       and (status in ('qualified', 'rewarded') or reject_reason = 'referrer_cap');
    if v_ms_have >= v_ms_need then
      v_tier := coalesce(nullif(public._config_text('reward_tier'), ''), 'pro');
      -- Unique index entitlement_grants_milestone_once makes this one-time;
      -- ON CONFLICT can't target a partial index predicate, so guard + tolerate race.
      if not exists (select 1 from public.entitlement_grants
                      where user_id = p_uid and source = 'collectz_milestone') then
        begin
          perform public.grant_premium(p_uid, v_tier, v_ms_days, 'collectz_milestone', null,
                                       jsonb_build_object('qualified_joins', v_ms_have));
        exception when unique_violation then null; -- lost a concurrent race — fine
        end;
      end if;
    end if;
  end if;
end $$;


-- my_entitlement — the app's single launch call.
-- Tracks the activity day, snapshots the device id, runs lazy
-- qualification, and returns gate state + effective entitlement.
create or replace function public.my_entitlement(p_device_id text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid;
  v_tier  text;
  v_until timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  insert into public.user_activity (user_id, day) values (v_uid, current_date)
  on conflict do nothing;

  if nullif(p_device_id, '') is not null then
    -- First-seen device is kept so a second device can't erase shared-device evidence.
    insert into public.referral_account_signals (user_id, device_id)
    values (v_uid, left(p_device_id, 128))
    on conflict (user_id) do nothing;
  end if;

  perform public._lazy_qualify(v_uid);

  -- Winning tier = highest-ranked grant ACTIVE right now (unchanged).
  select g.tier
    into v_tier
    from public.entitlement_grants g
   where g.user_id = v_uid
     and g.revoked_at is null
     and g.starts_at <= now() and g.ends_at > now()
   order by case g.tier when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0 end desc
   limit 1;

  -- premium_until = furthest end among ALL live grants (banked future ones
  -- included, starts_at ignored) of the highest-ranked live tier.
  select max(g.ends_at)
    into v_until
    from public.entitlement_grants g
   where g.user_id = v_uid
     and g.revoked_at is null
     and g.ends_at > now()
   group by g.tier
   order by case g.tier when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0 end desc
   limit 1;

  return json_build_object(
    'ok', true,
    'server_time', now(),
    'gate_on', public._config_bool('premium_gate_on'),
    'gate_start', public._config_ts('premium_gate_start'),
    'tier', coalesce(v_tier, 'free'),
    'premium_until', v_until
  );
end $$;

comment on function public.my_entitlement is
  'One call per app launch: upserts activity day + device signal, runs lazy referral qualification, returns {gate_on, gate_start, tier, premium_until}. tier is the highest-ranked grant active now; premium_until is the furthest live end of the best live tier, including banked future time. While gate_on=false the client keeps beta behaviour; grants still accrue.';


-- referral_progress — powers the Invite screen.
create or replace function public.referral_progress()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid;
  v_code text;
  v_pending integer; v_qualified integer; v_rewarded integer; v_rejected integer;
  v_cap integer; v_used integer;
  v_ms_need integer; v_ms_have integer; v_ms_done boolean;
  v_days_earned integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select referral_code into v_code from public.user_profiles where user_id = v_uid;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'qualified'),
    count(*) filter (where status = 'rewarded'),
    count(*) filter (where status = 'rejected')
    into v_pending, v_qualified, v_rewarded, v_rejected
    from public.referrals where referrer_user_id = v_uid;

  v_cap := greatest(public._config_int('reward_cap_per_year'), 0);
  select count(*) into v_used from public.entitlement_grants
   where user_id = v_uid and source = 'referral_reward'
     and granted_at > now() - interval '365 days';

  select coalesce(sum(days), 0) into v_days_earned from public.entitlement_grants
   where user_id = v_uid and source in ('referral_reward', 'collectz_milestone')
     and revoked_at is null;

  v_ms_need := greatest(public._config_int('milestone_collectz_count'), 1);
  select count(*) into v_ms_have from public.referrals
   where referrer_user_id = v_uid and source = 'collectz'
     and (status in ('qualified','rewarded') or reject_reason = 'referrer_cap');
  v_ms_done := exists (select 1 from public.entitlement_grants
                        where user_id = v_uid and source = 'collectz_milestone');

  return json_build_object(
    'ok', true,
    'code', v_code,
    'pending', v_pending, 'qualified', v_qualified,
    'rewarded', v_rewarded, 'rejected', v_rejected,
    'reward_days_each', greatest(public._config_int('reward_referrer_days'), 0),
    'days_earned', v_days_earned,
    'cap_per_year', v_cap, 'cap_used', v_used,
    'milestone_needed', v_ms_need, 'milestone_have', v_ms_have, 'milestone_done', v_ms_done
  );
end $$;

-- ------------------------------------------------------------
-- 4. Admin RPCs (all gated by public.is_admin()).
--    Called directly from site/admin.html via supabase-js rpc()
--    — same discipline as admin_user_stats / admin_identity_emails.
-- ------------------------------------------------------------

-- Mint codes. Returns the generated canonical codes.
create or replace function public.admin_create_redeem_codes(
  p_tier       text,
  p_days       integer,
  p_count      integer default 1,
  p_campaign   text default 'GIFT',
  p_max_uses   integer default 1,
  p_expires_at timestamptz default null,
  p_note       text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  v_campaign text;
  v_code     text;
  v_codes    text[] := '{}';
  v_i        integer;
  v_try      integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_tier not in ('basic','pro','premium') then
    raise exception 'bad tier';
  end if;
  if p_days is null or p_days <= 0 or p_days > 3700 then
    raise exception 'bad days';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expires_at must be in the future';
  end if;
  v_i := least(greatest(coalesce(p_count, 1), 1), 500);  -- hard cap per batch
  v_campaign := upper(regexp_replace(coalesce(nullif(p_campaign, ''), 'GIFT'), '[^A-Za-z0-9]', '', 'g'));
  v_campaign := left(coalesce(nullif(v_campaign, ''), 'GIFT'), 10);

  while v_i > 0 loop
    -- Mint until a collision-free code appears (PK is the guard).
    v_code := null;
    for v_try in 1..20 loop
      select v_campaign || string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
        into v_code
        from generate_series(1, 8);
      exit when not exists (select 1 from public.redeem_codes where code = v_code);
      v_code := null;
    end loop;
    if v_code is null then
      raise exception 'could not mint unique code — retry';
    end if;

    insert into public.redeem_codes (code, campaign, tier, days, max_uses, expires_at, note, created_by)
    values (v_code, v_campaign, p_tier, p_days,
            least(greatest(coalesce(p_max_uses, 1), 1), 100000),
            p_expires_at, nullif(p_note, ''),
            coalesce(auth.jwt() ->> 'email', 'unknown'));
    v_codes := v_codes || v_code;
    v_i := v_i - 1;
  end loop;

  return json_build_object('ok', true, 'campaign', v_campaign, 'codes', v_codes);
end $$;


-- List codes newest-first with live status. Optional campaign filter.
create or replace function public.admin_list_redeem_codes(p_campaign text default null)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc) from (
      select c.code, c.campaign, c.tier, c.days, c.max_uses, c.use_count,
             c.expires_at, c.disabled_at, c.created_by, c.note, c.created_at,
             case
               when c.disabled_at is not null then 'disabled'
               when c.expires_at is not null and c.expires_at <= now() then 'expired'
               when c.use_count >= c.max_uses then 'exhausted'
               else 'live'
             end as status
        from public.redeem_codes c
       where p_campaign is null or c.campaign = upper(regexp_replace(p_campaign, '[^A-Za-z0-9]', '', 'g'))
    ) t
  ), '[]'::json);
end $$;


-- Who redeemed a given code.
create or replace function public.admin_list_redemptions(p_code text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.redeemed_at desc) from (
      select r.user_id, u.email, r.redeemed_at, r.grant_id
        from public.redeem_redemptions r
        left join auth.users u on u.id = r.user_id
       where r.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
    ) t
  ), '[]'::json);
end $$;


-- Enable/disable a code.
create or replace function public.admin_set_redeem_code_disabled(p_code text, p_disabled boolean)
returns json
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  update public.redeem_codes
     set disabled_at = case when p_disabled then now() else null end
   where code = v_code;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  return json_build_object('ok', true);
end $$;


-- Direct grant to any user ("award whoever I want", no code needed).
create or replace function public.admin_grant_premium(
  p_user_id uuid,
  p_tier    text,
  p_days    integer,
  p_note    text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_id := public.grant_premium(p_user_id, p_tier, p_days, 'admin_manual', null,
                               jsonb_build_object('note', nullif(p_note, ''),
                                                  'by', coalesce(auth.jwt() ->> 'email', 'unknown')));
  return json_build_object('ok', true, 'grant_id', v_id);
end $$;


-- Revoke a grant (support tool; redemptions audit stays).
create or replace function public.admin_revoke_grant(p_grant_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.entitlement_grants set revoked_at = now()
   where id = p_grant_id and revoked_at is null;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  return json_build_object('ok', true);
end $$;


-- The launch switch. Flip gate_on at launch; move gate_start only
-- BEFORE launch (moving it after grants exist does not shift
-- already-baked starts_at — that is intentional, grants are immutable).
create or replace function public.admin_set_gate(
  p_gate_on    boolean default null,
  p_gate_start timestamptz default null
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_gate_on is not null then
    insert into public.app_config (key, value) values ('premium_gate_on', p_gate_on::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_gate_start is not null then
    insert into public.app_config (key, value) values ('premium_gate_start', p_gate_start::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  return json_build_object('ok', true,
    'gate_on', public._config_bool('premium_gate_on'),
    'gate_start', public._config_ts('premium_gate_start'));
end $$;


-- Referral funnel for the admin tab: totals + per-referrer breakdown.
create or replace function public.admin_referral_funnel()
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_totals json;
  v_rows   json;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select json_build_object(
    'referrals',  count(*),
    'pending',    count(*) filter (where status = 'pending'),
    'qualified',  count(*) filter (where status = 'qualified'),
    'rewarded',   count(*) filter (where status = 'rewarded'),
    'rejected',   count(*) filter (where status = 'rejected'),
    'collectz',   count(*) filter (where source = 'collectz'),
    'days_granted', coalesce((select sum(g.days) from public.entitlement_grants g
                       where g.source in ('referral_welcome','referral_reward','collectz_milestone')
                         and g.revoked_at is null), 0)
  ) into v_totals
  from public.referrals;

  select coalesce(json_agg(row_to_json(t) order by t.rewarded desc, t.total desc), '[]'::json)
    into v_rows
    from (
      select r.referrer_user_id,
             u.email as referrer_email,
             count(*) as total,
             count(*) filter (where r.status = 'pending') as pending,
             count(*) filter (where r.status = 'rewarded') as rewarded,
             count(*) filter (where r.status = 'rejected') as rejected,
             count(*) filter (where r.source = 'collectz') as via_collectz
        from public.referrals r
        left join auth.users u on u.id = r.referrer_user_id
       group by r.referrer_user_id, u.email
       order by count(*) desc
       limit 500
    ) t;

  return json_build_object('ok', true, 'totals', v_totals, 'referrers', v_rows);
end $$;


-- ------------------------------------------------------------
-- 5. Execute privileges.
--    Client-facing: authenticated only. Admin: authenticated (the
--    is_admin() check inside does the real gating). Internal:
--    service_role only — clients must never call these directly.
-- ------------------------------------------------------------
revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

revoke all on function public.claim_referral(text, text, text, text) from public, anon;
grant execute on function public.claim_referral(text, text, text, text) to authenticated;

revoke all on function public.my_entitlement(text) from public, anon;
grant execute on function public.my_entitlement(text) to authenticated;

revoke all on function public.referral_progress() from public, anon;
grant execute on function public.referral_progress() to authenticated;

revoke all on function public.admin_create_redeem_codes(text, integer, integer, text, integer, timestamptz, text) from public, anon;
grant execute on function public.admin_create_redeem_codes(text, integer, integer, text, integer, timestamptz, text) to authenticated;

revoke all on function public.admin_list_redeem_codes(text) from public, anon;
grant execute on function public.admin_list_redeem_codes(text) to authenticated;

revoke all on function public.admin_list_redemptions(text) from public, anon;
grant execute on function public.admin_list_redemptions(text) to authenticated;

revoke all on function public.admin_set_redeem_code_disabled(text, boolean) from public, anon;
grant execute on function public.admin_set_redeem_code_disabled(text, boolean) to authenticated;

revoke all on function public.admin_grant_premium(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_grant_premium(uuid, text, integer, text) to authenticated;

revoke all on function public.admin_revoke_grant(uuid) from public, anon;
grant execute on function public.admin_revoke_grant(uuid) to authenticated;

revoke all on function public.admin_set_gate(boolean, timestamptz) from public, anon;
grant execute on function public.admin_set_gate(boolean, timestamptz) to authenticated;

revoke all on function public.admin_referral_funnel() from public, anon;
grant execute on function public.admin_referral_funnel() to authenticated;

-- Internal helpers: never callable by clients.
revoke all on function public.grant_premium(uuid, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.grant_premium(uuid, text, integer, text, text, jsonb) to service_role;

revoke all on function public._lazy_qualify(uuid) from public, anon, authenticated;
grant execute on function public._lazy_qualify(uuid) to service_role;

revoke all on function public._config_text(text) from public, anon, authenticated;
revoke all on function public._config_int(text) from public, anon, authenticated;
revoke all on function public._config_bool(text) from public, anon, authenticated;
revoke all on function public._config_ts(text) from public, anon, authenticated;
grant execute on function public._config_text(text) to service_role;
grant execute on function public._config_int(text) to service_role;
grant execute on function public._config_bool(text) to service_role;
grant execute on function public._config_ts(text) to service_role;
