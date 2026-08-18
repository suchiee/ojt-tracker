-- Migration: 20260819000_extend_evaluations.sql
-- Purpose: Safely update evaluations check constraint and seed student agency evaluation template/questions.

DO $$
DECLARE
    v_tenant_id UUID;
    v_template_id UUID := 'd83c27e8-468b-4a53-8321-df6dfa32b123';
BEGIN
    -- 1. Safely drop and recreate the evaluator_role check constraint to include 'STUDENT'
    ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_evaluator_role_check;
    ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_evaluator_role_check 
        CHECK (evaluator_role IN ('FACULTY', 'COMPANY', 'STUDENT'));

    -- 2. Resolve the primary tenant ID
    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
        -- 3. Seed 'Student Agency Evaluation' template
        INSERT INTO public.evaluation_templates (id, tenant_id, title, is_active)
        VALUES (v_template_id, v_tenant_id, 'Student Agency Evaluation', true)
        ON CONFLICT (id) DO NOTHING;

        -- 4. Seed 9 standard rubric questions matching the UI form fields
        -- Rating Scale Questions
        INSERT INTO public.evaluation_questions (id, template_id, question_text, question_type, max_score, sort_order)
        VALUES
            ('11111111-1111-1111-1111-111111111111', v_template_id, 'workEnvironment', 'SCALE', 5, 1),
            ('22222222-2222-2222-2222-222222222222', v_template_id, 'supervision', 'SCALE', 5, 2),
            ('33333333-3333-3333-3333-333333333333', v_template_id, 'learningOpportunities', 'SCALE', 5, 3),
            ('44444444-4444-4444-4444-444444444444', v_template_id, 'skillDevelopment', 'SCALE', 5, 4),
            ('55555555-5555-5555-5555-555555555555', v_template_id, 'communication', 'SCALE', 5, 5),
            ('66666666-6666-6666-6666-666666666666', v_template_id, 'overallExperience', 'SCALE', 5, 6),
            -- Open-ended Questions
            ('77777777-7777-7777-7777-777777777777', v_template_id, 'strengths', 'TEXT', NULL, 7),
            ('88888888-8888-8888-8888-888888888888', v_template_id, 'improvements', 'TEXT', NULL, 8),
            ('99999999-9999-9999-9999-999999999999', v_template_id, 'additionalComments', 'TEXT', NULL, 9)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;
