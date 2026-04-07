-- Expand staff_permissions with a column per admin module.
-- Each boolean controls whether a staff member can see that module.
-- Admins always see everything; these only apply to staff role users.

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS mod_dashboard       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_mentors         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_assistant_mentors boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_mentees         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_staff           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_offerings       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_reports         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_billing         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_invoicing       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_payroll         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_staff_roles     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_audit_log       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mod_settings        boolean DEFAULT false;
