-- Add ends_at column to mentee_offerings for engagement end dates
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Engagement sessions: individual session logs for engagement credits
CREATE TABLE IF NOT EXISTS engagement_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentee_offering_id UUID NOT NULL REFERENCES mentee_offerings(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  logged_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engagement_sessions_mo ON engagement_sessions(mentee_offering_id);
CREATE INDEX IF NOT EXISTS idx_engagement_sessions_mentee ON engagement_sessions(mentee_id);
CREATE INDEX IF NOT EXISTS idx_engagement_sessions_date ON engagement_sessions(session_date);

-- RLS
ALTER TABLE engagement_sessions ENABLE ROW LEVEL SECURITY;

-- Staff can read all sessions in their org
CREATE POLICY staff_read_engagement_sessions ON engagement_sessions FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Staff can insert sessions
CREATE POLICY staff_insert_engagement_sessions ON engagement_sessions FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Staff can delete sessions (for undo/corrections)
CREATE POLICY staff_delete_engagement_sessions ON engagement_sessions FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Mentees can read their own sessions
CREATE POLICY mentee_read_own_sessions ON engagement_sessions FOR SELECT
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
