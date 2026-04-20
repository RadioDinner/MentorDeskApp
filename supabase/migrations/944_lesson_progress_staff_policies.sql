-- Fix: staff (mentors) could not reset or mark-complete mentee progress.
-- The original lesson_progress / question_responses RLS only granted staff
-- SELECT plus mentee-only INSERT/UPDATE. Mentor-triggered DELETE / INSERT /
-- UPDATE silently failed (RLS denial returns zero rows but no error).
--
-- Add staff INSERT / UPDATE / DELETE policies scoped to their organization
-- so "Reset Progress" and "Mark Complete" on the mentor side actually work.

CREATE POLICY staff_insert_lesson_progress ON lesson_progress FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_update_lesson_progress ON lesson_progress FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_delete_lesson_progress ON lesson_progress FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_insert_question_responses ON question_responses FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_update_question_responses ON question_responses FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_delete_question_responses ON question_responses FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
