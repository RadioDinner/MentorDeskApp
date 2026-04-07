-- ============================================================================
-- MIGRATION 044: Pending organization signup requests
-- ============================================================================
-- Stores self-serve signup requests that require super admin approval
-- before an organization and admin account are created.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_org_signups (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_name         text NOT NULL,
  org_slug         text NOT NULL,
  plan             text NOT NULL DEFAULT 'free',
  admin_email      text NOT NULL,
  admin_first_name text DEFAULT '',
  admin_last_name  text DEFAULT '',
  status           text NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  reviewed_at      timestamptz,
  reviewer_note    text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE pending_org_signups ENABLE ROW LEVEL SECURITY;
-- No client policies — only accessible via service_role in edge functions

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pending_org_signups_status ON pending_org_signups(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_org_signups_slug ON pending_org_signups(org_slug) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_org_signups_email ON pending_org_signups(admin_email) WHERE status = 'pending';
