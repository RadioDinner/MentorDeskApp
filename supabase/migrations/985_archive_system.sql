-- ============================================================================
-- MIGRATION 985: Archive and delete system for staff and mentees
-- ============================================================================

-- Add archived_at to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.staff.archived_at IS 'When set, the staff member is archived and hidden from active lists.';

CREATE INDEX IF NOT EXISTS idx_staff_archived ON public.staff(organization_id, archived_at);

-- Add archived_at to mentees table
ALTER TABLE public.mentees
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.mentees.archived_at IS 'When set, the mentee is archived and hidden from active lists.';

CREATE INDEX IF NOT EXISTS idx_mentees_archived ON public.mentees(organization_id, archived_at);

-- Archive settings on the organization
-- Structure: { "auto_delete_enabled": bool, "auto_delete_value": int, "auto_delete_unit": "days"|"months"|"years" }
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS archive_settings jsonb NOT NULL DEFAULT '{"auto_delete_enabled": false, "auto_delete_value": 90, "auto_delete_unit": "days"}'::jsonb;

COMMENT ON COLUMN public.organizations.archive_settings IS 'Controls auto-deletion of archived people. When enabled, archived records older than the configured threshold are permanently deleted.';
