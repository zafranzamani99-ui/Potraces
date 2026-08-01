-- Incremental-sync groundwork (Stage 0a) — see docs/INCREMENTAL_SYNC_PLAN.md.
-- Adds a (user_id, updated_at) index to every synced personal_* ROW table so a future
-- cursor pull (`where user_id = ? and updated_at > ? order by updated_at`) is index-served
-- instead of a per-table seq-scan+sort. Purely ADDITIVE: no reader uses it yet, no column
-- or behavior changes, safe to re-run. The 3 single-row blob tables (budget_profile,
-- categories, learning) are intentionally excluded — one row per user needs no cursor index.
--
-- Plain (not CONCURRENTLY) so it applies inside `supabase db push`'s per-migration transaction,
-- matching the repo's existing index migrations. These per-user tables are small, so the brief
-- build lock is negligible. (For a zero-lock build on a large table, run CONCURRENTLY by hand
-- outside a migration instead.)

create index if not exists personal_transactions_user_updated_idx
  on public.personal_transactions (user_id, updated_at);

create index if not exists personal_wallets_user_updated_idx
  on public.personal_wallets (user_id, updated_at);

create index if not exists personal_wallet_transfers_user_updated_idx
  on public.personal_wallet_transfers (user_id, updated_at);

create index if not exists personal_subscriptions_user_updated_idx
  on public.personal_subscriptions (user_id, updated_at);

create index if not exists personal_budgets_user_updated_idx
  on public.personal_budgets (user_id, updated_at);

create index if not exists personal_goals_user_updated_idx
  on public.personal_goals (user_id, updated_at);

create index if not exists personal_debts_user_updated_idx
  on public.personal_debts (user_id, updated_at);

create index if not exists personal_splits_user_updated_idx
  on public.personal_splits (user_id, updated_at);

create index if not exists personal_contacts_user_updated_idx
  on public.personal_contacts (user_id, updated_at);

create index if not exists personal_savings_accounts_user_updated_idx
  on public.personal_savings_accounts (user_id, updated_at);

create index if not exists personal_receipts_user_updated_idx
  on public.personal_receipts (user_id, updated_at);

create index if not exists personal_notes_user_updated_idx
  on public.personal_notes (user_id, updated_at);
