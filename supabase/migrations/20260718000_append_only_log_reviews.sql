-- Migration: 006 Append-Only Log Reviews and Privileged Review RPC
-- Purpose: Drop log_reviews daily_log_id unique constraint, drop direct insert RLS policy,
--          and implement the SECURITY DEFINER review_daily_log RPC function with full validations.

-- 1. Drop the uniqueness constraint on daily_log_id to support append-only history
ALTER TABLE public.log_reviews DROP CONSTRAINT IF EXISTS log_reviews_daily_log_id_key;

-- 2. Drop direct INSERT policy on log_reviews to prevent direct user insertions outside the RPC
DROP POLICY IF EXISTS log_reviews_insert_policy ON public.log_reviews;

-- 3. Create the SECURITY DEFINER RPC function with row locking and input validation
CREATE OR REPLACE FUNCTION public.review_daily_log(
    p_internship_id UUID,
    p_log_id UUID,
    p_decision VARCHAR(50),
    p_feedback TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog, pg_temp
AS $$
DECLARE
    v_status VARCHAR(50);
    v_student_id UUID;
    v_tenant_id UUID;
    v_review_id UUID;
    v_feedback TEXT;
BEGIN
    -- A. Reject if auth.uid() is null
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is unauthenticated' USING ERRCODE = '42501';
    END IF;

    -- B. Validate p_decision values
    IF p_decision NOT IN ('APPROVED', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Invalid review decision: must be APPROVED or CORRECTION_REQUESTED' USING ERRCODE = 'D0010';
    END IF;

    -- C. Validate feedback feedback length and presence
    v_feedback := trim(p_feedback);

    IF p_decision = 'CORRECTION_REQUESTED' AND (v_feedback IS NULL OR v_feedback = '') THEN
        RAISE EXCEPTION 'Feedback comment is required for correction requests' USING ERRCODE = 'D0011';
    END IF;

    IF v_feedback IS NOT NULL AND length(v_feedback) > 1000 THEN
        RAISE EXCEPTION 'Feedback comment cannot exceed 1000 characters' USING ERRCODE = 'D0012';
    END IF;

    -- Clear empty string feedback to NULL for APPROVED decision
    IF v_feedback = '' THEN
        v_feedback := NULL;
    END IF;

    -- D. Acquire row lock on daily_logs BEFORE processing state and authorization checks
    SELECT dl.status, i.student_id, i.tenant_id 
    INTO v_status, v_student_id, v_tenant_id
    FROM public.daily_logs dl
    JOIN public.internships i ON dl.internship_id = i.id
    WHERE dl.id = p_log_id AND dl.internship_id = p_internship_id
    FOR UPDATE OF dl;

    -- E. Raise P0002 (not found) if log doesn't exist or is mismatched with parent internship
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Daily log not found in parent internship' USING ERRCODE = 'P0002';
    END IF;

    -- F. Verify caller is currently assigned Company Mentor
    IF NOT EXISTS (
        SELECT 1 FROM public.internship_mentor_assignments
        WHERE internship_id = p_internship_id
          AND mentor_user_id = auth.uid()
          AND mentor_type = 'COMPANY'
    ) THEN
        RAISE EXCEPTION 'Access denied: You are not the assigned mentor for this internship' USING ERRCODE = '42501';
    END IF;

    -- G. Verify current log status is SUBMITTED
    IF v_status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Daily log must be in SUBMITTED state to be reviewed' USING ERRCODE = 'D0002';
    END IF;

    -- H. Insert log review record (storing auth.uid() directly in reviewed_by)
    INSERT INTO public.log_reviews (daily_log_id, reviewed_by, status, feedback)
    VALUES (p_log_id, auth.uid(), p_decision, v_feedback)
    RETURNING id INTO v_review_id;

    -- I. Update status on daily_logs
    UPDATE public.daily_logs SET status = p_decision WHERE id = p_log_id;

    -- J. Insert structured audit log record (runs under definer superuser bypass context)
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, after_state)
    VALUES (
        v_tenant_id,
        auth.uid(),
        CASE WHEN p_decision = 'APPROVED' THEN 'LOG_APPROVED' ELSE 'LOG_CORRECTION_REQUESTED' END,
        'daily_logs',
        p_log_id,
        jsonb_build_object('status', p_decision, 'review_id', v_review_id)
    );

    RETURN v_review_id;
END;
$$;

-- 4. Review default privileges
-- Revoke all default execution permissions from PUBLIC and anon roles
REVOKE EXECUTE ON FUNCTION public.review_daily_log(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_daily_log(UUID, UUID, VARCHAR, TEXT) FROM anon;

-- Explicitly grant execution only to authenticated and local test roles
GRANT EXECUTE ON FUNCTION public.review_daily_log(UUID, UUID, VARCHAR, TEXT) TO authenticated, internship_rls_test_user;
