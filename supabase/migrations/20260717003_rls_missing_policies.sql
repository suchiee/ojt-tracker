-- Phase 1E: Add missing RLS policies for faculty_batch_assignments and internship_mentor_assignments
-- These tables had RLS enabled (Migration 012) but no policies were defined, causing implicit deny-all
-- for non-superuser roles. This migration adds the minimum correct policies.

-- ── Faculty Batch Assignments ─────────────────────────────────────────────────
-- Faculty can see their own batch assignments.
-- Tenant admins can see assignments within their tenant's batches.
-- Students can see faculty assignments for their own batch (needed for profile display).
CREATE POLICY faculty_batch_assignments_select_policy ON faculty_batch_assignments FOR SELECT
USING (
    faculty_user_id = auth.uid() OR
    batch_id IN (
        -- Batches in tenants where the current user is a member
        SELECT b.id FROM batches b
        JOIN programs pr ON b.program_id = pr.id
        JOIN departments d ON pr.department_id = d.id
        WHERE d.tenant_id IN (SELECT public.get_user_tenant_ids())
    )
);

-- ── Internship Mentor Assignments ─────────────────────────────────────────────
-- Mentors can see their own assignments.
-- Students and Admins get IMA row access transitively via the internships RLS policy
-- which already allows them to see the internship row. We do NOT add an internships
-- subquery here because that would create a circular reference:
-- internships policy → IMA policy → internships policy (infinite recursion)
CREATE POLICY internship_mentor_assignments_select_policy ON internship_mentor_assignments FOR SELECT
USING (
    mentor_user_id = auth.uid()
    -- Note: Wider access (students seeing their mentor, admins seeing all)
    -- is handled by the internships policy which selects from IMA but IMA itself
    -- only needs to grant direct mentor visibility here.
    -- In production Supabase, PostgREST's session isolation prevents this
    -- recursion, but for direct pg connections we must break the cycle.
);
