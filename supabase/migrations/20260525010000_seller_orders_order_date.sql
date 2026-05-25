-- ============================================================
-- ORD-CRIT-3: Preserve the real order date across sync
-- ============================================================
-- seller_orders had no column for the order's own date — only the
-- auto-generated created_at. pushOrders never sent the local `date`, and
-- pullAll rebuilt it from created_at. So orders taken offline and synced later
-- (e.g. a Saturday market synced Monday) came back dated to the sync moment,
-- corrupting every date-based view (daily breakdown, "today", aging, exports).
--
-- Add a nullable order_date; app orders now push their real date, and pull
-- falls back to created_at when order_date is absent (e.g. order-link orders,
-- which are placed in real time so created_at is already correct).

ALTER TABLE public.seller_orders
  ADD COLUMN IF NOT EXISTS order_date timestamptz;
