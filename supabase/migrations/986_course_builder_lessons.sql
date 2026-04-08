-- ============================================================================
-- MIGRATION 986: Course builder — lessons table and org settings
-- ============================================================================

-- ── Lessons table (linked to offerings where type='course') ────────────────

CREATE TABLE IF NOT EXISTS lessons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id       uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  title             text NOT NULL,
  description       text,
  content           text,
  video_url         text,
  order_index       integer NOT NULL DEFAULT 0,
  due_days_offset   integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_offering ON lessons(offering_id);
CREATE INDEX IF NOT EXISTS idx_lessons_org ON lessons(organization_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lessons_select" ON lessons
    FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_insert" ON lessons
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_update" ON lessons
    FOR UPDATE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_delete" ON lessons
    FOR DELETE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Lesson questions table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lesson_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  question_text   text NOT NULL,
  question_type   text NOT NULL DEFAULT 'response',
  options         jsonb,
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_questions_lesson ON lesson_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_org ON lesson_questions(organization_id);

ALTER TABLE lesson_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_select" ON lesson_questions
    FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_insert" ON lesson_questions
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_update" ON lesson_questions
    FOR UPDATE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_delete" ON lesson_questions
    FOR DELETE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Due date mode on offerings ─────────────────────────────────────────────

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS due_date_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS expected_completion_days integer;

-- ── Org-level setting: enable per-lesson due dates ─────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS enable_lesson_due_dates boolean NOT NULL DEFAULT false;
