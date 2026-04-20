-- Fix: my_staff_role() was non-deterministic for users with multiple staff
-- rows (e.g. an admin who added test mentor / assistant_mentor profiles
-- via the profile "My Accounts" flow). The original function used
-- LIMIT 1 with no ORDER BY, so Postgres could return the non-admin row
-- and admin-scoped RLS (audit_log reads, admin settings, etc.) would
-- deny access for someone who IS an admin.
--
-- Make role lookup deterministic by preferring the highest-privilege
-- role the user holds. Same idea for my_organization_id() so the org
-- scope is tied to that same preferred row.

CREATE OR REPLACE FUNCTION public.my_staff_role()
RETURNS public.staff_role AS $$
  SELECT role FROM public.staff
  WHERE user_id = auth.uid()
  ORDER BY
    CASE role
      WHEN 'admin'            THEN 1
      WHEN 'operations'       THEN 2
      WHEN 'course_creator'   THEN 3
      WHEN 'staff'            THEN 4
      WHEN 'mentor'           THEN 5
      WHEN 'assistant_mentor' THEN 6
      ELSE 99
    END
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_organization_id()
RETURNS uuid AS $$
  SELECT organization_id FROM public.staff
  WHERE user_id = auth.uid()
  ORDER BY
    CASE role
      WHEN 'admin'            THEN 1
      WHEN 'operations'       THEN 2
      WHEN 'course_creator'   THEN 3
      WHEN 'staff'            THEN 4
      WHEN 'mentor'           THEN 5
      WHEN 'assistant_mentor' THEN 6
      ELSE 99
    END
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

NOTIFY pgrst, 'reload schema';
