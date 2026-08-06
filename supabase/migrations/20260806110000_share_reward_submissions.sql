-- ============================================================
-- Potraces — Share & Earn Pro (social-post reward) submissions.
--
-- Spec: AUGUST.md "Earn Pro hub + Share & Earn Pro reward" (decided
-- 2026-07-29). Users post about the app WITH a screenshot on Instagram /
-- 小红书 (RED) / Reddit / Facebook / X / Threads; the team reviews the post
-- by hand (like count + proof) in the admin Rewards tab and approves a tier:
--   30+ likes → 1 month Pro · 100+ likes → 1 year Pro · viral → forever.
-- The grant rides the EXISTING premium-grant ledger (grant_premium), so
-- share-earned Pro is a server-granted entitlement exactly like
-- redeem/referral grants — including the surprise-grant RewardModal on the
-- user's next launch (my_entitlement new_rewards, 'share_reward' added below).
--
-- Locked choices for the spec's open calls:
--  - Verification = MANUAL REVIEW (no platform like-count API at MVP).
--  - "Forever" = 3650 days (~10y). The ledger enforces days <= 3700 for
--    every source (table CHECK + grant_premium guard); 3650 is the largest
--    round figure that fits without relaxing that shared invariant.
--  - Share year-cap is INDEPENDENT of the referral cap: separate config key
--    (share_reward_cap_per_year, 12 — same number as the referral cap) and a
--    separate counter (grants with source='share_reward' only).
--  - Account-age gate: account must be ≥ share_reward_min_account_age_days
--    (7, same vintage as qualify_account_age_days) to submit.
--
-- Abuse controls (spec): dedupe by post URL (unique url_key — one row per
-- post, globally, so two accounts can't claim the same viral post), one
-- grant per post (only that one row can ever be approved), per-user/year cap
-- (re-checked atomically at approval), account-age gate (edge function),
-- bought-likes / edited screenshots rejected by human review.
--
-- Idempotent (create ... if not exists / create or replace / drop if exists).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tunables (no migration needed to change them).
-- ------------------------------------------------------------
insert into public.app_config (key, value) values
  ('share_reward_tier',                'pro'),  -- every share grant is Pro
  ('share_reward_month_days',          '30'),   -- 30+ likes
  ('share_reward_year_days',           '365'),  -- 100+ likes
  ('share_reward_forever_days',        '3650'), -- viral; ledger max is 3700
  ('share_reward_cap_per_year',        '12'),   -- grants / user / rolling 365d
  ('share_reward_min_account_age_days','7')     -- submit gate (edge function)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. 'share_reward' becomes a legal grant source.
--    The v1 migration declared the source list as an inline column CHECK;
--    drop whatever CHECK on entitlement_grants.source mentions
--    'referral_welcome' (name-agnostic) and re-assert the widened list.
-- ------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where nsp.nspname = 'public'
       and rel.relname = 'entitlement_grants'
       and con.contype = 'c'
       and att.attname = 'source'
       and pg_get_constraintdef(con.oid) ilike '%referral_welcome%'
  loop
    execute format('alter table public.entitlement_grants drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.entitlement_grants drop constraint if exists entitlement_grants_source_check;
alter table public.entitlement_grants
  add constraint entitlement_grants_source_check
  check (source in (
    'redeem_code',        -- admin-minted gift code
    'referral_welcome',   -- referee's instant welcome grant
    'referral_reward',    -- referrer's batch payout
    'collectz_milestone', -- organizer's 5-joins milestone
    'beta_promise',       -- promised 1 month for beta installers
    'admin_manual',       -- founder/support one-off
    'iap',                -- future: store purchase webhook
    'share_reward'        -- Share & Earn Pro (social post, admin-reviewed)
  ));

-- ------------------------------------------------------------
-- 3. share_reward_submissions — one row per submitted post.
--    Writes go through the share-reward-submit edge function ONLY
--    (service role); clients can read their own rows. Review happens via
--    admin_review_share_reward below (is_admin-gated).
-- ------------------------------------------------------------
create table if not exists public.share_reward_submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  platform        text not null check (platform in ('instagram','red','reddit','facebook','x','threads')),
  post_url        text not null,          -- as pasted (display)
  url_key         text not null,          -- normalized host+path (dedupe)
  screenshot_path text,                   -- share-reward-proofs object path (<uid>/…)
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  likes_seen      integer,                -- like count the reviewer observed (audit trail)
  awarded_tier    text check (awarded_tier in ('month','year','forever')),
  awarded_days    integer,
  grant_id        uuid references public.entitlement_grants(id) on delete set null,
  review_note     text,                   -- reviewer note (e.g. reject reason)
  reviewed_by     text,                   -- admin email (from JWT)
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.share_reward_submissions is
  'Share & Earn Pro queue. One row per social post (unique url_key — globally, so two accounts cannot claim the same post). Written only by the share-reward-submit edge function (service role); reviewed via admin_review_share_reward; approval grants through grant_premium like any other reward.';
comment on column public.share_reward_submissions.url_key is
  'Normalized post URL (lowercase host + path, no protocol/query/hash). Unique globally: dedupe by post URL + one grant per post, enforced by the DB.';

-- Dedupe by post URL, DB-enforced: one submission (⇒ at most one grant) per post.
create unique index if not exists share_reward_submissions_url_key_uidx
  on public.share_reward_submissions (url_key);

create index if not exists share_reward_submissions_user_idx
  on public.share_reward_submissions (user_id, created_at desc);

create index if not exists share_reward_submissions_status_idx
  on public.share_reward_submissions (status, created_at)
  where status = 'pending';

alter table public.share_reward_submissions enable row level security;

-- Owner-read so the Share pane can show "your submissions". No client writes.
drop policy if exists "share_reward_submissions_owner_read" on public.share_reward_submissions;
create policy "share_reward_submissions_owner_read" on public.share_reward_submissions
  for select using (auth.uid() = user_id);
revoke all on public.share_reward_submissions from anon, authenticated;
grant select on public.share_reward_submissions to authenticated;

-- ------------------------------------------------------------
-- 4. Proof-screenshot bucket (private). Mirrors beta-screenshots:
--    owner uploads/reads only under "<uid>/", admins read/delete all.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('share-reward-proofs', 'share-reward-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "share_reward_proofs_owner_insert" on storage.objects;
create policy "share_reward_proofs_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'share-reward-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "share_reward_proofs_owner_read" on storage.objects;
create policy "share_reward_proofs_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'share-reward-proofs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "share_reward_proofs_admin_read" on storage.objects;
create policy "share_reward_proofs_admin_read" on storage.objects
  for select to authenticated
  using ( bucket_id = 'share-reward-proofs' and public.is_admin() );

drop policy if exists "share_reward_proofs_admin_delete" on storage.objects;
create policy "share_reward_proofs_admin_delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'share-reward-proofs' and public.is_admin() );

-- ------------------------------------------------------------
-- 5. my_entitlement: share grants ride the surprise-reward channel.
--    'share_reward' is NOT in grant_premium's born-seen list, so an
--    approved grant is born unseen and pops the app's RewardModal exactly
--    once on the next launch — the "push on approval" (same mechanism as
--    referral_reward / collectz_milestone / admin_manual). Only change vs
--    the 20260727000000 version: 'share_reward' added to both source lists.
-- ------------------------------------------------------------
create or replace function public.my_entitlement(p_device_id text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid;
  v_tier  text;
  v_until timestamptz;
  v_rewards json;
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

  -- Surprise grants never shown to the user. Serialize per user (same lock
  -- key as grant_premium) so two concurrent launches can't both deliver.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select coalesce(
           json_agg(json_build_object('source', g.source, 'tier', g.tier, 'days', g.days)
                    order by g.granted_at),
           '[]'::json)
    into v_rewards
    from public.entitlement_grants g
   where g.user_id = v_uid
     and g.seen_at is null
     and g.revoked_at is null
     and g.source in ('referral_reward','collectz_milestone','admin_manual','beta_promise','share_reward');

  update public.entitlement_grants g set seen_at = now()
   where g.user_id = v_uid
     and g.seen_at is null
     and g.source in ('referral_reward','collectz_milestone','admin_manual','beta_promise','share_reward');

  return json_build_object(
    'ok', true,
    'server_time', now(),
    'gate_on', public._config_bool('premium_gate_on'),
    'gate_start', public._config_ts('premium_gate_start'),
    'tier', coalesce(v_tier, 'free'),
    'premium_until', v_until,
    'new_rewards', v_rewards
  );
end $$;

-- ------------------------------------------------------------
-- 6. Admin RPCs (is_admin-gated; called from site/admin.html Rewards tab).
-- ------------------------------------------------------------

-- Review queue: submissions newest-first, optionally filtered by status.
create or replace function public.admin_list_share_rewards(p_status text default null)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at desc) from (
      select s.id, s.user_id, u.email, s.platform, s.post_url, s.screenshot_path,
             s.status, s.likes_seen, s.awarded_tier, s.awarded_days, s.grant_id,
             s.review_note, s.reviewed_by, s.reviewed_at, s.created_at,
             (select count(*) from public.entitlement_grants g
               where g.user_id = s.user_id and g.source = 'share_reward'
                 and g.granted_at > now() - interval '365 days') as cap_used
        from public.share_reward_submissions s
        left join auth.users u on u.id = s.user_id
       where p_status is null or s.status = p_status
       order by s.created_at desc
       limit 500
    ) t
  ), '[]'::json);
