-- Journeys feature: flowchart-based sequencing of offerings.
-- See Session 021 handoff doc for the full design.
--
-- Model:
--   flow_folders     Organizational folders for journey_flows.
--   journey_flows    Reusable flowchart templates (org-level). content jsonb
--                    holds { nodes: JourneyNode[], connectors: JourneyConnector[] }.
--   mentee_journeys  Per-mentee snapshot copy of a flow. content is copied
--                    from the source flow at assignment time so per-mentee
--                    edits do not mutate the template. current_node_id
--                    tracks which node the mentee is currently on; status
--                    tracks active / completed / cancelled lifecycle.
--
-- All three tables are bundled into one migration because they share an
-- FK graph and should land atomically. Per CLAUDE.md rule #6, migration
-- numbers count DOWN — lowest existing is 951, so this is 950, and the
-- companion org-setting migration is 949.

-- ── flow_folders ───────────────────────────────────────────────────────

create table if not exists public.flow_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  order_index     integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_flow_folders_org
  on public.flow_folders (organization_id, order_index);

alter table public.flow_folders enable row level security;

do $$ begin
  create policy "flow_folders_select" on public.flow_folders
    for select to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "flow_folders_insert" on public.flow_folders
    for insert to authenticated
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "flow_folders_update" on public.flow_folders
    for update to authenticated
    using (organization_id = public.my_organization_id())
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "flow_folders_delete" on public.flow_folders
    for delete to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

-- ── journey_flows ──────────────────────────────────────────────────────

create table if not exists public.journey_flows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  folder_id       uuid references public.flow_folders (id) on delete set null,
  name            text not null,
  description     text,
  content         jsonb not null default '{"nodes": [], "connectors": []}'::jsonb,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.journey_flows is
  'Reusable journey flowchart templates. See mentee_journeys for per-mentee instances.';

create index if not exists idx_journey_flows_org
  on public.journey_flows (organization_id);
create index if not exists idx_journey_flows_folder
  on public.journey_flows (organization_id, folder_id);
create index if not exists idx_journey_flows_active
  on public.journey_flows (organization_id, archived_at);

create trigger journey_flows_updated_at
  before update on public.journey_flows
  for each row execute function public.handle_updated_at();

alter table public.journey_flows enable row level security;

do $$ begin
  create policy "journey_flows_select" on public.journey_flows
    for select to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "journey_flows_insert" on public.journey_flows
    for insert to authenticated
    with check (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'course_creator')
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "journey_flows_update" on public.journey_flows
    for update to authenticated
    using (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'course_creator')
    )
    with check (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'course_creator')
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "journey_flows_delete" on public.journey_flows
    for delete to authenticated
    using (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations')
    );
exception when duplicate_object then null;
end $$;

-- ── mentee_journeys ────────────────────────────────────────────────────

create table if not exists public.mentee_journeys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mentee_id       uuid not null references public.mentees (id) on delete cascade,
  flow_id         uuid references public.journey_flows (id) on delete set null,
  content         jsonb not null default '{"nodes": [], "connectors": []}'::jsonb,
  current_node_id text,
  status          text not null default 'active'
                  check (status in ('active', 'completed', 'cancelled')),
  assigned_by     uuid references public.staff (id) on delete set null,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.mentee_journeys is
  'Per-mentee snapshot copy of a journey_flow. content is copied at assignment; edits do not affect the source flow.';

create index if not exists idx_mentee_journeys_org
  on public.mentee_journeys (organization_id);
create index if not exists idx_mentee_journeys_mentee
  on public.mentee_journeys (mentee_id);
create index if not exists idx_mentee_journeys_flow
  on public.mentee_journeys (flow_id);
create index if not exists idx_mentee_journeys_status
  on public.mentee_journeys (organization_id, status);

create trigger mentee_journeys_updated_at
  before update on public.mentee_journeys
  for each row execute function public.handle_updated_at();

alter table public.mentee_journeys enable row level security;

-- Staff in org can read all journeys
do $$ begin
  create policy "mentee_journeys_select_staff" on public.mentee_journeys
    for select to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

-- Mentees can read their own journey (for the future /my-journey page)
do $$ begin
  create policy "mentee_journeys_select_own" on public.mentee_journeys
    for select to authenticated
    using (mentee_id in (select id from public.mentees where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

-- Staff can assign a journey to a mentee
do $$ begin
  create policy "mentee_journeys_insert" on public.mentee_journeys
    for insert to authenticated
    with check (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'mentor')
    );
exception when duplicate_object then null;
end $$;

-- Staff can advance / edit a mentee's journey
do $$ begin
  create policy "mentee_journeys_update" on public.mentee_journeys
    for update to authenticated
    using (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'mentor')
    )
    with check (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations', 'mentor')
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "mentee_journeys_delete" on public.mentee_journeys
    for delete to authenticated
    using (
      organization_id = public.my_organization_id()
      and public.my_staff_role() in ('admin', 'operations')
    );
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
