-- Folders for organizing courses and engagements
CREATE TABLE IF NOT EXISTS offering_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  folder_type TEXT NOT NULL CHECK (folder_type IN ('course', 'engagement')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offering_folders_org ON offering_folders(organization_id, folder_type);

ALTER TABLE offering_folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "offering_folders_select" ON offering_folders
    FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "offering_folders_insert" ON offering_folders
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "offering_folders_update" ON offering_folders
    FOR UPDATE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "offering_folders_delete" ON offering_folders
    FOR DELETE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Link offerings to folders (null = root level)
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES offering_folders(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
