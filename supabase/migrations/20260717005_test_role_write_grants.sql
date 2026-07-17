-- Migration: 005 RLS Test Role Write Grants
-- Purpose: Grant INSERT, UPDATE, and DELETE permissions on daily_logs and daily_log_tasks
--          to the internship_rls_test_user role so it can be used for RLS write testing.

GRANT INSERT, UPDATE, DELETE ON TABLE public.daily_logs TO internship_rls_test_user;
GRANT INSERT, UPDATE, DELETE ON TABLE public.daily_log_tasks TO internship_rls_test_user;
