-- Migration 003: Add pay_type to mentors table
-- Defines how a mentor is compensated. Currently the only implemented model
-- is 'percentage' (pro-rated share of arrangement subscription revenue based
-- on completed meetings in a billing period).
--
-- Future values could include 'flat_rate' (per-meeting fee) or 'salary'
-- (fixed monthly), but those are not yet implemented in the UI.
--
-- Run in the Supabase SQL editor, then reload the PostgREST schema cache.

ALTER TABLE mentors
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'percentage';

COMMENT ON COLUMN mentors.pay_type IS
  'Compensation model for this mentor. '
  'percentage = earn pay_percentage% of pro-rated arrangement subscription revenue based on completed meetings per billing period.';
