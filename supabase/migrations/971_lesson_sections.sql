-- Lesson sections: subdivisions within a lesson, each with its own content/video/questions
CREATE TABLE IF NOT EXISTS lesson_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  video_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link questions to sections (optional — null means legacy lesson-level question)
ALTER TABLE lesson_questions ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES lesson_sections(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_sections_lesson ON lesson_sections(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sections_order ON lesson_sections(lesson_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_section ON lesson_questions(section_id);

-- RLS
ALTER TABLE lesson_sections ENABLE ROW LEVEL SECURITY;

-- Staff can manage sections in their org
CREATE POLICY staff_manage_sections ON lesson_sections FOR ALL
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Mentees can read sections in their org
CREATE POLICY mentee_read_sections ON lesson_sections FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM mentees WHERE user_id = auth.uid()));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
