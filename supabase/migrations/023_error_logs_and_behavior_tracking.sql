-- Automatic error logging table
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Error details
  message text NOT NULL,
  stack text,
  source text,                          -- 'boundary' | 'runtime' | 'promise' | 'network' | 'manual'
  component_name text,                  -- React component name (from error boundaries)
  url text,                             -- page URL where error occurred
  -- User context
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_role text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  -- Browser/environment
  user_agent text,
  screen_size text,
  -- Metadata
  severity text DEFAULT 'error',        -- 'error' | 'warning' | 'info'
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Index for fast querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_org ON error_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);

-- RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert (errors are logged automatically)
CREATE POLICY "Authenticated users can insert error logs"
  ON error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Super admins can read all, org admins can read their own org
CREATE POLICY "Super admins read all error logs"
  ON error_logs FOR SELECT
  USING (is_super_admin() OR organization_id IN (SELECT user_org_ids()));

-- Super admins can update (resolve errors)
CREATE POLICY "Super admins can update error logs"
  ON error_logs FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Enhance bug_reports with status/severity/assignment for triage
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS severity text DEFAULT 'medium';
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS admin_notes text;

-- User frustration events (for smart help analytics)
CREATE TABLE IF NOT EXISTS user_behavior_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL,             -- 'rage_click' | 'rapid_nav' | 'error_encounter' | 'help_shown' | 'help_dismissed'
  page_url text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_behavior_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert behavior events"
  ON user_behavior_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Super admins read behavior events"
  ON user_behavior_events FOR SELECT
  USING (is_super_admin());
