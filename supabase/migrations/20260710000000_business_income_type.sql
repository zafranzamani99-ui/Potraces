-- Remember the seller's business income type on the account so it follows them
-- across devices / reinstalls. The client keeps a local per-user cache as the
-- authoritative, offline-first source; this column is the cross-device backup.
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS income_type text
    CHECK (income_type IN ('seller', 'stall', 'freelance', 'parttime', 'rider', 'mixed'));

-- NOTE: income_type is intentionally NOT added to the public seller_profiles_public
-- view (it is private setup state, not shown on the order page).
