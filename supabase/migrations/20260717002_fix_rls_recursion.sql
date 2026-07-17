-- Phase 1E: Fix RLS infinite recursion in tenant_memberships policy
-- Problem: The memberships_select_policy on tenant_memberships uses a subquery
--          that references the same table (tenant_memberships), causing infinite
--          recursion when a non-superuser role with RLS enforced queries it.
--
--          Original policy:
--          USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()))
--
--          This is also a bug that would manifest in real Supabase if the policy is
--          evaluated in a context where RLS is active on tenant_memberships.
--          Real Supabase PostgREST avoids this via row-level caching and session user context,
--          but is still subject to this issue in direct pg connections.
--
-- Fix: Replace with SECURITY DEFINER helper function get_user_tenant_ids()
--      which executes as the function owner (postgres), bypassing RLS on tenant_memberships.
--      This breaks the recursion while preserving the same authorization semantics.
--
-- Note: This also updates the roles_select_policy for consistency.

-- ── Tenant Memberships ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS memberships_select_policy ON tenant_memberships;
CREATE POLICY memberships_select_policy ON tenant_memberships FOR SELECT
USING (
    tenant_id IN (SELECT public.get_user_tenant_ids())
);

-- ── Membership Roles ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS roles_select_policy ON membership_roles;
CREATE POLICY roles_select_policy ON membership_roles FOR SELECT
USING (
    membership_id IN (
        SELECT id FROM tenant_memberships
        WHERE tenant_id IN (SELECT public.get_user_tenant_ids())
    )
);
