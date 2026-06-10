-- Tap to Pay on iPhone (Stripe Terminal) pilot.
--
-- Adds nullable columns for the Stripe PaymentIntent id + provider on a seller
-- order paid by card. Deposit-level card ids ride in the existing `deposits`
-- JSONB column and need no schema change.
--
-- Idempotent and additive (nullable). Apply this BEFORE deploying a build with
-- EXPO_PUBLIC_TAP_TO_PAY_ENABLED=true. App code never writes these columns for
-- non-card orders, so an un-migrated database keeps syncing normally.
ALTER TABLE seller_orders
  ADD COLUMN IF NOT EXISTS psp_transaction_id text,
  ADD COLUMN IF NOT EXISTS payment_provider text;
