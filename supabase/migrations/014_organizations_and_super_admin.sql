-- ============================================================================
-- MIGRATION 014: Organizations table + super_admin role
-- ============================================================================
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction.
--       Run Section 1 first by itself, then run Section 2.
-- ============================================================================


-- ============================================================================
-- SECTION 1: ENUM VALUE (run this section FIRST, separately)
-- ============================================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';


-- ============================================================================
-- SECTION 2: ORGANIZATIONS TABLE (run after Section 1 completes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  slug           text UNIQUE NOT NULL,
  plan           text NOT NULL DEFAULT 'free',
  feature_flags  jsonb NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed CourseCorrect as the first organization
INSERT INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'CourseCorrect', 'coursecorrect', 'pro')
ON CONFLICT (id) DO NOTHING;
