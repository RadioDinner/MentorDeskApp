-- Part 2 of prayer_partner → assistant_mentor rename.
-- Must run AFTER 024 so the 'assistantmentor' enum value is committed.

-- 1. Update existing role references in user_roles
UPDATE user_roles SET role = 'assistantmentor' WHERE role = 'prayerpartner';

-- 2. Update existing role references in profiles
UPDATE profiles SET role = 'assistantmentor' WHERE role = 'prayerpartner';

-- 3. Update platform_pricing limits keys
UPDATE platform_pricing SET limits = limits - 'prayer_partners' || jsonb_build_object('assistant_mentors', limits->'prayer_partners')
WHERE limits ? 'prayer_partners';
