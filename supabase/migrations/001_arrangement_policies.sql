-- Add arrangement policy and activity columns to offerings table
alter table offerings
  add column if not exists billing_period_months    integer,
  add column if not exists credits_rollover         boolean   not null default false,
  add column if not exists cancellation_policy      text      not null default 'time_based',
  add column if not exists cancellation_threshold_hours integer not null default 24,
  add column if not exists activities_enabled       jsonb     not null default '{}';

-- Constraint: cancellation_policy must be a known value
alter table offerings
  drop constraint if exists offerings_cancellation_policy_check;

alter table offerings
  add constraint offerings_cancellation_policy_check
  check (cancellation_policy in ('always_reallocate', 'always_use', 'time_based'));

comment on column offerings.billing_period_months is
  'Total number of billing months for the arrangement (e.g. 6 for a 6-month program). Null = open-ended.';

comment on column offerings.credits_rollover is
  'If true, unused meeting credits carry forward into the next billing cycle.';

comment on column offerings.cancellation_policy is
  'always_reallocate = credit always returned on cancel; always_use = credit always consumed; time_based = depends on threshold.';

comment on column offerings.cancellation_threshold_hours is
  'For time_based policy: cancel >= this many hours before = reallocate; cancel < this many hours before = credit consumed.';

comment on column offerings.activities_enabled is
  'JSON flags for optional activity types, e.g. {"whiteboard": true, "checkin_form": false}.';
