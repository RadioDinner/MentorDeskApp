-- Add creator notes to lesson sections (visible only to staff in the course builder)
ALTER TABLE lesson_sections ADD COLUMN IF NOT EXISTS notes TEXT;

NOTIFY pgrst, 'reload schema';
