-- ─── B3: cloud soft-delete tombstones for receipts + transactions ─────────────
-- WHY: personal sync's remote delete was a hard DELETE, which leaves NO record in
-- the cloud that a row was deleted. A second device that still holds the row (and
-- hasn't pulled the deletion) re-upserts it on its next push, resurrecting a
-- receipt/transaction the user deleted — the exact zombie the durable LOCAL
-- tombstone store only guards against for its own TTL window. This adds an
-- AUTHORITATIVE cloud tombstone (deleted_at) for these two tables so every device
-- learns of the deletion on its next pull. This closes the "authoritative cloud
-- tombstone (audit doc 05, later phase)" gap — scoped ONLY to receipts and
-- transactions; all other personal tables keep their hard-DELETE + durable local
-- tombstone behavior unchanged.
--
-- Nullable, no default: existing rows stay live (deleted_at IS NULL). The sync
-- push sets deleted_at = now() for tombstoned local_ids instead of DELETE; the
-- pull treats any deleted_at NOT NULL row as a tombstone (deletes the local copy +
-- records a durable local tombstone). A stale device re-upserting the row omits
-- deleted_at from its payload, so PostgREST's ON CONFLICT DO UPDATE never clears
-- the tombstone.
--
-- DEPLOY ORDER: apply this migration BEFORE shipping the app build that soft-
-- deletes. The app's schema preflight probes personal_transactions.deleted_at, so
-- on an un-migrated DB personal sync stays disabled (safe) rather than erroring.

alter table public.personal_receipts      add column if not exists deleted_at timestamptz;
alter table public.personal_transactions  add column if not exists deleted_at timestamptz;

-- Partial-friendly composite index: pulls filter/scan by (user_id, deleted_at)
-- when distinguishing live rows from tombstones.
create index if not exists personal_receipts_user_deleted_idx
  on public.personal_receipts (user_id, deleted_at);
create index if not exists personal_transactions_user_deleted_idx
  on public.personal_transactions (user_id, deleted_at);

-- ─── Retention: purge old tombstones so soft-deletes don't accumulate forever ──
-- Soft-deleted rows are kept only long enough for every device to pull the
-- deletion. After a generous window they can be hard-deleted: once every device
-- has recorded its own durable local tombstone, no device will re-push the row,
-- so a hard DELETE here is safe and stops old tombstones bloating pulls.
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

  return purged;
end;
$$;

comment on function public.purge_personal_tombstones(int) is
  'Hard-deletes personal_receipts/personal_transactions rows soft-deleted more than N days ago (default 90). Safe once all devices have pulled the deletion. Run on a schedule (pg_cron) or from a server cron.';

-- Schedule daily at 03:15 UTC IF pg_cron is installed. If pg_cron is not
-- available on this project, this block is skipped — run the function from any
-- server-side cron / edge scheduler instead, e.g.
--   select public.purge_personal_tombstones(90);
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-personal-tombstones',
      '15 3 * * *',
      $cron$ select public.purge_personal_tombstones(90); $cron$
    );
  else
    raise notice 'pg_cron not installed — schedule purge_personal_tombstones(90) via an external cron.';
  end if;
end;
$$;
