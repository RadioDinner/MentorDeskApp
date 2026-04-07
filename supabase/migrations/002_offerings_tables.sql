-- Offerings: Courses and Engagements

create type public.offering_type as enum ('course', 'engagement');

create table if not exists public.offerings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type            public.offering_type not null,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.offerings is 'Courses and engagements offered by an organization.';

-- Updated_at trigger
create trigger offerings_updated_at
  before update on public.offerings
  for each row execute function public.handle_updated_at();

-- RLS
alter table public.offerings enable row level security;

create policy "staff can read own org offerings"
  on public.offerings for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "admins can manage org offerings"
  on public.offerings for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );
