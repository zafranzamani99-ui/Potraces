-- Add deposits jsonb column to seller_orders
-- Stores the payment installment history for each order.
ALTER TABLE public.seller_orders
  ADD COLUMN IF NOT EXISTS deposits jsonb NOT NULL DEFAULT '[]';
