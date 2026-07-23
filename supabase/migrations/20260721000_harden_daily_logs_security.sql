-- Migration: Harden daily logs RLS and transition submit_daily_log to SECURITY DEFINER
-- Purpose: Prevent direct status manipulation (self-approval, self-submission) via PostgREST
--          while preserving the student E2E submission RPC workflow.

-- ── 1. Drop existing RLS policies on daily_logs ────────────────────────────────
DROP POLICY IF EXISTS daily_logs_insert_policy ON public.daily_logs;
DROP POLICY IF EXISTS daily_logs_update_policy ON public.daily_logs;

-- ── 2. Create hardened RLS policies ──────────────────────────────────────────
-- Students can only insert daily logs in DRAFT status
CREATE POLICY daily_logs_insert_policy ON public.daily_logs FOR INSERT
WITH CHECK (
    internship_id IN (
        SELECT id FROM public.internships 
        WHERE student_id = auth.uid() AND status = 'ACTIVE'
    )
    AND status = 'DRAFT'
);

-- Students can only update daily logs that are in DRAFT or CORRECTION_REQUESTED status,
-- and the updated row status must remain DRAFT or CORRECTION_REQUESTED (no direct status bypass)
CREATE POLICY daily_logs_update_policy ON public.daily_logs FOR UPDATE
USING (
    internship_id IN (
        SELECT id FROM public.internships 
        WHERE student_id = auth.uid() AND status = 'ACTIVE'
    )
    AND status IN ('DRAFT', 'CORRECTION_REQUESTED')
)
WITH CHECK (
    internship_id IN (
        SELECT id FROM public.internships 
        WHERE student_id = auth.uid() AND status = 'ACTIVE'
    )
    AND status IN ('DRAFT', 'CORRECTION_REQUESTED')
);

-- ── 3. Redesign submit_daily_log as a SECURITY DEFINER boundary ───────────────
CREATE OR REPLACE FUNCTION public.submit_daily_log(
    p_internship_id UUID,
    p_log_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_status VARCHAR(50);
    v_student_id UUID;
    v_calling_user UUID;
BEGIN
    -- Get calling user id
    v_calling_user := auth.uid();
    IF v_calling_user IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    -- Retrieve internship student and status, locking the row for update
    SELECT i.student_id, dl.status INTO v_student_id, v_status
    FROM public.daily_logs dl
    JOIN public.internships i ON dl.internship_id = i.id
    WHERE dl.id = p_log_id 
      AND dl.internship_id = p_internship_id
      AND i.status = 'ACTIVE'
    FOR UPDATE;

    -- Validate ownership
    IF v_student_id IS NULL OR v_student_id <> v_calling_user THEN
        RAISE EXCEPTION 'Daily log not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Validate workflow state
    IF v_status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Daily log cannot be submitted in current state' USING ERRCODE = 'D0002';
    END IF;

    -- Transition status
    UPDATE public.daily_logs SET status = 'SUBMITTED' WHERE id = p_log_id;
END;
$$;

-- ── 4. Revoke and grant EXECUTE privileges ────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.submit_daily_log(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_daily_log(UUID, UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.submit_daily_log(UUID, UUID) TO authenticated;
