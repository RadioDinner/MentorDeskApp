-- Migration: Add missing columns and indexes for audit tracking and performance
-- Safe to re-run (uses IF NOT EXISTS throughout)

-- 1. Add old_values and new_values to audit_log for change tracking + undo
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS old_values jsonb;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS new_values jsonb;

-- 2. Add updated_at to lesson_questions (lessons already has it)
ALTER TABLE public.lesson_questions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'lesson_questions_updated_at'
  ) THEN
    CREATE TRIGGER lesson_questions_updated_at
      BEFORE UPDATE ON public.lesson_questions
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- 3. Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_offerings_org_type ON public.offerings(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_assignments_mentor ON public.assignments(mentor_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_assignments_mentee ON public.assignments(mentee_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON public.audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
