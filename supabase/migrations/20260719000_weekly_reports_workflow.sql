-- Migration: 007 Weekly Reports and Faculty Review Workflow
-- Purpose: Dropping faculty_reviews unique/status constraints, creating public RPC operations, private audit logger, and defining strict RLS policies.

-- Create private schema if not exists
CREATE SCHEMA IF NOT EXISTS private;

-- 1. DROP old constraints
ALTER TABLE public.faculty_reviews DROP CONSTRAINT IF EXISTS faculty_reviews_weekly_report_id_key;
ALTER TABLE public.weekly_reports DROP CONSTRAINT IF EXISTS weekly_reports_status_check;
ALTER TABLE public.faculty_reviews DROP CONSTRAINT IF EXISTS faculty_reviews_status_check;

-- 2. ADD new status check constraints (removing REJECTED from the MVP state engine)
ALTER TABLE public.weekly_reports ADD CONSTRAINT weekly_reports_status_check 
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'CORRECTION_REQUESTED', 'APPROVED'));

ALTER TABLE public.faculty_reviews ADD CONSTRAINT faculty_reviews_status_check 
    CHECK (status IN ('APPROVED', 'CORRECTION_REQUESTED'));

-- 3. Private Audit Helper
CREATE OR REPLACE FUNCTION private.log_audit_event(
    p_tenant_id UUID,
    p_action VARCHAR,
    p_target_table VARCHAR,
    p_target_id UUID
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
    VALUES (p_tenant_id, auth.uid(), p_action, p_target_table, p_target_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- Revoke all executions from PUBLIC and authenticated roles
REVOKE ALL ON FUNCTION private.log_audit_event(UUID, VARCHAR, VARCHAR, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.log_audit_event(UUID, VARCHAR, VARCHAR, UUID) FROM anon;
REVOKE ALL ON FUNCTION private.log_audit_event(UUID, VARCHAR, VARCHAR, UUID) FROM authenticated;

-- 4. RLS POLICIES FOR weekly_reports
DROP POLICY IF EXISTS weekly_reports_select_policy ON public.weekly_reports;
DROP POLICY IF EXISTS weekly_reports_student_write_policy ON public.weekly_reports;

-- Tenant Admin, Faculty, and Student Read Authorization
CREATE POLICY weekly_reports_select_policy ON public.weekly_reports FOR SELECT
USING (
    -- 1. Student owns the report
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid())
    OR
    -- 2. Faculty member is assigned to the student's batch
    internship_id IN (
        SELECT i.id 
        FROM public.internships i
        JOIN public.tenant_memberships tm ON i.student_id = tm.user_id
        JOIN public.student_profiles sp ON tm.id = sp.tenant_membership_id
        JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE fba.faculty_user_id = auth.uid()
    )
    OR
    -- 3. Tenant Admin is member of the same tenant
    internship_id IN (
        SELECT i.id 
        FROM public.internships i
        JOIN public.tenant_memberships tm ON i.tenant_id = tm.tenant_id
        JOIN public.membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

DROP POLICY IF EXISTS weekly_reports_insert_policy ON public.weekly_reports;
DROP POLICY IF EXISTS weekly_reports_update_policy ON public.weekly_reports;
DROP POLICY IF EXISTS weekly_reports_delete_policy ON public.weekly_reports;

-- Restrict Student direct writes (Insert, Update, Delete) based on workflow state
CREATE POLICY weekly_reports_insert_policy ON public.weekly_reports FOR INSERT
WITH CHECK (
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid() AND status = 'ACTIVE')
    AND status = 'DRAFT'
);

CREATE POLICY weekly_reports_update_policy ON public.weekly_reports FOR UPDATE
USING (
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid() AND status = 'ACTIVE')
    AND status IN ('DRAFT', 'CORRECTION_REQUESTED')
)
WITH CHECK (
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid() AND status = 'ACTIVE')
    AND status IN ('DRAFT', 'CORRECTION_REQUESTED')
);

CREATE POLICY weekly_reports_delete_policy ON public.weekly_reports FOR DELETE
USING (
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid() AND status = 'ACTIVE')
    AND status = 'DRAFT'
);

