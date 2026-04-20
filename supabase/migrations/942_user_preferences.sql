-- Generic per-user preferences.
-- One row per auth.users.id, free-form JSONB so future prefs (notifications,
-- display density, default filters, etc.) can land without a schema change.
-- Intentionally keyed by auth user (not staff/mentee) so a person with
-- multiple profiles shares their preferences across them.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_select_own_preferences ON user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_insert_own_preferences ON user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_update_own_preferences ON user_preferences FOR UPDATE
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
