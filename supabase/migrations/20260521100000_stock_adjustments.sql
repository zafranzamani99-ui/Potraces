-- Stock adjustment tracking for seller products
CREATE TABLE IF NOT EXISTS seller_stock_adjustments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id text NOT NULL,
  product_local_id text NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  note text,
  adjustment_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for upsert
CREATE UNIQUE INDEX idx_stock_adj_user_local ON seller_stock_adjustments(user_id, local_id);

-- Fast lookup by product
CREATE INDEX idx_stock_adj_product ON seller_stock_adjustments(user_id, product_local_id);

-- RLS
ALTER TABLE seller_stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stock adjustments"
  ON seller_stock_adjustments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
