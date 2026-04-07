-- ============================================================================
-- MIGRATION 039: Tenant isolation audit tools
-- ============================================================================
-- Provides an RPC function to verify data segregation across organizations.
-- Call: SELECT * FROM verify_tenant_isolation();
-- Returns a row per issue found. Empty result = all clear.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_tenant_isolation()
RETURNS TABLE (
  check_name  text,
  severity    text,
  table_name  text,
  detail      text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  -- ── 1. Tables in public schema with RLS disabled ──────────────────────────
  RETURN QUERY
  SELECT
    'rls_disabled'::text,
    'CRITICAL'::text,
    t.tablename::text,
    'Row-Level Security is not enabled — table is publicly accessible'::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.rowsecurity = false;

  -- ── 2. Tables with RLS enabled but ZERO policies (completely locked out) ──
  RETURN QUERY
  SELECT
    'rls_no_policies'::text,
    'HIGH'::text,
    t.tablename::text,
    'RLS is enabled but no policies exist — all access is blocked'::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.rowsecurity = true
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t.tablename
    );

  -- ── 3. Overly permissive non-SELECT policies (USING true) ────────────────
  RETURN QUERY
  SELECT
    'permissive_write_policy'::text,
    'HIGH'::text,
    p.tablename::text,
    format('Policy "%s" (%s) uses USING(true) — allows unrestricted writes', p.policyname, p.cmd)::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd != 'SELECT'
    AND p.qual = 'true';

  -- ── 4. Tenant-scoped tables missing organization_id column ────────────────
  --    (Skips global tables: organizations, platform_pricing, platform_settings)
  RETURN QUERY
  SELECT
    'missing_org_id'::text,
    'MEDIUM'::text,
    t.tablename::text,
    'Table has no organization_id column — cannot enforce tenant segregation'::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT IN (
      'organizations', 'platform_pricing', 'platform_settings',
      'schema_migrations', 'spatial_ref_sys'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.tablename
        AND c.column_name = 'organization_id'
    );

  -- ── 5. Tenant tables where organization_id allows NULL ────────────────────
  RETURN QUERY
  SELECT
    'nullable_org_id'::text,
    'MEDIUM'::text,
    c.table_name::text,
    'organization_id is nullable — rows could bypass tenant filtering'::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'organization_id'
    AND c.is_nullable = 'YES';

  -- ── 6. Orphaned org IDs (rows referencing non-existent organizations) ─────
  --    Check key tenant tables for orphaned references
  RETURN QUERY
  SELECT
    'orphaned_org_ref'::text,
    'MEDIUM'::text,
    sub.tbl::text,
    format('%s row(s) reference non-existent organization_id', sub.cnt)::text
  FROM (
    SELECT 'profiles' AS tbl, count(*) AS cnt FROM profiles
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'user_roles', count(*) FROM user_roles
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'mentors', count(*) FROM mentors
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'mentees', count(*) FROM mentees
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'meetings', count(*) FROM meetings
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'offerings', count(*) FROM offerings
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'invoices', count(*) FROM invoices
      WHERE organization_id NOT IN (SELECT id FROM organizations)
    UNION ALL
    SELECT 'settings', count(*) FROM settings
      WHERE organization_id NOT IN (SELECT id FROM organizations)
  ) sub
  WHERE sub.cnt > 0;

  -- ── 7. Cross-org foreign key leaks ────────────────────────────────────────
  --    Mentee-offerings where mentee and offering belong to different orgs
  RETURN QUERY
  SELECT
    'cross_org_reference'::text,
    'CRITICAL'::text,
    'mentee_offerings'::text,
    format('mentee_offering id=%s links mentee (org %s) to offering (org %s)',
           mo.id, m.organization_id, o.organization_id)::text
  FROM mentee_offerings mo
  JOIN mentees m ON m.id = mo.mentee_id
  JOIN offerings o ON o.id = mo.offering_id
  WHERE m.organization_id != o.organization_id;

  -- Meetings where mentor and mentee belong to different orgs
  RETURN QUERY
  SELECT
    'cross_org_reference'::text,
    'CRITICAL'::text,
    'meetings'::text,
    format('meeting id=%s links entities from different organizations',
           mt.id)::text
  FROM meetings mt
  JOIN mentors mn ON mn.id = mt.mentor_id
  JOIN mentees me ON me.id = mt.mentee_id
  WHERE mn.organization_id != me.organization_id;

END;
$$;

-- Grant access so admins can run the check
GRANT EXECUTE ON FUNCTION public.verify_tenant_isolation() TO authenticated;

COMMENT ON FUNCTION public.verify_tenant_isolation() IS
  'Audits tenant isolation: RLS status, policy gaps, org_id integrity, and cross-org data leaks. Empty result = all clear.';
