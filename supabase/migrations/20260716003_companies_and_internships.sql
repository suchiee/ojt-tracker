-- Migration: 003 Companies and Internships
-- Purpose: Setup tenant-specific companies and internships with start/end date validation constraints.

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE internships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE RESTRICT NOT NULL,
    job_role VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_hours INT NOT NULL CHECK (total_hours > 0),
    status VARCHAR(50) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'ELIGIBLE_FOR_COMPLETION', 'COMPLETED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT chk_internship_dates CHECK (end_date >= start_date)
);

-- Core indexes for search/filter and relationship lookups
CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_internships_tenant ON internships(tenant_id);
CREATE INDEX idx_internships_student ON internships(student_id);
CREATE INDEX idx_internships_company ON internships(company_id);
