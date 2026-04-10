-- Mentor availability: recurring weekly schedule blocks
CREATE TABLE IF NOT EXISTS availability_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- Availability overrides: one-off available/blocked for specific dates
CREATE TABLE IF NOT EXISTS availability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true, -- true=extra availability, false=blocked off
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- Meetings: scheduled sessions between mentor and mentee
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mentee_offering_id UUID REFERENCES mentee_offerings(id) ON DELETE SET NULL,
  mentee_id UUID NOT NULL REFERENCES mentees(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  engagement_session_id UUID REFERENCES engagement_sessions(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  meeting_link TEXT,
  location TEXT,
  -- Future calendar integration fields
  external_calendar_id TEXT,
  external_calendar_provider TEXT, -- 'google', 'outlook', 'apple', etc.
  external_calendar_event_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_availability_staff ON availability_schedules(staff_id);
CREATE INDEX IF NOT EXISTS idx_availability_day ON availability_schedules(staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_overrides_staff_date ON availability_overrides(staff_id, override_date);
CREATE INDEX IF NOT EXISTS idx_meetings_mentor ON meetings(mentor_id);
CREATE INDEX IF NOT EXISTS idx_meetings_mentee ON meetings(mentee_id);
CREATE INDEX IF NOT EXISTS idx_meetings_mo ON meetings(mentee_offering_id);
CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_external ON meetings(external_calendar_id);

-- RLS
ALTER TABLE availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Staff can manage their own availability
CREATE POLICY staff_manage_own_availability ON availability_schedules FOR ALL
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Staff can read all availability in their org (for scheduling)
CREATE POLICY staff_read_org_availability ON availability_schedules FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Staff can manage their own overrides
CREATE POLICY staff_manage_own_overrides ON availability_overrides FOR ALL
  USING (staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid()));

-- Staff can read all overrides in their org
CREATE POLICY staff_read_org_overrides ON availability_overrides FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Staff can manage all meetings in their org
CREATE POLICY staff_manage_meetings ON meetings FOR ALL
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Mentees can read their own meetings
CREATE POLICY mentee_read_own_meetings ON meetings FOR SELECT
  USING (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

-- Mentees can insert meetings (for self-scheduling)
CREATE POLICY mentee_insert_meetings ON meetings FOR INSERT
  WITH CHECK (mentee_id IN (SELECT id FROM mentees WHERE user_id = auth.uid()));

-- Mentees can read mentor availability in their org (for scheduling)
CREATE POLICY mentee_read_availability ON availability_schedules FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM mentees WHERE user_id = auth.uid()));

CREATE POLICY mentee_read_overrides ON availability_overrides FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM mentees WHERE user_id = auth.uid()));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