-- 5. RLS POLICIES FOR weekly_report_log_links
DROP POLICY IF EXISTS weekly_report_log_links_policy ON public.weekly_report_log_links;
DROP POLICY IF EXISTS weekly_report_log_links_select_policy ON public.weekly_report_log_links;
DROP POLICY IF EXISTS weekly_report_log_links_insert_policy ON public.weekly_report_log_links;
DROP POLICY IF EXISTS weekly_report_log_links_delete_policy ON public.weekly_report_log_links;


CREATE POLICY weekly_report_log_links_select_policy ON public.weekly_report_log_links FOR SELECT
USING (
    weekly_report_id IN (SELECT id FROM public.weekly_reports)
);

CREATE POLICY weekly_report_log_links_insert_policy ON public.weekly_report_log_links FOR INSERT
WITH CHECK (
    weekly_report_id IN (
        SELECT wr.id FROM public.weekly_reports wr
        JOIN public.internships i ON wr.internship_id = i.id
        WHERE i.student_id = auth.uid() AND wr.status IN ('DRAFT', 'CORRECTION_REQUESTED')
    )
);

CREATE POLICY weekly_report_log_links_delete_policy ON public.weekly_report_log_links FOR DELETE
USING (
    weekly_report_id IN (
        SELECT wr.id FROM public.weekly_reports wr
        JOIN public.internships i ON wr.internship_id = i.id
        WHERE i.student_id = auth.uid() AND wr.status IN ('DRAFT', 'CORRECTION_REQUESTED')
    )
);

-- 6. RLS POLICIES FOR faculty_reviews
DROP POLICY IF EXISTS faculty_reviews_select_policy ON public.faculty_reviews;
DROP POLICY IF EXISTS faculty_reviews_insert_policy ON public.faculty_reviews;

CREATE POLICY faculty_reviews_select_policy ON public.faculty_reviews FOR SELECT
USING (
    weekly_report_id IN (SELECT id FROM public.weekly_reports)
);

-- Direct inserts/updates/deletes on faculty_reviews are completely DENIED to all users.
-- (Bypasses prevented; only review_weekly_report RPC function can write to this table).

-- 7. STUDENT RPC: create_weekly_report_with_logs
CREATE OR REPLACE FUNCTION public.create_weekly_report_with_logs(
    p_internship_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_student_notes TEXT,
    p_daily_log_ids UUID[]
) RETURNS UUID AS $$
DECLARE
    v_report_id UUID;
    v_tenant_id UUID;
    v_log_id UUID;
    v_log_date DATE;
    v_log_status VARCHAR(50);
    v_log_internship_id UUID;
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: auth.uid() is null' USING ERRCODE = '42501';
    END IF;

    -- Validate internship ownership and status
    SELECT tenant_id INTO v_tenant_id
    FROM public.internships
    WHERE id = p_internship_id AND student_id = auth.uid() AND status = 'ACTIVE';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Internship not found, inactive, or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Validate date boundaries (Monday to Sunday calendar week Wadia rule)
    IF EXTRACT(ISODOW FROM p_start_date) <> 1 THEN
        RAISE EXCEPTION 'Invalid start date: must be a Monday' USING ERRCODE = 'D0010';
    END IF;

    IF p_end_date <> p_start_date + INTERVAL '6 days' THEN
        RAISE EXCEPTION 'Invalid end date: must be the corresponding Sunday' USING ERRCODE = 'D0010';
    END IF;

    IF p_start_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Invalid date: reporting week cannot start in the future' USING ERRCODE = 'D0010';
    END IF;

    -- Create weekly report row in DRAFT status
    INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
    VALUES (p_internship_id, p_start_date, p_end_date, p_student_notes, 'DRAFT')
    RETURNING id INTO v_report_id;

    -- Link daily logs if provided
    IF p_daily_log_ids IS NOT NULL AND array_length(p_daily_log_ids, 1) > 0 THEN
        FOREACH v_log_id IN ARRAY p_daily_log_ids LOOP
            -- Retrieve daily log attributes
            SELECT date, status, internship_id INTO v_log_date, v_log_status, v_log_internship_id
            FROM public.daily_logs
            WHERE id = v_log_id;

            -- Checks
            IF v_log_internship_id IS NULL OR v_log_internship_id <> p_internship_id THEN
                RAISE EXCEPTION 'Daily log % does not belong to this internship', v_log_id USING ERRCODE = 'D0011';
            END IF;

            IF v_log_date < p_start_date OR v_log_date > p_end_date THEN
                RAISE EXCEPTION 'Daily log % date % falls outside weekly report range', v_log_id, v_log_date USING ERRCODE = 'D0011';
            END IF;

            IF v_log_status NOT IN ('SUBMITTED', 'APPROVED') THEN
                RAISE EXCEPTION 'Daily log % must be SUBMITTED or APPROVED to link', v_log_id USING ERRCODE = 'D0011';
            END IF;

            -- Check daily log unique link constraint
            IF EXISTS (SELECT 1 FROM public.weekly_report_log_links WHERE daily_log_id = v_log_id) THEN
                RAISE EXCEPTION 'Daily log % is already linked to another weekly report', v_log_id USING ERRCODE = '23505';
            END IF;

            -- Insert link
            INSERT INTO public.weekly_report_log_links (weekly_report_id, daily_log_id)
            VALUES (v_report_id, v_log_id);
        END LOOP;
    END IF;

    RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- 8. STUDENT RPC: update_weekly_report_with_logs
