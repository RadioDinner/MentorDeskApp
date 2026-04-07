-- ============================================================================
-- MIGRATION 035: Public org search for login page
-- ============================================================================
-- Allows unauthenticated users to search for their organization by name
-- on the /login page. Only returns active orgs, and only name + slug
-- (no sensitive data).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_organizations(query text)
RETURNS TABLE(name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name, o.slug
  FROM organizations o
  WHERE o.active = true
    AND (
      o.name ILIKE '%' || query || '%'
      OR o.slug ILIKE '%' || query || '%'
    )
  ORDER BY o.name
  LIMIT 10;
$$;

-- After a successful login, look up which orgs the user belongs to.
-- This is used when a user logs in on the wrong org's login page.
CREATE OR REPLACE FUNCTION public.get_user_org_memberships()
RETURNS TABLE(org_name text, org_slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT o.name, o.slug
  FROM user_roles ur
  JOIN organizations o ON o.id = ur.organization_id
  WHERE ur.user_id = auth.uid()
    AND o.active = true
  ORDER BY o.name;
$$;
