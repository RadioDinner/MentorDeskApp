-- Add mentee_offering_id to meetings table so meetings can be linked to a
-- specific arrangement enrollment (mentee_offerings row).
-- Required by the payroll window and the handle_meeting_credits() trigger.

alter table meetings
  add column if not exists mentee_offering_id uuid references mentee_offerings(id) on delete set null;

comment on column meetings.mentee_offering_id is
  'Optional link to the mentee_offerings row (arrangement enrollment) this meeting belongs to. '
  'Used for credit tracking and payroll calculations.';
