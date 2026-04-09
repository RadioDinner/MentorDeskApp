-- Add per-mentee pricing and session overrides to mentee_offerings
-- These columns copy the offering template values on assignment but can
-- be edited independently per mentee without affecting the template.

alter table mentee_offerings
  add column if not exists recurring_price_cents int not null default 0,
  add column if not exists setup_fee_cents int not null default 0,
  add column if not exists meeting_count int,
  add column if not exists allocation_period text default 'monthly' check (allocation_period in ('monthly', 'weekly', 'per_cycle')),
  add column if not exists notes text;
