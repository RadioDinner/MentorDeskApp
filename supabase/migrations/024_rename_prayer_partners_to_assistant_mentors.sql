-- Rename prayer_partners to assistant_mentors throughout the schema
-- This migration renames the table, columns, and indexes.
-- The enum value and data updates are in migration 024b (must be a separate transaction).

-- 1. Rename the table
ALTER TABLE IF EXISTS prayer_partners RENAME TO assistant_mentors;

-- 2. Rename foreign key columns in other tables
ALTER TABLE IF EXISTS profiles RENAME COLUMN prayer_partner_id TO assistant_mentor_id;
ALTER TABLE IF EXISTS mentors RENAME COLUMN linked_prayer_partner_id TO linked_assistant_mentor_id;

-- 3. Add the new role enum value (cannot rename enum values in Postgres, so add new one)
-- This must be committed before it can be used in DML statements.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'assistantmentor';

-- 4. Rename indexes (drop old, create new)
DROP INDEX IF EXISTS idx_prayer_partners_org;
CREATE INDEX IF NOT EXISTS idx_assistant_mentors_org ON assistant_mentors(organization_id);
