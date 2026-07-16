-- Migration: 006 Weekly Reports and Faculty Reviews
-- Purpose: Setup weekly reports, link associations to daily logs, faculty reviews, and attendance checkpoints.

CREATE TABLE weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    ai_summary TEXT,
    student_notes TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(internship_id, start_date),
    CONSTRAINT chk_weekly_report_dates CHECK (end_date >= start_date)
);

CREATE TABLE weekly_report_log_links (
    weekly_report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE NOT NULL,
    daily_log_id UUID REFERENCES daily_logs(id) ON DELETE RESTRICT UNIQUE NOT NULL,
    PRIMARY KEY (weekly_report_id, daily_log_id)
);

CREATE TABLE faculty_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    weekly_report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE UNIQUE NOT NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
    remarks TEXT,
    reviewed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE review_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    checkpoint_date DATE NOT NULL,
    attended BOOLEAN DEFAULT true NOT NULL,
    notes TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(internship_id, checkpoint_date)
);

CREATE INDEX idx_weekly_reports_internship ON weekly_reports(internship_id);
CREATE INDEX idx_faculty_reviews_report ON faculty_reviews(weekly_report_id);
CREATE INDEX idx_checkpoints_internship ON review_checkpoints(internship_id);
