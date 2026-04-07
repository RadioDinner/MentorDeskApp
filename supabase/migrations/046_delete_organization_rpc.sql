-- ============================================================================
-- MIGRATION 046: Add delete_organization RPC for super admins
-- ============================================================================
-- Provides a SECURITY DEFINER function that cascades deletion through all
-- org-scoped tables, bypassing RLS. Only callable by super admins.
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
  -- Child tables first, then parent tables

  DELETE FROM mentee_whiteboards WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_whiteboards', v_count);

  DELETE FROM mentee_lesson_progress WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_lesson_progress', v_count);

  DELETE FROM lesson_whiteboards WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_whiteboards', v_count);

  DELETE FROM course_feedback WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('course_feedback', v_count);

  DELETE FROM lesson_versions WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_versions', v_count);

  DELETE FROM lesson_questions WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_questions', v_count);

  DELETE FROM lesson_content_blocks WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('lesson_content_blocks', v_count);

  DELETE FROM lessons WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('lessons', v_count);

  DELETE FROM courses WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('courses', v_count);

  DELETE FROM invoices WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('invoices', v_count);

  DELETE FROM mentee_payment_methods WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_payment_methods', v_count);

  DELETE FROM arrangement_credit_ledger WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('arrangement_credit_ledger', v_count);

  DELETE FROM meetings WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('meetings', v_count);

  DELETE FROM mentee_offerings WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentee_offerings', v_count);

  DELETE FROM offerings WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('offerings', v_count);

  DELETE FROM staff_permissions WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('staff_permissions', v_count);

  DELETE FROM assistant_mentors WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('assistant_mentors', v_count);

  DELETE FROM mentees WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentees', v_count);

  DELETE FROM mentors WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('mentors', v_count);

  DELETE FROM staff WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('staff', v_count);

  DELETE FROM signup_requests WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('signup_requests', v_count);

  DELETE FROM org_billing WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('org_billing', v_count);

  DELETE FROM audit_logs WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);

  DELETE FROM login_events WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('login_events', v_count);

  DELETE FROM bug_reports WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('bug_reports', v_count);

  DELETE FROM settings WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('settings', v_count);

  DELETE FROM user_roles WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('user_roles', v_count);

  DELETE FROM profiles WHERE organization_id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles', v_count);

  -- Finally delete the org itself
  DELETE FROM organizations WHERE id = target_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('organizations', v_count);

  RETURN jsonb_build_object('success', true, 'organization', v_org_name, 'deleted', v_deleted_counts);
END;
$$;
