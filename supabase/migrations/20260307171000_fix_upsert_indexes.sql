-- Replace partial unique indexes with full unique indexes
-- PostgREST cannot use partial indexes as upsert conflict targets

-- Products
DROP INDEX IF EXISTS public.seller_products_user_local_idx;
CREATE UNIQUE INDEX seller_products_user_local_idx
  ON public.seller_products(user_id, local_id);

-- Orders
DROP INDEX IF EXISTS public.seller_orders_user_local_idx;
CREATE UNIQUE INDEX seller_orders_user_local_idx
  ON public.seller_orders(user_id, local_id);

-- Seasons
DROP INDEX IF EXISTS public.seller_seasons_user_local_idx;
CREATE UNIQUE INDEX seller_seasons_user_local_idx
  ON public.seller_seasons(user_id, local_id);

-- Customers
DROP INDEX IF EXISTS public.seller_customers_user_local_idx;
CREATE UNIQUE INDEX seller_customers_user_local_idx
  ON public.seller_customers(user_id, local_id);
