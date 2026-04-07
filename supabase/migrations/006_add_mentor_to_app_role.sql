-- Add 'mentor' to the app_role enum so profile rows can use role = 'mentor'
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'mentor';
