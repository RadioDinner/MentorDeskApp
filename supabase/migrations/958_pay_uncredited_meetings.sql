-- Company-level toggle for whether staff get paid for meetings that were
-- cancelled or no-showed WITHOUT crediting the mentee (i.e. the cancellation
-- policy kept the charge).
--
--   false (default) — the money stays with the org; the staff member is
--                     NOT paid for the non-completed meeting.
--   true            — the staff member is still paid for the meeting even
--                     though the mentee didn't actually attend, because the
--                     mentee was already charged for it.
--
-- Consumed by the payroll module when computing pct_per_meeting payouts.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pay_mentors_for_uncredited_meetings BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.organizations.pay_mentors_for_uncredited_meetings IS
  'When true, staff on pct_per_meeting are paid for cancelled/no-show meetings that kept the mentee charged per the cancellation policy. When false, uncredited meetings are unpaid and the value stays with the org.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
