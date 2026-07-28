-- redeem_code: report "already_redeemed" before "code_exhausted".
--
-- Bug (caught by supabase/smoke/20260726_grants_smoke.sql, section 3): for a
-- SINGLE-use code the caller already redeemed, use_count>=max_uses is true, so the
-- code_exhausted check (which ran first) returned 'code_exhausted' — reading as if
-- someone else drained it. The caller-specific 'already_redeemed' is clearer, so it
-- now takes precedence. Only the returned reason changes; grant/consume logic is
-- byte-identical to 20260726000000. The live function lives in that already-applied
-- migration, so this forward migration is what db push applies.
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

  -- Caller-specific "you already used this" takes precedence over the generic
  -- "used up": a single-use code the caller already redeemed reports
  -- already_redeemed, not code_exhausted.
  select id into v_existing from public.redeem_redemptions
   where code = v_input and user_id = v_uid;
  if v_existing is not null then
    return json_build_object('ok', false, 'reason', 'already_redeemed');
  end if;

  if v_code.use_count >= v_code.max_uses then
    return json_build_object('ok', false, 'reason', 'code_exhausted');
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
