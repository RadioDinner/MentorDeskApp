-- Habits: daily check-in routines authored by staff and assigned to mentees.
--
-- Model:
--   habits                      template authored by admin/course_creator
--   habit_steps                 ordered list of steps within a habit template
--   mentee_habits               instance of a habit assigned to a mentee
--                               (snapshots the template so edits to the
--                               template do not retroactively change an
--                               in-flight assignment)
--   mentee_habit_steps          per-assignment snapshot of the steps
--   mentee_habit_step_logs      one row per (step, day) when the mentee
--                               checks off a step
--
-- A day is "successful" when all of a mentee_habit's steps have a log row
-- for that log_date. The successful_days_count column on mentee_habits is a
-- denormalized cache maintained by the app after a step is checked.

-- ── habits (templates) ───────────────────────────────────────────────────

create table if not exists public.habits (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  name                   text not null,
  description            text,
  duration_mode          text not null check (duration_mode in ('fixed_days', 'goal_x_of_y', 'until_x_successful')),
  duration_days          integer,
  goal_successful_days   integer,
  is_active              boolean not null default true,
  created_by             uuid references public.staff (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint habits_duration_params_valid check (
    (duration_mode = 'fixed_days'          and duration_days is not null and duration_days > 0) or
    (duration_mode = 'goal_x_of_y'         and duration_days is not null and duration_days > 0
                                           and goal_successful_days is not null and goal_successful_days > 0
                                           and goal_successful_days <= duration_days) or
    (duration_mode = 'until_x_successful'  and goal_successful_days is not null and goal_successful_days > 0)
  )
);

comment on table public.habits is 'Daily check-in routine templates authored by staff.';

create index if not exists idx_habits_org    on public.habits (organization_id);
create index if not exists idx_habits_active on public.habits (organization_id, is_active);

create trigger habits_updated_at
  before update on public.habits
  for each row execute function public.handle_updated_at();

-- ── habit_steps ──────────────────────────────────────────────────────────

create table if not exists public.habit_steps (
  id              uuid primary key default gen_random_uuid(),
  habit_id        uuid not null references public.habits (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_index     integer not null default 0,
  title           text not null,
  instructions    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_habit_steps_habit on public.habit_steps (habit_id, order_index);

create trigger habit_steps_updated_at
  before update on public.habit_steps
  for each row execute function public.handle_updated_at();

-- ── mentee_habits (assignments) ──────────────────────────────────────────

create table if not exists public.mentee_habits (
  id                             uuid primary key default gen_random_uuid(),
  organization_id                uuid not null references public.organizations (id) on delete cascade,
  habit_id                       uuid not null references public.habits (id) on delete cascade,
  mentee_id                      uuid not null references public.mentees (id) on delete cascade,
  assigned_by                    uuid references public.staff (id) on delete set null,
  start_date                     date not null default (now() at time zone 'utc')::date,
  end_date                       date,
  status                         text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  successful_days_count          integer not null default 0,
  -- snapshot fields (frozen at assignment time)
  name_snapshot                  text not null,
  description_snapshot           text,
  duration_mode_snapshot         text not null check (duration_mode_snapshot in ('fixed_days', 'goal_x_of_y', 'until_x_successful')),
  duration_days_snapshot         integer,
  goal_successful_days_snapshot  integer,
  assigned_at                    timestamptz not null default now(),
  completed_at                   timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists idx_mentee_habits_mentee on public.mentee_habits (mentee_id);
create index if not exists idx_mentee_habits_habit  on public.mentee_habits (habit_id);
create index if not exists idx_mentee_habits_org    on public.mentee_habits (organization_id);
create index if not exists idx_mentee_habits_status on public.mentee_habits (organization_id, status);

create trigger mentee_habits_updated_at
  before update on public.mentee_habits
  for each row execute function public.handle_updated_at();

-- ── mentee_habit_steps (snapshot of steps at assignment time) ───────────

create table if not exists public.mentee_habit_steps (
  id               uuid primary key default gen_random_uuid(),
  mentee_habit_id  uuid not null references public.mentee_habits (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  order_index      integer not null default 0,
  title            text not null,
  instructions     text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_mentee_habit_steps_mh on public.mentee_habit_steps (mentee_habit_id, order_index);

-- ── mentee_habit_step_logs (daily check-offs) ───────────────────────────

create table if not exists public.mentee_habit_step_logs (
  id                    uuid primary key default gen_random_uuid(),
  mentee_habit_id       uuid not null references public.mentee_habits (id) on delete cascade,
  mentee_habit_step_id  uuid not null references public.mentee_habit_steps (id) on delete cascade,
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  log_date              date not null,
  completed_at          timestamptz not null default now(),
  unique (mentee_habit_step_id, log_date)
);

create index if not exists idx_mhsl_mh       on public.mentee_habit_step_logs (mentee_habit_id, log_date);
create index if not exists idx_mhsl_org      on public.mentee_habit_step_logs (organization_id);

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table public.habits                   enable row level security;
alter table public.habit_steps              enable row level security;
alter table public.mentee_habits            enable row level security;
alter table public.mentee_habit_steps       enable row level security;
alter table public.mentee_habit_step_logs   enable row level security;

-- habits: staff in org can read; admin/course_creator can manage
create policy "staff can read own org habits"
  on public.habits for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "authors can manage org habits"
  on public.habits for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() in ('admin', 'course_creator')
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() in ('admin', 'course_creator')
  );

-- habit_steps: same pattern
create policy "staff can read own org habit steps"
  on public.habit_steps for select
  to authenticated
  using (organization_id = public.my_organization_id());

create policy "authors can manage habit steps"
  on public.habit_steps for all
  to authenticated
  using (
    organization_id = public.my_organization_id()
    and public.my_staff_role() in ('admin', 'course_creator')
  )
  with check (
    organization_id = public.my_organization_id()
    and public.my_staff_role() in ('admin', 'course_creator')
  );

-- mentee_habits: any staff in org can read/write; mentee can read/write own
create policy "staff read org mentee_habits"
  on public.mentee_habits for select
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "staff insert org mentee_habits"
  on public.mentee_habits for insert
  with check (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "staff update org mentee_habits"
  on public.mentee_habits for update
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "staff delete org mentee_habits"
  on public.mentee_habits for delete
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "mentees view own mentee_habits"
  on public.mentee_habits for select
  using (
    mentee_id in (select id from public.mentees where user_id = auth.uid())
  );

create policy "mentees update own mentee_habits"
  on public.mentee_habits for update
  using (
    mentee_id in (select id from public.mentees where user_id = auth.uid())
  );

-- mentee_habit_steps: read-only for staff + mentee owner; writes happen via server
create policy "staff read org mentee_habit_steps"
  on public.mentee_habit_steps for select
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "staff manage org mentee_habit_steps"
  on public.mentee_habit_steps for all
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  )
  with check (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "mentees view own mentee_habit_steps"
  on public.mentee_habit_steps for select
  using (
    mentee_habit_id in (
      select mh.id from public.mentee_habits mh
      join public.mentees m on m.id = mh.mentee_id
      where m.user_id = auth.uid()
    )
  );

-- mentee_habit_step_logs: staff read all in org; mentees read/write their own
create policy "staff read org step logs"
  on public.mentee_habit_step_logs for select
  using (
    organization_id in (select organization_id from public.staff where user_id = auth.uid())
  );

create policy "mentees read own step logs"
  on public.mentee_habit_step_logs for select
  using (
    mentee_habit_id in (
      select mh.id from public.mentee_habits mh
      join public.mentees m on m.id = mh.mentee_id
      where m.user_id = auth.uid()
    )
  );

create policy "mentees insert own step logs"
  on public.mentee_habit_step_logs for insert
  with check (
    mentee_habit_id in (
      select mh.id from public.mentee_habits mh
      join public.mentees m on m.id = mh.mentee_id
      where m.user_id = auth.uid()
    )
  );

create policy "mentees delete own step logs"
  on public.mentee_habit_step_logs for delete
  using (
    mentee_habit_id in (
      select mh.id from public.mentee_habits mh
      join public.mentees m on m.id = mh.mentee_id
      where m.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
