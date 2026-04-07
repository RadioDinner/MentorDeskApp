-- MentorDesk Seed Data
-- Inserts the TechBeans test organization and sample staff.
-- Run AFTER schema.sql in the Supabase SQL editor.
--
-- NOTE: Auth users must be created separately via the Supabase
-- Auth dashboard or the admin API. After creating auth users,
-- update the user_id column below with their auth.users UUIDs.

-- ============================================================
-- TEST ORGANIZATION: TechBeans
-- ============================================================

insert into public.organizations (id, name, slug, primary_color)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'TechBeans',
  'techbeans',
  '#4F46E5'
)
on conflict (slug) do nothing;


-- ============================================================
-- SAMPLE STAFF (TechBeans)
-- user_id is null until auth accounts are created.
-- ============================================================

insert into public.staff (
  id,
  organization_id,
  first_name,
  last_name,
  role,
  email,
  phone,
  city,
  state,
  country
)
values
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Alice',
    'Admin',
    'admin',
    'alice@techbeans.dev',
    '555-100-0001',
    'San Francisco',
    'CA',
    'US'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Marcus',
    'Mentor',
    'mentor',
    'marcus@techbeans.dev',
    '555-100-0002',
    'Austin',
    'TX',
    'US'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Sara',
    'Staff',
    'staff',
    'sara@techbeans.dev',
    '555-100-0003',
    'Chicago',
    'IL',
    'US'
  )
on conflict do nothing;
