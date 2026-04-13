-- Add show_all_days_in_scheduler toggle to organizations.
-- When true (default, preserves existing behavior), the mentee "Schedule a
-- Meeting" date dropdown lists all upcoming dates regardless of the assigned
-- mentor's availability (days with no availability are shown disabled).
-- When false, only days with available slots on the mentor's schedule appear.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS show_all_days_in_scheduler BOOLEAN NOT NULL DEFAULT TRUE;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
