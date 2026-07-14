-- ============================================================
-- Potraces — Beta feedback (account-gated tester submissions)
--
-- This is the CANONICAL backend for the public web feedback page
-- docs/beta.html (served at https://jejakbaki.my/beta.html).
-- Testers sign in (Google OAuth or email magic link) and submit
-- feedback tied to their own account. RLS keeps every tester's
-- rows private to them; the founder triages via service_role.
--
-- Apply via: Supabase dashboard > project iydqeeonaljqapulboaz >
--            SQL Editor > paste this whole file > Run.
-- Idempotent: safe to re-run (create-if-not-exists / drop-policy-if-exists).
-- Optionally version-control it as:
--   supabase/migrations/20260616120000_beta_feedback.sql
--
-- NOTE: this REPLACES the older anon-insert placeholder in
-- docs/beta/beta_feedback.sql (that one was for an in-app, no-account
-- WhatsApp-first flow). The web page uses accounts, so keep this one.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Table ───────────────────────────────────────────────────
create table if not exists public.beta_feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid()
                    references auth.users(id) on delete cascade,
  email           text,
  created_at      timestamptz not null default now(),
  screen          text,
  severity        text,
  body            text not null,
  screenshot_path text,
  app_version     text,
  user_agent      text,
  status          text not null default 'new'
);

create index if not exists beta_feedback_user_idx    on public.beta_feedback(user_id);
create index if not exists beta_feedback_created_idx  on public.beta_feedback(created_at desc);
create index if not exists beta_feedback_status_idx   on public.beta_feedback(status);

-- Keep the data sane (no scolding tone in app, but guard rails are fine in DB).
alter table public.beta_feedback
  drop constraint if exists beta_feedback_body_nonempty;
alter table public.beta_feedback
  add  constraint beta_feedback_body_nonempty check (length(btrim(body)) > 0);

alter table public.beta_feedback
  drop constraint if exists beta_feedback_severity_chk;
alter table public.beta_feedback
  add  constraint beta_feedback_severity_chk
  check (severity is null or severity in ('idea','minor','major','blocker'));

alter table public.beta_feedback enable row level security;

-- ── RLS ─────────────────────────────────────────────────────
-- A tester may INSERT only rows that belong to them. The DEFAULT auth.uid()
-- fills user_id; WITH CHECK guarantees a client cannot spoof another uid.
drop policy if exists "beta_feedback_insert_own" on public.beta_feedback;
create policy "beta_feedback_insert_own" on public.beta_feedback
  for insert to authenticated
  with check (
    auth.uid() = user_id
    -- the convenience email copy must be the caller's own (it's shown to the
    -- admin as the reporter identity; don't let a tester spoof someone else's)
    and (email is null or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
  );

-- A tester may SELECT only their own rows.
drop policy if exists "beta_feedback_select_own" on public.beta_feedback;
create policy "beta_feedback_select_own" on public.beta_feedback
  for select to authenticated
  using (auth.uid() = user_id);

-- No UPDATE / DELETE policies for testers (status is owned by the founder).
-- No anon access at all: revoke and only grant to authenticated.
revoke all on public.beta_feedback from anon;
grant  select, insert on public.beta_feedback to authenticated;
-- Founder reads/triages everything via the service_role key / dashboard,
-- which bypasses RLS by design.

-- ============================================================
-- Private storage bucket for OPTIONAL feedback screenshots
-- ============================================================

insert into storage.buckets (id, name, public)
values ('beta-screenshots', 'beta-screenshots', false)
on conflict (id) do update set public = false;

-- Authenticated users may upload ONLY under a folder named with their own uid
-- (path = "{auth.uid()}/{file}"). Matches the project's receipt-images pattern.
drop policy if exists "beta_screenshots_owner_insert" on storage.objects;
create policy "beta_screenshots_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'beta-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated users may read ONLY their own files. No public read.
drop policy if exists "beta_screenshots_owner_read" on storage.objects;
create policy "beta_screenshots_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'beta-screenshots'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- (Founder reads any screenshot via service_role / dashboard, which bypasses RLS.)
-- To share/preview a screenshot, mint a short-lived signed URL server-side:
--   storage.from('beta-screenshots').createSignedUrl(path, 3600)

-- ============================================================
-- v2 (2026-06-17): tester edit/delete + an in-app ADMIN view
--   so the founder can triage from /admin.html (own account,
--   NO service_role in the browser). Everything below is
--   idempotent — safe to re-run the whole file.
-- ============================================================

