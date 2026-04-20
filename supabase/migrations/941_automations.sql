-- Automations: mentor/staff-authored if-this-then-that rules.
--
-- An automation has ONE trigger (e.g. "mentee completed course X") and an
-- ORDERED LIST of action steps (create task, send email, send notification).
-- On a matching event, the process-automations edge function loads the
-- automation, iterates its actions, executes each, and writes one row per
-- run to automation_runs for debugging/audit.
--
-- trigger_config / actions are JSONB so we can add new trigger & action
-- types without schema churn.

CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_org ON automations(organization_id);
CREATE INDEX IF NOT EXISTS idx_automations_owner ON automations(owner_id);
CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(organization_id, trigger_type) WHERE enabled;

-- Per-execution log. One row per automation fire.
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  mentee_id UUID REFERENCES mentees(id) ON DELETE SET NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'skipped')),
  action_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_org ON automation_runs(organization_id, started_at DESC);

-- RLS
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

-- Staff may read/write automations in their org; the edge function uses the
-- service role and bypasses RLS when it needs to read across owners.
CREATE POLICY staff_read_automations ON automations FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_insert_automations ON automations FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_update_automations ON automations FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

CREATE POLICY staff_delete_automations ON automations FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Runs: staff can read their org's runs. Inserts happen from the service
-- role inside the edge function, so no client-facing insert policy is
-- needed.
CREATE POLICY staff_read_automation_runs ON automation_runs FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM staff WHERE user_id = auth.uid()));

-- Extend mentor_tasks to record automation-sourced tasks.
ALTER TABLE mentor_tasks
  ADD COLUMN IF NOT EXISTS source_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL;

-- Extend the source check constraint to accept 'automation'.
ALTER TABLE mentor_tasks DROP CONSTRAINT IF EXISTS mentor_tasks_source_check;
ALTER TABLE mentor_tasks
  ADD CONSTRAINT mentor_tasks_source_check
  CHECK (source IN ('manual', 'journey_decision', 'automation'));

NOTIFY pgrst, 'reload schema';
