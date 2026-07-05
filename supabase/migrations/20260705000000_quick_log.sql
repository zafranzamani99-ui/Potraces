-- Background Quick-Log: per-user auth key + server inbox of pending entries.
-- The edge function (service-role) is the only writer; the owning user reads
-- and updates their own inbox rows to mark them consumed after reconcile.

-- ── quick_log_keys ────────────────────────────────────────────────────────────
-- One active key per user (regenerate = revoke old + insert new). We store only
-- the SHA-256 hex hash, never the raw key.
CREATE TABLE IF NOT EXISTS public.quick_log_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key_hash     text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS quick_log_keys_user_idx ON public.quick_log_keys (user_id);

ALTER TABLE public.quick_log_keys ENABLE ROW LEVEL SECURITY;
-- Owner may read/insert/update/revoke their own keys from the app.
DROP POLICY IF EXISTS quick_log_keys_owner ON public.quick_log_keys;
CREATE POLICY quick_log_keys_owner ON public.quick_log_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── quick_log_inbox ───────────────────────────────────────────────────────────
-- Pending entries written by the edge function (service-role). The owning user
-- reads their rows and stamps consumed_at after logQuickExpense() runs.
CREATE TABLE IF NOT EXISTS public.quick_log_inbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount      numeric NOT NULL,
  type        text NOT NULL DEFAULT 'expense',
  category    text,
  wallet      text,
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS quick_log_inbox_user_unconsumed_idx
  ON public.quick_log_inbox (user_id) WHERE consumed_at IS NULL;

ALTER TABLE public.quick_log_inbox ENABLE ROW LEVEL SECURITY;
-- Owner may read + mark consumed. Inserts come from service-role only (no
-- insert policy → RLS blocks user inserts, service-role bypasses RLS).
DROP POLICY IF EXISTS quick_log_inbox_read ON public.quick_log_inbox;
CREATE POLICY quick_log_inbox_read ON public.quick_log_inbox
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS quick_log_inbox_consume ON public.quick_log_inbox;
CREATE POLICY quick_log_inbox_consume ON public.quick_log_inbox
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
