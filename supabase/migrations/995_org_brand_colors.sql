-- Add secondary and tertiary brand colors to organizations

alter table public.organizations
  add column if not exists secondary_color text not null default '#6366F1',
  add column if not exists tertiary_color text not null default '#818CF8';
