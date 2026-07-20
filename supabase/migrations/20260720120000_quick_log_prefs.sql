-- Quick Log preferences: the app's category labels per user, uploaded directly
-- by the app (RLS, own row only) so the shared Shortcut can fetch them live via
-- the quick-log function's action:'categories' — the same trick the Payment
-- picker already uses for wallets. This is quick-log infrastructure, NOT cloud
-- backup: free signed-in users get it too.

create table if not exists public.quick_log_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  categories jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.quick_log_prefs enable row level security;

-- Owner-only access (the app upserts its own row; the edge function reads via
-- the service role, which bypasses RLS).
create policy "quick_log_prefs_select_own" on public.quick_log_prefs
  for select to authenticated using (auth.uid() = user_id);
create policy "quick_log_prefs_insert_own" on public.quick_log_prefs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "quick_log_prefs_update_own" on public.quick_log_prefs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
