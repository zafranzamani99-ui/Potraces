-- ============================================================
-- Persist the transfer-to-personal flags on seller_orders
-- ============================================================
-- When paid orders are "transferred to personal", each order is flagged with
-- transferredToPersonal + transferId locally, and a lump-sum income transaction
-- is created in personal mode. But these flags were never pushed and had no
-- column, so a sync round-trip wiped them: pullAll rebuilt the order without
-- them, the "transfer to personal" button reappeared, and delete/edit could no
-- longer reconcile the personal income (it keys on transferId).
--
-- Add the columns so the flags survive sync and propagate across devices.

ALTER TABLE public.seller_orders
  ADD COLUMN IF NOT EXISTS transferred_to_personal boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_id text;
