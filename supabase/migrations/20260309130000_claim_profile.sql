-- Allow a device with a new anonymous user to claim an existing profile by slug.
-- This handles the case where the user set up their shop on one device (e.g. Expo Go)
-- and then installs the APK on another device (new anonymous user_id).
-- SECURITY DEFINER bypasses RLS so the caller can update a profile they don't own.

CREATE OR REPLACE FUNCTION public.claim_seller_profile(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _caller_uid uuid := auth.uid();
  _target_profile_id uuid;
  _target_user_id uuid;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the profile with this slug
  SELECT id, user_id INTO _target_profile_id, _target_user_id
    FROM public.seller_profiles
   WHERE slug = p_slug;

  IF _target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found for slug: %', p_slug;
  END IF;

  -- Already owned by caller — nothing to do
  IF _target_user_id = _caller_uid THEN
    RETURN _target_profile_id;
  END IF;

  -- Delete the caller's empty/orphan profile (created by ensureProfile)
  -- so we don't violate the user_id unique constraint
  DELETE FROM public.seller_profiles
   WHERE user_id = _caller_uid;

  -- Also reassign any data rows from the caller's old user_id to the target profile's user_id
  -- (in case sync already pushed products/orders under the new user_id)
  UPDATE public.seller_products SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_seasons  SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_customers SET user_id = _target_user_id WHERE user_id = _caller_uid;
  UPDATE public.seller_orders   SET user_id = _target_user_id WHERE user_id = _caller_uid;

  -- Transfer ownership of the target profile to the caller
  UPDATE public.seller_profiles
     SET user_id = _caller_uid
   WHERE id = _target_profile_id;

  RETURN _target_profile_id;
END;
$$;
