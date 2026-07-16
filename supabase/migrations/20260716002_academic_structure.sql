-- Migration: 002 Academic Structure
-- Purpose: Setup departments, programs, batches, faculty batch assignments, and student profiles.

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE faculty_batch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
    UNIQUE(faculty_user_id, batch_id)
);

CREATE TABLE student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_membership_id UUID REFERENCES tenant_memberships(id) ON DELETE CASCADE UNIQUE NOT NULL,
    student_id_number VARCHAR(100) NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE RESTRICT NOT NULL
);

-- Core indexes for academic hierarchies
CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_programs_department ON programs(department_id);
CREATE INDEX idx_batches_program ON batches(program_id);
CREATE INDEX idx_student_profiles_batch ON student_profiles(batch_id);
CREATE INDEX idx_student_profiles_membership ON student_profiles(tenant_membership_id);
