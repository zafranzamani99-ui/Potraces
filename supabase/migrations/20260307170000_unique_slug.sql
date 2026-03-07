-- Deduplicate slugs: keep only the most recently updated profile per slug,
-- set slug = NULL on older duplicate rows
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY updated_at DESC) AS rn
  FROM public.seller_profiles
  WHERE slug IS NOT NULL
)
UPDATE public.seller_profiles
SET slug = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Enforce slug uniqueness (partial index — allows multiple NULL slugs)
CREATE UNIQUE INDEX IF NOT EXISTS seller_profiles_slug_unique_idx
  ON public.seller_profiles(slug)
  WHERE slug IS NOT NULL;
