-- ─── client_edit_at: client-authoritative edit timestamp for true LWW ─────────
-- WHY: personal tables carry a BEFORE UPDATE trigger (handle_updated_at) that
-- overwrites updated_at with server now() on every upsert-update. Because the
-- sync layer re-pushes all rows each cycle and resolves conflicts on updated_at,
-- that degraded multi-device conflict resolution to last-PUSH-wins — a genuinely
-- newer edit on one device could be silently overwritten by a stale device that
-- merely pushed later (and it defeated walletReconcile's "don't bump updatedAt"
-- safeguard). See memory: wallet-money-model-bugs / money-data-safety-audit.
--
-- FIX: add client_edit_at — a timestamp the client writes (its real edit time)
-- that NO server trigger touches. Sync now resolves conflicts on client_edit_at
-- (last-EDIT-wins). updated_at remains the server-side audit stamp. Nullable with
-- no default so pre-existing rows fall back to updated_at until they're re-pushed.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the app build that writes
-- client_edit_at. The app's schema preflight (SCHEMA_PROBES) now probes this
-- column, so on an un-migrated DB sync stays disabled (safe) rather than erroring.

alter table public.personal_transactions      add column if not exists client_edit_at timestamptz;
alter table public.personal_wallets           add column if not exists client_edit_at timestamptz;
alter table public.personal_wallet_transfers  add column if not exists client_edit_at timestamptz;
alter table public.personal_subscriptions     add column if not exists client_edit_at timestamptz;
alter table public.personal_budgets           add column if not exists client_edit_at timestamptz;
alter table public.personal_goals             add column if not exists client_edit_at timestamptz;
alter table public.personal_debts             add column if not exists client_edit_at timestamptz;
alter table public.personal_splits            add column if not exists client_edit_at timestamptz;
alter table public.personal_savings_accounts  add column if not exists client_edit_at timestamptz;
alter table public.personal_receipts          add column if not exists client_edit_at timestamptz;

-- Backfill existing rows so the first LWW comparison after upgrade has a value
-- (equal to the current updated_at); future writes set it from the client.
update public.personal_transactions      set client_edit_at = updated_at where client_edit_at is null;
update public.personal_wallets           set client_edit_at = updated_at where client_edit_at is null;
update public.personal_wallet_transfers  set client_edit_at = updated_at where client_edit_at is null;
update public.personal_subscriptions     set client_edit_at = updated_at where client_edit_at is null;
update public.personal_budgets           set client_edit_at = updated_at where client_edit_at is null;
update public.personal_goals             set client_edit_at = updated_at where client_edit_at is null;
update public.personal_debts             set client_edit_at = updated_at where client_edit_at is null;
update public.personal_splits            set client_edit_at = updated_at where client_edit_at is null;
update public.personal_savings_accounts  set client_edit_at = updated_at where client_edit_at is null;
update public.personal_receipts          set client_edit_at = updated_at where client_edit_at is null;
