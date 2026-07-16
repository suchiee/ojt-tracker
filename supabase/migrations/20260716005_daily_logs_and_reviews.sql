-- Migration: 005 Daily Logs and Reviews
-- Purpose: Setup daily logs, sub-tasks, and log review records for company mentor review.

CREATE TABLE daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'CORRECTION_REQUESTED')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE daily_log_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_log_id UUID REFERENCES daily_logs(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    hours NUMERIC(4,2) NOT NULL CHECK (hours > 0)
);

CREATE TABLE log_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_log_id UUID REFERENCES daily_logs(id) ON DELETE CASCADE UNIQUE NOT NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('APPROVED', 'CORRECTION_REQUESTED')),
    feedback TEXT,
    reviewed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_daily_logs_internship ON daily_logs(internship_id);
CREATE INDEX idx_daily_log_tasks_log ON daily_log_tasks(daily_log_id);
CREATE INDEX idx_log_reviews_log ON log_reviews(daily_log_id);
