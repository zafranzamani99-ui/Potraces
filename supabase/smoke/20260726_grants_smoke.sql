-- ============================================================
-- SMOKE TEST — premium grants / redeem codes / referral rewards.
-- Migrations under test: 20260726000000_premium_grants_and_rewards.sql,
-- 20260727000000_rewards_milestone5_seen.sql (5-join milestone + new_rewards).
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
-- user A (redeemer + referee), B (referee), C (referrer), I (referee #3),
-- D/E/F/G/H (collectz joiners)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-a@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('b0000000-0000-4000-8000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-b@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('c0000000-0000-4000-8000-00000000000c','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-c@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('d0000000-0000-4000-8000-00000000000d','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-d@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('e0000000-0000-4000-8000-00000000000e','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-e@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('f0000000-0000-4000-8000-00000000000f','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-f@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-g@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-4000-8000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-h@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}'),
  ('00000000-0000-4000-8000-000000000009','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-i@example.com','x',now(),now(),now(),'{"provider":"email","providers":["email"]}','{}')
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

  -- stacking: A redeems two codes from DIFFERENT campaigns -> sequential windows.
  -- (One code per campaign per user, so the two stacking codes MUST live in
  -- separate campaigns — SMK2 then SMK3 — else the second is campaign_already_used.)
  perform set_config('request.jwt.claims',
    json_build_object('sub','c0000000-0000-4000-8000-00000000000c','role','authenticated',
                      'email','smoke-admin@example.com','email_verified',true)::text, true);
  v := public.admin_create_redeem_codes('pro', 30, 1, 'SMK2', 1, null, null);
  v := public.admin_create_redeem_codes('pro', 30, 1, 'SMK3', 1, null, null);
  select code into v_code2 from public.redeem_codes where campaign='SMK2' order by code limit 1;
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.redeem_code(v_code2);
  perform pg_temp.expect((v->>'ok')::boolean, 'SMK2 code ok');
  select code into v_code2 from public.redeem_codes where campaign='SMK3' order by code limit 1;
  v := public.redeem_code(v_code2);
  perform pg_temp.expect((v->>'ok')::boolean, 'SMK3 code ok (different campaign)');
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
  perform pg_temp.expect((v->>'welcome_days')::int = 15, 'welcome grant = 15d');

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

  -- a third referee for the batch-of-3 payout test in section 5
  perform pg_temp.act_as('00000000-0000-4000-8000-000000000009','smoke-i@example.com');
  v := public.claim_referral('SMKREF', 'dev-i', 'link', null);
  perform pg_temp.expect((v->>'ok')::boolean, 'third legit claim ok');
end $$;

-- ---------- 5. qualification + batch-of-3 referrer payout ----------
-- Referrer is paid 30d only when 3 settled friends complete a batch.
do $$
declare
  v_a uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_b uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_c uuid := 'c0000000-0000-4000-8000-00000000000c';
  v_i uuid := '00000000-0000-4000-8000-000000000009';
  v_status text; v_cnt int;
begin
  perform pg_temp.act_as(v_b,'smoke-b@example.com');
  perform public.my_entitlement('dev-b');
  select status into v_status from public.referrals where referred_user_id = v_b;
  perform pg_temp.expect(v_status = 'pending', 'new account stays pending (too young)');

  -- B proves real -> qualified, but NO payout yet (1 of 3)
  update auth.users set created_at = now() - interval '8 days' where id = v_b;
  insert into public.user_activity (user_id, day) values
    (v_b, current_date - 2), (v_b, current_date - 1), (v_b, current_date)
  on conflict do nothing;
  perform public.my_entitlement('dev-b');
  select status into v_status from public.referrals where referred_user_id = v_b;
  perform pg_temp.expect(v_status = 'qualified', 'first settled friend: qualified, not yet rewarded');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'referral_reward';
  perform pg_temp.expect(v_cnt = 0, 'no payout before the batch completes (1 of 3)');

  -- A proves real -> 2 of 3, still nothing
  update auth.users set created_at = now() - interval '8 days' where id = v_a;
  insert into public.user_activity (user_id, day) values
    (v_a, current_date - 2), (v_a, current_date - 1), (v_a, current_date)
  on conflict do nothing;
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  perform public.my_entitlement('dev-a');
  select status into v_status from public.referrals where referred_user_id = v_a;
  perform pg_temp.expect(v_status = 'qualified', 'second settled friend: qualified (2 of 3)');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'referral_reward';
  perform pg_temp.expect(v_cnt = 0, 'no payout before the batch completes (2 of 3)');

  -- I proves real -> batch completes: C paid one 30d grant
  update auth.users set created_at = now() - interval '8 days' where id = v_i;
  insert into public.user_activity (user_id, day) values
    (v_i, current_date - 2), (v_i, current_date - 1), (v_i, current_date)
  on conflict do nothing;
  perform pg_temp.act_as(v_i,'smoke-i@example.com');
  perform public.my_entitlement('dev-i');
  select status into v_status from public.referrals where referred_user_id = v_i;
  perform pg_temp.expect(v_status = 'rewarded', 'third settled friend completes the batch');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'referral_reward' and days = 30;
  perform pg_temp.expect(v_cnt = 1, 'referrer received one 30d batch grant at 3 settled friends');
end $$;

-- ---------- 6. collectz milestone (5 qualified joins) ----------
do $$
declare
  v_c uuid := 'c0000000-0000-4000-8000-00000000000c';
  v_cnt int;
  v json;
begin
  -- simulate five qualified collectz-sourced referrals for C
  insert into public.referrals (referrer_user_id, referred_user_id, code, status, source, session_code)
  values
    (v_c,'d0000000-0000-4000-8000-00000000000d','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'e0000000-0000-4000-8000-00000000000e','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'f0000000-0000-4000-8000-00000000000f','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'00000000-0000-4000-8000-000000000007','SMKREF','qualified','collectz','SMKSES'),
    (v_c,'00000000-0000-4000-8000-000000000008','SMKREF','rewarded','collectz','SMKSES')
  on conflict (referred_user_id) do nothing;

  perform pg_temp.act_as(v_c,'smoke-c@example.com');
  -- C's first launch after the batch completed + 5 collectz joins: lazy-qualify
  -- pays the milestone, and BOTH surprise grants surface via new_rewards
  -- (then marked seen).
  v := public.my_entitlement('dev-c');
  perform pg_temp.expect(exists (
    select 1 from json_array_elements(v->'new_rewards') e where e->>'source' = 'referral_reward'
  ), 'new_rewards delivers the referrer payout');
  perform pg_temp.expect(exists (
    select 1 from json_array_elements(v->'new_rewards') e where e->>'source' = 'collectz_milestone'
  ), 'new_rewards delivers the collectz milestone');
  perform pg_temp.expect(not exists (
    select 1 from json_array_elements(v->'new_rewards') e where e->>'source' = 'referral_welcome'
  ), 'welcome grant is born seen — never in new_rewards');

  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'collectz_milestone';
  perform pg_temp.expect(v_cnt = 1, 'collectz milestone granted once at 5 qualified joins');

  -- idempotent: second pass does not double-grant (partial unique index),
  -- and new_rewards is exactly-once (empty on the next launch).
  v := public.my_entitlement('dev-c');
  select count(*) into v_cnt from public.entitlement_grants
   where user_id = v_c and source = 'collectz_milestone';
  perform pg_temp.expect(v_cnt = 1, 'milestone is one-time');
  perform pg_temp.expect(json_array_length(v->'new_rewards') = 0, 'new_rewards is exactly-once');
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
  perform pg_temp.expect(exists (
    select 1 from json_array_elements(v->'new_rewards') e where e->>'source' = 'admin_manual'
  ), 'admin manual grant surfaces via new_rewards');

  -- ...but A's beta-era grants were BAKED with starts at the old future
  -- gate_start, which we moved backwards without shifting them: still queued.
  perform pg_temp.act_as(v_a,'smoke-a@example.com');
  v := public.my_entitlement(null);
  perform pg_temp.expect(v->>'tier' = 'free', 'baked beta grants keep their baked start dates');
  -- A's history: welcome + redeems (born seen) and a REVOKED admin grant — none surface.
  perform pg_temp.expect(json_array_length(v->'new_rewards') = 0, 'revoked + born-seen grants never surface');

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
