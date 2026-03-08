-- Add optional shop notice/announcement to seller_profiles
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS shop_notice text;
