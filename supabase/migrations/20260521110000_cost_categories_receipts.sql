-- ============================================================
-- Cost Management overhaul: categories, receipt images, vendor
-- ============================================================

-- New columns on existing cost tables (nullable = backward-compatible)
ALTER TABLE public.seller_ingredient_costs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS vendor text;

ALTER TABLE public.seller_recurring_costs
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.seller_cost_templates
  ADD COLUMN IF NOT EXISTS category text;

-- ── Custom cost categories ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_cost_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id text NOT NULL,           -- deterministic for seeded defaults
  name text NOT NULL,
  name_bm text NOT NULL,
  icon text NOT NULL,
  color text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_protected boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_cat_user_local
  ON public.seller_cost_categories(user_id, local_id);

ALTER TABLE public.seller_cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cost categories"
  ON public.seller_cost_categories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Cost-category tombstones ────────────────────────────────
-- Durable record of deleted categories so deletions propagate across devices
-- (without this, a device still holding the category would re-upsert it).
CREATE TABLE IF NOT EXISTS public.seller_deleted_cost_categories (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_id)
);

ALTER TABLE public.seller_deleted_cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deleted cost categories"
  ON public.seller_deleted_cost_categories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Receipt images storage bucket ───────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipt-images', 'receipt-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "receipt_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipt-images');

CREATE POLICY "receipt_images_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'receipt-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "receipt_images_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'receipt-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "receipt_images_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'receipt-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
