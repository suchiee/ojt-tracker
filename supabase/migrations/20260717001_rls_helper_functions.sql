-- Phase 1E: Anti-recursion helper functions for local RLS testing
-- Purpose: Break the tenant_memberships self-reference in RLS policies by providing
--          SECURITY DEFINER functions that execute as the function owner (postgres superuser).
--          This mirrors how Supabase PostgREST handles JWT-based role resolution internally.
--
-- IMPORTANT: These functions are only needed for local RLS testing with the internship_rls_test_user.
--            In production Supabase, PostgREST handles JWT claims at the connection level,
--            preventing the recursive policy evaluation that occurs in direct pg connections.

-- ── 1. Helper: Get tenant IDs for the current user ───────────────────────────
-- Runs as SECURITY DEFINER (as postgres superuser) — bypasses RLS on tenant_memberships
-- when called from within an RLS policy, breaking the recursion.
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid();
$$;

-- ── 2. Helper: Check if current user is tenant admin ────────────────────────
CREATE OR REPLACE FUNCTION public.is_tenant_admin(check_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    JOIN public.membership_roles mr ON tm.id = mr.membership_id
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = check_tenant_id
      AND mr.role = 'ADMIN'
  );
$$;

-- Grant execute to the RLS test role
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO internship_rls_test_user;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(UUID) TO internship_rls_test_user;

-- Grant execute to postgres and authenticated (for completeness)
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(UUID) TO postgres;
