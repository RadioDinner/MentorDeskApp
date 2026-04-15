-- Add engagement closeout fields to mentee_offerings.
--
-- completed_at already exists on the table (from 978). This migration adds
-- the cancelled_at / cancellation_reason / refund_amount_cents fields so
-- the admin can distinguish "completed normally" from "cancelled early"
-- and capture the refund amount agreed with the mentee at cancel time.
--
-- Neither column is required — refund_amount_cents defaults to 0 so
-- legacy rows and "no refund" cancels don't need a value.

alter table mentee_offerings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists refund_amount_cents int not null default 0;
