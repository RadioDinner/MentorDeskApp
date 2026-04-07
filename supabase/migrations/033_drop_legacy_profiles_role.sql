-- ============================================================================
-- MIGRATION 033: Remove legacy profiles.role column
-- ============================================================================
-- The user_roles junction table (migration 012) is the sole source of truth
-- for user roles. The old profiles.role column was kept for backward
-- compatibility but is no longer read by the frontend or edge functions.
-- This migration:
--   1. Replaces the auto-assign trigger to stop writing profiles.role
--   2. Drops all legacy RLS policies that reference profiles.role
--   3. Drops the role column from profiles
-- ============================================================================


-- ── 1. Replace the auto-assign trigger ─────────────────────────────────────
-- The original (migration 018) wrote to both user_roles AND profiles.role.
-- This version only writes to user_roles.

CREATE OR REPLACE FUNCTION public.handle_new_user_default_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the user doesn't already have a role assigned
  -- (admins using invite-user will have already created user_roles entries)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
    DECLARE
      v_mentee_id uuid;
      v_org_id uuid;
    BEGIN
      -- Check if there's a mentee record matching this email
      SELECT id, organization_id INTO v_mentee_id, v_org_id
      FROM public.mentees
      WHERE email = NEW.email
      LIMIT 1;

      IF v_mentee_id IS NOT NULL THEN
        -- Link to existing mentee record
        INSERT INTO public.user_roles (user_id, role, entity_id, organization_id)
        VALUES (NEW.id, 'mentee', v_mentee_id, v_org_id)
        ON CONFLICT DO NOTHING;

        -- Set entity linkage in profiles (no role column)
        INSERT INTO public.profiles (id, mentee_id, organization_id)
        VALUES (NEW.id, v_mentee_id, v_org_id)
        ON CONFLICT (id) DO UPDATE
          SET mentee_id = v_mentee_id, organization_id = v_org_id;
      ELSE
        -- No mentee record — create a basic profiles entry
        INSERT INTO public.profiles (id)
        VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2. Drop all legacy RLS policies that reference profiles.role ───────────
-- These policies predate the tenant-scoped RLS (migration 016) and the
-- multi-role system (migration 012). They exist in the live DB from early
-- setup but were never tracked in numbered migration files.
-- Migration 016 already created proper tenant-scoped policies for these
-- tables using user_org_ids() and is_super_admin().

-- mentors
DROP POLICY IF EXISTS "Admins can insert mentors" ON mentors;
DROP POLICY IF EXISTS "Admins can select mentors" ON mentors;
DROP POLICY IF EXISTS "Admins can update mentors" ON mentors;
DROP POLICY IF EXISTS "Admins can delete mentors" ON mentors;

-- mentees
DROP POLICY IF EXISTS "Admins can select mentees" ON mentees;
DROP POLICY IF EXISTS "Admins can update mentees" ON mentees;
DROP POLICY IF EXISTS "Admins can delete mentees" ON mentees;

-- settings
DROP POLICY IF EXISTS "Admins can manage settings" ON settings;

-- staff
DROP POLICY IF EXISTS "Admins can manage staff" ON staff;

-- offerings
DROP POLICY IF EXISTS "Admins can manage offerings" ON offerings;
DROP POLICY IF EXISTS "Mentee can view offerings" ON offerings;

-- assistant_mentors (formerly prayer_partners)
DROP POLICY IF EXISTS "Admins full access prayer_partners" ON assistant_mentors;

-- staff_permissions
DROP POLICY IF EXISTS "Admins full access staff_permissions" ON staff_permissions;

-- courses
DROP POLICY IF EXISTS "Admins full access courses" ON courses;
DROP POLICY IF EXISTS "Mentor can view courses" ON courses;

-- lessons
DROP POLICY IF EXISTS "Admins full access lessons" ON lessons;
DROP POLICY IF EXISTS "Mentor can view lessons" ON lessons;

-- mentee_offerings
DROP POLICY IF EXISTS "Admin manage mentee_offerings" ON mentee_offerings;

-- invoices
DROP POLICY IF EXISTS "Admin manage invoices" ON invoices;

-- mentee_payment_methods
DROP POLICY IF EXISTS "Admin manage payment_methods" ON mentee_payment_methods;

-- mentee_lesson_progress
DROP POLICY IF EXISTS "Admin manage lesson_progress" ON mentee_lesson_progress;

-- lesson_whiteboards
DROP POLICY IF EXISTS "Admin manage lesson_whiteboards" ON lesson_whiteboards;

-- mentee_whiteboards
DROP POLICY IF EXISTS "Admin manage mentee_whiteboards" ON mentee_whiteboards;

-- login_events
DROP POLICY IF EXISTS "Staff can read login events" ON login_events;

-- storage.objects (avatar/asset upload policies)
DROP POLICY IF EXISTS "Admins upload mentor avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload mentee avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload company assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins update avatars" ON storage.objects;

-- bug_reports (replaced in migration 012)
DROP POLICY IF EXISTS "Admins can read bug reports" ON bug_reports;


-- ── 3. Drop the legacy role column ─────────────────────────────────────────

ALTER TABLE profiles DROP COLUMN IF EXISTS role;
