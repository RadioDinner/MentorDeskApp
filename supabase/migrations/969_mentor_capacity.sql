-- Add max_active_mentees to staff for mentor capacity management
ALTER TABLE staff ADD COLUMN IF NOT EXISTS max_active_mentees INTEGER;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
