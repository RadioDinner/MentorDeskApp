-- ============================================================================
-- MIGRATION 037: Mentor availability hours
-- ============================================================================
-- Stores each mentor's available hours as a JSONB column. Format:
-- { "mon": [{"start": "09:00", "end": "17:00"}], "tue": [...], ... }
-- ============================================================================

ALTER TABLE mentors ADD COLUMN IF NOT EXISTS availability jsonb NOT NULL DEFAULT '{}';