end $$;

comment on function public.admin_list_share_rewards is
  'Share & Earn review queue for the admin Rewards tab. Includes the submitter email and their rolling-year share-grant count (cap_used) so the reviewer sees cap state inline.';


-- Approve a tier (grant via the shared ledger) or reject. One transaction.
create or replace function public.admin_review_share_reward(
  p_id    uuid,
  p_action text,                 -- 'approve' | 'reject'
  p_tier  text default null,     -- 'month' | 'year' | 'forever' (approve only)
  p_likes integer default null,  -- like count observed by the reviewer (audit)
  p_note  text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_sub      public.share_reward_submissions%rowtype;
  v_days     integer;
  v_tier     text;
  v_cap      integer;
  v_used     integer;
  v_grant_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_sub from public.share_reward_submissions where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_sub.status <> 'pending' then
    return json_build_object('ok', false, 'reason', 'already_reviewed');
  end if;

  if p_action = 'reject' then
    update public.share_reward_submissions
       set status = 'rejected',
           likes_seen = p_likes,
           review_note = nullif(p_note, ''),
           reviewed_by = coalesce(auth.jwt() ->> 'email', 'unknown'),
           reviewed_at = now()
     where id = p_id;
    return json_build_object('ok', true);
  end if;

  if p_action <> 'approve' then
    return json_build_object('ok', false, 'reason', 'bad_action');
  end if;
  if p_tier not in ('month','year','forever') then
    return json_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  -- Per-user/year cap, re-checked atomically at grant time (the edge
  -- function's submit-time check is only an early out). Independent of the
  -- referral cap: counts share_reward grants only.
  v_cap := greatest(public._config_int('share_reward_cap_per_year'), 0);
  select count(*) into v_used from public.entitlement_grants
   where user_id = v_sub.user_id and source = 'share_reward'
     and granted_at > now() - interval '365 days';
  if v_cap > 0 and v_used >= v_cap then
    return json_build_object('ok', false, 'reason', 'year_cap_reached');
  end if;

  v_days := case p_tier
              when 'month'   then greatest(public._config_int('share_reward_month_days'), 1)
              when 'year'    then greatest(public._config_int('share_reward_year_days'), 1)
              else                greatest(public._config_int('share_reward_forever_days'), 1)
            end;
  v_tier := coalesce(nullif(public._config_text('share_reward_tier'), ''), 'pro');

  v_grant_id := public.grant_premium(v_sub.user_id, v_tier, v_days, 'share_reward', v_sub.id::text,
                                     jsonb_build_object('platform', v_sub.platform,
                                                        'url_key', v_sub.url_key,
                                                        'likes', p_likes,
                                                        'awarded_tier', p_tier,
                                                        'by', coalesce(auth.jwt() ->> 'email', 'unknown')));

  -- Guarded transition: if a concurrent review beat us to it, the update
  -- affects no row and the whole transaction (grant included) rolls back.
  update public.share_reward_submissions
     set status = 'approved',
         likes_seen = p_likes,
         awarded_tier = p_tier,
         awarded_days = v_days,
         grant_id = v_grant_id,
         review_note = nullif(p_note, ''),
         reviewed_by = coalesce(auth.jwt() ->> 'email', 'unknown'),
         reviewed_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'already_reviewed';
  end if;

  return json_build_object('ok', true, 'grant_id', v_grant_id, 'days', v_days, 'tier', v_tier);
end $$;

comment on function public.admin_review_share_reward is
  'Share & Earn review action. approve: grant_premium(source=share_reward) after re-checking the rolling-year cap (independent of the referral cap); reject: mark rejected with a note. One transaction, row locked, status transition guarded against double review. The grant is born unseen so the app pops its RewardModal on the user''s next launch.';

-- ------------------------------------------------------------
-- 7. Execute privileges (client-facing admin RPCs: authenticated +
--    is_admin inside, same discipline as the other admin_* rewards RPCs).
-- ------------------------------------------------------------
revoke all on function public.admin_list_share_rewards(text) from public, anon;
grant execute on function public.admin_list_share_rewards(text) to authenticated;

revoke all on function public.admin_review_share_reward(uuid, text, text, integer, text) from public, anon;
grant execute on function public.admin_review_share_reward(uuid, text, text, integer, text) to authenticated;
