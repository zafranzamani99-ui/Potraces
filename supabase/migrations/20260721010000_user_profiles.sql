-- User profiles: the avatar choice that other people can see. The app's
-- avatar (settings store) is device-local; this table is the shared copy so
-- surfaces like the Collectz roster can show a claimed participant's avatar.
-- The app upserts its own row (debounced, on every avatar change); free users
-- included — an avatar is identity, not backup.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_id text,
  avatar_uri text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- READ: any signed-in user (avatars are shown on shared surfaces to people you
-- share with — not sensitive). WRITE: owner only.
create policy "user_profiles_select_authenticated" on public.user_profiles
  for select to authenticated using (true);
create policy "user_profiles_insert_own" on public.user_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_profiles_update_own" on public.user_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
