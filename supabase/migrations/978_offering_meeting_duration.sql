-- Add default meeting duration (in minutes) to engagement offerings.
-- Used to:
--   1) Display/edit the per-meeting length on the engagement edit/create page.
--   2) Generate bookable time blocks in the mentee "Schedule a Meeting" flow.
-- Defaults to 60 minutes for existing rows.
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS default_meeting_duration_minutes INTEGER NOT NULL DEFAULT 60;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
