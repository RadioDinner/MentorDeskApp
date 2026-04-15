-- Company-level toggle for the Journeys feature.
--
-- When a mentee advances their journey into an offering node, should the
-- mentee_offerings row be auto-created, or should the journey flag a
-- pending-assignment badge and let the mentor confirm manually?
--
-- Default TRUE: most orgs want automatic assignment. Disable for orgs
-- where billing/intake needs human review before the offering opens.
--
-- Partner to migration 950 (journey_tables). Kept separate so applying
-- the schema and flipping the toggle are distinct admin actions.

alter table public.organizations
  add column if not exists journey_auto_assign_offerings boolean not null default true;

comment on column public.organizations.journey_auto_assign_offerings is
  'When true, advancing a mentee_journey into an offering node auto-creates the mentee_offerings row. When false, the mentor gets a pending-assignment flag and confirms manually.';

notify pgrst, 'reload schema';
