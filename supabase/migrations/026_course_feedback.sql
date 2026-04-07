-- Course feedback from mentees
CREATE TABLE IF NOT EXISTS course_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentee_id uuid NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  feedback_text text NOT NULL,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_feedback_mentee ON course_feedback(mentee_id);
CREATE INDEX IF NOT EXISTS idx_course_feedback_offering ON course_feedback(offering_id);
CREATE INDEX IF NOT EXISTS idx_course_feedback_org ON course_feedback(organization_id);

ALTER TABLE course_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org feedback"
  ON course_feedback FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Authenticated users can insert feedback"
  ON course_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);
