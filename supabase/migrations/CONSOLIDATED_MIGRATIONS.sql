-- ============================================================================
-- CONSOLIDATED MIGRATIONS — CourseCorrect
-- ============================================================================
-- Run these in order in the Supabase SQL editor.
-- After running, reload the PostgREST schema cache:
--   Settings → API → "Reload schema"
--
-- NOTE: ALTER TYPE ADD VALUE statements cannot run inside a transaction.
--       Run Section 1 first by itself, then run the rest.
-- ============================================================================


-- ============================================================================
-- SECTION 1: ENUM VALUES (run this section FIRST, separately)
-- ============================================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'mentor';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'mentee';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'prayerpartner';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'trainee';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';


-- ============================================================================
-- SECTION 2: EVERYTHING ELSE (run after Section 1 completes)
-- ============================================================================

-- ── Offerings table additions ──────────────────────────────────────────────

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS offering_type             text NOT NULL DEFAULT 'course',
  ADD COLUMN IF NOT EXISTS meetings_per_period       integer,
  ADD COLUMN IF NOT EXISTS program_duration_periods  integer,
  ADD COLUMN IF NOT EXISTS credits_rollover          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_policy       text,
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS allow_activities          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_end_months        integer;

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_cancellation_policy_check;
ALTER TABLE offerings
  ADD CONSTRAINT offerings_cancellation_policy_check
  CHECK (cancellation_policy IS NULL OR cancellation_policy IN ('reallocate', 'consume', 'window'));

UPDATE offerings SET offering_type = 'course'
  WHERE offering_type IS NULL OR offering_type = '';


-- ── Staff table additions ──────────────────────────────────────────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10, 2);

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_pay_type_check;
ALTER TABLE staff
  ADD CONSTRAINT staff_pay_type_check
  CHECK (pay_type IN ('hourly', 'salary'));


-- ── Mentors table additions ────────────────────────────────────────────────

ALTER TABLE mentors
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10, 2);


-- ── Meetings table additions ───────────────────────────────────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS mentee_offering_id uuid
    REFERENCES mentee_offerings(id) ON DELETE SET NULL;


-- ── Profiles table additions ───────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prayer_partner_id uuid REFERENCES prayer_partners(id),
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS active_role app_role;


-- ── Bug reports table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bug_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen       text,
  trying       text,
  happened     text,
  browser      text,
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert bug reports" ON bug_reports;
CREATE POLICY "Authenticated users can insert bug reports"
  ON bug_reports FOR INSERT TO authenticated
  WITH CHECK (true);


-- ── Staff permissions (module-level access control) ────────────────────────

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS mod_dashboard        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_mentors          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_assistant_mentors boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_mentees          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_staff            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_offerings        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_reports          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_billing          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_invoicing        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_payroll          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_staff_roles      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_audit_log        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_settings         boolean DEFAULT false;


-- ── Multi-role user system ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_roles (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL,
  entity_id  uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own roles" ON user_roles;
CREATE POLICY "Users can read own roles"
  ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles"
  ON user_roles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

-- Migrate existing profiles data into user_roles
INSERT INTO user_roles (user_id, role, entity_id)
SELECT
  p.id,
  p.role,
  CASE
    WHEN p.role::text = 'mentor'        THEN p.mentor_id
    WHEN p.role::text = 'mentee'        THEN p.mentee_id
    WHEN p.role::text = 'trainee'       THEN p.mentee_id
    WHEN p.role::text = 'staff'         THEN p.staff_id
    WHEN p.role::text = 'prayerpartner' THEN p.prayer_partner_id
    ELSE NULL
  END
FROM profiles p
WHERE p.role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill active_role from current role
UPDATE profiles SET active_role = role
  WHERE active_role IS NULL AND role IS NOT NULL;

-- Bug reports RLS: admins read via user_roles
DROP POLICY IF EXISTS "Admins can read bug reports" ON bug_reports;
CREATE POLICY "Admins can read bug reports"
  ON bug_reports FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );
