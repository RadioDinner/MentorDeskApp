-- Canvases: collaborative sticky-note whiteboards shared between a mentor
-- and a mentee on a pairing. Ad-hoc per pairing (NOT a template system).
-- Async collaboration — last save wins. Content is a single jsonb blob of
-- positioned notes.
--
-- Model:
--   canvases    one row per canvas. content jsonb holds { notes: CanvasNote[] }
--               where each note has { id, x, y, width, height, text, color, z }.
--               mentor_id and mentee_id together form the editor set (plus
--               org admins). updated_by tracks the last editor (staff or
--               mentee user) via auth.uid, so we can render "last edited by".

create table if not exists public.canvases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mentor_id       uuid not null references public.staff (id) on delete cascade,
  mentee_id       uuid not null references public.mentees (id) on delete cascade,
  title           text not null,
  description     text,
  content         jsonb not null default '{"notes": []}'::jsonb,
  created_by      uuid references public.staff (id) on delete set null,
  updated_by_uid  uuid, -- auth.uid of the last editor (may be mentor's user_id or mentee's user_id)
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.canvases is 'Collaborative sticky-note whiteboards between a mentor and a mentee.';

create index if not exists idx_canvases_org    on public.canvases (organization_id);
create index if not exists idx_canvases_mentor on public.canvases (mentor_id);
create index if not exists idx_canvases_mentee on public.canvases (mentee_id);
create index if not exists idx_canvases_active on public.canvases (organization_id, archived_at);

create trigger canvases_updated_at
  before update on public.canvases
  for each row execute function public.handle_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table public.canvases enable row level security;

-- Staff in org can read all canvases in their org
create policy "staff read org canvases"
  on public.canvases for select
  to authenticated
  using (organization_id = public.my_organization_id());

-- Admin, operations, and the assigned mentor can create canvases in-org
create policy "staff create org canvases"
  on public.canvases for insert
  to authenticated
  with check (
    organization_id = public.my_organization_id()
    and (
      public.my_staff_role() in ('admin', 'operations')
      or mentor_id in (select id from public.staff where user_id = auth.uid())
    )
  );

-- Admin, operations, and the assigned mentor can update/delete canvases
create policy "staff update org canvases"
  on public.canvases for update
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and (
      public.my_staff_role() in ('admin', 'operations')
      or mentor_id in (select id from public.staff where user_id = auth.uid())
    )
  )
  with check (
    organization_id = public.my_organization_id()
    and (
      public.my_staff_role() in ('admin', 'operations')
      or mentor_id in (select id from public.staff where user_id = auth.uid())
    )
  );

create policy "staff delete org canvases"
  on public.canvases for delete
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() in ('admin', 'operations')
  );

-- Mentees: read/update their own canvases only
create policy "mentees read own canvases"
  on public.canvases for select
  to authenticated
  using (
    mentee_id in (select id from public.mentees where user_id = auth.uid())
  );

create policy "mentees update own canvases"
  on public.canvases for update
  to authenticated
  using (
    mentee_id in (select id from public.mentees where user_id = auth.uid())
  )
  with check (
    mentee_id in (select id from public.mentees where user_id = auth.uid())
  );

notify pgrst, 'reload schema';
