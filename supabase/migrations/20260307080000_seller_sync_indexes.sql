-- ============================================================
-- Unique indexes for upsert conflict resolution
-- Each local record has a local_id (device-generated string ID)
-- and a user_id (anon auth uid). Together they identify a record
-- uniquely so we can upsert without duplicating on re-sync.
-- ============================================================

-- Products
create unique index if not exists seller_products_user_local_idx
  on public.seller_products(user_id, local_id)
  where local_id is not null;

-- Orders (app-originated only; order_link orders have user_id = null)
create unique index if not exists seller_orders_user_local_idx
  on public.seller_orders(user_id, local_id)
  where user_id is not null and local_id is not null;

-- Seasons
create unique index if not exists seller_seasons_user_local_idx
  on public.seller_seasons(user_id, local_id)
  where local_id is not null;

-- Customers
create unique index if not exists seller_customers_user_local_idx
  on public.seller_customers(user_id, local_id)
  where local_id is not null;
