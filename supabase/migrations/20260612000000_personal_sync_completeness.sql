-- ============================================================
-- Potraces — Personal Sync Schema COMPLETENESS
-- ============================================================
-- The original personal_* schema (20260417100000) was missing columns for
-- many local fields. The mappers silently dropped those fields, which caused
-- real local data loss on 2026-06-11 (debt descriptions/grouping, split items
-- & method, goal icon/color, wallet initial_balance — the missing
-- `initial_balance` column even threw PGRST204 and auto-disabled sync).
--
-- This migration adds EVERY column the to/fromRemote mappers now write, so the
-- round-trip is lossless. It is additive and idempotent (add column if not
-- exists) — safe to run on a populated database.
--
-- Personal sync stays OFF until this is applied AND the preflight check in
-- personalSync.ts confirms the schema is present. Do not enable before then.
-- ============================================================

-- ─── TRANSACTIONS ─────────────────────────────────────────────
alter table public.personal_transactions add column if not exists receipt_url                  text;
alter table public.personal_transactions add column if not exists tags                         jsonb not null default '[]';
alter table public.personal_transactions add column if not exists raw_input                    text;
alter table public.personal_transactions add column if not exists input_method                 text;
alter table public.personal_transactions add column if not exists linked_payment_id            text;
alter table public.personal_transactions add column if not exists linked_debt_id               text;
alter table public.personal_transactions add column if not exists linked_goal_id               text;
alter table public.personal_transactions add column if not exists linked_goal_contribution_id  text;
alter table public.personal_transactions add column if not exists playbook_links               jsonb not null default '[]';
alter table public.personal_transactions add column if not exists original_amount              numeric(14,2);
alter table public.personal_transactions add column if not exists original_currency            text;
alter table public.personal_transactions add column if not exists fx_rate                      numeric(18,8);

-- ─── WALLETS ──────────────────────────────────────────────────
alter table public.personal_wallets add column if not exists initial_balance  numeric(14,2);
alter table public.personal_wallets add column if not exists preset_id        text;
alter table public.personal_wallets add column if not exists credit_bank      text;
alter table public.personal_wallets add column if not exists credit_network   text;

-- ─── WALLET TRANSFERS ─────────────────────────────────────────
alter table public.personal_wallet_transfers add column if not exists kind text;

-- ─── SUBSCRIPTIONS ────────────────────────────────────────────
alter table public.personal_subscriptions add column if not exists reminder_days          int;
alter table public.personal_subscriptions add column if not exists is_installment         boolean not null default false;
alter table public.personal_subscriptions add column if not exists total_installments     int;
alter table public.personal_subscriptions add column if not exists completed_installments int;
alter table public.personal_subscriptions add column if not exists image_uri              text;
alter table public.personal_subscriptions add column if not exists icon_name              text;
alter table public.personal_subscriptions add column if not exists outstanding_balance    numeric(14,2);
alter table public.personal_subscriptions add column if not exists last_paid_at           timestamptz;
alter table public.personal_subscriptions add column if not exists shared_sub_id          text;
alter table public.personal_subscriptions add column if not exists payment_history        jsonb not null default '[]';

-- ─── BUDGETS ──────────────────────────────────────────────────
alter table public.personal_budgets add column if not exists rollover        boolean;
alter table public.personal_budgets add column if not exists rollover_amount numeric(14,2);

-- ─── GOALS ────────────────────────────────────────────────────
alter table public.personal_goals add column if not exists icon            text;
alter table public.personal_goals add column if not exists color           text;
alter table public.personal_goals add column if not exists image_uri       text;
alter table public.personal_goals add column if not exists wallet_local_id text;

-- ─── DEBTS ────────────────────────────────────────────────────
alter table public.personal_debts add column if not exists description           text;
alter table public.personal_debts add column if not exists category              text;
alter table public.personal_debts add column if not exists group_id              text;
alter table public.personal_debts add column if not exists mode                  text;
alter table public.personal_debts add column if not exists split_id              text;
alter table public.personal_debts add column if not exists shared_sub_id         text;
alter table public.personal_debts add column if not exists shared_sub_month      text;
alter table public.personal_debts add column if not exists is_archived           boolean not null default false;
alter table public.personal_debts add column if not exists archived_at           timestamptz;
alter table public.personal_debts add column if not exists contact_email         text;
alter table public.personal_debts add column if not exists contact_local_id      text;
alter table public.personal_debts add column if not exists contact_is_from_phone boolean;
alter table public.personal_debts add column if not exists edit_log              jsonb not null default '[]';
-- Backfill description from the legacy `note` column where it was the only copy.
update public.personal_debts set description = note where description is null and note is not null;

-- ─── SPLITS ───────────────────────────────────────────────────
alter table public.personal_splits add column if not exists description           text;
alter table public.personal_splits add column if not exists split_method          text;
alter table public.personal_splits add column if not exists items                 jsonb not null default '[]';
alter table public.personal_splits add column if not exists paid_by               jsonb;
alter table public.personal_splits add column if not exists tax_amount            numeric(14,2);
alter table public.personal_splits add column if not exists tax_handling          text;
alter table public.personal_splits add column if not exists linked_transaction_id text;
alter table public.personal_splits add column if not exists wallet_local_id       text;
alter table public.personal_splits add column if not exists mode                  text;
alter table public.personal_splits add column if not exists status                text;
alter table public.personal_splits add column if not exists draft_receipt         jsonb;
alter table public.personal_splits add column if not exists is_archived           boolean not null default false;
alter table public.personal_splits add column if not exists archived_at           timestamptz;
-- Backfill description from the legacy NOT-NULL `title` column.
update public.personal_splits set description = title where description is null and title is not null;

-- ─── CONTACTS ─────────────────────────────────────────────────
alter table public.personal_contacts add column if not exists email        text;
alter table public.personal_contacts add column if not exists is_from_phone boolean not null default false;

-- ─── SAVINGS ACCOUNTS ─────────────────────────────────────────
alter table public.personal_savings_accounts add column if not exists initial_investment numeric(14,2);
alter table public.personal_savings_accounts add column if not exists account_type       text;
alter table public.personal_savings_accounts add column if not exists goal_name          text;
alter table public.personal_savings_accounts add column if not exists annual_rate        numeric(18,8);

-- ─── RECEIPTS ─────────────────────────────────────────────────
alter table public.personal_receipts add column if not exists title           text;
alter table public.personal_receipts add column if not exists subtotal        numeric(14,2);
alter table public.personal_receipts add column if not exists tax             numeric(14,2);
alter table public.personal_receipts add column if not exists category        text;
alter table public.personal_receipts add column if not exists payment_method  text;
alter table public.personal_receipts add column if not exists location        text;
alter table public.personal_receipts add column if not exists wallet_local_id text;
alter table public.personal_receipts add column if not exists verified        boolean not null default false;
