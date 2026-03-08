-- Add optional description column to seller_products
ALTER TABLE seller_products ADD COLUMN IF NOT EXISTS description text;
