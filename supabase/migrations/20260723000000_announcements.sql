-- Announcements: the in-app notification inbox. An admin broadcasts a title+body
-- from admin.html (via the broadcast-send edge function), which inserts ONE row
-- here and pushes it to every device. The app reads active announcements to build
-- its inbox. Title/body are not sensitive, so any signed-in user can read — like
-- user_profiles; only an admin (is_admin()) can write.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

alter table public.announcements enable row level security;

-- READ: any signed-in user (announcements are shown to everyone in-app).
-- WRITE: admins only. is_admin() is the security-definer gate defined in
-- 20260616120000_beta_feedback.sql (true when the caller's JWT email is in
-- app_admins). The broadcast-send function inserts via the service role, which
-- bypasses RLS — these write policies still gate any direct authenticated write.
create policy "announcements_select_authenticated" on public.announcements
  for select to authenticated using (true);
create policy "announcements_insert_admin" on public.announcements
  for insert to authenticated with check (public.is_admin());
create policy "announcements_update_admin" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "announcements_delete_admin" on public.announcements
  for delete to authenticated using (public.is_admin());

-- The app's inbox query: active rows, newest first.
create index if not exists announcements_active_created_idx
  on public.announcements (active, created_at desc);
