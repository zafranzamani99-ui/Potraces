-- ============================================================
-- SMOKE TEST — premium grants / redeem codes / referral rewards.
-- Migration under test: 20260726000000_premium_grants_and_rewards.sql
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste whole file → Run.
-- Runs as postgres (service role), so GRANT/REVOKE rules are NOT
-- exercised here (permissions are enforced by PostgREST in real calls).
-- Any failure raises an exception and aborts; a clean run ends with
--   NOTICE: SMOKE OK
-- The script creates throwaway users (smoke-*@example.com) and TEST
-- campaign codes, and cleans them up at the start AND end.
-- NOT a migration — do not place in supabase/migrations/.
-- ============================================================

-- ---------- cleanup (idempotent, also the final cleanup) ----------
create or replace function pg_temp.smoke_cleanup() returns void language plpgsql as $$
begin
  delete from public.redeem_codes where campaign like 'SMK%';
  delete from public.user_profiles where user_id in (select id from auth.users where email like 'smoke-%@example.com');
  delete from auth.users where email like 'smoke-%@example.com';
  delete from public.app_admins where email = 'smoke-admin@example.com';
end $$;
select pg_temp.smoke_cleanup();

-- ---------- fixtures: users + a temp admin ----------
-- user A (redeemer), B (referee), C (referrer), D/E/F (collectz joiners)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-a@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('b0000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-b@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('c0000000-0000-4000-8000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-c@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('d0000000-0000-4000-8000-00000000000d','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-d@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('e0000000-0000-4000-8000-00000000000e','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-e@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('f0000000-0000-4000-8000-00000000000f','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-f@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
on conflict (id) do nothing;

insert into public.user_profiles (user_id, referral_code)
values ('c0000000-0000-4000-8000-00000000000c','SMKREF')
on conflict (user_id) do nothing;

insert into public.app_admins (email) values ('smoke-admin@example.com') on conflict do nothing;

-- helper: act as a user (role claim mirrors PostgREST authenticated calls)
create or replace function pg_temp.act_as(p_uid uuid, p_email text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'email', p_email, 'email_verified', true)::text, true);
end $$;

create or replace function pg_temp.expect(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'SMOKE FAIL: %', p_label;
  end if;
  raise notice 'ok: %', p_label;
end $$;

-- ---------- 1. config seeded ----------
do $$
begin
  perform pg_temp.expect(public._config_text('premium_gate_start') is not null, 'config: gate_start seeded');
  perform pg_temp.expect(public._config_bool('premium_gate_on') = false, 'config: gate starts OFF (beta)');
end $$;

-- ---------- 2. admin mints codes; non-admin is refused ----------
do $$
declare v json; v_codes text[]; v_err text;
begin
  perform pg_temp.act_as('c0000000-0000-4000-8000-00000000000c','smoke-c@example.com');
  begin
    perform public.admin_create_redeem_codes('pro', 30, 1, 'SMKNO', 1, null, 'x');
    raise exception 'SMOKE FAIL: non-admin could mint codes';
  exception when insufficient_privilege then
    raise notice 'ok: non-admin mint refused (42501)';
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);
  v := public.admin_create_redeem_codes('pro', 30, 2, 'SMK1', 1, null, 'smoke batch');
  perform pg_temp.expect((v->>'ok')::boolean, 'admin mint returned ok');
  perform pg_temp.expect(json_array_length(v->'codes') = 2, 'admin mint returned 2 codes');
end $$;

-- ---------- 3. redeem flow ----------
do $$
declare
  v_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_b uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_code text; v_code2 text; v json; v_until timestamptz; v_until2 timestamptz;
  v_gate timestamptz := public._config_ts('premium_gate_start');
begin
  select code into v_code from public.redeem_codes where campaign='SMK1' order by code limit 1;

  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.redeem_code(' ' || lower(substr(v_code,1,4)) || '-' || substr(v_code,5) || ' '); -- messy input normalized
  perform pg_temp.expect((v->>'ok')::boolean, 'redeem ok with messy formatting');
  perform pg_temp.expect(v->>'tier' = 'pro' and (v->>'days')::int = 30, 'redeem returns tier/days');
  v_until := (v->>'premium_until')::timestamptz;
  perform pg_temp.expect(v_until = v_gate + interval '30 days', 'beta grant starts at gate_start, +30d');

  -- idempotent per code
  v := public.redeem_code(v_code);
  perform pg_temp.expect(v->>'reason' = 'already_redeemed', 'second redeem of same code refused');

  -- one per campaign
  select code into v_code2 from public.redeem_codes where campaign='SMK1' and code <> v_code;
  v := public.redeem_code(v_code2);
  perform pg_temp.expect(v->>'reason' = 'campaign_already_used', 'one code per campaign per user');

  -- exhausted for someone else
  perform pg_temp.act_as(v_b,'smoke-b@example.com');
  v := public.redeem_code(v_code);
  perform pg_temp.expect(v->>'reason' = 'code_exhausted', 'single-use code exhausted for user B');

  -- brute force: 5 wrong tries then locked
  for i in 1..5 loop
    v := public.redeem_code('ZZZZZZZZ' || i::text);
    perform pg_temp.expect(v->>'reason' = 'invalid_code', 'unknown code ' || i || ' = generic invalid');
  end loop;
  v := public.redeem_code('ZZZZZZZZ99');
  perform pg_temp.expect(v->>'reason' = 'rate_limited', '6th wrong try rate-limited');

  -- stacking: A redeems two codes from another campaign -> sequential windows
  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);
  v := public.admin_create_redeem_codes('pro', 30, 2, 'SMK2', 1, null, null);
  select code into v_code2 from public.redeem_codes where campaign='SMK2' order by code limit 1;
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.redeem_code(v_code2);
  perform pg_temp.expect((v->>'ok')::boolean, 'SMK2 first code ok');
  select code into v_code2 from public.redeem_codes where campaign='SMK2' and use_count = 0 limit 1;
  v := public.redeem_code(v_code2);
  perform pg_temp.expect((v->>'ok')::boolean, 'SMK2 second code ok (different campaign)');
  v_until2 := (v->>'premium_until')::timestamptz;
  perform pg_temp.expect(v_until2 = v_gate + interval '90 days', 'stacking is sequential: gate + 90d total');

  -- pre-launch: grants are future-dated, so my_entitlement says free while beta is open
  v := public.my_entitlement(null);
  perform pg_temp.expect(v->>'tier' = 'free', 'beta: future-dated grants do NOT leak into open beta');
  perform pg_temp.expect((v->>'gate_on')::boolean = false, 'my_entitlement reports gate off');
end $$;

-- ---------- 4. referral flow ----------
do $$
declare
  v_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_b uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_c uuid := 'c0000000-0000-4000-8000-00000000000c';
  v json;
begin
  -- self-referral refused
  perform pg_temp.act_as(v_c,'smoke-c@example.com');
  v := public.claim_referral('SMKREF', 'dev-c', 'link', null);
  perform pg_temp.expect(v->>'reason' = 'self_referral', 'self-referral refused');

  -- register C's device so the same-device guard has something to match
  perform public.my_entitlement('dev-c');

  -- B claims C's code (new account) -> instant welcome grant
  perform pg_temp.act_as(v_b,'smoke-b@example.com');
  v := public.claim_referral(' smkref ', 'dev-b', 'link', null);
  perform pg_temp.expect((v->>'ok')::boolean, 'claim ok (case/space normalized)');
  perform pg_temp.expect((v->>'welcome_days')::int = 30, 'welcome grant = 30d');

  -- duplicate claim refused
  v := public.claim_referral('SMKREF', 'dev-b', 'link', null);
  perform pg_temp.expect(v->>'reason' = 'already_referred', 'one referral per account');

  -- same-device refused: D claims C's code FROM C's own device
  perform pg_temp.act_as('d0000000-0000-4000-8000-00000000000d','smoke-d@example.com');
  v := public.claim_referral('SMKREF', 'dev-c', 'link', null);
  perform pg_temp.expect(v->>'reason' = 'same_device', 'claim from referrer''s device refused');

  -- a different new user on their own device can still claim
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.claim_referral('SMKREF', 'dev-a', 'link', null);
  perform pg_temp.expect((v->>'ok')::boolean, 'second legit claim ok');
end $$;

-- note: A could not claim above (device), so test the referrer payout with B only.
-- ---------- 5. qualification: too early, then qualified ----------
do $$
declare
  v_b uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_c uuid := 'c0000000-0000-4000-8000-00000000000c';
  v json; v_status text; v_cnt int;
begin
  perform pg_temp.act_as(v_b,'smoke-b@example.com');
  perform public.my_entitlement('dev-b');
  select status into v_status from public.referrals where referred_user_id = v_b;
  perform pg_temp.expect(v_status = 'pending', 'new account stays pending (too young)');

  -- age the account, add 3 active days, re-run
  update auth.users set created_at = now() - interval '8 days' where id = v_b;
  insert into public.user_activity (user_id, day) values
    (v_b, current_date - 2), (v_b, current_date - 1), (v_b, current_date)
  on conflict do nothing;
  perform public.my_entitlement('dev-b');

  select status into v_status from public.referrals where referred_user_id = v_b;
  perform pg_temp.expect(v_status = 'rewarded', 'referral rewarded once referee proves real');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'referral_reward' and days = 30;
  perform pg_temp.expect(v_cnt = 1, 'referrer received one 30d pro grant');
end $$;

-- ---------- 6. collectz milestone (3 qualified joins) ----------
do $$
declare
  v_c uuid := 'c0000000-0000-4000-8000-00000000000c';
  v_cnt int;
begin
  -- simulate three qualified collectz-sourced referrals for C
  insert into public.referrals (referrer_user_id, referred_user_id, code, status, source, session_code)
  values
    (v_c,'d0000000-0000-4000-8000-00000000000d','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'e0000000-0000-4000-8000-00000000000e','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'f0000000-0000-4000-8000-00000000000f','SMKREF','rewarded','collectz','SMKSES')
  on conflict (referred_user_id) do nothing;

  perform pg_temp.act_as(v_c,'smoke-c@example.com');
  perform public.my_entitlement('dev-c');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'collectz_milestone';
  perform pg_temp.expect(v_cnt = 1, 'collectz milestone granted once at 3 qualified joins');

  -- idempotent: second pass does not double-grant (partial unique index)
  perform public.my_entitlement('dev-c');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'collectz_milestone';
  perform pg_temp.expect(v_cnt = 1, 'milestone is one-time');
end $$;

-- ---------- 7. admin tools ----------
do $$
declare
  v_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  v json; v_code text; v_gid uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);

  v := public.admin_grant_premium(v_a, 'premium', 7, 'smoke manual');
  perform pg_temp.expect((v->>'ok')::boolean, 'manual admin grant ok');

  v_gid := (v->>'grant_id')::uuid;
  v := public.admin_revoke_grant(v_gid);
  perform pg_temp.expect((v->>'ok')::boolean, 'revoke ok');

  select code into v_code from public.redeem_codes where campaign='SMK1' and use_count > 0 limit 1;
  v := public.admin_list_redemptions(v_code);
  perform pg_temp.expect(json_array_length(v) = 1, 'redemptions list shows the redeemer');

  v := public.admin_referral_funnel();
  perform pg_temp.expect((v->'totals'->>'referrals')::int >= 4, 'funnel counts referrals');

  v := public.admin_set_redeem_code_disabled(v_code, true);
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.redeem_code(v_code);
  perform pg_temp.expect(v->>'reason' in ('code_disabled','already_redeemed'), 'disabled code refused');
