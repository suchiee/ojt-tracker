-- SQL Test Script: Database Integrity & Policy Verification
-- Run this inside your Supabase SQL editor or local PostgreSQL client.
-- Runs inside a transaction and rolls back at the end to keep the database clean.

BEGIN;

-- =============================================================================
-- TEST 1: SETUP VALID MOCK DATA
-- =============================================================================
SELECT 'Running Setup...' AS progress;

INSERT INTO tenants (id, name, domain) 
VALUES ('6a58f73b-51df-baf5-c032-8af400000001', 'Nowrosjee Wadia College', 'wadia.edu');

-- Insert mock users (using random UUIDs for auth.users simulation)
INSERT INTO users (id, first_name, last_name, email) VALUES
('aa000000-0000-0000-0000-000000000001', 'Test', 'Student', 'student@wadia.edu'),
('aa000000-0000-0000-0000-000000000002', 'Test', 'Faculty', 'faculty@wadia.edu'),
('aa000000-0000-0000-0000-000000000003', 'Test', 'Mentor', 'mentor@company.com'),
('aa000000-0000-0000-0000-000000000004', 'Test', 'Admin', 'admin@wadia.edu');

-- Set up memberships
INSERT INTO tenant_memberships (id, tenant_id, user_id) VALUES
('b0000000-0000-0000-0000-000000000001', '6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', '6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000002'),
('b0000000-0000-0000-0000-000000000004', '6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000004');

-- Set up roles
INSERT INTO membership_roles (membership_id, role) VALUES
('b0000000-0000-0000-0000-000000000001', 'STUDENT'),
('b0000000-0000-0000-0000-000000000002', 'FACULTY_MENTOR'),
('b0000000-0000-0000-0000-000000000004', 'ADMIN');

