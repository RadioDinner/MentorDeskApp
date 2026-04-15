-- How far in advance a mentee is allowed to schedule a meeting.
-- The mentee engagement detail page's date dropdown will loop from day 1
-- through day N where N is this value. Default 14 preserves the prior
-- hardcoded behavior so no existing org changes experience.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS scheduler_max_days_ahead INTEGER NOT NULL DEFAULT 14;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_scheduler_max_days_ahead_check
    CHECK (scheduler_max_days_ahead >= 1 AND scheduler_max_days_ahead <= 365);

COMMENT ON COLUMN public.organizations.scheduler_max_days_ahead IS
  'How many days in the future a mentee can schedule meetings from the mentee engagement detail page. 1-365.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
