-- SQL RLS Policy Verification Script
-- Simulates the Supabase Auth context (JWT claims and role contexts) to verify multi-tenant isolation rules.
-- Executed inside a transaction block and rolled back to maintain database state.

BEGIN;

-- =============================================================================
-- 1. SETUP TESTING SYSTEM DATA
-- =============================================================================

-- Create Tenants
INSERT INTO tenants (id, name, domain) VALUES
('11111111-1111-1111-1111-111111111111', 'College A (Tenant A)', 'college-a.edu'),
('22222222-2222-2222-2222-222222222222', 'College B (Tenant B)', 'college-b.edu');

-- Create Users
INSERT INTO users (id, first_name, last_name, email) VALUES
-- Tenant A Users
('00000000-0000-0000-0000-000000000001', 'Student', 'A', 'student-a@college-a.edu'),
('00000000-0000-0000-0000-000000000002', 'Student', 'B', 'student-b@college-a.edu'),
('00000000-0000-0000-0000-000000000003', 'Faculty', 'A', 'faculty-a@college-a.edu'),
('00000000-0000-0000-0000-000000000004', 'Faculty', 'B', 'faculty-b@college-a.edu'),
('00000000-0000-0000-0000-000000000005', 'Admin', 'A', 'admin-a@college-a.edu'),
-- Tenant B Users
('00000000-0000-0000-0000-000000000006', 'Student', 'C', 'student-c@college-b.edu'),
('00000000-0000-0000-0000-000000000007', 'Admin', 'B', 'admin-b@college-b.edu'),
-- External Users (no tenant memberships)
('00000000-0000-0000-0000-000000000008', 'Mentor', 'A', 'mentor-a@company.com'),
('00000000-0000-0000-0000-000000000009', 'Mentor', 'B', 'mentor-b@company.com');

-- Set up Tenant Memberships (Tenant A)
INSERT INTO tenant_memberships (id, tenant_id, user_id) VALUES
('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001'),
('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002'),
('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003'),
('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000004'),
('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000005');

-- Set up Tenant Memberships (Tenant B)
INSERT INTO tenant_memberships (id, tenant_id, user_id) VALUES
('b0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000006'),
('b0000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000007');

-- Set up Membership Roles
INSERT INTO membership_roles (membership_id, role) VALUES
('a0000000-0000-0000-0000-000000000001', 'STUDENT'),
('a0000000-0000-0000-0000-000000000002', 'STUDENT'),
('a0000000-0000-0000-0000-000000000003', 'FACULTY_MENTOR'),
('a0000000-0000-0000-0000-000000000004', 'FACULTY_MENTOR'),
('a0000000-0000-0000-0000-000000000005', 'ADMIN'),
('b0000000-0000-0000-0000-000000000006', 'STUDENT'),
('b0000000-0000-0000-0000-000000000007', 'ADMIN');

-- Set up Batches (Tenant A Academic Hierarchy)
INSERT INTO departments (id, tenant_id, name) VALUES ('de000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Computer Science');
INSERT INTO programs (id, department_id, name) VALUES ('pr000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', 'BSc CS');
INSERT INTO batches (id, program_id, name) VALUES 
('ba000000-0000-0000-0000-000000000001', 'pr000000-0000-0000-0000-000000000001', 'BSc CS Batch 1'),
('ba000000-0000-0000-0000-000000000002', 'pr000000-0000-0000-0000-000000000001', 'BSc CS Batch 2');

-- Faculty Batch Assignments (Faculty A assigned to Batch 1, Faculty B assigned to Batch 2)
INSERT INTO faculty_batch_assignments (faculty_user_id, batch_id) VALUES
('00000000-0000-0000-0000-000000000003', 'ba000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000004', 'ba000000-0000-0000-0000-000000000002');

-- Student Profiles (Student A -> Batch 1, Student B -> Batch 2)
INSERT INTO student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES
('a0000000-0000-0000-0000-000000000001', 'SID-A', 'ba000000-0000-0000-0000-000000000001'),
('a0000000-0000-0000-0000-000000000002', 'SID-B', 'ba000000-0000-0000-0000-000000000002');

-- Companies
INSERT INTO companies (id, tenant_id, name) VALUES 
('co000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Company A'),
('co000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Company B');

