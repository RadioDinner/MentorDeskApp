-- Add compensation columns to assistant_mentors to match mentors table
ALTER TABLE assistant_mentors
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS pay_percentage numeric(10,2),
  ADD COLUMN IF NOT EXISTS pay_rate numeric(10,2);
