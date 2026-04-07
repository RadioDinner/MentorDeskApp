-- Consolidated migration: ensures all tables exist for features built
-- through Session 002. Run this AFTER schema.sql and migrations 001-003.
-- This is safe to run even if the tables already exist (uses IF NOT EXISTS).
--
-- Tables covered:
--   organizations  (schema.sql)
--   staff          (schema.sql)
--   offerings      (002)
--   mentees        (003)
--   assignments    (003)
--
-- This migration adds any tables or columns that may have been missed,
-- and creates placeholder tables for upcoming modules.


-- ============================================================
-- VERIFY CORE TABLES EXIST (no-ops if already created)
-- ============================================================

-- organizations: created in schema.sql
-- staff: created in schema.sql
-- offerings: created in 002
-- mentees: created in 003
-- assignments: created in 003


-- ============================================================
-- AUDIT LOG
-- ============================================================

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references public.staff (id) on delete set null,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  details         jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.audit_log is 'Tracks admin actions for accountability and debugging.';

alter table public.audit_log enable row level security;

create policy "admins can read own org audit log"
  on public.audit_log for select
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );

create policy "system can insert audit log"
  on public.audit_log for insert
  to authenticated
  with check (
    organization_id = public.my_organization_id()
  );


-- ============================================================
-- INVOICES
-- ============================================================

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mentee_id       uuid references public.mentees (id) on delete set null,
  invoice_number  text,
  status          public.invoice_status not null default 'draft',
  amount_cents    integer not null default 0,
  currency        text not null default 'USD',
  due_date        date,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.invoices is 'Billing invoices sent to mentees.';

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.handle_updated_at();

alter table public.invoices enable row level security;

create policy "staff can read own org invoices"
  on public.invoices for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "admins can manage org invoices"
  on public.invoices for all
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
-- PAYROLL RECORDS
-- ============================================================

create type public.pay_type as enum ('hourly', 'salary', 'per_session', 'commission');

create table if not exists public.payroll (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  staff_id        uuid not null references public.staff (id) on delete cascade,
  pay_type        public.pay_type not null default 'hourly',
  rate_cents      integer not null default 0,
  currency        text not null default 'USD',
  period_start    date,
  period_end      date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.payroll is 'Staff compensation records.';

create trigger payroll_updated_at
  before update on public.payroll
  for each row execute function public.handle_updated_at();

alter table public.payroll enable row level security;

create policy "admins can read own org payroll"
  on public.payroll for select
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );

create policy "admins can manage org payroll"
  on public.payroll for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() = 'admin'
  );
