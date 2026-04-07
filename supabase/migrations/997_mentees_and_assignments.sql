-- Mentees table (separate from staff)
-- and mentor-mentee assignments

-- ============================================================
-- MENTEES
-- ============================================================

create table if not exists public.mentees (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  first_name      text not null,
  last_name       text not null,
  email           text not null,
  phone           text,
  street          text,
  city            text,
  state           text,
  zip             text,
  country         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, email)
);

comment on table public.mentees is 'Mentees / trainees within an organization.';

create trigger mentees_updated_at
  before update on public.mentees
  for each row execute function public.handle_updated_at();

-- RLS
alter table public.mentees enable row level security;

create policy "staff can read own org mentees"
  on public.mentees for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "admins can manage org mentees"
  on public.mentees for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );


-- ============================================================
-- ASSIGNMENTS (mentor <-> mentee pairings)
-- ============================================================

create type public.assignment_status as enum ('active', 'paused', 'ended');

create table if not exists public.assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mentor_id       uuid not null references public.staff (id) on delete cascade,
  mentee_id       uuid not null references public.mentees (id) on delete cascade,
  status          public.assignment_status not null default 'active',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.assignments is 'Pairs a mentor (staff) with a mentee.';

create trigger assignments_updated_at
  before update on public.assignments
  for each row execute function public.handle_updated_at();

-- RLS
alter table public.assignments enable row level security;

create policy "staff can read own org assignments"
  on public.assignments for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "admins can manage org assignments"
  on public.assignments for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );
