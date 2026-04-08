-- ============================================================================
-- MIGRATION 980: Rename assignments → pairings, add offering_id,
--                add org setting for multi-engagement mentees
-- ============================================================================

-- Rename the table
ALTER TABLE IF EXISTS public.assignments RENAME TO pairings;

-- Rename the enum type
ALTER TYPE public.assignment_status RENAME TO pairing_status;

-- Rename indexes (if they exist)
ALTER INDEX IF EXISTS assignments_pkey RENAME TO pairings_pkey;

-- Rename foreign key constraints
ALTER TABLE public.pairings RENAME CONSTRAINT assignments_organization_id_fkey TO pairings_organization_id_fkey;
ALTER TABLE public.pairings RENAME CONSTRAINT assignments_mentor_id_fkey TO pairings_mentor_id_fkey;
ALTER TABLE public.pairings RENAME CONSTRAINT assignments_mentee_id_fkey TO pairings_mentee_id_fkey;

-- Rename the updated_at trigger
DROP TRIGGER IF EXISTS assignments_updated_at ON public.pairings;
CREATE TRIGGER pairings_updated_at
  BEFORE UPDATE ON public.pairings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add offering_id column (which engagement/program this pairing is for)
ALTER TABLE public.pairings
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES public.offerings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pairings_offering ON public.pairings(offering_id);

-- Recreate RLS policies with new names
DROP POLICY IF EXISTS "staff can read own org assignments" ON public.pairings;
DROP POLICY IF EXISTS "admins can manage org assignments" ON public.pairings;

DO $$ BEGIN
  CREATE POLICY "staff can read own org pairings"
    ON public.pairings FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org pairings"
    ON public.pairings FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add org setting: allow mentees to have multiple open engagements at once
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS allow_multi_engagement boolean NOT NULL DEFAULT false;
