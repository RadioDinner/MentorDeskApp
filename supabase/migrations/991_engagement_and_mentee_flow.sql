-- Engagement: meeting count
alter table public.offerings
  add column if not exists meeting_count integer;

comment on column public.offerings.meeting_count is 'Number of meetings in an engagement (e.g. 4 for "4x Mentoring")';

-- Mentee flow configuration on the org
-- Structure: { "steps": [ { "id", "name", "type", "offering_id", "in_flow", "order" } ] }
-- type: "status" | "course" | "engagement"
-- in_flow: true = part of the progression, false = available status but not in sequence
alter table public.organizations
  add column if not exists mentee_flow jsonb not null default '{"steps":[]}'::jsonb;

comment on column public.organizations.mentee_flow is 'Mentee progression flow and available statuses';

-- Mentee: current flow step
alter table public.mentees
  add column if not exists flow_step_id text;

comment on column public.mentees.flow_step_id is 'Current step ID from the org mentee_flow configuration';
