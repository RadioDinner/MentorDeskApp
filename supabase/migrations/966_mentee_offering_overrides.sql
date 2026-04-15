-- Add per-mentee override columns to mentee_offerings
-- These allow overriding the offering template's pricing/settings per mentee
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS recurring_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS setup_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS meeting_count INTEGER;
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS allocation_period TEXT;
ALTER TABLE mentee_offerings ADD COLUMN IF NOT EXISTS notes TEXT;

NOTIFY pgrst, 'reload schema';
