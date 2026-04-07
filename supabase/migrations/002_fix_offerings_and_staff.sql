-- Migration 002: Fix offerings schema + add staff pay columns
-- Run this in the Supabase SQL editor, then go to
-- Settings → API → "Reload schema" to clear the PostgREST cache.

-- ── Offerings ──────────────────────────────────────────────────────────────

-- Ensure offering_type column exists (may be missing if initial migration was never run)
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS offering_type text NOT NULL DEFAULT 'course';

-- Arrangement-specific columns (matches ManageOfferings.jsx field names)
ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS meetings_per_period      integer,
  ADD COLUMN IF NOT EXISTS program_duration_periods integer,
  ADD COLUMN IF NOT EXISTS credits_rollover         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_policy      text    NOT NULL DEFAULT 'window',
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS allow_activities         boolean NOT NULL DEFAULT false;

-- Drop any old constraint from migration 001 (safe if it doesn't exist)
ALTER TABLE offerings
  DROP CONSTRAINT IF EXISTS offerings_cancellation_policy_check;

-- Policy values used by the UI: 'reallocate' | 'consume' | 'window'
ALTER TABLE offerings
  ADD CONSTRAINT offerings_cancellation_policy_check
  CHECK (cancellation_policy IN ('reallocate', 'consume', 'window'));

-- Backfill: ensure all existing rows have a valid offering_type
UPDATE offerings SET offering_type = 'course' WHERE offering_type IS NULL OR offering_type = '';

-- ── Staff ──────────────────────────────────────────────────────────────────

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS pay_type text    NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10, 2);

ALTER TABLE staff
  DROP CONSTRAINT IF EXISTS staff_pay_type_check;

ALTER TABLE staff
  ADD CONSTRAINT staff_pay_type_check
  CHECK (pay_type IN ('hourly', 'salary'));

COMMENT ON COLUMN staff.pay_type IS 'hourly or salary';
COMMENT ON COLUMN staff.pay_rate IS 'Hourly rate ($/hr) or annual salary ($), depending on pay_type';
