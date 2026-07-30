-- Migration: 20260721004_add_company_mentor_role.sql
-- Purpose: Update membership_roles check constraint to include COMPANY_MENTOR.

ALTER TABLE public.membership_roles DROP CONSTRAINT IF EXISTS membership_roles_role_check;

ALTER TABLE public.membership_roles ADD CONSTRAINT membership_roles_role_check CHECK (role IN ('STUDENT', 'FACULTY_MENTOR', 'ADMIN', 'COMPANY_MENTOR'));
