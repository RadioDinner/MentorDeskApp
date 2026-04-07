-- ============================================================================
-- MIGRATION 020: Add video_url column to lessons
-- ============================================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_url text;
