-- Phase 1E Test Fixtures: Non-Superuser RLS Test Role
-- Purpose: Create a restricted application-level database role for RLS verification.
--          This role is subject to PostgreSQL RLS enforcement (no BYPASSRLS, not superuser).
--          Used exclusively for local RLS integration tests — NOT the runtime connection role.
--
-- Connection role vs test role:
--   Migration/admin operations: postgres (superuser)
--   Runtime API (Phase 1E): postgres superuser with explicit auth-mirror WHERE clauses (temporary)
--   Local RLS integration tests: internship_rls_test_user (this role — RLS enforced)
--   Production: Supabase anon/authenticated roles via PostgREST

-- ── 1. Create the application test user role ──────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'internship_rls_test_user') THEN
        CREATE ROLE internship_rls_test_user LOGIN PASSWORD 'rls_test_only_2026';
    END IF;
END
$$;

-- Ensure BYPASSRLS is NOT granted (default for non-superusers — confirmed here explicitly)
ALTER ROLE internship_rls_test_user NOBYPASSRLS;
ALTER ROLE internship_rls_test_user NOSUPERUSER;
ALTER ROLE internship_rls_test_user NOCREATEROLE;
ALTER ROLE internship_rls_test_user NOCREATEDB;

-- ── 2. Schema access ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO internship_rls_test_user;
GRANT USAGE ON SCHEMA auth TO internship_rls_test_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO internship_rls_test_user;

-- ── 3. Table-level privileges (SELECT only for read tests; INSERT for fixture setup) ─────
-- For RLS read tests, SELECT is sufficient
GRANT SELECT ON TABLE
    public.tenants,
    public.users,
    public.tenant_memberships,
    public.membership_roles,
    public.departments,
    public.programs,
    public.batches,
    public.faculty_batch_assignments,
    public.student_profiles,
    public.companies,
    public.internships,
    public.internship_mentor_assignments,
    public.daily_logs,
    public.daily_log_tasks,
    public.log_reviews,
    public.weekly_reports,
    public.weekly_report_log_links,
    public.faculty_reviews,
    public.review_checkpoints,
    public.documents,
    public.evaluation_templates,
    public.evaluation_questions,
    public.evaluations,
    public.evaluation_responses,
    public.announcements,
    public.notifications,
    public.migration_id_map
TO internship_rls_test_user;

-- ── 4. View access ────────────────────────────────────────────────────────────
-- The internship_hours_summary view is not RLS-protected directly,
-- but it joins internships which IS RLS-protected.
GRANT SELECT ON public.internship_hours_summary TO internship_rls_test_user;

-- Confirmation comments (no data changes in this migration):
-- internship_rls_test_user: NOBYPASSRLS + NOSUPERUSER = RLS ENFORCED
-- Production runtime never uses this role.
-- Remove this role before production cutover if no longer needed.
