-- Folders for organizing habits and canvases, mirroring the pattern from
-- migration 965_offering_folders.sql.
--
-- One folders table per entity type. Both share the same shape:
--   id, organization_id, name, order_index, created_at.
-- A null folder_id on habits/canvases means the row lives at the root
-- ("unfiled") level.
--
-- Delete-folder semantics match the offerings pattern: ON DELETE SET NULL
-- on the item's folder_id FK. Deleting a folder moves its items back to
-- the unfiled root — no data is lost.
--
-- RLS: all staff in the org can read/write folders. Folders are an
-- organizational tool — any staff member should be able to create
-- folders and move items between them regardless of who authored them.
-- See the UPDATE policy broadening for habits + canvases at the bottom
-- of this file for the matching permission widening on the item rows.

-- ── habit_folders ───────────────────────────────────────────────────────

create table if not exists public.habit_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  order_index     integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_habit_folders_org
  on public.habit_folders (organization_id, order_index);

alter table public.habit_folders enable row level security;

do $$ begin
  create policy "habit_folders_select" on public.habit_folders
    for select to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "habit_folders_insert" on public.habit_folders
    for insert to authenticated
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "habit_folders_update" on public.habit_folders
    for update to authenticated
    using (organization_id = public.my_organization_id())
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "habit_folders_delete" on public.habit_folders
    for delete to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

-- ── canvas_folders ──────────────────────────────────────────────────────

create table if not exists public.canvas_folders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  order_index     integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_canvas_folders_org
  on public.canvas_folders (organization_id, order_index);

alter table public.canvas_folders enable row level security;

do $$ begin
  create policy "canvas_folders_select" on public.canvas_folders
    for select to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "canvas_folders_insert" on public.canvas_folders
    for insert to authenticated
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "canvas_folders_update" on public.canvas_folders
    for update to authenticated
    using (organization_id = public.my_organization_id())
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "canvas_folders_delete" on public.canvas_folders
    for delete to authenticated
    using (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

-- ── folder_id columns on habits and canvases ───────────────────────────

alter table public.habits
  add column if not exists folder_id uuid references public.habit_folders (id) on delete set null;

create index if not exists idx_habits_folder on public.habits (organization_id, folder_id);

alter table public.canvases
  add column if not exists folder_id uuid references public.canvas_folders (id) on delete set null;

create index if not exists idx_canvases_folder on public.canvases (organization_id, folder_id);

-- ── Broaden UPDATE policies so folder moves work for all staff ─────────
--
-- The existing habits UPDATE policy ("authors can manage org habits") is
-- scoped to admin/course_creator only. The existing canvases UPDATE
-- policy ("staff update org canvases") is scoped to admin/operations
-- and the assigned mentor. In both cases that excludes the other staff
-- roles (operations/mentor for habits; course_creator/assistant_mentor
-- for canvases) from being able to move rows between folders.
--
-- RLS permissive policies are OR-combined, so we add a second, broader
-- UPDATE policy on each table that allows any staff member in the org
-- to UPDATE the row. This is strictly additive — the original policies
-- still apply and are what the edit pages rely on for the fine-grained
-- author/owner gates on the other columns.
--
-- Postgres RLS doesn't do column-level gating. In principle a staff
-- member could UPDATE columns other than folder_id via a hand-crafted
-- API call. The app's trust model is "any authenticated staff in the
-- organization is trusted"; the edit pages enforce role gating in the
-- UI only. If stricter column-level enforcement is needed later, the
-- right fix is a security-definer function (e.g. move_habit_to_folder)
-- that only touches folder_id.

do $$ begin
  create policy "staff update habits folder" on public.habits
    for update to authenticated
    using (organization_id = public.my_organization_id())
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "staff update canvases folder" on public.canvases
    for update to authenticated
    using (organization_id = public.my_organization_id())
    with check (organization_id = public.my_organization_id());
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
