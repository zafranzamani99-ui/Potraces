-- Import batch fields on personal_transactions (Phase 0 of import reconciliation,
-- docs/plans/import-reconciliation-design.md §2).
--   external_ref    — bank reference number when the statement parser has one.
--   import_batch_id — groups rows created by one statement/CSV import; enables undo.
-- Both nullable, no defaults. The owner RLS policy on personal_transactions is
-- `for all using (auth.uid() = user_id)` — not column-scoped — so no policy changes.

alter table public.personal_transactions add column if not exists external_ref text;
alter table public.personal_transactions add column if not exists import_batch_id text;
