-- Migration: Enforce daily logs status transition and state locking via trigger
-- Purpose: Prevent direct status manipulation by authenticated users via PostgREST
--          while allowing SECURITY DEFINER functions to perform transitions.

CREATE OR REPLACE FUNCTION public.check_daily_log_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
-- Runs as SECURITY INVOKER so CURRENT_USER matches the context of the UPDATE statement executor
AS $$
BEGIN
    -- If the update is executed by the 'authenticated' role directly (PostgREST or SECURITY INVOKER RPC),
    -- block status updates.
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

DROP TRIGGER IF EXISTS enforce_daily_log_status_trigger ON public.daily_logs;
CREATE TRIGGER enforce_daily_log_status_trigger
BEFORE UPDATE ON public.daily_logs
FOR EACH ROW
EXECUTE FUNCTION public.check_daily_log_status_transition();
