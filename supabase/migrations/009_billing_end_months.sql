-- Add billing_end_months column to offerings for arrangements with fixed billing duration.
-- NULL means the arrangement runs indefinitely until manually closed.
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS billing_end_months integer;
