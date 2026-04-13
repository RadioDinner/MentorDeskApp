-- Two new mentor pay types + a link from staff to the offering they're
-- compensated from. Everything is opt-in (nullable) so existing rows are
-- untouched.
--
-- New pay types (staff.pay_type is plain TEXT — no enum change needed):
--   pct_course_profit  — mirrors pct_engagement_profit but for a course
--   pct_per_meeting    — percentage of each completed meeting's value
--                        (per-meeting value = engagement monthly price /
--                        meetings allocated per cycle). Payroll module
--                        will compute the total at payout time.
--
-- New column:
--   staff.pay_offering_id — for pct_engagement_profit / pct_course_profit,
--                            points at the specific offering the staff
--                            member is paid from. Null for the other pay
--                            types.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS pay_offering_id UUID
    REFERENCES public.offerings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.staff.pay_offering_id IS
  'Offering this staff member is paid from. Used when pay_type is pct_engagement_profit or pct_course_profit. Null for other pay types.';

-- Update the default pay_type_settings JSONB so new orgs get the extra
-- options surfaced automatically. Existing orgs keep whatever they have —
-- admins can add the new types via Company Settings.
ALTER TABLE public.organizations
  ALTER COLUMN pay_type_settings SET DEFAULT '{
    "staff": ["hourly", "salary"],
    "mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit", "pct_course_profit", "pct_per_meeting"],
    "assistant_mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit", "pct_course_profit", "pct_per_meeting"]
  }'::jsonb;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
