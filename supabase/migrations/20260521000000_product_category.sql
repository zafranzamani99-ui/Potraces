-- Add optional category column to seller_products
ALTER TABLE seller_products ADD COLUMN IF NOT EXISTS category text;
