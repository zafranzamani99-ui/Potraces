-- ============================================================
-- Public "web" bucket for serving static HTML pages
-- (order page for customers to place orders via the shop link)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('web', 'web', true)
on conflict (id) do update set public = true;

-- Allow anyone to read files in this bucket
create policy "web_public_read" on storage.objects
  for select using (bucket_id = 'web');