CREATE OR REPLACE FUNCTION public.update_weekly_report_with_logs(
    p_report_id UUID,
    p_student_notes TEXT,
    p_daily_log_ids UUID[]
) RETURNS VOID AS $$
DECLARE
    v_status VARCHAR(50);
    v_internship_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_log_id UUID;
    v_log_date DATE;
    v_log_status VARCHAR(50);
    v_log_internship_id UUID;
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: auth.uid() is null' USING ERRCODE = '42501';
    END IF;

    -- Lock and verify report row
    SELECT wr.status, wr.internship_id, wr.start_date, wr.end_date 
    INTO v_status, v_internship_id, v_start_date, v_end_date
    FROM public.weekly_reports wr
    JOIN public.internships i ON wr.internship_id = i.id
    WHERE wr.id = p_report_id AND i.student_id = auth.uid() AND i.status = 'ACTIVE'
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Weekly report not found, inactive, or access denied' USING ERRCODE = 'P0002';
    END IF;

    IF v_status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Weekly report is locked for editing in % status', v_status USING ERRCODE = 'D0012';
    END IF;

    -- Update notes
    UPDATE public.weekly_reports
    SET student_notes = p_student_notes
    WHERE id = p_report_id;

    -- Delete old log links
    DELETE FROM public.weekly_report_log_links WHERE weekly_report_id = p_report_id;

    -- Relink daily logs if provided
    IF p_daily_log_ids IS NOT NULL AND array_length(p_daily_log_ids, 1) > 0 THEN
        FOREACH v_log_id IN ARRAY p_daily_log_ids LOOP
            -- Retrieve daily log attributes
            SELECT date, status, internship_id INTO v_log_date, v_log_status, v_log_internship_id
            FROM public.daily_logs
            WHERE id = v_log_id;

            -- Checks
            IF v_log_internship_id IS NULL OR v_log_internship_id <> v_internship_id THEN
                RAISE EXCEPTION 'Daily log % does not belong to this internship', v_log_id USING ERRCODE = 'D0011';
            END IF;

            IF v_log_date < v_start_date OR v_log_date > v_end_date THEN
                RAISE EXCEPTION 'Daily log % date % falls outside weekly report range', v_log_id, v_log_date USING ERRCODE = 'D0011';
            END IF;

            IF v_log_status NOT IN ('SUBMITTED', 'APPROVED') THEN
                RAISE EXCEPTION 'Daily log % must be SUBMITTED or APPROVED to link', v_log_id USING ERRCODE = 'D0011';
            END IF;

            -- Check daily log unique link constraint
            IF EXISTS (SELECT 1 FROM public.weekly_report_log_links WHERE daily_log_id = v_log_id) THEN
                RAISE EXCEPTION 'Daily log % is already linked to another weekly report', v_log_id USING ERRCODE = '23505';
            END IF;

            -- Insert link
            INSERT INTO public.weekly_report_log_links (weekly_report_id, daily_log_id)
            VALUES (p_report_id, v_log_id);
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- 9. STUDENT RPC: submit_weekly_report
CREATE OR REPLACE FUNCTION public.submit_weekly_report(
    p_report_id UUID
) RETURNS VOID AS $$
DECLARE
    v_status VARCHAR(50);
    v_internship_id UUID;
    v_tenant_id UUID;
    v_end_date DATE;
    v_link_count INT;
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: auth.uid() is null' USING ERRCODE = '42501';
    END IF;

    -- Lock target Weekly Report row
    SELECT wr.status, wr.internship_id, i.tenant_id, wr.end_date 
    INTO v_status, v_internship_id, v_tenant_id, v_end_date
    FROM public.weekly_reports wr
    JOIN public.internships i ON wr.internship_id = i.id
    WHERE wr.id = p_report_id AND i.student_id = auth.uid()
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Weekly report not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Enforce progressive submission constraint (cannot submit until week is complete)
    IF CURRENT_DATE < v_end_date THEN
        RAISE EXCEPTION 'Cannot submit report: reporting period has not ended yet' USING ERRCODE = 'D0012';
    END IF;

    IF v_status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Weekly report cannot be submitted in current state %', v_status USING ERRCODE = 'D0012';
    END IF;

    -- Enforce that at least 1 daily log is linked
    SELECT COUNT(*) INTO v_link_count FROM public.weekly_report_log_links WHERE weekly_report_id = p_report_id;
    IF v_link_count = 0 THEN
        RAISE EXCEPTION 'Cannot submit weekly report with zero linked daily logs' USING ERRCODE = 'D0012';
    END IF;

    -- Transition status
    UPDATE public.weekly_reports
    SET status = 'SUBMITTED'
    WHERE id = p_report_id;

    -- Autocommit audit log via private helper function
    PERFORM private.log_audit_event(v_tenant_id, 'WEEKLY_REPORT_SUBMITTED', 'weekly_reports', p_report_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- 10. STUDENT RPC: delete_weekly_report
CREATE OR REPLACE FUNCTION public.delete_weekly_report(
    p_report_id UUID
) RETURNS VOID AS $$
DECLARE
    v_status VARCHAR(50);
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: auth.uid() is null' USING ERRCODE = '42501';
    END IF;

    -- Retrieve and lock row
    SELECT wr.status INTO v_status
    FROM public.weekly_reports wr
    JOIN public.internships i ON wr.internship_id = i.id
    WHERE wr.id = p_report_id AND i.student_id = auth.uid()
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Weekly report not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    IF v_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Weekly report can only be deleted in DRAFT status' USING ERRCODE = 'D0012';
    END IF;

    -- Delete report (cascades links)
    DELETE FROM public.weekly_reports WHERE id = p_report_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- 11. FACULTY RPC: review_weekly_report
CREATE OR REPLACE FUNCTION public.review_weekly_report(
    p_report_id UUID,
    p_decision VARCHAR,
    p_remarks TEXT
) RETURNS UUID AS $$
DECLARE
    v_review_id UUID;
    v_status VARCHAR(50);
    v_internship_id UUID;
    v_student_id UUID;
    v_tenant_id UUID;
    v_trimmed_remarks TEXT;
    v_unapproved_count INT;
BEGIN
    -- Require authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated: auth.uid() is null' USING ERRCODE = '42501';
    END IF;

    -- Lock parent Weekly Report row
    SELECT wr.status, wr.internship_id, i.student_id, i.tenant_id 
    INTO v_status, v_internship_id, v_student_id, v_tenant_id
    FROM public.weekly_reports wr
    JOIN public.internships i ON wr.internship_id = i.id
    WHERE wr.id = p_report_id
    FOR UPDATE OF wr;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Weekly report not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Verify Faculty batch assignment
    IF NOT EXISTS (
        SELECT 1 
        FROM public.student_profiles sp
        JOIN public.tenant_memberships tm ON sp.tenant_membership_id = tm.id
        JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE tm.user_id = v_student_id 
          AND fba.faculty_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied: You are not the assigned faculty for this batch' USING ERRCODE = '42501';
    END IF;

    -- Verify report status is currently SUBMITTED
    IF v_status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Weekly report is not in SUBMITTED status' USING ERRCODE = 'D0012';
    END IF;

    -- Validate decision input
    IF p_decision NOT IN ('APPROVED', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Invalid review decision: must be APPROVED or CORRECTION_REQUESTED' USING ERRCODE = 'D0010';
    END IF;

    -- Validate remarks/feedback constraints
    v_trimmed_remarks := COALESCE(trim(p_remarks), '');
    IF p_decision = 'CORRECTION_REQUESTED' AND v_trimmed_remarks = '' THEN
        RAISE EXCEPTION 'Remarks are required for correction requests' USING ERRCODE = 'D0010';
    END IF;

    IF length(v_trimmed_remarks) > 1000 THEN
        RAISE EXCEPTION 'Remarks cannot exceed 1000 characters' USING ERRCODE = 'D0010';
    END IF;

    -- If decision is APPROVED, verify that EVERY linked daily log status is APPROVED (locks out SUBMITTED/DRAFT/CORRECTION_REQUESTED logs)
    IF p_decision = 'APPROVED' THEN
        SELECT COUNT(*) INTO v_unapproved_count
        FROM public.weekly_report_log_links l
        JOIN public.daily_logs dl ON l.daily_log_id = dl.id
        WHERE l.weekly_report_id = p_report_id AND dl.status <> 'APPROVED';

        IF v_unapproved_count > 0 THEN
            RAISE EXCEPTION 'Cannot approve weekly report: some linked daily logs are not approved by mentor' USING ERRCODE = 'D0013';
        END IF;
    END IF;

    -- Insert append-only faculty review record
    INSERT INTO public.faculty_reviews (weekly_report_id, reviewed_by, status, remarks)
    VALUES (p_report_id, auth.uid(), p_decision, v_trimmed_remarks)
    RETURNING id INTO v_review_id;

    -- Transition Weekly Report status
    UPDATE public.weekly_reports
    SET status = p_decision
    WHERE id = p_report_id;

    -- Log audit event via private helper
    PERFORM private.log_audit_event(
        v_tenant_id, 
        CASE WHEN p_decision = 'APPROVED' THEN 'WEEKLY_REPORT_APPROVED' ELSE 'WEEKLY_REPORT_CORRECTION_REQUESTED' END, 
        'weekly_reports', 
        p_report_id
    );

    RETURN v_review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- 12. RPC Execution Privileges hardening
-- Student RPCs
REVOKE ALL ON FUNCTION public.create_weekly_report_with_logs(UUID, DATE, DATE, TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_weekly_report_with_logs(UUID, DATE, DATE, TEXT, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_weekly_report_with_logs(UUID, DATE, DATE, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_weekly_report_with_logs(UUID, DATE, DATE, TEXT, UUID[]) TO internship_rls_test_user;

REVOKE ALL ON FUNCTION public.update_weekly_report_with_logs(UUID, TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_weekly_report_with_logs(UUID, TEXT, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_weekly_report_with_logs(UUID, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_weekly_report_with_logs(UUID, TEXT, UUID[]) TO internship_rls_test_user;

REVOKE ALL ON FUNCTION public.delete_weekly_report(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_weekly_report(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_weekly_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_weekly_report(UUID) TO internship_rls_test_user;

REVOKE ALL ON FUNCTION public.submit_weekly_report(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_weekly_report(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_weekly_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_weekly_report(UUID) TO internship_rls_test_user;

-- Faculty RPC
REVOKE ALL ON FUNCTION public.review_weekly_report(UUID, VARCHAR, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_weekly_report(UUID, VARCHAR, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_weekly_report(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_weekly_report(UUID, VARCHAR, TEXT) TO internship_rls_test_user;

-- Table Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_reports TO internship_rls_test_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_report_log_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_report_log_links TO internship_rls_test_user;

GRANT SELECT ON TABLE public.faculty_reviews TO authenticated;
GRANT SELECT ON TABLE public.faculty_reviews TO internship_rls_test_user;

