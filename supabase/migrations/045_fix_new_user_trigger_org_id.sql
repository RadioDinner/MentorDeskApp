-- ============================================================================
-- MIGRATION 045: Fix user creation triggers
-- ============================================================================
-- 1. Drop the legacy handle_new_user trigger that inserts into profiles
--    without organization_id, violating the NOT NULL constraint added in
--    migration 015. This trigger predates multi-tenancy.
-- 2. Update handle_new_user_default_role to read organization_id from
--    user_metadata when users are created via admin API, and skip profile
--    creation for admin-created users (the edge function handles it).
-- ============================================================================

-- Drop the legacy trigger that crashes user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Update the default role trigger to handle admin-created users
CREATE OR REPLACE FUNCTION public.handle_new_user_default_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if this user was created by an admin (has organization_id in metadata).
  -- The edge function handles profile/role creation for admin-created users.
  IF NEW.raw_user_meta_data ? 'organization_id' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
    DECLARE
      v_mentee_id uuid;
      v_org_id uuid;
    BEGIN
      SELECT id, organization_id INTO v_mentee_id, v_org_id
      FROM public.mentees
      WHERE email = NEW.email
      LIMIT 1;

      IF v_mentee_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role, entity_id, organization_id)
        VALUES (NEW.id, 'mentee', v_mentee_id, v_org_id)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.profiles (id, mentee_id, organization_id)
        VALUES (NEW.id, v_mentee_id, v_org_id)
        ON CONFLICT (id) DO UPDATE
          SET mentee_id = v_mentee_id, organization_id = v_org_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user_default_role failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
