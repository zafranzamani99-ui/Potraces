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
  with check (auth.uid() = user_id);

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
