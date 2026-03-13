-- ============================================================
-- Shop Logo: column + storage bucket
-- ============================================================

-- Add logo_url column to seller_profiles
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create public storage bucket for shop logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-logos', 'shop-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access (logos are public)
CREATE POLICY "shop_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'shop-logos');

-- Owner can upload (path must start with their user_id)
CREATE POLICY "shop_logos_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'shop-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can update their own logos
CREATE POLICY "shop_logos_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'shop-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can delete their own logos
CREATE POLICY "shop_logos_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'shop-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