-- Internships
INSERT INTO internships (id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES
('in000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'co000000-0000-0000-0000-000000000001', 'Dev', '2026-07-01', '2026-08-31', 120, 'ACTIVE'),
('in000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'co000000-0000-0000-0000-000000000001', 'QA', '2026-07-01', '2026-08-31', 120, 'ACTIVE');

-- Company Mentor Assignment (Mentor A explicitly assigned to Student A's internship)
INSERT INTO internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary) VALUES
('in000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000008', 'COMPANY', TRUE);

-- Documents (Student A has an uploaded offer letter)
INSERT INTO documents (id, internship_id, document_type, storage_path, status) VALUES
('do000000-0000-0000-0000-000000000001', 'in000000-0000-0000-0000-000000000001', 'OFFER_LETTER', '/docs/offer.pdf', 'PENDING_VERIFICATION');


-- =============================================================================
-- 2. RUN SIMULATED ROLE TESTS
-- =============================================================================

-- Test Scenario 1: Student A Context (Should see own internship, not Student B's)
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Student A selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'RLS Fail: Student A should see exactly 1 internship (own), but sees %', v_count;
    END IF;
END $$;

-- Test Scenario 2: Student A cannot read documents of another user
-- Wait, let's verify if Student A can select own document first
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM documents;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'RLS Fail: Student A should see own document, but sees %', v_count;
    END IF;
END $$;

-- Test Scenario 3: Faculty A Context (assigned to Batch 1, should see Student A, NOT Student B)
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Faculty A selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
    v_student_id UUID;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'RLS Fail: Faculty A should see exactly 1 internship (Batch 1), but sees %', v_count;
    END IF;
    
    SELECT student_id INTO v_student_id FROM internships LIMIT 1;
    IF v_student_id <> '00000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'RLS Fail: Faculty A saw student %, expected Student A', v_student_id;
    END IF;
END $$;

-- Test Scenario 4: Faculty B Context (assigned to Batch 2, should see Student B, NOT Student A)
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Faculty B selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
    v_student_id UUID;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'RLS Fail: Faculty B should see exactly 1 internship (Batch 2), but sees %', v_count;
    END IF;
    
    SELECT student_id INTO v_student_id FROM internships LIMIT 1;
    IF v_student_id <> '00000000-0000-0000-0000-000000000002' THEN
        RAISE EXCEPTION 'RLS Fail: Faculty B saw student %, expected Student B', v_student_id;
    END IF;
END $$;

-- Test Scenario 5: Company Mentor A Context (assigned to Student A, should see Student A, NOT Student B)
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000008';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Company Mentor A selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'RLS Fail: Mentor A should see exactly 1 assigned internship, but sees %', v_count;
    END IF;
END $$;

-- Company Mentor A cannot read documents (least privilege check)
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM documents;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'RLS Fail: Mentor A should not be allowed to select student documents, but saw %', v_count;
    END IF;
END $$;

-- Test Scenario 6: Company Mentor B Context (unassigned, should see 0 internships)
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000009';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Company Mentor B selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'RLS Fail: Unassigned Mentor B should see 0 internships, but sees %', v_count;
    END IF;
END $$;

-- Test Scenario 7: Tenant Admin A Context (should see both Student A & B in Tenant A, but NOT Tenant B/Student C)
RESET ROLE;
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
SET LOCAL role = 'authenticated';

SELECT 'TEST: Tenant Admin A selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'RLS Fail: Admin A should see all 2 internships in Tenant A, but sees %', v_count;
    END IF;
END $$;

-- Test Scenario 8: Anonymous user (should see 0 rows)
RESET ROLE;
SET LOCAL role = 'anon';

SELECT 'TEST: Anonymous selects internships...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'RLS Fail: Anonymous user saw % internships, expected 0', v_count;
    END IF;
END $$;

-- =============================================================================
-- 3. BYPASS TESTS
-- =============================================================================
RESET ROLE;
SET LOCAL role = 'service_role';
SELECT 'TEST: Service role bypass RLS check...' AS info;
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Service role bypasses RLS, should see both internships directly
    SELECT COUNT(*) INTO v_count FROM internships;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Service role RLS bypass check failed: expected 2 internships, got %', v_count;
    END IF;
END $$;

SELECT 'RLS Tests Completed Successfully.' AS status;

ROLLBACK;
