-- Migration: 004 Daily Logs Integrity and Database Transaction RPCs
-- Purpose: Setup unique constraint on daily_logs, delete RLS policy with DRAFT check, 
--          and SECURITY INVOKER transaction functions with strict input validation.

-- 1. Date Uniqueness Constraint (Idempotent)
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_internship_id_date_key;
ALTER TABLE public.daily_logs
ADD CONSTRAINT daily_logs_internship_id_date_key UNIQUE (internship_id, date);

-- 2. Daily Logs Delete Policy (Enforce owner and DRAFT-only status at DB level)
DROP POLICY IF EXISTS daily_logs_delete_policy ON public.daily_logs;
CREATE POLICY daily_logs_delete_policy ON public.daily_logs FOR DELETE
USING (
    internship_id IN (
        SELECT id FROM public.internships 
        WHERE student_id = auth.uid() AND status <> 'COMPLETED'
    )
    AND status = 'DRAFT'
);

-- 3. SECURITY INVOKER RPC: Create Log
CREATE OR REPLACE FUNCTION public.create_daily_log_with_tasks(
    p_internship_id UUID,
    p_date DATE,
    p_notes TEXT,
    p_tasks JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_log_id UUID;
    v_task RECORD;
    v_total_hours NUMERIC(4,2) := 0;
BEGIN
    -- Check internship existence and student ownership first (404 if invalid)
    IF NOT EXISTS (
        SELECT 1 FROM public.internships 
        WHERE id = p_internship_id AND student_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Internship not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Check internship status permits logging (must be ACTIVE) (422 if not active)
    IF NOT EXISTS (
        SELECT 1 FROM public.internships 
        WHERE id = p_internship_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Internship must be ACTIVE to log work' USING ERRCODE = 'D0003';
    END IF;

    -- Validate tasks is a JSON array
    IF jsonb_typeof(p_tasks) <> 'array' THEN
        RAISE EXCEPTION 'Tasks must be a JSON array' USING ERRCODE = '22023';
    END IF;

    -- At least one task must exist
    IF jsonb_array_length(p_tasks) = 0 THEN
        RAISE EXCEPTION 'At least one task must be provided' USING ERRCODE = 'D0004';
    END IF;

    -- Task count limit (max 20)
    IF jsonb_array_length(p_tasks) > 20 THEN
        RAISE EXCEPTION 'Task count cannot exceed 20' USING ERRCODE = 'D0005';
    END IF;

    -- Loop to calculate running sum and validate each task
    FOR v_task IN SELECT * FROM jsonb_to_recordset(p_tasks) AS x(description TEXT, hours NUMERIC(4,2)) LOOP
        IF v_task.description IS NULL OR trim(v_task.description) = '' THEN
            RAISE EXCEPTION 'Task description cannot be empty' USING ERRCODE = 'D0006';
        END IF;

        IF length(v_task.description) > 500 THEN
            RAISE EXCEPTION 'Task description too long' USING ERRCODE = 'D0007';
        END IF;

        IF v_task.hours IS NULL OR v_task.hours <= 0 THEN
            RAISE EXCEPTION 'Task hours must be greater than zero' USING ERRCODE = '2201F';
        END IF;

        IF v_task.hours > 24.00 THEN
            RAISE EXCEPTION 'Individual task hours cannot exceed 24' USING ERRCODE = 'D0008';
        END IF;

        v_total_hours := v_total_hours + v_task.hours;
    END LOOP;

    -- Total daily hours limit
    IF v_total_hours > 24.00 THEN
        RAISE EXCEPTION 'Total task hours cannot exceed 24 per log' USING ERRCODE = 'D0009';
    END IF;

    -- Insert parent daily log
    INSERT INTO public.daily_logs (internship_id, date, notes, status)
    VALUES (p_internship_id, p_date, p_notes, 'DRAFT')
    RETURNING id INTO v_log_id;

    -- Insert child tasks
    FOR v_task IN SELECT * FROM jsonb_to_recordset(p_tasks) AS x(description TEXT, hours NUMERIC(4,2)) LOOP
        INSERT INTO public.daily_log_tasks (daily_log_id, description, hours)
        VALUES (v_log_id, trim(v_task.description), v_task.hours);
    END LOOP;

    RETURN v_log_id;
END;
$$;

-- 4. SECURITY INVOKER RPC: Update Log (Replace-all Tasks pattern)
CREATE OR REPLACE FUNCTION public.update_daily_log_with_tasks(
    p_internship_id UUID,
    p_log_id UUID,
    p_notes TEXT,
    p_notes_supplied BOOLEAN,
    p_tasks JSONB,
    p_tasks_supplied BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_status VARCHAR(50);
    v_task RECORD;
    v_total_hours NUMERIC(4,2) := 0;
BEGIN
    -- Check that the daily log belongs to the specified internship AND is owned by the calling user
    IF NOT EXISTS (
        SELECT 1 FROM public.daily_logs dl
        JOIN public.internships i ON dl.internship_id = i.id
        WHERE dl.id = p_log_id 
          AND dl.internship_id = p_internship_id 
          AND i.student_id = auth.uid()
          AND i.status <> 'COMPLETED'
    ) THEN
        RAISE EXCEPTION 'Daily log not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Exclusive row lock on the daily log to serialize concurrent edits/submits
    SELECT status INTO v_status 
    FROM public.daily_logs 
    WHERE id = p_log_id 
    FOR UPDATE;

    IF v_status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Daily log is locked for editing' USING ERRCODE = 'D0001';
    END IF;

    -- Update notes if notes were explicitly supplied
    IF p_notes_supplied THEN
        UPDATE public.daily_logs 
        SET notes = p_notes
        WHERE id = p_log_id;
    END IF;

    -- Replace tasks if tasks were explicitly supplied
    IF p_tasks_supplied THEN
        -- Validate tasks parameter structure and bounds
        IF jsonb_typeof(p_tasks) <> 'array' THEN
            RAISE EXCEPTION 'Tasks must be a JSON array' USING ERRCODE = '22023';
        END IF;

        IF jsonb_array_length(p_tasks) = 0 THEN
            RAISE EXCEPTION 'At least one task must be provided' USING ERRCODE = 'D0004';
        END IF;

        IF jsonb_array_length(p_tasks) > 20 THEN
            RAISE EXCEPTION 'Task count cannot exceed 20' USING ERRCODE = 'D0005';
        END IF;

        -- Validate individual tasks and compute running sum
        FOR v_task IN SELECT * FROM jsonb_to_recordset(p_tasks) AS x(description TEXT, hours NUMERIC(4,2)) LOOP
            IF v_task.description IS NULL OR trim(v_task.description) = '' THEN
                RAISE EXCEPTION 'Task description cannot be empty' USING ERRCODE = 'D0006';
            END IF;

            IF length(v_task.description) > 500 THEN
                RAISE EXCEPTION 'Task description too long' USING ERRCODE = 'D0007';
            END IF;

            IF v_task.hours IS NULL OR v_task.hours <= 0 THEN
                RAISE EXCEPTION 'Task hours must be greater than zero' USING ERRCODE = '2201F';
            END IF;

            IF v_task.hours > 24.00 THEN
                RAISE EXCEPTION 'Individual task hours cannot exceed 24' USING ERRCODE = 'D0008';
            END IF;

            v_total_hours := v_total_hours + v_task.hours;
        END LOOP;

        IF v_total_hours > 24.00 THEN
            RAISE EXCEPTION 'Total task hours cannot exceed 24 per log' USING ERRCODE = 'D0009';
        END IF;

        -- Perform delete-and-replace
        DELETE FROM public.daily_log_tasks WHERE daily_log_id = p_log_id;

        FOR v_task IN SELECT * FROM jsonb_to_recordset(p_tasks) AS x(description TEXT, hours NUMERIC(4,2)) LOOP
            INSERT INTO public.daily_log_tasks (daily_log_id, description, hours)
            VALUES (p_log_id, trim(v_task.description), v_task.hours);
        END LOOP;
    END IF;
END;
$$;

-- 5. SECURITY INVOKER RPC: Submit Log
CREATE OR REPLACE FUNCTION public.submit_daily_log(
    p_internship_id UUID,
    p_log_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_status VARCHAR(50);
BEGIN
    -- Check that the daily log belongs to the specified internship AND is owned by the calling student
    IF NOT EXISTS (
        SELECT 1 FROM public.daily_logs dl
        JOIN public.internships i ON dl.internship_id = i.id
        WHERE dl.id = p_log_id 
          AND dl.internship_id = p_internship_id 
          AND i.student_id = auth.uid()
          AND i.status <> 'COMPLETED'
    ) THEN
        RAISE EXCEPTION 'Daily log not found or access denied' USING ERRCODE = 'P0002';
    END IF;

    -- Lock parent row for workflow transition
    SELECT status INTO v_status FROM public.daily_logs WHERE id = p_log_id FOR UPDATE;

    IF v_status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Daily log cannot be submitted in current state' USING ERRCODE = 'D0002';
    END IF;

    UPDATE public.daily_logs SET status = 'SUBMITTED' WHERE id = p_log_id;
END;
$$;

-- 6. Review default execution privileges (Revoke PUBLIC execute, grant select roles)
-- Revoke all default EXECUTE privileges from PUBLIC/anon roles
REVOKE EXECUTE ON FUNCTION public.create_daily_log_with_tasks(UUID, DATE, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_daily_log_with_tasks(UUID, UUID, TEXT, BOOLEAN, JSONB, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_daily_log(UUID, UUID) FROM PUBLIC;

-- Explicitly grant only to authenticated and local test roles
GRANT EXECUTE ON FUNCTION public.create_daily_log_with_tasks(UUID, DATE, TEXT, JSONB) TO authenticated, internship_rls_test_user;
GRANT EXECUTE ON FUNCTION public.update_daily_log_with_tasks(UUID, UUID, TEXT, BOOLEAN, JSONB, BOOLEAN) TO authenticated, internship_rls_test_user;
GRANT EXECUTE ON FUNCTION public.submit_daily_log(UUID, UUID) TO authenticated, internship_rls_test_user;
