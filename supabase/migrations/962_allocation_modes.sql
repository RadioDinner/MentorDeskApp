-- Two new organization-level settings that control how meeting allocations
-- (credits) are granted to mentees for engagements:
--
--   allocation_grant_mode:
--     'on_open'          — initial allocation batch is granted the moment
--                          the engagement is opened/assigned (preserves
--                          existing behavior)
--     'on_first_payment' — no credits until the mentee's first invoice
--                          for this engagement is marked paid
--
--   allocation_refresh_mode:
--     'by_cycle'         — additional allocation batches are granted on
--                          each cycle boundary (weekly/monthly/per_cycle
--                          from the engagement's allocation_period)
--     'by_payment'       — additional allocation batches are granted each
--                          time another invoice for the engagement is paid
--                          (enables the "pay to unlock next batch" flow)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS allocation_grant_mode   TEXT NOT NULL DEFAULT 'on_open',
  ADD COLUMN IF NOT EXISTS allocation_refresh_mode TEXT NOT NULL DEFAULT 'by_cycle';

ALTER TABLE organizations
  ADD CONSTRAINT organizations_allocation_grant_mode_check
    CHECK (allocation_grant_mode IN ('on_open', 'on_first_payment'));

ALTER TABLE organizations
  ADD CONSTRAINT organizations_allocation_refresh_mode_check
    CHECK (allocation_refresh_mode IN ('by_cycle', 'by_payment'));

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
