-- ============================================================
-- Lock the public order-link INSERT path
-- ============================================================
-- Previously, "seller_orders_customer_insert" let ANY anonymous
-- caller INSERT order_link rows (user_id null, source='order_link',
-- seller_id not null). Because the public page ships the anon key,
-- anyone could read it from page source and curl unlimited fake
-- orders — each firing the new-order push trigger.
--
-- The place-order Edge Function is now the ONLY way to create an
-- order_link order. It validates input, verifies products, recomputes
-- the total server-side, applies a per-seller flood cap, and inserts
-- with the service role. The service role bypasses RLS, so it does
-- NOT need an INSERT policy here.
--
-- We drop ONLY the anonymous customer-insert policy. We deliberately
-- leave intact:
--   * seller_orders_owner       (seller app's own source='app' inserts
--                                use auth.uid() = user_id and are
--                                checked by this FOR ALL policy)
--   * seller_orders_link_read   (sellers read their order_link orders)
--   * seller_orders_link_update (sellers update their order_link orders)
--   * seller_orders_link_delete (sellers delete their order_link orders)
-- ============================================================

DROP POLICY IF EXISTS "seller_orders_customer_insert" ON public.seller_orders;

-- Belt-and-suspenders on top of the policy drop: Supabase's default grants give
-- the anon role a table-level INSERT privilege. After the policy drop, RLS
-- default-deny already blocks anon inserts, but that protection is purely
-- RLS-dependent — a future permissive INSERT policy (even for an unrelated case)
-- would re-open this exact hole while the dormant anon grant still stands. Revoke
-- the grant so anon can never INSERT regardless of future policy changes. This
-- mirrors the defense-in-depth pattern in 20260525000000_restrict_seller_products_anon.sql.
-- We revoke ONLY from anon: authenticated sellers still INSERT their own
-- source='app' rows via seller_orders_owner (auth.uid() = user_id), so their
-- table grant must stay.
REVOKE INSERT ON public.seller_orders FROM anon;
