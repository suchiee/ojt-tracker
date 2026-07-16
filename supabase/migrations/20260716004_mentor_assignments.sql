-- Migration: 004 Mentor Assignments
-- Purpose: Setup direct mentor assignments for internships (both external company and institutional faculty mentors).

CREATE TABLE internship_mentor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    mentor_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    mentor_type VARCHAR(50) NOT NULL CHECK (mentor_type IN ('FACULTY', 'COMPANY')),
    is_primary BOOLEAN DEFAULT false NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(internship_id, mentor_user_id)
);

CREATE INDEX idx_mentor_assignments_mentor ON internship_mentor_assignments(mentor_user_id);
CREATE INDEX idx_mentor_assignments_internship ON internship_mentor_assignments(internship_id);
