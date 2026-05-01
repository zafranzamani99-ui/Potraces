-- ============================================================
-- Referrals — each authenticated user gets a stable 6-char code
-- that a new sign-up can redeem. Bonuses are applied by an edge
-- function (to be built when the bonus logic is decided).
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  referral_code  text unique not null,
  referred_by    text,
  created_at     timestamptz not null default now()
);

create index if not exists user_profiles_referral_code_idx on public.user_profiles(referral_code);

alter table public.user_profiles enable row level security;

-- Anyone authenticated can read their own profile.
create policy "user_profiles_owner_read" on public.user_profiles
  for select using (auth.uid() = user_id);

-- Anyone authenticated can insert their own profile on first run.
create policy "user_profiles_owner_insert" on public.user_profiles
  for insert with check (auth.uid() = user_id);

-- Allow authenticated users to update their own profile (e.g. setting
-- referred_by on first run). Column-level checks happen app-side.
create policy "user_profiles_owner_update" on public.user_profiles
  for update using (auth.uid() = user_id);

-- Public read of referral_code by code (so invite links can resolve
-- the referrer). Returns nothing else — keep exposure minimal.
create policy "user_profiles_public_code_lookup" on public.user_profiles
  for select using (referral_code is not null);

-- Referral events (who redeemed whose code, when).
create table if not exists public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_user_id   uuid not null references auth.users(id) on delete cascade,
  referred_user_id   uuid not null references auth.users(id) on delete cascade,
  code               text not null,
  created_at         timestamptz not null default now(),
  constraint referrals_unique_per_referred unique (referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);

alter table public.referrals enable row level security;

-- Referrer and referred can both read the record.
create policy "referrals_party_read" on public.referrals
  for select using (auth.uid() = referrer_user_id or auth.uid() = referred_user_id);

-- Inserts happen through an edge function (service role) to validate codes.
-- No client INSERT policy on purpose.
