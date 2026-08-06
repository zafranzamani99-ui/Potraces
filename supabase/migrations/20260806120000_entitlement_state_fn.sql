-- ============================================================
-- entitlement_state() — READ-ONLY entitlement lookup for the
-- get-entitlements edge function (server-side entitlement lock).
-- ============================================================
-- Why a separate function instead of reusing my_entitlement():
-- my_entitlement() has side effects the app relies on exactly once per
-- launch (activity-day upsert, device signal, lazy referral qualify, and
-- collecting + marking new_rewards seen). The edge function is a pure
-- lookup that may run right AFTER the app's my_entitlement() call, so it
-- must not double-fire those effects (a second call would swallow
-- new_rewards before the app's own call could return them, if it ever
-- ran first). The tier queries below mirror my_entitlement()'s exactly —
-- keep them in sync if the ledger semantics ever change.
--
-- Security: takes an explicit p_uid, so it MUST NOT be callable by
-- anon/authenticated (a caller could otherwise read anyone's tier).
-- Executed only via the service role from get-entitlements.
-- Idempotent: create or replace + revoke are re-runnable.

create or replace function public.entitlement_state(p_uid uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier  text;
  v_until timestamptz;
begin
  if p_uid is null then
    raise exception 'entitlement_state: user required';
  end if;

  -- Winning tier = highest-ranked grant ACTIVE right now.
  -- (Mirrors my_entitlement; see 20260727000000_rewards_milestone5_seen.sql.)
  select g.tier
    into v_tier
    from public.entitlement_grants g
   where g.user_id = p_uid
     and g.revoked_at is null
     and g.starts_at <= now() and g.ends_at > now()
   order by case g.tier when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0 end desc
   limit 1;

  -- premium_until = furthest end among ALL live grants (banked future ones
  -- included, starts_at ignored) of the highest-ranked live tier.
  select max(g.ends_at)
    into v_until
    from public.entitlement_grants g
   where g.user_id = p_uid
     and g.revoked_at is null
     and g.ends_at > now()
   group by g.tier
   order by case g.tier when 'premium' then 3 when 'pro' then 2 when 'basic' then 1 else 0 end desc
   limit 1;

  return json_build_object(
    'ok', true,
    'server_time', now(),
    'gate_on', public._config_bool('premium_gate_on'),
    'tier', coalesce(v_tier, 'free'),
    'premium_until', v_until
  );
end $$;

comment on function public.entitlement_state(p_uid uuid) is
  'Read-only entitlement snapshot for the get-entitlements edge function: {ok, server_time, gate_on, tier, premium_until}. Same ledger semantics as my_entitlement() but NO side effects (no activity ping, no lazy qualify, no new_rewards). Service-role only.';

-- Service role only. EXECUTE is granted to PUBLIC by default and
-- anon/authenticated inherit that, so PUBLIC must be revoked explicitly —
-- then service_role re-granted for the get-entitlements edge function.
-- (p_uid is an explicit parameter: left callable, any user could read
-- anyone's entitlement tier.)
revoke execute on function public.entitlement_state(p_uid uuid) from public, anon, authenticated;
grant execute on function public.entitlement_state(p_uid uuid) to service_role;
