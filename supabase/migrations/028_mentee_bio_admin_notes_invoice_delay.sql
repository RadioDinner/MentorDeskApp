-- Add bio and admin_notes columns to mentees
ALTER TABLE mentees ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE mentees ADD COLUMN IF NOT EXISTS admin_notes text;

-- Add invoice_delay_days column to offerings (per-offering override)
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS invoice_delay_days integer;
