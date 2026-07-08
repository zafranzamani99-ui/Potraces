-- Per-signup beta welcome email bookkeeping. The `beta-signup` edge function
-- stamps welcomed_at when it sends the Resend welcome email, so it never
-- double-sends to the same address and can rate-cap total sends per hour
-- (email-bomb backstop). Nullable + idempotent — safe on an existing table.
alter table public.waitlist add column if not exists welcomed_at timestamptz;
