-- ============================================================
-- Potraces — public launch waitlist (homepage "Notify me")
--
-- Captures email/phone from anonymous visitors on jejakbaki.my.
-- Anyone (signed-out) may INSERT; the list is NOT publicly readable;
-- only an admin (public.is_admin(), from beta_feedback.sql) may read it.
--
-- Apply via: Supabase dashboard > project iydqeeonaljqapulboaz >
--            SQL Editor > paste this whole file > Run.
-- Idempotent. REQUIRES beta_feedback.sql to have been run first
-- (it defines public.is_admin(), used by the admin SELECT policy).
-- ============================================================

-- Fail fast with a clear message if the prerequisite is missing, instead of
-- creating half the objects and then aborting on the admin SELECT policy below.
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Run docs/beta_feedback.sql first — it defines public.is_admin(), used by this file.';
  end if;
end $$;

create extension if not exists "pgcrypto";

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  contact     text not null,        -- email or phone, as typed
  kind        text,                 -- 'email' | 'phone' (client hint)
  source      text,                 -- 'hero' | 'final' (which form)
  user_agent  text
);

create index if not exists waitlist_created_idx on public.waitlist(created_at desc);

-- launch-blast bookkeeping: stamped when this contact was sent the one "we're live"
-- message, so re-running the blast never messages the same person twice. NULL = not yet notified.
alter table public.waitlist add column if not exists notified_at timestamptz;

-- length guard (mirrors the WITH CHECK below)
alter table public.waitlist drop constraint if exists waitlist_contact_len;
alter table public.waitlist
  add  constraint waitlist_contact_len check (char_length(btrim(contact)) between 3 and 120);

-- de-dupe on the normalized contact so the same person can't pile up rows
create unique index if not exists waitlist_contact_uniq
  on public.waitlist (lower(btrim(contact)));

alter table public.waitlist enable row level security;

-- Anyone may JOIN — INSERT only, with a length guard. No anon SELECT, so the
-- email/phone list can never be read back by the public.
drop policy if exists "waitlist_insert_any" on public.waitlist;
create policy "waitlist_insert_any" on public.waitlist
  for insert to anon, authenticated
  with check (char_length(btrim(contact)) between 3 and 120);

-- The list is private: only an admin may read it (in admin.html / dashboard).
drop policy if exists "waitlist_select_admin" on public.waitlist;
create policy "waitlist_select_admin" on public.waitlist
  for select to authenticated
  using (public.is_admin());

revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;
grant select on public.waitlist to authenticated;  -- still gated to admin by RLS
