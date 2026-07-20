-- Collectz v2: session image (club identity), maps link, remind cooldown,
-- participant archive.
--
-- Notes:
--  * archived_at needs NO guard-trigger change: collectz_participant_guard's
--    immutable list (20260721000000) does not include it, and the self-UPDATE
--    policy already covers the participant's own row — hiding is a self-write
--    that touches nothing else.
--  * collectz-images is a PUBLIC bucket: club images are shown on the public
--    join page anyway (same reasoning as the public `web` bucket for shortcuts).
--    Path convention: {session_id}/{file} — only the session owner writes.

-- ── Columns ────────────────────────────────────────────────────────────────

alter table public.collectz_sessions
  add column if not exists image_path text,
  add column if not exists maps_url text,
  add column if not exists last_reminded_at timestamptz;

alter table public.collectz_participants
  add column if not exists archived_at timestamptz;

-- ── Club-images bucket (public read, owner write) ──────────────────────────

insert into storage.buckets (id, name, public)
values ('collectz-images', 'collectz-images', true)
on conflict (id) do nothing;

drop policy if exists "collectz_images_owner_insert" on storage.objects;
create policy "collectz_images_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'collectz-images'
    and public.collectz_is_session_owner((storage.foldername(name))[1])
  );

drop policy if exists "collectz_images_owner_update" on storage.objects;
create policy "collectz_images_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'collectz-images'
    and public.collectz_is_session_owner((storage.foldername(name))[1])
  );

drop policy if exists "collectz_images_owner_delete" on storage.objects;
create policy "collectz_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'collectz-images'
    and public.collectz_is_session_owner((storage.foldername(name))[1])
  );
