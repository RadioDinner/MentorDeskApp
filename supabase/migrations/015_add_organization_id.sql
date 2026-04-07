-- ============================================================================
-- MIGRATION 015: Add organization_id to all tenant-scoped tables
-- ============================================================================
-- Depends on: 014_organizations_and_super_admin.sql
--
-- Strategy: Add nullable column, backfill with seed org, set NOT NULL, index.
-- ============================================================================

DO $$
DECLARE
  seed_org uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- ── profiles ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='organization_id') THEN
    ALTER TABLE profiles ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE profiles SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE profiles ALTER COLUMN organization_id SET NOT NULL;

  -- ── user_roles ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='organization_id') THEN
    ALTER TABLE user_roles ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE user_roles SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE user_roles ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentors ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentors' AND column_name='organization_id') THEN
    ALTER TABLE mentors ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentors SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentors ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentees ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentees' AND column_name='organization_id') THEN
    ALTER TABLE mentees ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentees SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentees ALTER COLUMN organization_id SET NOT NULL;

  -- ── staff ───────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff' AND column_name='organization_id') THEN
    ALTER TABLE staff ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE staff SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE staff ALTER COLUMN organization_id SET NOT NULL;

  -- ── prayer_partners ─────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prayer_partners' AND column_name='organization_id') THEN
    ALTER TABLE prayer_partners ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE prayer_partners SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE prayer_partners ALTER COLUMN organization_id SET NOT NULL;

  -- ── offerings ───────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='offerings' AND column_name='organization_id') THEN
    ALTER TABLE offerings ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE offerings SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE offerings ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentee_offerings ────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentee_offerings' AND column_name='organization_id') THEN
    ALTER TABLE mentee_offerings ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentee_offerings SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentee_offerings ALTER COLUMN organization_id SET NOT NULL;

  -- ── meetings ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='organization_id') THEN
    ALTER TABLE meetings ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE meetings SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE meetings ALTER COLUMN organization_id SET NOT NULL;

  -- ── arrangement_credit_ledger (only if table exists) ────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='arrangement_credit_ledger') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arrangement_credit_ledger' AND column_name='organization_id') THEN
      ALTER TABLE arrangement_credit_ledger ADD COLUMN organization_id uuid REFERENCES organizations(id);
    END IF;
    UPDATE arrangement_credit_ledger SET organization_id = seed_org WHERE organization_id IS NULL;
    ALTER TABLE arrangement_credit_ledger ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- ── courses ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='organization_id') THEN
    ALTER TABLE courses ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE courses SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE courses ALTER COLUMN organization_id SET NOT NULL;

  -- ── lessons ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lessons' AND column_name='organization_id') THEN
    ALTER TABLE lessons ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE lessons SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE lessons ALTER COLUMN organization_id SET NOT NULL;

  -- ── lesson_whiteboards ──────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lesson_whiteboards' AND column_name='organization_id') THEN
    ALTER TABLE lesson_whiteboards ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE lesson_whiteboards SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE lesson_whiteboards ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentee_lesson_progress ──────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentee_lesson_progress' AND column_name='organization_id') THEN
    ALTER TABLE mentee_lesson_progress ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentee_lesson_progress SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentee_lesson_progress ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentee_whiteboards ──────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentee_whiteboards' AND column_name='organization_id') THEN
    ALTER TABLE mentee_whiteboards ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentee_whiteboards SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentee_whiteboards ALTER COLUMN organization_id SET NOT NULL;

  -- ── invoices ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='organization_id') THEN
    ALTER TABLE invoices ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE invoices SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL;

  -- ── mentee_payment_methods ──────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mentee_payment_methods' AND column_name='organization_id') THEN
    ALTER TABLE mentee_payment_methods ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE mentee_payment_methods SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE mentee_payment_methods ALTER COLUMN organization_id SET NOT NULL;

  -- ── settings ────────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='organization_id') THEN
    ALTER TABLE settings ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE settings SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE settings ALTER COLUMN organization_id SET NOT NULL;

  -- ── staff_permissions ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff_permissions' AND column_name='organization_id') THEN
    ALTER TABLE staff_permissions ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE staff_permissions SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE staff_permissions ALTER COLUMN organization_id SET NOT NULL;

  -- ── audit_logs ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='organization_id') THEN
    ALTER TABLE audit_logs ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE audit_logs SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE audit_logs ALTER COLUMN organization_id SET NOT NULL;

  -- ── login_events ────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='login_events' AND column_name='organization_id') THEN
    ALTER TABLE login_events ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE login_events SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE login_events ALTER COLUMN organization_id SET NOT NULL;

  -- ── bug_reports ─────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bug_reports' AND column_name='organization_id') THEN
    ALTER TABLE bug_reports ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
  UPDATE bug_reports SET organization_id = seed_org WHERE organization_id IS NULL;
  ALTER TABLE bug_reports ALTER COLUMN organization_id SET NOT NULL;

END $$;


-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentors_org ON mentors(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentees_org ON mentees(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_org ON staff(organization_id);
CREATE INDEX IF NOT EXISTS idx_prayer_partners_org ON prayer_partners(organization_id);
CREATE INDEX IF NOT EXISTS idx_offerings_org ON offerings(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentee_offerings_org ON mentee_offerings(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org ON meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_courses_org ON courses(organization_id);
CREATE INDEX IF NOT EXISTS idx_lessons_org ON lessons(organization_id);
CREATE INDEX IF NOT EXISTS idx_lesson_whiteboards_org ON lesson_whiteboards(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentee_lesson_progress_org ON mentee_lesson_progress(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentee_whiteboards_org ON mentee_whiteboards(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_mentee_payment_methods_org ON mentee_payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_permissions_org ON staff_permissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_login_events_org ON login_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_org ON bug_reports(organization_id);


-- arrangement_credit_ledger index (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='arrangement_credit_ledger') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_arrangement_credit_ledger_org ON arrangement_credit_ledger(organization_id)';
  END IF;
END $$;


-- ── Constraint changes ──────────────────────────────────────────────────────

-- user_roles: change unique from (user_id, role) to (user_id, role, organization_id)
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_org_key UNIQUE (user_id, role, organization_id);

-- settings: change unique from (key) to (organization_id, key)
-- The constraint name may vary depending on how it was created
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_unique;
DO $$
BEGIN
  -- Try to add the new composite unique; ignore if it already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_org_key_unique'
  ) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_org_key_unique UNIQUE (organization_id, key);
  END IF;
END $$;
