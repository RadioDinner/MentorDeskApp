-- Add flow_layout_mode to organizations.
-- 'auto'     = Option B: nodes auto-arrange by graph depth, drag reorders within row
-- 'freeform' = Option C: grid-snap drag with manual placement, auto-arrange button available
alter table organizations
  add column if not exists flow_layout_mode text not null default 'freeform';
