-- Add section_type to lesson_sections: text, video, quiz, response
-- Existing sections default to 'text' for backwards compatibility
ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'text';

NOTIFY pgrst, 'reload schema';