-- ── Status is admin-owned; constrain the allowed set ────────
alter table public.beta_feedback drop constraint if exists beta_feedback_status_chk;
alter table public.beta_feedback
  add  constraint beta_feedback_status_chk
  check (status in ('new','triaged','fixed','wontfix','dup','done'));

-- ── screenshot_path must live under the OWNER's own uid folder ─
-- Defense in depth: testers hold an UPDATE grant on screenshot_path, so without
-- this a tester could store an arbitrary string (path traversal, or an XSS
-- payload that the admin UI would render). Force "<uid>/...".
alter table public.beta_feedback drop constraint if exists beta_feedback_shotpath_chk;
alter table public.beta_feedback
  add  constraint beta_feedback_shotpath_chk
  check (screenshot_path is null or screenshot_path like user_id::text || '/%');

-- ── Testers may EDIT their own reports — CONTENT columns only ─
-- Row scope via RLS; column scope via a column-level GRANT (status,
-- user_id, email are deliberately NOT grantable to authenticated, so a
-- tester can never change their triage status or reassign ownership).
drop policy if exists "beta_feedback_update_own" on public.beta_feedback;
create policy "beta_feedback_update_own" on public.beta_feedback
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant update (body, screen, severity, screenshot_path)
  on public.beta_feedback to authenticated;

-- ── Testers may DELETE their own reports ────────────────────
drop policy if exists "beta_feedback_delete_own" on public.beta_feedback;
create policy "beta_feedback_delete_own" on public.beta_feedback
  for delete to authenticated
  using (auth.uid() = user_id);
grant delete on public.beta_feedback to authenticated;

-- ════════════ ADMIN (founder) ════════════
-- Data-driven admin list (add more founders later by inserting a row).
create table if not exists public.app_admins (
  email     text primary key,
  added_at  timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies on app_admins → unreadable to anon/authenticated; only the
-- SECURITY DEFINER is_admin() (runs as owner) can read it.
insert into public.app_admins (email) values ('zafranzamani99@gmail.com')
  on conflict (email) do nothing;

-- is_admin(): true when the CALLER's verified JWT email is in app_admins.
-- security definer reads app_admins as owner; auth.jwt() still reflects the caller.
create or replace function public.is_admin()
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  -- belt-and-suspenders: deny only if the email is EXPLICITLY unverified
  -- (absent claim → treated as ok, so a legit founder is never locked out).
  and coalesce(
        (auth.jwt() ->> 'email_verified')::boolean,
        (auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean,
        true
      );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admin may SELECT every report (added alongside the per-tester select policy).
drop policy if exists "beta_feedback_select_admin" on public.beta_feedback;
create policy "beta_feedback_select_admin" on public.beta_feedback
  for select to authenticated
  using (public.is_admin());

-- Admin may DELETE any report (spam / cleanup).
drop policy if exists "beta_feedback_delete_admin" on public.beta_feedback;
create policy "beta_feedback_delete_admin" on public.beta_feedback
  for delete to authenticated
  using (public.is_admin());

-- Status changes flow through a SECURITY DEFINER rpc, NOT a direct UPDATE,
-- so testers (who hold a content-column UPDATE grant) can never touch status.
create or replace function public.admin_set_status(p_id uuid, p_status text)
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('new','triaged','fixed','wontfix','dup','done') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.beta_feedback set status = p_status where id = p_id;
end;
$$;
revoke all on function public.admin_set_status(uuid, text) from public, anon;
grant execute on function public.admin_set_status(uuid, text) to authenticated;

-- Admin may read EVERY screenshot (testers still read only their own).
drop policy if exists "beta_screenshots_admin_read" on storage.objects;
create policy "beta_screenshots_admin_read" on storage.objects
  for select to authenticated
  using ( bucket_id = 'beta-screenshots' and public.is_admin() );

-- DELETE policies — without these, every .remove() silently fails and
-- screenshots are orphaned forever (a deletion-promise / retention gap).
drop policy if exists "beta_screenshots_owner_delete" on storage.objects;
create policy "beta_screenshots_owner_delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'beta-screenshots' and auth.uid()::text = (storage.foldername(name))[1] );

drop policy if exists "beta_screenshots_admin_delete" on storage.objects;
create policy "beta_screenshots_admin_delete" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'beta-screenshots' and public.is_admin() );
