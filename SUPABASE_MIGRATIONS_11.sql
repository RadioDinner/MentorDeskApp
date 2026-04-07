-- Migration 11: Update handle_meeting_credits() trigger to respect
-- the cancellation policy columns added in supabase/migrations/001_arrangement_policies.sql
--
-- Run AFTER 001_arrangement_policies.sql
--
-- cancellation_policy values:
--   'reallocate' — credit always returned on cancel
--   'consume'    — credit always consumed on cancel
--   'window'     — credit returned only if cancelled >= threshold hours before

CREATE OR REPLACE FUNCTION handle_meeting_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offering_id uuid;
  v_policy text;
  v_window_hours integer;
  v_hours_until numeric;
BEGIN
  -- Only act on meetings linked to an arrangement offering
  IF NEW.mentee_offering_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the offering linked to this mentee_offering
  SELECT o.id, o.cancellation_policy, o.cancellation_window_hours
    INTO v_offering_id, v_policy, v_window_hours
    FROM mentee_offerings mo
    JOIN offerings o ON o.id = mo.offering_id
   WHERE mo.id = NEW.mentee_offering_id
     AND o.offering_type = 'arrangement';

  IF v_offering_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT: consume one credit when a meeting is scheduled
  IF TG_OP = 'INSERT' AND NEW.status = 'scheduled' THEN
    INSERT INTO arrangement_credit_ledger (
      mentee_id, mentee_offering_id, offering_id,
      transaction_type, amount, description
    ) VALUES (
      NEW.mentee_id, NEW.mentee_offering_id, v_offering_id,
      'consumed', -1, 'Meeting scheduled: ' || COALESCE(NEW.title, NEW.id::text)
    );

  -- UPDATE to cancelled: conditionally return credit based on policy
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'scheduled' AND NEW.status = 'cancelled' THEN

    IF v_policy = 'reallocate' THEN
      INSERT INTO arrangement_credit_ledger (
        mentee_id, mentee_offering_id, offering_id,
        transaction_type, amount, description
      ) VALUES (
        NEW.mentee_id, NEW.mentee_offering_id, v_offering_id,
        'returned', 1, 'Meeting cancelled (credit returned): ' || COALESCE(NEW.title, NEW.id::text)
      );

    ELSIF v_policy = 'window' THEN
      v_hours_until := EXTRACT(EPOCH FROM (NEW.scheduled_at - NOW())) / 3600.0;
      IF v_hours_until >= COALESCE(v_window_hours, 24) THEN
        INSERT INTO arrangement_credit_ledger (
          mentee_id, mentee_offering_id, offering_id,
          transaction_type, amount, description
        ) VALUES (
          NEW.mentee_id, NEW.mentee_offering_id, v_offering_id,
          'returned', 1, 'Meeting cancelled outside window (credit returned): ' || COALESCE(NEW.title, NEW.id::text)
        );
      END IF;
      -- Within threshold window: credit consumed, no entry

    ELSIF v_policy = 'consume' THEN
      NULL; -- Never return credit on cancellation
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS trg_meeting_credits ON meetings;

CREATE TRIGGER trg_meeting_credits
AFTER INSERT OR UPDATE ON meetings
FOR EACH ROW
EXECUTE FUNCTION handle_meeting_credits();
