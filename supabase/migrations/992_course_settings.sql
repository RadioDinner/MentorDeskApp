-- Course-specific fields on offerings table

-- Pricing
alter table public.offerings
  add column if not exists price_cents integer not null default 0,
  add column if not exists setup_fee_cents integer not null default 0,
  add column if not exists currency text not null default 'USD';

-- Course plan: how lessons are dispensed
-- dispense_mode: 'interval' | 'completion' | 'all_at_once'
--   interval: dispense every X days
--   completion: dispense after previous lesson is complete
--   all_at_once: all lessons available immediately
alter table public.offerings
  add column if not exists dispense_mode text not null default 'completion',
  add column if not exists dispense_interval_days integer,
  add column if not exists lesson_count integer,
  add column if not exists course_due_date date;

-- Visibility: can mentees see upcoming lesson titles or content before unlocked?
-- preview_mode: 'hidden' | 'titles_only' | 'full_preview'
alter table public.offerings
  add column if not exists preview_mode text not null default 'titles_only';

comment on column public.offerings.dispense_mode is 'How lessons are released: interval, completion, all_at_once';
comment on column public.offerings.dispense_interval_days is 'Days between lessons when dispense_mode is interval';
comment on column public.offerings.lesson_count is 'Total number of lessons in the course';
comment on column public.offerings.preview_mode is 'What mentees can see before a lesson is unlocked: hidden, titles_only, full_preview';
