-- CF-56: Make receipt-images bucket private
-- Previously the bucket was public, meaning anyone who guessed the URL pattern
-- ({user_id}/{cost_id}.jpg) could view receipts without authentication.

UPDATE storage.buckets SET public = false WHERE id = 'receipt-images';

-- Drop the old permissive public-read policy (allowed any reader, no auth check).
DROP POLICY IF EXISTS "receipt_images_public_read" ON storage.objects;

-- Replace with owner-only read: authenticated users can only read files
-- inside their own user-id folder.
CREATE POLICY "Users can read own receipt images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipt-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Insert and delete policies already enforce owner-only via foldername check
-- (see 20260521110000), so no changes needed there.


-- CF-57: Restrict user_profiles public lookup
--
-- The existing "user_profiles_public_code_lookup" policy uses
--   FOR SELECT USING (referral_code IS NOT NULL)
-- which exposes the full row (user_id, referral_code, referred_by, created_at)
-- for any profile that has a referral code set. A malicious actor with the anon
-- key could query `?select=user_id,referral_code` to enumerate user IDs.
--
-- RLS policies cannot restrict columns — they control row access only.
-- Fix: drop the permissive policy and create a SECURITY DEFINER function that
-- returns only the referral_code column. Anon callers use the function (via
-- PostgREST RPC) instead of querying the table directly.

DROP POLICY IF EXISTS "user_profiles_public_code_lookup" ON public.user_profiles;

-- A function that looks up whether a referral code exists.
-- Returns the code if found, NULL otherwise. SECURITY DEFINER so it bypasses
-- RLS on user_profiles (the function runs as the table owner, not as anon).
CREATE OR REPLACE FUNCTION public.lookup_referral_code(code text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT referral_code
  FROM public.user_profiles
  WHERE referral_code = code
  LIMIT 1;
$$;

-- Allow anon and authenticated roles to call this function.
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO authenticated;

-- Authenticated users still have their owner policies on user_profiles for
-- full row access (reading/writing their own profile).
