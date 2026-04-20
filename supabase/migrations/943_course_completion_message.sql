-- Custom "Course Complete!" popup message.
-- Org-wide default lives on organizations; a per-course override lives on
-- offerings. Resolution order at render time:
--   offerings.course_completion_message (if non-null)
--   organizations.default_course_completion_message (if non-null)
--   hard-coded fallback in the client

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_course_completion_message TEXT;

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS course_completion_message TEXT;

NOTIFY pgrst, 'reload schema';
