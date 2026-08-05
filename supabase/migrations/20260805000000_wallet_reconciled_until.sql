-- Reconcile horizon on personal_wallets (Phase 3 of import reconciliation,
-- docs/plans/import-reconciliation-design.md §10).
--   reconciled_until — YYYY-MM-DD horizon date; import matching freezes this
-- wallet's rows on/before it (a reconciled period is locked).
-- Nullable, no default. The owner RLS policy on personal_wallets is
-- `for all using (auth.uid() = user_id)` — not column-scoped — so no policy changes.

alter table public.personal_wallets add column if not exists reconciled_until text;
