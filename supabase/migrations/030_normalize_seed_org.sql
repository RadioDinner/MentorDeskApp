-- ============================================================================
-- MIGRATION 030: Normalize seed org to match create-organization output
-- ============================================================================
-- The seed org (from migration 014) was created directly via INSERT and
-- never received the default settings that create-organization seeds for
-- every new org. This migration closes that gap so the seed org behaves
-- identically to any customer org created via the edge function.
-- ============================================================================

-- Fix the org name (was 'CourseCorrect', renamed to 'MentorDesk')
UPDATE organizations
SET    name = 'MentorDesk',
       updated_at = now()
WHERE  id = '00000000-0000-0000-0000-000000000001'
  AND  name = 'CourseCorrect';

-- Seed the same default settings that create-organization provides.
-- Uses ON CONFLICT to avoid clobbering any settings the admin already
-- configured manually.
INSERT INTO settings (organization_id, key, value)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'primary_color',                   '#6366f1'),
  ('00000000-0000-0000-0000-000000000001', 'secondary_color',                 '#8b5cf6'),
  ('00000000-0000-0000-0000-000000000001', 'highlight_color',                 '#f59e0b'),
  ('00000000-0000-0000-0000-000000000001', 'currency',                        'USD'),
  ('00000000-0000-0000-0000-000000000001', 'default_country',                 ''),
  ('00000000-0000-0000-0000-000000000001', 'lock_country',                    'false'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_processing',              'manual'),
  ('00000000-0000-0000-0000-000000000001', 'mentee_can_edit_status',          'false'),
  ('00000000-0000-0000-0000-000000000001', 'mentor_pay_percentage_enabled',   'true'),
  ('00000000-0000-0000-0000-000000000001', 'mentor_pay_monthly_enabled',      'true'),
  ('00000000-0000-0000-0000-000000000001', 'mentor_pay_per_meeting_enabled',  'true'),
  ('00000000-0000-0000-0000-000000000001', 'mentor_pay_hourly_enabled',       'true'),
  ('00000000-0000-0000-0000-000000000001', 'signup_policy',                   'closed'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_prefix',                  'INV-'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_default_notes',           ''),
  ('00000000-0000-0000-0000-000000000001', 'company_name',                    'MentorDesk')
ON CONFLICT ON CONSTRAINT settings_org_key_unique DO NOTHING;
