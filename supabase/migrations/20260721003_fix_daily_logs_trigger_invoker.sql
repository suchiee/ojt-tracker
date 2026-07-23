-- Migration: Fix daily logs trigger behavior to run as SECURITY INVOKER
-- Purpose: Change check_daily_log_status_transition to run as SECURITY INVOKER
--          so it can correctly identify direct 'authenticated' PostgREST updates.

CREATE OR REPLACE FUNCTION public.check_daily_log_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If the update is executed by the 'authenticated' role directly, block status updates.
    IF CURRENT_USER = 'authenticated' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Direct status updates are not allowed' USING ERRCODE = '42501';
    END IF;
    
    -- Prevent editing notes/fields if the log is not in DRAFT or CORRECTION_REQUESTED status
    IF CURRENT_USER = 'authenticated' AND OLD.status NOT IN ('DRAFT', 'CORRECTION_REQUESTED') THEN
        RAISE EXCEPTION 'Daily log is locked for editing' USING ERRCODE = 'D0001';
    END IF;

    RETURN NEW;
END;
$$;
