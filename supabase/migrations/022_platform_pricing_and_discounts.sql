-- Platform pricing configuration (editable by super admins)
CREATE TABLE IF NOT EXISTS platform_pricing (
  plan_key text PRIMARY KEY,           -- 'free', 'starter', 'pro', 'enterprise'
  label text NOT NULL,
  price numeric,                       -- monthly price (null = free or custom)
  limits jsonb NOT NULL DEFAULT '{}',  -- { mentors, mentees, staff, prayer_partners, offerings }
  features jsonb NOT NULL DEFAULT '{}',-- { billing, invoicing, payroll, reports, courses, arrangements }
  updated_at timestamptz DEFAULT now()
);

-- Seed with current defaults
INSERT INTO platform_pricing (plan_key, label, price, limits, features) VALUES
  ('free', 'Free', NULL,
    '{"mentors":2,"mentees":5,"staff":2,"prayer_partners":2,"offerings":1}',
    '{"billing":false,"invoicing":false,"payroll":false,"reports":false,"courses":false,"arrangements":true}'),
  ('starter', 'Starter', 49,
    '{"mentors":10,"mentees":25,"staff":5,"prayer_partners":10,"offerings":5}',
    '{"billing":true,"invoicing":true,"payroll":false,"reports":true,"courses":true,"arrangements":true}'),
  ('pro', 'Pro', 149,
    '{"mentors":50,"mentees":100,"staff":20,"prayer_partners":50,"offerings":-1}',
    '{"billing":true,"invoicing":true,"payroll":true,"reports":true,"courses":true,"arrangements":true}'),
  ('enterprise', 'Enterprise', NULL,
    '{"mentors":-1,"mentees":-1,"staff":-1,"prayer_partners":-1,"offerings":-1}',
    '{"billing":true,"invoicing":true,"payroll":true,"reports":true,"courses":true,"arrangements":true}')
ON CONFLICT (plan_key) DO NOTHING;

-- RLS: only super_admins can read/write
ALTER TABLE platform_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage platform pricing"
  ON platform_pricing FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Organization discount fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discount_note text DEFAULT '';
