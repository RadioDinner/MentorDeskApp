-- Staff role groups for module-level access control

-- Org-level role group definitions
-- Structure: [ { "id", "name", "module_groups": ["Main","People","Business","Finance","System"] } ]
alter table public.organizations
  add column if not exists role_groups jsonb not null default '[
    {"id":"rg-admin","name":"Admin","module_groups":["Main","People","Business","Finance","System"]},
    {"id":"rg-operations","name":"Operations","module_groups":["Main","People","Business","Finance"]},
    {"id":"rg-course-builder","name":"Course Builder","module_groups":["Main","Business"]}
  ]'::jsonb;

comment on column public.organizations.role_groups is 'Configurable role groups that control which module groups staff can access';

-- Per-staff role group assignments (array of role group IDs)
alter table public.staff
  add column if not exists access_groups text[] not null default '{}';

comment on column public.staff.access_groups is 'Array of role group IDs from the org role_groups config';
