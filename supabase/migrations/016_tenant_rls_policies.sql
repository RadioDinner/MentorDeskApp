-- ============================================================================
-- MIGRATION 016: Tenant RLS policies + helper functions
-- ============================================================================
-- Depends on: 015_add_organization_id.sql
--
-- Establishes row-level security across all tenant-scoped tables.
-- Uses SECURITY DEFINER helper functions to avoid circular RLS lookups.
-- ============================================================================


-- ── Helper functions ────────────────────────────────────────────────────────

-- Returns all organization IDs the current user belongs to
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT organization_id FROM user_roles WHERE user_id = auth.uid();
$$;

-- Returns true if the current user has the super_admin role
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Public-facing: resolve an org by slug (no auth required)
CREATE OR REPLACE FUNCTION public.get_org_by_slug(org_slug text)
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug
  FROM organizations o
  WHERE o.slug = org_slug AND o.active = true;
$$;

-- Public-facing: get branding settings for an org (no auth required)
CREATE OR REPLACE FUNCTION public.get_org_branding(org_id uuid)
RETURNS TABLE(key text, value text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.key, s.value
  FROM settings s
  WHERE s.organization_id = org_id
    AND s.key IN (
      'primary_color', 'secondary_color', 'highlight_color',
      'company_name', 'company_tagline', 'company_logo'
    );
$$;


-- ── organizations table RLS ─────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT user_org_ids())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "org_insert" ON organizations;
CREATE POLICY "org_insert" ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations
  FOR UPDATE TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "org_delete" ON organizations;
CREATE POLICY "org_delete" ON organizations
  FOR DELETE TO authenticated
  USING (is_super_admin());


-- ── user_roles table RLS (replace existing policies) ────────────────────────

DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;

-- Users can always read their own role rows
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

-- Org admins can manage roles within their org; super_admin can manage all
CREATE POLICY "user_roles_admin_manage" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      organization_id IN (SELECT user_org_ids())
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'admin'
          AND ur.organization_id = user_roles.organization_id
      )
    )
    OR is_super_admin()
  );

CREATE POLICY "user_roles_admin_update" ON user_roles
  FOR UPDATE TO authenticated
  USING (
    (
      organization_id IN (SELECT user_org_ids())
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'admin'
          AND ur.organization_id = user_roles.organization_id
      )
    )
    OR is_super_admin()
  );

CREATE POLICY "user_roles_admin_delete" ON user_roles
  FOR DELETE TO authenticated
  USING (
    (
      organization_id IN (SELECT user_org_ids())
      AND EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'admin'
          AND ur.organization_id = user_roles.organization_id
      )
    )
    OR is_super_admin()
  );


-- ── profiles table RLS ──────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR organization_id IN (SELECT user_org_ids())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR organization_id IN (SELECT user_org_ids())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR is_super_admin()
  );


-- ── Standard tenant-scoped RLS (applied to all remaining tables) ────────────

-- Helper: macro-like application of tenant RLS to a table.
-- We use DO blocks to apply the same pattern across many tables.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'mentors', 'mentees', 'staff', 'prayer_partners',
    'offerings', 'mentee_offerings', 'meetings',
    'arrangement_credit_ledger', 'courses', 'lessons',
    'lesson_whiteboards', 'mentee_lesson_progress', 'mentee_whiteboards',
    'invoices', 'mentee_payment_methods', 'settings',
    'staff_permissions', 'audit_logs', 'login_events', 'bug_reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Skip tables that don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      RAISE NOTICE 'Skipping RLS for non-existent table: %', tbl;
      CONTINUE;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop any existing tenant policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_select" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_insert" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_update" ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_delete" ON %I', tbl, tbl);

    -- Also drop old bug_reports policies that conflict
    IF tbl = 'bug_reports' THEN
      EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can insert bug reports" ON bug_reports';
      EXECUTE 'DROP POLICY IF EXISTS "Admins can read bug reports" ON bug_reports';
    END IF;

    -- SELECT: tenant members + super_admin
    EXECUTE format(
      'CREATE POLICY "%s_tenant_select" ON %I
         FOR SELECT TO authenticated
         USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin())',
      tbl, tbl
    );

    -- INSERT: tenant members + super_admin
    EXECUTE format(
      'CREATE POLICY "%s_tenant_insert" ON %I
         FOR INSERT TO authenticated
         WITH CHECK (organization_id IN (SELECT user_org_ids()) OR is_super_admin())',
      tbl, tbl
    );

    -- UPDATE: tenant members + super_admin
    EXECUTE format(
      'CREATE POLICY "%s_tenant_update" ON %I
         FOR UPDATE TO authenticated
         USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin())',
      tbl, tbl
    );

    -- DELETE: tenant members + super_admin
    EXECUTE format(
      'CREATE POLICY "%s_tenant_delete" ON %I
         FOR DELETE TO authenticated
         USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin())',
      tbl, tbl
    );
  END LOOP;
END $$;
