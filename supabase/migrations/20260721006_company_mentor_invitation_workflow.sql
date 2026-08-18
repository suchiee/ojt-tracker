-- Migration: 20260721006_company_mentor_invitation_workflow.sql
-- Purpose: Add mentor contact columns to internships, extend invitation_codes for COMPANY_MENTOR_INVITE and internship linkage, and update consume_invitation RPC.

-- 1. Add mentor contact fields to internships table
ALTER TABLE public.internships 
  ADD COLUMN IF NOT EXISTS mentor_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mentor_email VARCHAR(255);

-- 2. Add internship_id linkage to invitation_codes table
ALTER TABLE public.invitation_codes 
  ADD COLUMN IF NOT EXISTS internship_id UUID REFERENCES public.internships(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_invitation_codes_internship ON public.invitation_codes(internship_id);

-- 3. Extend invitation_codes invitation_type check constraint
ALTER TABLE public.invitation_codes DROP CONSTRAINT IF EXISTS invitation_codes_invitation_type_check;

ALTER TABLE public.invitation_codes ADD CONSTRAINT invitation_codes_invitation_type_check 
  CHECK (invitation_type IN ('STUDENT_ONBOARDING', 'FACULTY_INVITE', 'ADMIN_INVITE', 'COMPANY_MENTOR_INVITE'));

-- 4. Update consume_invitation atomic RPC function
CREATE OR REPLACE FUNCTION public.consume_invitation(
    p_code_hash TEXT,
    p_student_id_number TEXT -- NULL if Faculty/Admin/Company Mentor invite
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

    -- Check intended email restriction (case-insensitive email matching)
    IF v_invite.intended_email IS NOT NULL AND LOWER(v_invite.intended_email) <> LOWER(v_user_email) THEN
        RAISE EXCEPTION 'This invitation is registered to another email address';
    END IF;

    -- Determine role based on invitation type
    IF v_invite.invitation_type = 'STUDENT_ONBOARDING' THEN
        v_role := 'STUDENT';
    ELSIF v_invite.invitation_type = 'FACULTY_INVITE' THEN
        v_role := 'FACULTY_MENTOR';
    ELSIF v_invite.invitation_type = 'ADMIN_INVITE' THEN
        v_role := 'ADMIN';
    ELSIF v_invite.invitation_type = 'COMPANY_MENTOR_INVITE' THEN
        v_role := 'COMPANY_MENTOR';
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
    DO UPDATE SET created_at = now()
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

    -- If invitation is for a Company Mentor and bound to a specific internship, create assignment
    IF v_role = 'COMPANY_MENTOR' AND v_invite.internship_id IS NOT NULL THEN
        INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary)
        VALUES (v_invite.internship_id, v_user_id, 'COMPANY', true)
        ON CONFLICT (internship_id, mentor_user_id) DO UPDATE SET is_primary = true;

        -- Record assignment audit log
        INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, after_state)
        VALUES (
            v_invite.tenant_id,
            v_user_id,
            'COMPANY_MENTOR_ASSIGNED',
            'internship_mentor_assignments',
            v_invite.internship_id,
            json_build_object('internship_id', v_invite.internship_id, 'mentor_user_id', v_user_id, 'mentor_type', 'COMPANY')::jsonb
        );
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
        CASE WHEN v_role = 'COMPANY_MENTOR' THEN 'COMPANY_MENTOR_INVITE_ACCEPTED' ELSE 'MEMBERSHIP_GRANTED' END,
        'tenant_memberships',
        v_membership_id
    );

    RETURN v_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.consume_invitation(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_invitation(TEXT, TEXT) TO authenticated;
