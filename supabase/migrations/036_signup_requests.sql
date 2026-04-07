-- ============================================================================
-- MIGRATION 036: Signup requests for org-controlled self-registration
-- ============================================================================
-- When an org's signup_policy is 'approval', prospective users submit a
-- signup request that an admin must approve before they get an account.
-- ============================================================================

CREATE TABLE IF NOT EXISTS signup_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  email             text NOT NULL,
  phone             text,
  message           text,
  status            text NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  reviewed_by       uuid REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One pending request per email per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_requests_pending
  ON signup_requests (organization_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_signup_requests_org_status
  ON signup_requests (organization_id, status);

-- RLS: admins can manage, public can insert
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY signup_requests_insert ON signup_requests FOR INSERT
  WITH CHECK (true);  -- anyone can submit (unauthenticated via anon key)

CREATE POLICY signup_requests_select ON signup_requests FOR SELECT
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );

CREATE POLICY signup_requests_update ON signup_requests FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );

CREATE POLICY signup_requests_delete ON signup_requests FOR DELETE
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );


-- ── Public RPC to get an org's signup policy ───────────────────────────────
-- Used by the signup page before showing the form.

CREATE OR REPLACE FUNCTION public.get_org_signup_policy(org_slug text)
RETURNS TABLE(org_id uuid, org_name text, policy text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name,
    COALESCE(
      (SELECT s.value FROM settings s WHERE s.organization_id = o.id AND s.key = 'signup_policy'),
      'closed'
    )
  FROM organizations o
  WHERE o.slug = org_slug AND o.active = true;
$$;
