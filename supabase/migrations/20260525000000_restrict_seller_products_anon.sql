-- ============================================================
-- CRIT-4: Restrict anon column access on seller_products
-- ============================================================
-- The public order page (anon role) reads a seller's catalogue by user_id,
-- but the existing "seller_products_public_read" policy (using is_active = true)
-- combined with a table-level SELECT grant lets ANY anonymous caller read
-- EVERY column of EVERY seller's products -- including cost_per_unit,
-- stock_quantity, and total_sold (margins, inventory, sales volume).
--
-- RLS is row-level only and a table-level SELECT grant supersedes column-level
-- grants, so we must revoke the table-level grant from anon and re-grant SELECT
-- on only the columns the public order page actually consumes. The order page
-- query is:
--   seller_products?select=id,name,description,price_per_unit,unit,image_url&user_id=eq.<id>
-- plus the RLS predicate needs is_active. The authenticated seller keeps full
-- access to their own rows via the owner policy + authenticated-role grants
-- (untouched here).

REVOKE SELECT ON public.seller_products FROM anon;

GRANT SELECT (
  id,
  user_id,
  name,
  description,
  price_per_unit,
  unit,
  is_active,
  image_url
) ON public.seller_products TO anon;
