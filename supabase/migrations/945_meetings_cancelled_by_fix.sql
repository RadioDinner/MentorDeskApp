-- Fix: cancelled_by was FK'd to staff(id) but mentees also cancel meetings.
-- Drop the FK so the column can hold either a staff or mentee UUID.
alter table meetings drop constraint if exists meetings_cancelled_by_fkey;
