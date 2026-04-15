-- Link invoices to specific mentee_offerings (engagements/courses)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mentee_offering_id UUID REFERENCES mentee_offerings(id) ON DELETE SET NULL;

-- Add line_description for invoice line items context (e.g., "Setup fee", "May 2026 - 4x Mentoring")
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_description TEXT;

-- Index for querying invoices by mentee_offering
CREATE INDEX IF NOT EXISTS idx_invoices_mentee_offering ON invoices(mentee_offering_id);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
