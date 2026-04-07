-- ============================================================================
-- MIGRATION 038: Enable RLS on platform_settings
-- ============================================================================
-- The platform_settings table (created in 029) was missing Row-Level Security,
-- leaving it publicly accessible to anyone with the project URL.
-- This migration enables RLS and adds policies so only super_admins can
-- manage platform settings, while authenticated users get read access.
-- ============================================================================

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read platform settings (branding, config)
CREATE POLICY "platform_settings_select"
  ON platform_settings
  FOR SELECT TO authenticated
  USING (true);

-- Only super_admins can insert/update/delete platform settings
CREATE POLICY "platform_settings_insert"
  ON platform_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "platform_settings_update"
  ON platform_settings
  FOR UPDATE TO authenticated
  USING (is_super_admin());

CREATE POLICY "platform_settings_delete"
  ON platform_settings
  FOR DELETE TO authenticated
  USING (is_super_admin());
