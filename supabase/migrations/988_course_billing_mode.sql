-- Course billing mode: one_time (has due date) or recurring (no due date, monthly until complete)
alter table public.offerings
  add column if not exists billing_mode text not null default 'one_time',
  add column if not exists recurring_price_cents integer not null default 0;

comment on column public.offerings.billing_mode is 'one_time (fixed price with due date) or recurring (monthly until course completed)';
comment on column public.offerings.recurring_price_cents is 'Monthly price when billing_mode is recurring';
