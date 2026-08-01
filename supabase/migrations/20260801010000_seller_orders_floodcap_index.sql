-- Composite index for the place-order per-seller flood-cap query (WAVE_TRACKER #14).
--
-- place-order (supabase/functions/place-order/index.ts, step 5) runs on EVERY
-- public order-link submission:
--
--   select created_at from seller_orders
--   where seller_id = $1 and source = 'order_link' and created_at > $window
--   order by created_at asc;
--
-- The existing single-column seller_orders_seller_id_idx makes Postgres read all
-- of a seller's rows and then filter source + created_at. For a Raya-scale seller
-- getting a viral order rush that flood-cap check degrades from <100ms into a
-- sequential-ish scan, slowing legitimate customers. This composite index turns it
-- into a direct (seller_id, source) → created_at range scan.
--
-- Additive + idempotent — safe to apply anytime. Deploy: `supabase db push`.
create index if not exists seller_orders_floodcap_idx
  on public.seller_orders (seller_id, source, created_at);
