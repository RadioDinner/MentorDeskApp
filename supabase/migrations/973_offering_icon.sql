-- Add icon_url column to offerings for course/engagement icons
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
