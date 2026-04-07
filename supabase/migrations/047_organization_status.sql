-- ============================================================================
-- MIGRATION 047: Replace active boolean with status column
-- ============================================================================
-- Adds a 'status' text column to organizations with values:
--   'active'   – normal operation
--   'locked'   – disabled by super admin (e.g. non-payment)
--   'archived' – paused/shelved, data preserved for reactivation
--
-- Keeps 'active' column in sync for backwards compatibility, and updates
-- all RPCs that filter on active = true to use status = 'active' instead.
-- ============================================================================

-- 1. Add the status column
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. Sync existing data: inactive → archived, active → active
UPDATE organizations SET status = CASE WHEN active = true THEN 'active' ELSE 'archived' END;

-- 3. Add a check constraint for allowed values
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active', 'locked', 'archived'));

-- 4. Keep 'active' boolean in sync via trigger
CREATE OR REPLACE FUNCTION sync_org_active_from_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.active := (NEW.status = 'active');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_active ON organizations;
CREATE TRIGGER trg_sync_org_active
  BEFORE INSERT OR UPDATE OF status ON organizations
  FOR EACH ROW EXECUTE FUNCTION sync_org_active_from_status();

-- 5. Update get_org_by_slug to check status
CREATE OR REPLACE FUNCTION public.get_org_by_slug(org_slug text)
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug
  FROM organizations o
  WHERE o.slug = org_slug AND o.status = 'active';
$$;

-- 6. Update search_organizations to check status
CREATE OR REPLACE FUNCTION public.search_organizations(query text)
RETURNS TABLE(name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name, o.slug
  FROM organizations o
  WHERE o.status = 'active'
    AND (
      o.name ILIKE '%' || query || '%'
      OR o.slug ILIKE '%' || query || '%'
    )
  ORDER BY o.name
  LIMIT 10;
$$;

-- 7. Update get_user_org_memberships to check status
CREATE OR REPLACE FUNCTION public.get_user_org_memberships()
RETURNS TABLE(org_name text, org_slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT o.name, o.slug
  FROM user_roles ur
  JOIN organizations o ON o.id = ur.organization_id
  WHERE ur.user_id = auth.uid()
    AND o.status = 'active'
  ORDER BY o.name;
$$;

-- 8. Update get_org_signup_policy to check status
DROP FUNCTION IF EXISTS public.get_org_signup_policy(text);
CREATE OR REPLACE FUNCTION public.get_org_signup_policy(org_slug text)
RETURNS TABLE(org_id uuid, org_name text, policy text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name,
    COALESCE(
      (SELECT s.value FROM settings s WHERE s.organization_id = o.id AND s.key = 'signup_policy'),
      'closed'
    )
  FROM organizations o
  WHERE o.slug = org_slug AND o.status = 'active';
$$;
