-- Two fixes bundled together:
--
-- 1) Row-level security: admins cannot currently insert or modify availability
--    rows for other staff members in their org. The existing policy only lets
--    staff manage their own rows (staff_id matches their own). This adds an
--    explicit admin policy that allows any staff member with role='admin' to
--    insert/update/delete availability rows inside their organization, which
--    is what both the admin "Edit Availability" flow and the admin-assisted
--    mentor onboarding flow expect.
--
-- 2) New staff.timezone column so mentors (and admins on their behalf) can
--    record the IANA timezone their weekly availability should be interpreted
--    in. Defaults to NULL; the UI falls back to the browser's timezone when
--    unset so existing behavior is unchanged.

-- ─────────── RLS fix ───────────

-- Drop+recreate the self-manage policy with explicit WITH CHECK so INSERTs
-- are validated. Postgres normally mirrors USING into WITH CHECK when only
-- USING is provided, but being explicit keeps this unambiguous and easier to
-- reason about later.
DROP POLICY IF EXISTS staff_manage_own_availability ON availability_schedules;
CREATE POLICY staff_manage_own_availability ON availability_schedules FOR ALL
  USING     (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- NEW: admins can manage any availability in their organization.
DROP POLICY IF EXISTS admin_manage_org_availability ON availability_schedules;
CREATE POLICY admin_manage_org_availability ON availability_schedules FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Same treatment for availability_overrides to keep them in sync.
DROP POLICY IF EXISTS staff_manage_own_overrides ON availability_overrides;
CREATE POLICY staff_manage_own_overrides ON availability_overrides FOR ALL
  USING     (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS admin_manage_org_overrides ON availability_overrides;
CREATE POLICY admin_manage_org_overrides ON availability_overrides FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────── Timezone column ───────────

ALTER TABLE staff ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
