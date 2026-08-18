-- Migration: 007 Faculty Mentor Dual-Assignment Authorization and Academic Structure Alignment
-- Purpose: Unify Faculty authorization across RLS and RPCs (batch assignment OR direct internship assignment),
--          auto-assign faculty to batch on invite consumption, and non-destructively align program/batch names to M.Sc. Computer Science.

-- 1. Non-destructive Academic Structure Alignment
UPDATE public.programs 
SET name = 'M.Sc. Computer Science' 
WHERE name = 'BSc Computer Science';

UPDATE public.batches 
SET name = 'M.Sc. CS Batch 2026' 
WHERE name = 'BSc CS Batch 2026';

-- 2. Update weekly_reports RLS Select Policy with Unified Dual-Assignment Rule
DROP POLICY IF EXISTS weekly_reports_select_policy ON public.weekly_reports;

CREATE POLICY weekly_reports_select_policy ON public.weekly_reports FOR SELECT
USING (
    -- 1. Student owns the report
    internship_id IN (SELECT id FROM public.internships WHERE student_id = auth.uid())
    OR
    -- 2. Faculty Mentor of the same tenant assigned via Batch OR directly to Internship
    internship_id IN (
        SELECT i.id 
        FROM public.internships i
        JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
        JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
        LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
        LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
        LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
        LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
        WHERE tm_fac.user_id = auth.uid()
          AND mr_fac.role = 'FACULTY_MENTOR'
          AND (fba.id IS NOT NULL OR ima.id IS NOT NULL)
    )
    OR
    -- 3. Tenant Admin of the same tenant
    internship_id IN (
        SELECT i.id 
        FROM public.internships i
        JOIN public.tenant_memberships tm ON i.tenant_id = tm.tenant_id
        JOIN public.membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

-- 3. Update review_weekly_report RPC with Unified Dual-Assignment Authorization
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
    v_is_authorized BOOLEAN := false;
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

    -- Verify Faculty Authorization:
    -- Caller must be FACULTY_MENTOR in the same tenant AND (assigned to student's batch OR directly assigned to internship)
    SELECT EXISTS (
        SELECT 1 
        FROM public.tenant_memberships tm_fac
        JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
        LEFT JOIN public.tenant_memberships tm_stu ON tm_stu.user_id = v_student_id AND tm_stu.tenant_id = v_tenant_id
        LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
        LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
        LEFT JOIN public.internship_mentor_assignments ima ON ima.internship_id = v_internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
        WHERE tm_fac.user_id = auth.uid() 
          AND tm_fac.tenant_id = v_tenant_id
          AND mr_fac.role = 'FACULTY_MENTOR'
          AND (fba.id IS NOT NULL OR ima.id IS NOT NULL)
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: You are not an assigned faculty mentor for this batch or internship' USING ERRCODE = '42501';
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

-- 4. Update consume_invitation RPC to auto-assign Faculty Mentor to Batch on Invite
CREATE OR REPLACE FUNCTION public.consume_invitation(
    p_code_hash TEXT,
    p_student_id_number TEXT -- NULL if Faculty/Admin/Company Mentor invite
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email VARCHAR(255);
    v_invite public.invitation_codes%ROWTYPE;
    v_membership_id UUID;
    v_role VARCHAR(50);
BEGIN
    -- Get active authenticated user context
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User authentication is required';
    END IF;

    -- Fetch user details
    SELECT email INTO v_user_email FROM public.users WHERE id = v_user_id;

    -- Fetch invitation record and lock it to prevent concurrent usage conflicts
    SELECT * INTO v_invite 
    FROM public.invitation_codes 
    WHERE code_hash = p_code_hash AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;

    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    -- Check usage limit
    IF v_invite.uses_count >= v_invite.max_uses THEN
        RAISE EXCEPTION 'Invitation code has already been consumed';
    END IF;

    -- Check intended email restriction (case-insensitive email matching)
    IF v_invite.intended_email IS NOT NULL AND LOWER(v_invite.intended_email) <> LOWER(v_user_email) THEN
        RAISE EXCEPTION 'This invitation is registered to another email address';
    END IF;

    -- Determine role based on invitation type
    IF v_invite.invitation_type = 'STUDENT_ONBOARDING' THEN
        v_role := 'STUDENT';
    ELSIF v_invite.invitation_type = 'FACULTY_INVITE' THEN
        v_role := 'FACULTY_MENTOR';
    ELSIF v_invite.invitation_type = 'ADMIN_INVITE' THEN
        v_role := 'ADMIN';
    ELSIF v_invite.invitation_type = 'COMPANY_MENTOR_INVITE' THEN
        v_role := 'COMPANY_MENTOR';
    ELSE
        RAISE EXCEPTION 'Unsupported invitation type';
    END IF;

    -- Verify student profiles have student ID number provided
    IF v_role = 'STUDENT' AND (p_student_id_number IS NULL OR p_student_id_number = '') THEN
        RAISE EXCEPTION 'Student ID number is required for student onboarding';
    END IF;

    -- Create tenant membership
    INSERT INTO public.tenant_memberships (tenant_id, user_id)
    VALUES (v_invite.tenant_id, v_user_id)
    ON CONFLICT (tenant_id, user_id) 
    DO UPDATE SET created_at = now()
    RETURNING id INTO v_membership_id;

    -- Create membership role link
    INSERT INTO public.membership_roles (membership_id, role)
    VALUES (v_membership_id, v_role)
    ON CONFLICT (membership_id, role) DO NOTHING;

    -- Create student profile if role is STUDENT
    IF v_role = 'STUDENT' THEN
        INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id)
        VALUES (v_membership_id, p_student_id_number, v_invite.batch_id)
        ON CONFLICT (tenant_membership_id) 
        DO UPDATE SET student_id_number = p_student_id_number, batch_id = v_invite.batch_id;
    END IF;

    -- If invitation is for a Faculty Mentor and includes batch_id, assign to batch
    IF v_role = 'FACULTY_MENTOR' AND v_invite.batch_id IS NOT NULL THEN
        INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id)
        VALUES (v_user_id, v_invite.batch_id)
        ON CONFLICT (faculty_user_id, batch_id) DO NOTHING;

        -- Record batch assignment audit log
        INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, after_state)
        VALUES (
            v_invite.tenant_id,
            v_user_id,
            'FACULTY_BATCH_ASSIGNED',
            'faculty_batch_assignments',
            v_invite.batch_id,
            json_build_object('faculty_user_id', v_user_id, 'batch_id', v_invite.batch_id)::jsonb
        );
    END IF;

    -- If invitation is for a Company Mentor and bound to a specific internship, create assignment
    IF v_role = 'COMPANY_MENTOR' AND v_invite.internship_id IS NOT NULL THEN
        INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary)
        VALUES (v_invite.internship_id, v_user_id, 'COMPANY', true)
        ON CONFLICT (internship_id, mentor_user_id) DO UPDATE SET is_primary = true;

        -- Record assignment audit log
        INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, after_state)
        VALUES (
            v_invite.tenant_id,
            v_user_id,
            'COMPANY_MENTOR_ASSIGNED',
            'internship_mentor_assignments',
            v_invite.internship_id,
            json_build_object('internship_id', v_invite.internship_id, 'mentor_user_id', v_user_id, 'mentor_type', 'COMPANY')::jsonb
        );
    END IF;

    -- Increment usage count
    UPDATE public.invitation_codes 
    SET uses_count = uses_count + 1 
    WHERE id = v_invite.id;

    -- Append audit event record
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
    VALUES (
        v_invite.tenant_id,
        v_user_id,
        'MEMBERSHIP_GRANTED',
        'tenant_memberships',
        v_membership_id
    );

    RETURN v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
