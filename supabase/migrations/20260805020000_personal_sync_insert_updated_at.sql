-- ─────────────────────────────────────────────────────────────────────────────
-- Stage 0b (incremental sync, docs/INCREMENTAL_SYNC_PLAN.md): server-stamp
-- updated_at on INSERT as well as UPDATE, on every personal_* synced table.
--
-- WHY: the Stage-3 cursor pull filters on `updated_at >= watermark`, so that
-- column must be SERVER-authoritative. Today the triggers fire BEFORE UPDATE
-- only, and client upsert payloads carry `updated_at` (client wall-clock) —
-- a skewed device clock could write a future/past updated_at on INSERT and
-- poison the cursor (a future stamp jumps the watermark ahead = missed rows).
-- With INSERT OR UPDATE, `new.updated_at = now()` always wins on the server.
--
-- SAFE for LWW: merge conflict resolution reads `client_edit_at` (client edit
-- time, untouched by any trigger), never `updated_at` — see personalSyncMerge
-- and mappers (`client_edit_at ?? updated_at` fallback for legacy rows only).
--
-- Idempotent: drop-if-exists + create. No data changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- The handler already does `new.updated_at = now()` (20260417100000) — no change
-- needed to the function itself, only to WHEN it fires.

do $$
declare
  t text;
  tables text[] := array[
    'personal_transactions',
    'personal_wallets',
    'personal_wallet_transfers',
    'personal_subscriptions',
    'personal_budgets',
    'personal_goals',
    'personal_debts',
    'personal_splits',
    'personal_contacts',
    'personal_savings_accounts',
    'personal_receipts',
    'personal_notes',
    'personal_budget_profile',
    'personal_categories',
    'personal_learning'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.handle_updated_at()',
      t || '_updated_at', t
    );
  end loop;
end $$;
