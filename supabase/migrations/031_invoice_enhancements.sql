-- ============================================================================
-- MIGRATION 031: Invoice system enhancements
-- ============================================================================
-- Adds invoice numbering, issued_at tracking, notes, and a DB function
-- to auto-generate sequential invoice numbers per organization.
-- ============================================================================

-- ── New columns ────────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;

-- Unique invoice numbers within an org
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_number
  ON invoices (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;


-- ── Auto-generate invoice number on insert ─────────────────────────────────
-- Format: {prefix}{zero-padded sequence}  e.g. INV-000042
-- The prefix is read from the org's settings (key = 'invoice_prefix').
-- If no prefix is configured, defaults to 'INV-'.

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_seq bigint;
BEGIN
  -- Only generate if not already set (allows manual override)
  IF NEW.invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Read the org's invoice prefix from settings
  SELECT value INTO prefix
  FROM settings
  WHERE organization_id = NEW.organization_id
    AND key = 'invoice_prefix';

  IF prefix IS NULL OR prefix = '' THEN
    prefix := 'INV-';
  END IF;

  -- Get the next sequence number for this org
  SELECT COALESCE(MAX(
    -- Extract the numeric suffix after the prefix
    CASE
      WHEN invoice_number LIKE prefix || '%' THEN
        NULLIF(regexp_replace(substring(invoice_number FROM length(prefix) + 1), '[^0-9]', '', 'g'), '')::bigint
      ELSE NULL
    END
  ), 0) + 1
  INTO next_seq
  FROM invoices
  WHERE organization_id = NEW.organization_id;

  NEW.invoice_number := prefix || lpad(next_seq::text, 6, '0');

  -- Default issued_at to now if not set
  IF NEW.issued_at IS NULL THEN
    NEW.issued_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION generate_invoice_number();


-- ── Backfill existing invoices ─────────────────────────────────────────────
-- Give existing invoices sequential numbers and set issued_at to now().

DO $$
DECLARE
  inv record;
  prefix text;
  seq bigint;
  prev_org uuid := NULL;
BEGIN
  FOR inv IN
    SELECT i.id, i.organization_id
    FROM invoices i
    WHERE i.invoice_number IS NULL
    ORDER BY i.organization_id, i.due_date, i.id
  LOOP
    IF inv.organization_id IS DISTINCT FROM prev_org THEN
      prev_org := inv.organization_id;
      seq := 0;

      SELECT s.value INTO prefix
      FROM settings s
      WHERE s.organization_id = inv.organization_id
        AND s.key = 'invoice_prefix';

      IF prefix IS NULL OR prefix = '' THEN
        prefix := 'INV-';
      END IF;
    END IF;

    seq := seq + 1;

    UPDATE invoices
    SET invoice_number = prefix || lpad(seq::text, 6, '0'),
        issued_at = COALESCE(issued_at, now())
    WHERE id = inv.id;
  END LOOP;
END $$;