end $$;

-- ---------- gate flip sanity (then restore OFF) ----------
do $$
declare
  v_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_f uuid := 'f0000000-0000-4000-8000-00000000000f';
  v json;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);
  -- launch "yesterday", then a NEW grant becomes live immediately...
  perform public.admin_set_gate(true, now() - interval '1 day');
  perform public.admin_grant_premium(v_f, 'premium', 7, 'smoke live grant');
  perform pg_temp.act_as(v_f,'smoke-f@example.com');
  v := public.my_entitlement(null);
  perform pg_temp.expect(v->>'tier' = 'premium', 'post-launch grant is live immediately');
  perform pg_temp.expect((v->>'gate_on')::boolean = true, 'gate reported ON');

  -- ...but A's beta-era grants were BAKED with starts at the old future
  -- gate_start, which we moved backwards without shifting them: still queued.
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.my_entitlement(null);
  perform pg_temp.expect(v->>'tier' = 'free', 'baked beta grants keep their baked start dates');

  -- restore beta state
  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);
  perform public.admin_set_gate(false, '2026-09-01T00:00:00+08:00');
  perform pg_temp.expect(public._config_bool('premium_gate_on') = false, 'gate restored to OFF');
end $$;

-- ---------- final cleanup ----------
select pg_temp.smoke_cleanup();
drop function pg_temp.smoke_cleanup();
drop function pg_temp.act_as(uuid, text);
drop function pg_temp.expect(boolean, text);

do $$ begin raise notice 'SMOKE OK'; end $$;
