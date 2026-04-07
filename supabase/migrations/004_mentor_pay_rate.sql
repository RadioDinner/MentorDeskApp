-- Migration 004: Add pay_rate to mentors table
-- Used by the non-percentage pay types:
--   monthly    → fixed dollar amount per billing month
--   per_meeting → flat dollar rate per completed meeting
--   hourly     → dollar rate per hour worked (hours tracking coming in a future release)
--
-- The existing pay_percentage column continues to serve the 'percentage' pay type.
-- Only one of pay_percentage or pay_rate will be populated at a time,
-- depending on the mentor's pay_type.

ALTER TABLE mentors
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10, 2);

COMMENT ON COLUMN mentors.pay_rate IS
  'Dollar rate for flat pay models. '
  'monthly = $/month regardless of meetings; '
  'per_meeting = $/completed meeting; '
  'hourly = $/hour (hours tracking coming in a future release).';
