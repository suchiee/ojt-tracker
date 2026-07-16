-- Migration: 008 Evaluations
-- Purpose: Setup evaluation templates, questions, evaluations, and student/mentor rubric responses.

CREATE TABLE evaluation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL
);

CREATE TABLE evaluation_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES evaluation_templates(id) ON DELETE CASCADE NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL CHECK (question_type IN ('SCALE', 'TEXT')),
    max_score INT,
    sort_order INT NOT NULL
);

CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    template_id UUID REFERENCES evaluation_templates(id) ON DELETE RESTRICT NOT NULL,
    evaluator_user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    evaluator_role VARCHAR(50) NOT NULL CHECK (evaluator_role IN ('FACULTY', 'COMPANY')),
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE evaluation_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES evaluation_questions(id) ON DELETE RESTRICT NOT NULL,
    score_rating INT,
    text_response TEXT,
    UNIQUE(evaluation_id, question_id)
);

CREATE INDEX idx_evaluations_internship ON evaluations(internship_id);
CREATE INDEX idx_evaluation_questions_template ON evaluation_questions(template_id);
CREATE INDEX idx_evaluation_responses_eval ON evaluation_responses(evaluation_id);
