-- Multi-role user system: one auth user can have multiple roles.
-- The user_roles junction table replaces profiles.role as the source of truth.
-- PREREQUISITE: Run 012a_add_enum_values.sql first to add missing enum values.

CREATE TABLE IF NOT EXISTS user_roles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  entity_id   uuid,
  created_at  timestamptz DEFAULT now(),
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

-- Migrate existing profiles data into user_roles.
-- Use role::text to avoid enum literal comparison issues.
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

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_role app_role;

UPDATE profiles SET active_role = role WHERE active_role IS NULL AND role IS NOT NULL;

DROP POLICY IF EXISTS "Admins can read bug reports" ON bug_reports;
CREATE POLICY "Admins can read bug reports"
  ON bug_reports FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );
