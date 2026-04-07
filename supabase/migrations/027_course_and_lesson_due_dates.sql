-- Add due date support for courses and lessons
-- due_date_mode: 'none' (no due dates), 'course' (single course deadline), 'lesson' (per-lesson deadlines)
-- expected_completion_days: for course-level, number of days from enrollment to complete the whole course
-- due_days_offset: for lesson-level, number of days from enrollment that each lesson is due

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS due_date_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS expected_completion_days integer;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS due_days_offset integer;
