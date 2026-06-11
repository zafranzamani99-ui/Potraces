-- DuitNow QR payments (Phase 2) — soundbox-replacement pipeline.
-- Idempotent / additive. seller_orders already has psp_transaction_id +
-- payment_provider (20260610000000_seller_orders_card_payment.sql); the webhook
-- reuses those columns.

-- ── device_tokens ─────────────────────────────────────────────────────────────
-- One row per device a user is logged into (a counter may run two phones), so a
-- payment alert reaches every device. Legacy seller_profiles.push_token stays
-- for back-compat; this table is the authoritative multi-device list.
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_owner ON public.device_tokens;
CREATE POLICY device_tokens_owner ON public.device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── processed_webhook_events ──────────────────────────────────────────────────
-- Idempotency ledger: a PSP may deliver the same event more than once. The
-- webhook inserts (provider, event_id) FIRST; a unique-violation means
-- already-processed → skip. Service-role only (no user policies).
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  provider     text NOT NULL,
  event_id     text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
-- (No policies → only the service role, which bypasses RLS, can touch it.)

-- ── payment_events ────────────────────────────────────────────────────────────
-- The in-app feed of QR payments. The webhook inserts a row on confirmed
-- payment; the app subscribes (realtime) or polls on focus to flip pending
-- charges to "paid" live. Readable by the owning user; inserts are service-role.
CREATE TABLE IF NOT EXISTS public.payment_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  order_id     uuid REFERENCES public.seller_orders (id) ON DELETE SET NULL,
  app_ref      text,                 -- raw refId the charge was created with
  provider     text NOT NULL,        -- 'fiuu' | 'hitpay' | …
  charge_id    text,                 -- provider charge/payment id
  amount_cents integer NOT NULL,
  currency     text NOT NULL DEFAULT 'myr',
  status       text NOT NULL DEFAULT 'paid',
  raw          jsonb,                -- trimmed provider payload (no secrets)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_user_idx  ON public.payment_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_order_idx ON public.payment_events (order_id);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_owner_read ON public.payment_events;
CREATE POLICY payment_events_owner_read ON public.payment_events
  FOR SELECT USING (auth.uid() = user_id);
-- Inserts come from qr-payment-webhook using the service role (bypasses RLS).
