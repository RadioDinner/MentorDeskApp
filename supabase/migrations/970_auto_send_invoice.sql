-- Add auto_send_invoice toggle to offerings (engagement templates)
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS auto_send_invoice BOOLEAN NOT NULL DEFAULT false;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
