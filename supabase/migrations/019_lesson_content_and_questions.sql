-- ============================================================================
-- MIGRATION 019: Add lesson content column and lesson_questions table
-- ============================================================================
-- Adds rich text content storage to lessons and a flexible question system
-- that supports both quizzes (right/wrong answers) and response forms
-- (open-ended feedback).
-- ============================================================================

-- ── Add content column to lessons ───────────────────────────────────────────

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content text;

-- ── Create lesson_questions table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lesson_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  question_text   text NOT NULL,
  question_type   text NOT NULL DEFAULT 'response',
  -- question_type: 'quiz' (has correct answer) or 'response' (open-ended)
  options         jsonb,
  -- For quiz: array of { text: string, is_correct: boolean }
  -- For response: null (free-text answer)
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_questions_lesson ON lesson_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_org ON lesson_questions(organization_id);

-- ── Create mentee_question_responses table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS mentee_question_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id       uuid NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES lesson_questions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  response_text   text,
  -- For response type: the mentee's free-text answer
  selected_option integer,
  -- For quiz type: index of the option they selected
  is_correct      boolean,
  -- For quiz type: whether their answer was correct
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mentee_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_mentee_responses_mentee ON mentee_question_responses(mentee_id);
CREATE INDEX IF NOT EXISTS idx_mentee_responses_question ON mentee_question_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_mentee_responses_org ON mentee_question_responses(organization_id);

-- ── RLS for lesson_questions ────────────────────────────────────────────────

ALTER TABLE lesson_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_questions_tenant_select" ON lesson_questions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "lesson_questions_tenant_insert" ON lesson_questions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "lesson_questions_tenant_update" ON lesson_questions
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "lesson_questions_tenant_delete" ON lesson_questions
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

-- ── RLS for mentee_question_responses ───────────────────────────────────────

ALTER TABLE mentee_question_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentee_responses_tenant_select" ON mentee_question_responses
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "mentee_responses_tenant_insert" ON mentee_question_responses
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "mentee_responses_tenant_update" ON mentee_question_responses
  FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "mentee_responses_tenant_delete" ON mentee_question_responses
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

-- ── Auto-populate org trigger ───────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['lesson_questions', 'mentee_question_responses'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org_id ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_set_org_id
         BEFORE INSERT ON %I
         FOR EACH ROW
         EXECUTE FUNCTION set_org_id_on_insert()', tbl);
  END LOOP;
END $$;
