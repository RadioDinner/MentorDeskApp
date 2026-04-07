-- ============================================================================
-- MIGRATION 034: Test mentee accounts for mentors
-- ============================================================================
-- Adds a proper is_test_account flag to mentees so test accounts can be
-- cleanly excluded from license counts and admin lists. Replaces the old
-- convention of using status = 'Test Account' as a marker.
-- ============================================================================

-- Add the flag column
ALTER TABLE mentees ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

-- Backfill any existing test mentees (created via the old preview system)
UPDATE mentees SET is_test_account = true WHERE status = 'Test Account';

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_mentees_test_account ON mentees(is_test_account) WHERE is_test_account = true;
