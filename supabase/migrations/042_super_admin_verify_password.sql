-- ============================================================================
-- MIGRATION 042: Add password verification function for super admin login
-- ============================================================================
-- Uses pgcrypto's crypt() to verify passwords server-side, avoiding
-- bcrypt library compatibility issues in Supabase edge functions.
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_super_admin_password(p_email text, p_password text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM super_admin_credentials
    WHERE email = lower(trim(p_email))
      AND password_hash = crypt(p_password, password_hash)
  );
$$;
