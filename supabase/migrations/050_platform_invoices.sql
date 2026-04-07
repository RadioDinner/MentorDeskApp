-- Platform-level invoices: MentorDesk billing organizations for their subscription plans
CREATE TABLE IF NOT EXISTS platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled', 'void')),
  plan_key text NOT NULL DEFAULT 'free',
  billing_period_start date,
  billing_period_end date,
  due_date date,
  issued_at timestamptz,
  paid_at timestamptz,
  sent_at timestamptz,
  description text,
  notes text,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-generate sequential invoice numbers: PLAT-000001
CREATE OR REPLACE FUNCTION generate_platform_invoice_number()
RETURNS trigger AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1
  INTO next_num
  FROM platform_invoices;

  NEW.invoice_number := 'PLAT-' || lpad(next_num::text, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_platform_invoice_number
  BEFORE INSERT ON platform_invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_platform_invoice_number();

-- RLS
ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins full access to platform_invoices"
  ON platform_invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- Org admins can read their own invoices
CREATE POLICY "Org admins can view own platform invoices"
  ON platform_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND organization_id = platform_invoices.organization_id
      AND role = 'admin'
    )
  );

-- Index for common queries
CREATE INDEX idx_platform_invoices_org ON platform_invoices(organization_id);
CREATE INDEX idx_platform_invoices_status ON platform_invoices(status);
CREATE INDEX idx_platform_invoices_due_date ON platform_invoices(due_date);
