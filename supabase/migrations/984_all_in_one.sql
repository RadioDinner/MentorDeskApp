-- ============================================================================
-- MIGRATION 984: All-in-one safe migration
-- ============================================================================
-- This combines all migrations (985-999) into a single file that is safe to
-- run even if some or all migrations have already been applied.
-- Run this AFTER schema.sql has been applied.
--
-- Run order context:
--   1. schema.sql (creates organizations, staff, helper functions, RLS)
--   2. This file (everything else)
-- ============================================================================


-- ============================================================================
-- 999: Admins can update their own organization
-- ============================================================================

DO $$ BEGIN
  CREATE POLICY "admins can update own org"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (
      id = public.my_organization_id()
      AND public.my_staff_role() = 'admin'
    )
    WITH CHECK (
      id = public.my_organization_id()
      AND public.my_staff_role() = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 998: Offerings table (courses and engagements)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.offering_type AS ENUM ('course', 'engagement');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.offerings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  type            public.offering_type NOT NULL,
  name            text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigger (safe: drop + recreate)
DROP TRIGGER IF EXISTS offerings_updated_at ON public.offerings;
CREATE TRIGGER offerings_updated_at
  BEFORE UPDATE ON public.offerings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff can read own org offerings"
    ON public.offerings FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org offerings"
    ON public.offerings FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 997: Mentees and Assignments (pairings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mentees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL,
  phone           text,
  street          text,
  city            text,
  state           text,
  zip             text,
  country         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

DROP TRIGGER IF EXISTS mentees_updated_at ON public.mentees;
CREATE TRIGGER mentees_updated_at
  BEFORE UPDATE ON public.mentees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.mentees ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff can read own org mentees"
    ON public.mentees FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org mentees"
    ON public.mentees FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Assignments

DO $$ BEGIN
  CREATE TYPE public.assignment_status AS ENUM ('active', 'paused', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  mentor_id       uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  mentee_id       uuid NOT NULL REFERENCES public.mentees (id) ON DELETE CASCADE,
  status          public.assignment_status NOT NULL DEFAULT 'active',
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS assignments_updated_at ON public.assignments;
CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff can read own org assignments"
    ON public.assignments FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org assignments"
    ON public.assignments FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 996: Audit log, Invoices, Payroll
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES public.staff (id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  details         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admins can read own org audit log"
    ON public.audit_log FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "system can insert audit log"
    ON public.audit_log FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Invoices

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  mentee_id       uuid REFERENCES public.mentees (id) ON DELETE SET NULL,
  invoice_number  text,
  status          public.invoice_status NOT NULL DEFAULT 'draft',
  amount_cents    integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'USD',
  due_date        date,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS invoices_updated_at ON public.invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff can read own org invoices"
    ON public.invoices FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org invoices"
    ON public.invoices FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payroll

DO $$ BEGIN
  CREATE TYPE public.pay_type AS ENUM ('hourly', 'salary', 'per_session', 'commission');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.payroll (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  pay_type        public.pay_type NOT NULL DEFAULT 'hourly',
  rate_cents      integer NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'USD',
  period_start    date,
  period_end      date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS payroll_updated_at ON public.payroll;
CREATE TRIGGER payroll_updated_at
  BEFORE UPDATE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admins can read own org payroll"
    ON public.payroll FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admins can manage org payroll"
    ON public.payroll FOR ALL TO authenticated
    USING (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin')
    WITH CHECK (organization_id = public.my_organization_id() AND public.my_staff_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 995: Brand colors on organizations
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#6366F1',
  ADD COLUMN IF NOT EXISTS tertiary_color text NOT NULL DEFAULT '#818CF8';


-- ============================================================================
-- 994: Pay type settings per org + individual staff pay
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pay_type_settings jsonb NOT NULL DEFAULT '{
    "staff": ["hourly", "salary"],
    "mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit"],
    "assistant_mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit"]
  }'::jsonb;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS pay_type text,
  ADD COLUMN IF NOT EXISTS pay_rate numeric;


-- ============================================================================
-- 993: Add assistant_mentor role
-- ============================================================================

ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'assistant_mentor';


-- ============================================================================
-- 992: Course-specific fields on offerings
-- ============================================================================

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setup_fee_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS dispense_mode text NOT NULL DEFAULT 'completion',
  ADD COLUMN IF NOT EXISTS dispense_interval_days integer,
  ADD COLUMN IF NOT EXISTS lesson_count integer,
  ADD COLUMN IF NOT EXISTS course_due_date date,
  ADD COLUMN IF NOT EXISTS preview_mode text NOT NULL DEFAULT 'titles_only';


-- ============================================================================
-- 991: Engagement meeting count + mentee flow
-- ============================================================================

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS meeting_count integer;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS mentee_flow jsonb NOT NULL DEFAULT '{"steps":[]}'::jsonb;

ALTER TABLE public.mentees
  ADD COLUMN IF NOT EXISTS flow_step_id text;


-- ============================================================================
-- 990: Cancellation policy
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_cancellation_policy jsonb NOT NULL DEFAULT '{
    "cancel_window_value": 24,
    "cancel_window_unit": "hours",
    "cancelled_in_window": "keep_credit",
    "cancelled_outside_window": "lose_credit",
    "no_show": "lose_credit"
  }'::jsonb;

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS cancellation_policy jsonb,
  ADD COLUMN IF NOT EXISTS use_org_default_cancellation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allocation_period text NOT NULL DEFAULT 'monthly';


-- ============================================================================
-- 989: Role groups for access control
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS role_groups jsonb NOT NULL DEFAULT '[
    {"id":"rg-admin","name":"Admin","module_groups":["Main","People","Business","Finance","System"]},
    {"id":"rg-operations","name":"Operations","module_groups":["Main","People","Business","Finance"]},
    {"id":"rg-course-builder","name":"Course Builder","module_groups":["Main","Business"]}
  ]'::jsonb;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS access_groups text[] NOT NULL DEFAULT '{}';


-- ============================================================================
-- 988: Course billing mode
-- ============================================================================

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS recurring_price_cents integer NOT NULL DEFAULT 0;


-- ============================================================================
-- 987: Per-module access control
-- ============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS allowed_modules text[] NOT NULL DEFAULT '{}';


-- ============================================================================
-- 986: Course builder — lessons and lesson questions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lessons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id     uuid NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  title           text NOT NULL,
  description     text,
  content         text,
  video_url       text,
  order_index     integer NOT NULL DEFAULT 0,
  due_days_offset integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_offering ON public.lessons(offering_id);
CREATE INDEX IF NOT EXISTS idx_lessons_org ON public.lessons(organization_id);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lessons_select" ON public.lessons
    FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_insert" ON public.lessons
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_update" ON public.lessons
    FOR UPDATE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lessons_delete" ON public.lessons
    FOR DELETE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.lesson_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  question_text   text NOT NULL,
  question_type   text NOT NULL DEFAULT 'response',
  options         jsonb,
  order_index     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_questions_lesson ON public.lesson_questions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_questions_org ON public.lesson_questions(organization_id);

ALTER TABLE public.lesson_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_select" ON public.lesson_questions
    FOR SELECT TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_insert" ON public.lesson_questions
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_update" ON public.lesson_questions
    FOR UPDATE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "lesson_questions_delete" ON public.lesson_questions
    FOR DELETE TO authenticated
    USING (organization_id = public.my_organization_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.offerings
  ADD COLUMN IF NOT EXISTS due_date_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS expected_completion_days integer;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_lesson_due_dates boolean NOT NULL DEFAULT false;


-- ============================================================================
-- 985: Archive system
-- ============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_staff_archived ON public.staff(organization_id, archived_at);

ALTER TABLE public.mentees
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mentees_archived ON public.mentees(organization_id, archived_at);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS archive_settings jsonb NOT NULL DEFAULT '{"auto_delete_enabled": false, "auto_delete_value": 90, "auto_delete_unit": "days"}'::jsonb;


-- ============================================================================
-- DONE! All migrations applied.
-- ============================================================================
