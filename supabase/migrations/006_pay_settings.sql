-- Pay type configuration per org + individual staff pay rates

-- Org-level setting: which pay types are available per role category
alter table public.organizations
  add column if not exists pay_type_settings jsonb not null default '{
    "staff": ["hourly", "salary"],
    "mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit"],
    "assistant_mentor": ["hourly", "salary", "pct_monthly_profit", "pct_engagement_profit"]
  }'::jsonb;

comment on column public.organizations.pay_type_settings is
  'JSON mapping role categories to allowed pay types. Keys: staff, mentor, assistant_mentor. Values: arrays of pay type strings.';

-- Individual staff pay type and rate
alter table public.staff
  add column if not exists pay_type text,
  add column if not exists pay_rate numeric;

comment on column public.staff.pay_type is
  'One of: hourly, salary, pct_monthly_profit, pct_engagement_profit';
comment on column public.staff.pay_rate is
  'Dollar amount (hourly/salary) or percentage (0-100) depending on pay_type';
