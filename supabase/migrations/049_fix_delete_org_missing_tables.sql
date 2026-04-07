-- ============================================================================
-- MIGRATION 049: Fix delete_organization for missing tables
-- ============================================================================
-- Error: relation "course_feedback" does not exist (42P01)
-- Root cause: The RPC function references tables (course_feedback,
-- lesson_content_blocks) that may not exist in all environments.
-- Fix: Guard every DELETE with an IF EXISTS check so the function
-- gracefully skips tables that haven't been created yet.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_organization(target_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_name text;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_count int;
  v_table_exists boolean;
BEGIN
  -- Verify caller is super_admin
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  -- Verify org exists
  SELECT name INTO v_org_name FROM organizations WHERE id = target_org_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Delete from all org-scoped tables (order matters for FK constraints)
  -- Child tables first, then parent tables.
  -- Each block checks IF EXISTS so we skip tables not yet created.

  -- mentee_whiteboards
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentee_whiteboards') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentee_whiteboards WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_whiteboards', v_count);
  END IF;

  -- mentee_lesson_progress
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentee_lesson_progress') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentee_lesson_progress WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_lesson_progress', v_count);
  END IF;

  -- lesson_whiteboards
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lesson_whiteboards') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM lesson_whiteboards WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_whiteboards', v_count);
  END IF;

  -- course_feedback
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='course_feedback') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM course_feedback WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('course_feedback', v_count);
  END IF;

  -- lesson_versions
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lesson_versions') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM lesson_versions WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_versions', v_count);
  END IF;

  -- lesson_questions
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lesson_questions') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM lesson_questions WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_questions', v_count);
  END IF;

  -- lesson_content_blocks
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lesson_content_blocks') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM lesson_content_blocks WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_content_blocks', v_count);
  END IF;

  -- lessons
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lessons') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM lessons WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('lessons', v_count);
  END IF;

  -- courses
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='courses') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM courses WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('courses', v_count);
  END IF;

  -- invoices
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM invoices WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('invoices', v_count);
  END IF;

  -- mentee_payment_methods
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentee_payment_methods') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentee_payment_methods WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_payment_methods', v_count);
  END IF;

  -- arrangement_credit_ledger
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='arrangement_credit_ledger') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM arrangement_credit_ledger WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('arrangement_credit_ledger', v_count);
  END IF;

  -- meetings
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='meetings') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM meetings WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('meetings', v_count);
  END IF;

  -- mentee_offerings
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentee_offerings') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentee_offerings WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_offerings', v_count);
  END IF;

  -- offerings
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='offerings') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM offerings WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('offerings', v_count);
  END IF;

  -- staff_permissions
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_permissions') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM staff_permissions WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('staff_permissions', v_count);
  END IF;

  -- profiles (BEFORE assistant_mentors, mentors, staff due to FK refs)
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM profiles WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles', v_count);
  END IF;

  -- assistant_mentors
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='assistant_mentors') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM assistant_mentors WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('assistant_mentors', v_count);
  END IF;

  -- mentees
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentees') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentees WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentees', v_count);
  END IF;

  -- mentors
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentors') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM mentors WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('mentors', v_count);
  END IF;

  -- staff
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM staff WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('staff', v_count);
  END IF;

  -- signup_requests
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='signup_requests') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM signup_requests WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('signup_requests', v_count);
  END IF;

  -- org_billing
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='org_billing') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM org_billing WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('org_billing', v_count);
  END IF;

  -- audit_logs
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM audit_logs WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);
  END IF;

  -- login_events
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='login_events') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM login_events WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('login_events', v_count);
  END IF;

  -- bug_reports
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bug_reports') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM bug_reports WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('bug_reports', v_count);
  END IF;

  -- settings
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='settings') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM settings WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('settings', v_count);
  END IF;

  -- user_roles
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles') INTO v_table_exists;
  IF v_table_exists THEN
    DELETE FROM user_roles WHERE organization_id = target_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('user_roles', v_count);
  END IF;

  -- Finally delete the org itself
  DELETE FROM organizations WHERE id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('organizations', v_count);

  RETURN jsonb_build_object('success', true, 'organization', v_org_name, 'deleted', v_deleted_counts);
END;
$$;
