-- ============================================================================
-- MIGRATION 017: Auto-populate organization_id trigger
-- ============================================================================
-- Depends on: 016_tenant_rls_policies.sql
--
-- Safety net: if organization_id is NULL on insert, fill from the inserting
-- user's user_roles row. Frontend should still pass it explicitly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_org_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM user_roles
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply the trigger to all tenant-scoped tables
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles', 'mentors', 'mentees', 'staff', 'prayer_partners',
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
      RAISE NOTICE 'Skipping trigger for non-existent table: %', tbl;
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_org_id ON %I', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_set_org_id
         BEFORE INSERT ON %I
         FOR EACH ROW
         EXECUTE FUNCTION set_org_id_on_insert()',
      tbl
    );
  END LOOP;
END $$;


-- ── Seed super_admin role ───────────────────────────────────────────────────
-- NOTE: Replace the placeholder UUID below with your actual auth.users ID
-- when running this migration. This is intentionally left as a placeholder
-- so it does not fail on migration run.
--
-- Example (run manually after migration):
--   INSERT INTO user_roles (user_id, role, organization_id)
--   VALUES ('<your-user-uuid>', 'super_admin', '00000000-0000-0000-0000-000000000001');
