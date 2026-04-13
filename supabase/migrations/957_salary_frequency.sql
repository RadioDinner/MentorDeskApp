-- Salary frequency for staff on pay_type = 'salary'. Nullable — only
-- meaningful when pay_type is 'salary'; other pay types ignore it. The
-- payroll module will use this when computing salary payouts per pay period.
--
-- Allowed values (enforced at the app layer, TEXT here to stay flexible):
--   weekly, bi_weekly, semi_monthly, monthly, annually
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS pay_frequency TEXT;

COMMENT ON COLUMN public.staff.pay_frequency IS
  'Salary frequency when pay_type = salary. One of: weekly, bi_weekly, semi_monthly, monthly, annually. Null for non-salary pay types.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
