-- Time cards for manual hour reporting, to eventually feed the payroll
-- engine. Admins type these in on behalf of staff/mentors until we build
-- self-serve time tracking inside the mentor/staff portals.
--
-- document_data_url holds an optional base64-encoded file (Excel sheet,
-- PDF, image, etc.) so the admin can save a copy of whatever the staff
-- member handed them. Capped at 5MB in the UI layer. We keep it in the
-- DB for now to avoid a Storage bucket setup; if files start getting
-- bigger or more numerous, migrate to Supabase Storage.

CREATE TABLE IF NOT EXISTS public.time_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES public.staff(id)         ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  hours_worked    NUMERIC(7, 2) NOT NULL,
  notes           TEXT,
  document_data_url TEXT,
  document_name     TEXT,
  entered_by      UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (hours_worked >= 0)
);

CREATE INDEX IF NOT EXISTS idx_time_cards_staff  ON public.time_cards(staff_id);
CREATE INDEX IF NOT EXISTS idx_time_cards_period ON public.time_cards(period_start, period_end);

ALTER TABLE public.time_cards ENABLE ROW LEVEL SECURITY;

-- Admins can manage any time card in their org
DROP POLICY IF EXISTS admin_manage_time_cards ON public.time_cards;
CREATE POLICY admin_manage_time_cards ON public.time_cards FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Staff can read their own time cards (for future self-serve time view)
DROP POLICY IF EXISTS staff_read_own_time_cards ON public.time_cards;
CREATE POLICY staff_read_own_time_cards ON public.time_cards FOR SELECT
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
