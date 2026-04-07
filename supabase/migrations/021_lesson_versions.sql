-- ============================================================================
-- MIGRATION 021: Lesson version history
-- ============================================================================

CREATE TABLE IF NOT EXISTS lesson_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title           text,
  description     text,
  content         text,
  video_url       text,
  questions       jsonb,
  version_number  integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_versions_lesson ON lesson_versions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_versions_org ON lesson_versions(organization_id);

ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_versions_tenant_select" ON lesson_versions
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "lesson_versions_tenant_insert" ON lesson_versions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

CREATE POLICY "lesson_versions_tenant_delete" ON lesson_versions
  FOR DELETE TO authenticated
  USING (organization_id IN (SELECT user_org_ids()) OR is_super_admin());

-- Auto-populate org trigger
DROP TRIGGER IF EXISTS trg_set_org_id ON lesson_versions;
CREATE TRIGGER trg_set_org_id
  BEFORE INSERT ON lesson_versions
  FOR EACH ROW
  EXECUTE FUNCTION set_org_id_on_insert();
