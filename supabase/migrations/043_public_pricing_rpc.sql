-- ============================================================================
-- MIGRATION 043: Public pricing RPC for landing page
-- ============================================================================
-- Exposes platform pricing as a public read-only function so the
-- landing page can fetch current plans without authentication.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_public_pricing()
RETURNS TABLE (
  plan_key text,
  label text,
  price numeric,
  limits jsonb,
  features jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plan_key, label, price, limits, features
  FROM platform_pricing
  ORDER BY
    CASE plan_key
      WHEN 'free' THEN 1
      WHEN 'starter' THEN 2
      WHEN 'pro' THEN 3
      WHEN 'enterprise' THEN 4
      ELSE 5
    END;
$$;
