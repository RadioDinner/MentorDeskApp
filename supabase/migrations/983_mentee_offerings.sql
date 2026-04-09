-- Tracks course assignments and engagement openings for mentees
create table if not exists mentee_offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mentee_id uuid not null references mentees(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  assigned_by uuid references staff(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  sessions_used int not null default 0,
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mentee_id, offering_id, status)
);

-- Index for fast lookups
create index if not exists idx_mentee_offerings_mentee on mentee_offerings(mentee_id);
create index if not exists idx_mentee_offerings_offering on mentee_offerings(offering_id);
create index if not exists idx_mentee_offerings_org on mentee_offerings(organization_id);

-- RLS
alter table mentee_offerings enable row level security;

create policy "Users can view mentee_offerings in their org"
  on mentee_offerings for select
  using (
    organization_id in (
      select organization_id from staff where user_id = auth.uid()
    )
  );

create policy "Users can insert mentee_offerings in their org"
  on mentee_offerings for insert
  with check (
    organization_id in (
      select organization_id from staff where user_id = auth.uid()
    )
  );

create policy "Users can update mentee_offerings in their org"
  on mentee_offerings for update
  using (
    organization_id in (
      select organization_id from staff where user_id = auth.uid()
    )
  );

create policy "Users can delete mentee_offerings in their org"
  on mentee_offerings for delete
  using (
    organization_id in (
      select organization_id from staff where user_id = auth.uid()
    )
  );

-- Mentees can view their own offerings
create policy "Mentees can view own offerings"
  on mentee_offerings for select
  using (
    mentee_id in (
      select id from mentees where user_id = auth.uid()
    )
  );
