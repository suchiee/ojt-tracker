-- Migration: 014 Invitations and Triggers
-- Purpose: Setup user profile synchronization, secure invitation codes, and atomic transaction RPC for student onboarding.

-- 1. Create invitation_codes table
CREATE TABLE public.invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash TEXT NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE, -- NULL for Faculty/Admin invites
    invitation_type VARCHAR(50) NOT NULL CHECK (invitation_type IN ('STUDENT_ONBOARDING', 'FACULTY_INVITE', 'ADMIN_INVITE')),
    intended_email VARCHAR(255),
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count <= max_uses),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on invitation_codes
ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- Select policy: Only Tenant Admins of that tenant can view invitation codes
CREATE POLICY invitation_codes_select_policy ON public.invitation_codes FOR SELECT
USING (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM public.tenant_memberships tm
        JOIN public.membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

-- 2. User profile sync trigger function (SECURITY DEFINER, safe search_path)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_first_name VARCHAR(100);
    v_last_name VARCHAR(100);
BEGIN
    -- Secure parsing of metadata
    v_first_name := NEW.raw_user_meta_data->>'first_name';
    v_last_name := NEW.raw_user_meta_data->>'last_name';

    -- Safe name fallbacks (leave as NULL if missing, ask user to complete profile in UI)
    INSERT INTO public.users (id, first_name, last_name, email)
    VALUES (
        NEW.id,
        COALESCE(v_first_name, 'New'),
        COALESCE(v_last_name, 'User'),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Setup the auth user created trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3. Atomic Transaction RPC: consume_invitation (SECURITY DEFINER, safe search_path)
CREATE OR REPLACE FUNCTION public.consume_invitation(
    p_code_hash TEXT,
    p_student_id_number TEXT -- NULL if Faculty/Admin invite
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_user_email VARCHAR(255);
    v_invite public.invitation_codes%ROWTYPE;
    v_membership_id UUID;
    v_role VARCHAR(50);
BEGIN
    -- Get active authenticated user context
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User authentication is required';
    END IF;

    -- Fetch user details
    SELECT email INTO v_user_email FROM public.users WHERE id = v_user_id;

    -- Fetch invitation record and lock it to prevent concurrent usage conflicts
    SELECT * INTO v_invite 
    FROM public.invitation_codes 
    WHERE code_hash = p_code_hash AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;

    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    -- Check usage limit
    IF v_invite.uses_count >= v_invite.max_uses THEN
        RAISE EXCEPTION 'Invitation code has already been consumed';
    END IF;

    -- Check intended email restriction
    IF v_invite.intended_email IS NOT NULL AND v_invite.intended_email <> v_user_email THEN
        RAISE EXCEPTION 'This invitation is registered to another email address';
    END IF;

    -- Determine role based on invitation type
    IF v_invite.invitation_type = 'STUDENT_ONBOARDING' THEN
        v_role := 'STUDENT';
    ELSIF v_invite.invitation_type = 'FACULTY_INVITE' THEN
        v_role := 'FACULTY_MENTOR';
    ELSIF v_invite.invitation_type = 'ADMIN_INVITE' THEN
        v_role := 'ADMIN';
    ELSE
        RAISE EXCEPTION 'Unsupported invitation type';
    END IF;

    -- Verify student profiles have student ID number provided
    IF v_role = 'STUDENT' AND (p_student_id_number IS NULL OR p_student_id_number = '') THEN
        RAISE EXCEPTION 'Student ID number is required for student onboarding';
    END IF;

    -- Create tenant membership
    INSERT INTO public.tenant_memberships (tenant_id, user_id)
    VALUES (v_invite.tenant_id, v_user_id)
    ON CONFLICT (tenant_id, user_id) 
    DO UPDATE SET created_at = now() -- handle overlapping memberships
    RETURNING id INTO v_membership_id;

    -- Create membership role link
    INSERT INTO public.membership_roles (membership_id, role)
    VALUES (v_membership_id, v_role)
    ON CONFLICT (membership_id, role) DO NOTHING;

    -- Create student profile if role is STUDENT
    IF v_role = 'STUDENT' THEN
        INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id)
        VALUES (v_membership_id, p_student_id_number, v_invite.batch_id)
        ON CONFLICT (tenant_membership_id) 
        DO UPDATE SET student_id_number = p_student_id_number, batch_id = v_invite.batch_id;
    END IF;

    -- Increment usage count
    UPDATE public.invitation_codes 
    SET uses_count = uses_count + 1 
    WHERE id = v_invite.id;

    -- Append audit event record
    INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
    VALUES (
        v_invite.tenant_id,
        v_user_id,
        'MEMBERSHIP_GRANTED',
        'tenant_memberships',
        v_membership_id
    );

    RETURN v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Restrict execute privilege to authenticated users only
REVOKE EXECUTE ON FUNCTION public.consume_invitation(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_invitation(TEXT, TEXT) TO authenticated;
