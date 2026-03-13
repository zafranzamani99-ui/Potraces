-- ============================================================
-- Product Images: column + storage bucket
-- ============================================================

-- Add image_url column to seller_products
ALTER TABLE public.seller_products
  ADD COLUMN IF NOT EXISTS image_url text;

-- Create public storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- Owner can upload (path starts with their user_id)
CREATE POLICY "product_images_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can update their own images
CREATE POLICY "product_images_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can delete their own images
CREATE POLICY "product_images_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
