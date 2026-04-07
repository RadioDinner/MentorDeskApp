-- ============================================================================
-- MIGRATION 041: Rebrand BetterCoach → MentorDesk
-- ============================================================================
-- Updates the seed organization name and default company_name setting
-- to reflect the new brand identity.
-- ============================================================================

-- Update seed organization name
UPDATE organizations
SET name = 'MentorDesk',
    updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND name = 'BetterCoach';

-- Update company_name in settings for the seed org
UPDATE settings
SET value = 'MentorDesk'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND key = 'company_name'
  AND value = 'BetterCoach';
