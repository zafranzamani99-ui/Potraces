-- ============================================================
-- Potraces — Beta installer reward (1 month premium at launch)
--
-- Promise: everyone who joins during the beta gets 1 month premium when the
-- app goes official. The app isn't on any store yet, so EVERY account created
-- now is a beta user — the cutoff is simply the official-launch moment.
--
-- How it works (SERVER-ONLY — no app code, can't be spoofed by clients):
--   • a SECURITY DEFINER trigger on auth.users records each new signup into
--     public.beta_installers while app_config 'beta'.active = true;
--   • it is exception-safe, so a tracking error can NEVER block a signup;
--   • existing accounts are backfilled below.
--
-- AT OFFICIAL LAUNCH (do later, NOT now):
--   1) stop recording new users as beta:
--        update public.app_config
--           set value = jsonb_set(value,'{active}','false'::jsonb), updated_at = now()
--         where key = 'beta';
--   2) grant 1 month premium to the cohort (mechanism depends on the app's
--      premium model) and stamp it:
--        update public.beta_installers
--           set premium_granted_at = now()
--         where premium_granted_at is null;
--
-- Apply: Supabase SQL Editor > paste this whole file > Run. Idempotent.
-- REQUIRES beta_feedback.sql first (defines public.is_admin() for the read policy).
-- ============================================================

do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Run docs/beta_feedback.sql first — it defines public.is_admin(), used by this file.';
  end if;
end $$;

-- ── tiny key/value config (flip beta.active=false at official launch) ───────
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value)
  values ('beta', jsonb_build_object('active', true))
  on conflict (key) do nothing;
-- no client policies: only the SECURITY DEFINER trigger (as owner) + dashboard read it
alter table public.app_config enable row level security;

-- ── the beta cohort ────────────────────────────────────────────────────────
create table if not exists public.beta_installers (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  joined_at          timestamptz not null default now(),
  email              text,
  premium_granted_at timestamptz       -- stamped when the 1-month premium is granted
);
create index if not exists beta_installers_joined_idx on public.beta_installers(joined_at);

alter table public.beta_installers enable row level security;
-- founder reads the list (dashboard service_role bypasses RLS; admin.html via is_admin())
drop policy if exists "beta_installers_select_admin" on public.beta_installers;
create policy "beta_installers_select_admin" on public.beta_installers
  for select to authenticated using (public.is_admin());
revoke all on public.beta_installers from anon, authenticated;
grant select on public.beta_installers to authenticated;  -- still gated to admin by RLS
-- (no INSERT/UPDATE/DELETE grant to clients — only the trigger writes it.)

-- ── auto-record each new signup while beta is active ───────────────────────
create or replace function public.record_beta_installer()
  returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  begin
    if coalesce((select (value->>'active')::boolean from public.app_config where key = 'beta'), false) then
      insert into public.beta_installers (user_id, joined_at, email)
      values (new.id, coalesce(new.created_at, now()), new.email)
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    null;  -- beta tracking must NEVER break authentication
  end;
  return new;
end;
$$;

drop trigger if exists trg_record_beta_installer on auth.users;
create trigger trg_record_beta_installer
  after insert on auth.users
  for each row execute function public.record_beta_installer();

-- ── backfill everyone who already has an account (all pre-store = beta) ─────
insert into public.beta_installers (user_id, joined_at, email)
  select id, coalesce(created_at, now()), email from auth.users
  on conflict (user_id) do nothing;
