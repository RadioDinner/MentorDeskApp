-- ============================================================================
-- MIGRATION: Allow same email to have multiple roles in an organization
-- ============================================================================
-- The unique constraint staff(organization_id, email) prevents a person from
-- being both admin + mentor in the same org. Drop it and replace with a
-- unique constraint on (organization_id, email, role) so the same person
-- can have one record per role.
-- ============================================================================

-- Drop the old constraint (same email can only appear once per org)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_organization_id_email_key;

-- Add new constraint: same email can have one record per role per org
ALTER TABLE public.staff ADD CONSTRAINT staff_organization_id_email_role_key
  UNIQUE (organization_id, email, role);
