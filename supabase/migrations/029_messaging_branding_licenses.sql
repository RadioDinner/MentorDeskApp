-- Add new messaging columns to all user tables
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS messaging_methods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE mentors ADD COLUMN IF NOT EXISTS preferred_messaging text;

ALTER TABLE mentees ADD COLUMN IF NOT EXISTS messaging_methods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE mentees ADD COLUMN IF NOT EXISTS preferred_messaging text;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS messaging_methods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS preferred_messaging text;

ALTER TABLE assistant_mentors ADD COLUMN IF NOT EXISTS messaging_methods jsonb DEFAULT '[]'::jsonb;
ALTER TABLE assistant_mentors ADD COLUMN IF NOT EXISTS preferred_messaging text;

-- Add license_limits column to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS license_limits jsonb;

-- Create platform_settings table for super admin branding/config
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);
