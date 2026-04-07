-- MentorDesk Database Schema
-- Run this in the Supabase SQL editor to set up the database.

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- ORGANIZATIONS
-- ============================================================

create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  logo_url      text,
  primary_color text not null default '#4F46E5',
  created_at    timestamptz not null default now()
);

comment on table public.organizations is 'Tenant organizations that license MentorDesk.';


-- ============================================================
-- STAFF
-- Org employees/contractors who use MentorDesk to manage their
-- mentoring business. Includes admins and mentors.
-- user_id links to auth.users when the staff member has login access.
-- ============================================================

create type public.staff_role as enum ('admin', 'mentor', 'staff');

create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  role            public.staff_role not null default 'staff',
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

comment on table public.staff is 'Staff members (admins, mentors, staff) within an organization.';
comment on column public.staff.id is 'Unique identifier for the staff member, independent of auth.';
comment on column public.staff.user_id is 'Links to auth.users when the staff member has a login account.';
comment on column public.staff.organization_id is 'The organization this staff member belongs to.';


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.handle_updated_at();


-- ============================================================
-- HELPER: get calling user's organization_id
-- ============================================================

create or replace function public.my_organization_id()
returns uuid as $$
  select organization_id from public.staff
  where user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

create or replace function public.my_staff_role()
returns public.staff_role as $$
  select role from public.staff
  where user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations enable row level security;
alter table public.staff enable row level security;

-- Organizations: authenticated users can read their own org only
create policy "staff can read own org"
  on public.organizations for select
  to authenticated
  using (id = public.my_organization_id());

-- Staff: users can read all staff in their own org
create policy "staff can read own org staff"
  on public.staff for select
  to authenticated
  using (organization_id = public.my_organization_id());

-- Staff: admins can insert/update/delete staff in their org
create policy "admins can manage org staff"
  on public.staff for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );

-- Staff: each staff member can update their own record
create policy "staff can update own record"
  on public.staff for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
