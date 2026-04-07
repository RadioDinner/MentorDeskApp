-- Per-module access control per staff member
-- Replaces the role group system with direct module-level granularity

alter table public.staff
  add column if not exists allowed_modules text[] not null default '{}';

comment on column public.staff.allowed_modules is 'Array of module keys this staff member can access (e.g. staff, mentors, billing, settings)';
