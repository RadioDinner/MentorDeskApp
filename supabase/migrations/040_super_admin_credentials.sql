-- ============================================================================
-- MIGRATION 040: Super admin credentials table
-- ============================================================================
-- Stores separate authentication credentials for super admin users.
-- Super admins log in via a dedicated portal with their own password,
-- independent of the Supabase auth system used for org-level logins.
-- The same email can exist in both auth.users (org login) and here.
-- ============================================================================

-- Credentials table
CREATE TABLE IF NOT EXISTS super_admin_credentials (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email          text UNIQUE NOT NULL,
  password_hash  text NOT NULL,
  totp_secret    text,                   -- reserved for future 2FA
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- RLS enabled with NO policies = completely inaccessible via client.
-- Only service_role (edge functions) can read/write this table.
ALTER TABLE super_admin_credentials ENABLE ROW LEVEL SECURITY;

-- Rate limiting table for login attempts
CREATE TABLE IF NOT EXISTS super_admin_login_attempts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text NOT NULL,
  attempted_at timestamptz DEFAULT now(),
  success    boolean DEFAULT false
);

ALTER TABLE super_admin_login_attempts ENABLE ROW LEVEL SECURITY;
-- Also no policies — only accessible via service_role

-- Index for efficient rate-limit lookups
CREATE INDEX IF NOT EXISTS idx_sa_login_attempts_email_time
  ON super_admin_login_attempts (email, attempted_at DESC);

-- Auto-cleanup: remove attempts older than 1 hour
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM super_admin_login_attempts
  WHERE attempted_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_login_attempts
  AFTER INSERT ON super_admin_login_attempts
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_login_attempts();
