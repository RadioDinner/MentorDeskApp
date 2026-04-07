-- Allow cancellation_policy to be NULL for courses (only arrangements use it).
-- The old migration 002 set it as NOT NULL DEFAULT 'window'.
ALTER TABLE offerings ALTER COLUMN cancellation_policy DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN cancellation_policy DROP DEFAULT;

-- Update constraint to explicitly allow NULL
ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_cancellation_policy_check;
ALTER TABLE offerings
  ADD CONSTRAINT offerings_cancellation_policy_check
  CHECK (cancellation_policy IS NULL OR cancellation_policy IN ('reallocate', 'consume', 'window'));
