-- ============================================================================
-- MIGRATION: Error Reports table for automatic error collection
-- ============================================================================
-- Captures frontend errors from all organizations for platform-level
-- monitoring. A Supabase Edge Function can sync these to GitHub Issues.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.error_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Error details
  error_message   text NOT NULL,
  error_stack     text,
  error_code      text,           -- e.g. "23505" for unique violation
  -- Context
  page            text,           -- e.g. "/courses/abc/builder"
  component       text,           -- e.g. "CourseBuilderPage"
  action          text,           -- e.g. "saveLesson", "addQuestion"
  -- Extra context
  metadata        jsonb,          -- any additional context (request body, etc.)
  -- Status
  status          text NOT NULL DEFAULT 'new',  -- new, reported, resolved, ignored
  github_issue_url text,          -- link to GitHub Issue once created
  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_reports_org ON public.error_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_status ON public.error_reports(status);
CREATE INDEX IF NOT EXISTS idx_error_reports_created ON public.error_reports(created_at DESC);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can INSERT error reports (for their own org)
DO $$ BEGIN
  CREATE POLICY "anyone can insert error reports"
    ON public.error_reports FOR INSERT TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can read error reports for their org
DO $$ BEGIN
  CREATE POLICY "admins can read own org error reports"
    ON public.error_reports FOR SELECT TO authenticated
    USING (
      organization_id = public.my_organization_id()
      AND public.my_staff_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role (Edge Functions) can read/update all error reports
-- (This is handled by using the service_role key in the Edge Function)
