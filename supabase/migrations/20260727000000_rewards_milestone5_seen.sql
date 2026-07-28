-- ============================================================
-- Rewards tuning + reward-notification channel (2026-07-27)
--
-- 1. Reward tuning (owner decisions):
--    - Collectz milestone 3 -> 5 qualified joins.
--    - Friend welcome 30 -> 15 days.
--    - Referrer paid per BATCH of 3 settled friends -> 30 days
--      (was 30 days per settled friend). Cap 12 batches/yr.
-- 2. entitlement_grants.seen_at — tracks whether the user has been SHOWN
--    a grant. "Surprise" grants (referrer payout, collectz milestone,
--    admin manual, beta promise) are born unseen; self-initiated grants
--    (welcome claim, redeem code, future IAP) are born seen because the
--    claim toast / redeem alert / purchase modal already cover them.
-- 3. my_entitlement() returns new_rewards: unseen surprise grants,
--    collected and marked seen in the same call (exactly-once) so the
--    app can pop a success modal the moment a reward lands.
-- ============================================================

-- ---------- 1. reward tuning ----------
update public.app_config set value = '5'  where key = 'milestone_collectz_count';
update public.app_config set value = '15' where key = 'reward_welcome_days';
insert into public.app_config (key, value) values
  ('reward_referrer_batch_count', '3')  -- settled friends per 30d referrer payout
on conflict (key) do nothing;

-- ---------- 2. seen_at ----------
alter table public.entitlement_grants add column if not exists seen_at timestamptz;

comment on column public.entitlement_grants.seen_at is
  'When the user was shown this grant (reward modal). NULL = never surfaced. Only surprise grants (referral_reward, collectz_milestone, admin_manual, beta_promise) use it — self-initiated grants are born seen.';

-- Clean slate: grants that predate this change must not pop retroactive modals.
update public.entitlement_grants set seen_at = granted_at where seen_at is null;

-- ---------- 3. grant_premium: self-initiated grants are born seen ----------
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
    (user_id, tier, days, source, source_id, starts_at, ends_at, meta, seen_at)
  values
    (p_user_id, p_tier, p_days, p_source, p_source_id,
     v_start, v_start + make_interval(days => p_days), coalesce(p_meta, '{}'::jsonb),
     -- Self-initiated grants have their own UX (claim toast / redeem alert /
     -- purchase modal) — born seen so the reward modal never double-messages.
     case when p_source in ('referral_welcome','redeem_code','iap') then now() else null end)
  returning id into v_id;

  return v_id;
end $$;

comment on function public.grant_premium is
  'Internal write path for the entitlement ledger. Sequential stacking per tier: starts at the later of now / premium_gate_start / latest active same-tier ends_at. Self-initiated grants (referral_welcome, redeem_code, iap) are born seen; surprise grants are born unseen for my_entitlement new_rewards.';

-- ---------- 4. my_entitlement: return + mark new_rewards ----------
create or replace function public.my_entitlement(p_device_id text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid;
  v_tier    text;
  v_until   timestamptz;
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
     and g.source in ('referral_reward','collectz_milestone','admin_manual','beta_promise');

  update public.entitlement_grants g set seen_at = now()
   where g.user_id = v_uid
     and g.seen_at is null
     and g.source in ('referral_reward','collectz_milestone','admin_manual','beta_promise');

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

comment on function public.my_entitlement is
  'One call per app launch: upserts activity day + device signal, runs lazy referral qualification, returns {gate_on, gate_start, tier, premium_until, new_rewards}. tier is the highest-ranked grant active now; premium_until is the furthest live end of the best live tier, including banked future time. new_rewards = unseen surprise grants (referrer payout, collectz milestone, admin manual, beta promise), collected and marked seen in the same call so the app shows its reward modal exactly once. While gate_on=false the client keeps beta behaviour; grants still accrue.';


-- ---------- 5. _lazy_qualify: referrer paid per BATCH of settled friends ----------
-- Same shape as the v1 function; the only change is the referrer payout: a
-- referral now becomes 'qualified' when the friend proves real, and the
-- referrer is paid only when their settled count COMPLETES a batch
-- (reward_referrer_batch_count, default 3 -> reward_referrer_days, 30).
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
  v_batch      integer;
  v_settled    integer;
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

      -- Batch payout: count the referrer's settled friends INCLUDING this one;
      -- pay only when the count completes a batch.
      v_batch := greatest(public._config_int('reward_referrer_batch_count'), 1);
      select count(*) into v_settled from public.referrals
       where referrer_user_id = r.referrer_user_id and status in ('qualified','rewarded');

      if v_settled % v_batch = 0 then
        -- Pay the referrer, unless they hit the rolling-year cap (in batches).
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
                                               jsonb_build_object('referred', p_uid, 'batch_size', v_batch));
            update public.referrals set status = 'rewarded', rewarded_grant_id = v_grant_id
             where id = r.id;
          else
            update public.referrals set status = 'rewarded' where id = r.id;
          end if;
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

-- ---------- 6. referral_progress: batch + welcome/milestone-day fields ----------
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
  v_batch integer; v_settled integer;
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

  -- Batch progress: settled friends toward the referrer's next payout.
  v_batch := greatest(public._config_int('reward_referrer_batch_count'), 1);
  v_settled := v_qualified + v_rewarded;

  return json_build_object(
    'ok', true,
    'code', v_code,
    'pending', v_pending, 'qualified', v_qualified,
    'rewarded', v_rewarded, 'rejected', v_rejected,
    'welcome_days', greatest(public._config_int('reward_welcome_days'), 0),
    'reward_days_each', greatest(public._config_int('reward_referrer_days'), 0),
    'batch_size', v_batch,
    'batch_progress', v_settled % v_batch,
    'days_earned', v_days_earned,
    'cap_per_year', v_cap, 'cap_used', v_used,
    'milestone_needed', v_ms_need, 'milestone_have', v_ms_have, 'milestone_done', v_ms_done,
    'milestone_days', greatest(public._config_int('milestone_collectz_days'), 0)
  );
end $$;

comment on function public.referral_progress is
  'Invite screen + Collectz reward info: my code, referral counts, welcome days, per-batch referrer days + batch size/progress, days earned, yearly cap, and the Collectz milestone (needed/have/done/days).';
