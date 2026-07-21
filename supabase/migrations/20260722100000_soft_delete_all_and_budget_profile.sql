-- ─── M1: cloud soft-delete tombstones for ALL synced personal tables ──────────
-- WHY (audit "step3 July.md" M1, 2026-07-18): SOFT_DELETE_TABLES covered only
-- personal_transactions + personal_receipts (20260718000000). Every OTHER money
-- table hard-DELETEd on tombstone push, which leaves NO cloud record of the
-- deletion — so a second device that still holds the row (and hasn't pulled)
-- re-upserts it on its next push, resurrecting a goal/wallet/debt the user
-- deleted, and autoReconcileWallets re-applies its wallet effect (permanent
-- split-brain). This extends the authoritative deleted_at cloud tombstone to
-- every remaining table personalSync pushes:
--   personal_wallets, personal_wallet_transfers, personal_subscriptions,
--   personal_budgets, personal_goals, personal_debts, personal_splits,
--   personal_contacts, personal_savings_accounts, personal_notes
-- (personal_transactions + personal_receipts already have it.)
--
-- Nullable, no default: existing rows stay live (deleted_at IS NULL). The sync
-- push sets deleted_at = now() for tombstoned local_ids instead of DELETE; the
-- pull treats any deleted_at NOT NULL row as a tombstone (deletes the local copy
-- + records a durable local tombstone). A stale device re-upserting the row
-- omits deleted_at from its payload, so PostgREST's ON CONFLICT DO UPDATE never
-- clears the tombstone.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the app build that soft-
-- deletes everywhere. The app's schema preflight probes
-- personal_wallets.deleted_at, so on an un-migrated DB personal sync stays
-- DISABLED (safe) rather than erroring mid-push.

alter table public.personal_wallets           add column if not exists deleted_at timestamptz;
alter table public.personal_wallet_transfers  add column if not exists deleted_at timestamptz;
alter table public.personal_subscriptions     add column if not exists deleted_at timestamptz;
alter table public.personal_budgets           add column if not exists deleted_at timestamptz;
alter table public.personal_goals             add column if not exists deleted_at timestamptz;
alter table public.personal_debts             add column if not exists deleted_at timestamptz;
alter table public.personal_splits            add column if not exists deleted_at timestamptz;
alter table public.personal_contacts          add column if not exists deleted_at timestamptz;
alter table public.personal_savings_accounts  add column if not exists deleted_at timestamptz;
alter table public.personal_notes             add column if not exists deleted_at timestamptz;

-- Partial-friendly composite indexes: pulls filter/scan by (user_id, deleted_at)
-- when distinguishing live rows from tombstones (same shape as the receipts/
-- transactions indexes from 20260718000000).
create index if not exists personal_wallets_user_deleted_idx
  on public.personal_wallets (user_id, deleted_at);
create index if not exists personal_wallet_transfers_user_deleted_idx
  on public.personal_wallet_transfers (user_id, deleted_at);
create index if not exists personal_subscriptions_user_deleted_idx
  on public.personal_subscriptions (user_id, deleted_at);
create index if not exists personal_budgets_user_deleted_idx
  on public.personal_budgets (user_id, deleted_at);
create index if not exists personal_goals_user_deleted_idx
  on public.personal_goals (user_id, deleted_at);
create index if not exists personal_debts_user_deleted_idx
  on public.personal_debts (user_id, deleted_at);
create index if not exists personal_splits_user_deleted_idx
  on public.personal_splits (user_id, deleted_at);
create index if not exists personal_contacts_user_deleted_idx
  on public.personal_contacts (user_id, deleted_at);
create index if not exists personal_savings_accounts_user_deleted_idx
  on public.personal_savings_accounts (user_id, deleted_at);
create index if not exists personal_notes_user_deleted_idx
  on public.personal_notes (user_id, deleted_at);

-- ─── Retention: extend purge_personal_tombstones to sweep every table ─────────
-- Same contract + retention as the existing function (20260718000000, default
-- 90 days; the pg_cron job created there calls purge_personal_tombstones(90)
-- daily and picks this new body up automatically — no re-scheduling needed).
-- 90 days comfortably exceeds the 30-day local durable-tombstone TTL, so every
-- device has pulled the deletion long before the row is hard-purged.
create or replace function public.purge_personal_tombstones(retention_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  purged int := 0;
  n int;
begin
  delete from public.personal_receipts
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_transactions
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_wallets
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_wallet_transfers
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_subscriptions
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_budgets
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_goals
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_debts
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_splits
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_contacts
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_savings_accounts
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  delete from public.personal_notes
    where deleted_at is not null and deleted_at < now() - make_interval(days => retention_days);
  get diagnostics n = row_count; purged := purged + n;

  return purged;
end;
$$;

comment on function public.purge_personal_tombstones(int) is
  'Hard-deletes rows soft-deleted more than N days ago (default 90) across ALL synced personal_* tables. Safe once all devices have pulled the deletion. Run on a schedule (pg_cron, already scheduled by 20260718000000) or from a server cron.';

-- ─── M2: personal_budget_profile — sync the budget planner income profile ─────
-- WHY (audit M2): budgetProfileStore (takeHome, must-pay commitments, modelId)
-- never synced, so device B pulled the budgets but planned them against a null
-- income — silent divergence + re-prompting for numbers the user already set.
-- ONE row per user (user_id is the PK), synced as a single LWW blob:
-- client_edit_at is the CLIENT-stamped last-edit time (same convention as every
-- other personal_* table since 20260716000000); newer client_edit_at wins on
-- both pull and push. commitments is the BudgetCommitment[] array as jsonb.
create table if not exists public.personal_budget_profile (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  take_home      numeric,
  commitments    jsonb not null default '[]',
  model_id       text,
  -- client-authoritative edit time for true LWW (no server trigger touches it)
  client_edit_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS: owner-only, same policy shape as personal_notes (20260719000000).
alter table public.personal_budget_profile enable row level security;
drop policy if exists "personal_budget_profile_owner" on public.personal_budget_profile;
create policy "personal_budget_profile_owner" on public.personal_budget_profile
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keep updated_at fresh on server-side updates (audit stamp only; LWW uses
-- client_edit_at, which no trigger overwrites).
drop trigger if exists personal_budget_profile_updated_at on public.personal_budget_profile;
create trigger personal_budget_profile_updated_at
  before update on public.personal_budget_profile
  for each row execute function public.handle_updated_at();
