-- Engagement cancellation and allocation policy

-- Organization default cancellation policy
alter table public.organizations
  add column if not exists default_cancellation_policy jsonb not null default '{
    "cancel_window_value": 24,
    "cancel_window_unit": "hours",
    "cancelled_in_window": "keep_credit",
    "cancelled_outside_window": "lose_credit",
    "no_show": "lose_credit"
  }'::jsonb;

comment on column public.organizations.default_cancellation_policy is
  'Default cancellation policy for engagements. Overridable per engagement.';

-- Per-engagement cancellation policy (null = use org default)
alter table public.offerings
  add column if not exists cancellation_policy jsonb,
  add column if not exists use_org_default_cancellation boolean not null default true,
  add column if not exists allocation_period text not null default 'monthly';

comment on column public.offerings.cancellation_policy is
  'Per-engagement cancellation policy. Null when use_org_default_cancellation is true.';
comment on column public.offerings.allocation_period is
  'How often meeting credits are allocated: monthly, weekly, per_cycle';
