-- Lesson progress: tracks mentee completion of individual lessons
CREATE TABLE IF NOT EXISTS lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  mentee_offering_id UUID NOT NULL REFERENCES mentee_offerings(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mentee_id, lesson_id, mentee_offering_id)
);

-- Question responses: tracks mentee answers to lesson questions
CREATE TABLE IF NOT EXISTS question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  mentee_offering_id UUID NOT NULL REFERENCES mentee_offerings(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES lesson_questions(id) ON DELETE CASCADE,
  response_text TEXT,
  selected_option_index INTEGER,
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mentee_id, question_id, mentee_offering_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lesson_progress_mentee ON lesson_progress(mentee_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_mo ON lesson_progress(mentee_offering_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_mentee ON question_responses(mentee_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_mo ON question_responses(mentee_offering_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_lesson ON question_responses(lesson_id);

-- RLS
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_responses ENABLE ROW LEVEL SECURITY;

-- Staff can read all progress in their org
CREATE POLICY staff_read_lesson_progress ON lesson_progress FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Mentees can read and write their own progress
CREATE POLICY mentee_read_own_progress ON lesson_progress FOR SELECT
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

CREATE POLICY mentee_insert_own_progress ON lesson_progress FOR INSERT
  WITH CHECK (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

CREATE POLICY mentee_update_own_progress ON lesson_progress FOR UPDATE
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

-- Staff can read all responses in their org
CREATE POLICY staff_read_question_responses ON question_responses FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Mentees can read and write their own responses
CREATE POLICY mentee_read_own_responses ON question_responses FOR SELECT
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

CREATE POLICY mentee_insert_own_responses ON question_responses FOR INSERT
  WITH CHECK (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

CREATE POLICY mentee_update_own_responses ON question_responses FOR UPDATE
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
