-- Auto-assign mentee role to new users who sign up without an admin-created account.
-- If an admin has already created a user_roles entry (via invite-user), this trigger
-- does nothing. This supports self-signup where new users default to mentee.

CREATE OR REPLACE FUNCTION public.handle_new_user_default_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the user doesn't already have a role assigned
  -- (admins using invite-user will have already created user_roles entries)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
  ) THEN
    -- Check if there's a mentee record matching this email
    -- (admin may have created the mentee record but not yet invited)
    DECLARE
      v_mentee_id uuid;
      v_org_id uuid;
    BEGIN
      SELECT id, organization_id INTO v_mentee_id, v_org_id
      FROM public.mentees
      WHERE email = NEW.email
      LIMIT 1;

      IF v_mentee_id IS NOT NULL THEN
        -- Link to existing mentee record
        INSERT INTO public.user_roles (user_id, role, entity_id, organization_id)
        VALUES (NEW.id, 'mentee', v_mentee_id, v_org_id)
        ON CONFLICT DO NOTHING;

        -- Also set profiles for backward compatibility
        INSERT INTO public.profiles (id, role, mentee_id, organization_id)
        VALUES (NEW.id, 'mentee', v_mentee_id, v_org_id)
        ON CONFLICT (id) DO UPDATE
          SET role = 'mentee', mentee_id = v_mentee_id, organization_id = v_org_id;
      ELSE
        -- No mentee record exists — create a basic profiles entry as mentee
        -- The mentee record will need to be created by an admin later,
        -- or we create a stub from the email
        INSERT INTO public.profiles (id, role)
        VALUES (NEW.id, 'mentee')
        ON CONFLICT (id) DO UPDATE SET role = COALESCE(NULLIF(profiles.role, ''), 'mentee');
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created_default_role ON auth.users;

-- Create trigger on new user creation
CREATE TRIGGER on_auth_user_created_default_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_default_role();
