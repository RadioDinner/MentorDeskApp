-- ============================================================================
-- MIGRATION 032: Separate platform billing from org settings
-- ============================================================================
-- Platform billing (org paying BetterCoach) was stored as bettercoach_*
-- keys in the settings table alongside org configuration. This migration
-- moves it to a dedicated org_billing table so the two domains are cleanly
-- separated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_billing (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) UNIQUE,
  card_last4        text,
  card_brand        text,
  card_expiry       text,
  card_holder       text,
  billing_street    text,
  billing_city      text,
  billing_state     text,
  billing_zip       text,
  billing_country   text DEFAULT 'United States',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by org
CREATE INDEX IF NOT EXISTS idx_org_billing_org ON org_billing(organization_id);

-- RLS: same pattern as other tenant-scoped tables
ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_billing_select ON org_billing FOR SELECT
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );

CREATE POLICY org_billing_insert ON org_billing FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );

CREATE POLICY org_billing_update ON org_billing FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );

CREATE POLICY org_billing_delete ON org_billing FOR DELETE
  USING (
    organization_id IN (SELECT public.user_org_ids())
    OR public.is_super_admin()
  );


-- ── Migrate existing bettercoach_* settings into org_billing ───────────────

INSERT INTO org_billing (organization_id, card_last4, card_brand, card_expiry, card_holder,
                         billing_street, billing_city, billing_state, billing_zip, billing_country)
SELECT
  s.organization_id,
  MAX(CASE WHEN s.key = 'bettercoach_card_last4'      THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_card_brand'       THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_card_expiry'      THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_card_holder'      THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_billing_street'   THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_billing_city'     THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_billing_state'    THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_billing_zip'      THEN s.value END),
  MAX(CASE WHEN s.key = 'bettercoach_billing_country'  THEN s.value END)
FROM settings s
WHERE s.key LIKE 'bettercoach_%'
GROUP BY s.organization_id
ON CONFLICT (organization_id) DO NOTHING;

-- Clean up the migrated keys from settings
DELETE FROM settings WHERE key LIKE 'bettercoach_%';