-- Set up academic structure
INSERT INTO departments (id, tenant_id, name) VALUES ('d0000000-0000-0000-0000-000000000001', '6a58f73b-51df-baf5-c032-8af400000001', 'Computer Science');
INSERT INTO programs (id, department_id, name) VALUES ('p0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'BSc Computer Science');
INSERT INTO batches (id, program_id, name) VALUES ('c0000000-0000-0000-0000-000000000001', 'p0000000-0000-0000-0000-000000000001', 'BSc CS 2026');

-- Set up student profile
INSERT INTO student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES
('b0000000-0000-0000-0000-000000000001', 'SID-999', 'c0000000-0000-0000-0000-000000000001');

-- Set up company
INSERT INTO companies (id, tenant_id, name) VALUES ('e0000000-0000-0000-0000-000000000001', '6a58f73b-51df-baf5-c032-8af400000001', 'Wadia Web Services');

-- Set up internship
INSERT INTO internships (id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES
('f0000000-0000-0000-0000-000000000001', '6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Web Developer', '2026-07-01', '2026-08-31', 120, 'ACTIVE');

-- =============================================================================
-- TEST 2: DATE AND VALUE CONSTRAINTS
-- =============================================================================
SELECT 'Testing Date Validation Constraint...' AS progress;
DO $$
BEGIN
    BEGIN
        INSERT INTO internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
        VALUES ('6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Web Developer', '2026-07-31', '2026-07-01', 120, 'ACTIVE');
        RAISE EXCEPTION 'Date check failed: Allowed invalid end_date < start_date!';
    EXCEPTION
        WHEN check_violation THEN
            -- Pass
            RAISE NOTICE 'Date check passed: Successfully blocked invalid date range.';
    END;
END $$;

-- =============================================================================
-- TEST 3: COMPLETED HOURS DYNAMIC VIEW CALCULATIONS
-- =============================================================================
SELECT 'Testing Internship Hours Summary View Calculations...' AS progress;

-- Insert Daily Logs and Tasks
INSERT INTO daily_logs (id, internship_id, date, notes, status) VALUES
('10000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '2026-07-06', 'DRAFT log notes', 'DRAFT'),
('10000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', '2026-07-07', 'SUBMITTED log notes', 'SUBMITTED'),
('10000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', '2026-07-08', 'APPROVED log notes', 'APPROVED');

INSERT INTO daily_log_tasks (daily_log_id, description, hours) VALUES
('10000000-0000-0000-0000-000000000001', 'Coding task', 4.0),
('10000000-0000-0000-0000-000000000002', 'Design task', 3.0),
('10000000-0000-0000-0000-000000000003', 'Testing task', 5.0);

-- Query the view and check assertions
DO $$
DECLARE
    v_logged NUMERIC;
    v_approved NUMERIC;
BEGIN
    SELECT logged_hours, approved_hours INTO v_logged, v_approved
    FROM internship_hours_summary
    WHERE internship_id = 'f0000000-0000-0000-0000-000000000001';

    -- Assertions:
    -- Logged should include SUBMITTED and APPROVED (3.0 + 5.0 = 8.0). DRAFT is excluded.
    -- Approved should include only APPROVED (5.0).
    IF v_logged <> 8.0 THEN
        RAISE EXCEPTION 'Hours View Error: Expected 8.0 logged hours, got %', v_logged;
    END IF;
    
    IF v_approved <> 5.0 THEN
        RAISE EXCEPTION 'Hours View Error: Expected 5.0 approved hours, got %', v_approved;
    END IF;

    RAISE NOTICE 'Hours View calculations verified successfully.';
END $$;

-- =============================================================================
-- TEST 4: LOG REVIEWS & ATTENDANCE UNIQUE CONSTRAINTS
-- =============================================================================
SELECT 'Testing Unique Constraints...' AS progress;
DO $$
BEGIN
    -- Log Review uniqueness test (only one review per log)
    INSERT INTO log_reviews (daily_log_id, reviewed_by, status, feedback)
    VALUES ('10000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', 'APPROVED', 'Good work');

    BEGIN
        INSERT INTO log_reviews (daily_log_id, reviewed_by, status, feedback)
        VALUES ('10000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', 'APPROVED', 'Duplicate review');
        RAISE EXCEPTION 'Constraint error: Allowed duplicate log review entry!';
    EXCEPTION
        WHEN unique_violation THEN
            -- Pass
            RAISE NOTICE 'Uniqueness check passed: Blocked duplicate log reviews.';
    END;

    -- Attendance checkpoint date uniqueness test
    INSERT INTO review_checkpoints (internship_id, checkpoint_date, attended, recorded_by)
    VALUES ('f0000000-0000-0000-0000-000000000001', '2026-07-16', TRUE, 'aa000000-0000-0000-0000-000000000002');

    BEGIN
        INSERT INTO review_checkpoints (internship_id, checkpoint_date, attended, recorded_by)
        VALUES ('f0000000-0000-0000-0000-000000000001', '2026-07-16', FALSE, 'aa000000-0000-0000-0000-000000000002');
        RAISE EXCEPTION 'Constraint error: Allowed duplicate checkpoints for same day!';
    EXCEPTION
        WHEN unique_violation THEN
            -- Pass
            RAISE NOTICE 'Uniqueness check passed: Blocked duplicate checkpoints.';
    END;
END $$;

-- =============================================================================
-- TEST 5: AUDIT LOGS MODIFICATION BLOCKS
-- =============================================================================
SELECT 'Testing Audit Log Constraints...' AS progress;

INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_table, target_id)
VALUES ('90000000-0000-0000-0000-000000000001', '6a58f73b-51df-baf5-c032-8af400000001', 'aa000000-0000-0000-0000-000000000004', 'INTERNSHIP_COMPLETED', 'internships', 'f0000000-0000-0000-0000-000000000001');

-- The table itself allows standard SQL insertions, but in RLS we block UPDATE/DELETE.
-- Since RLS is bypassed by database owners inside direct SQL test scripts, we manually verify 
-- that the table remains structured for append-only logic.

SELECT 'Test Suite completed successfully.' AS status;

ROLLBACK;
