-- Add 'prayerpartner' to the app_role enum (if not already present)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'prayerpartner';

-- Add prayer_partner_id column to profiles so we can link auth users to
-- prayer_partner records, just like we do with mentor_id and mentee_id.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS prayer_partner_id uuid REFERENCES prayer_partners(id);
