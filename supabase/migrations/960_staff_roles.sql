-- Two new staff roles for finer-grained admin permissions. Keeps the
-- existing role enum extensible without requiring any data migration — new
-- values just slot into the staff_role enum and existing rows stay put.
--
-- Role taxonomy after this migration:
--   admin            — full access to every module (existing)
--   operations       — day-to-day org operations (people, pairings, engagements, billing)
--   course_creator   — focused on course authoring
--   staff            — legacy / generic staff member (still valid, not removed)
--   mentor           — mentor portal user (existing)
--   assistant_mentor — assistant mentor portal user (existing)
--
-- The legacy 'staff' value is intentionally retained so existing rows remain
-- valid. New hires should be created as one of admin/operations/course_creator.

ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'operations';
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'course_creator';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
