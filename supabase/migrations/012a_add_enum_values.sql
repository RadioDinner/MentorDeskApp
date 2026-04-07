-- These must run outside the main migration transaction.
-- Add any missing values to the app_role enum.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'trainee';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';
