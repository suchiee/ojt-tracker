-- Migration: 013 Fix Cascade Delete Risks
-- Purpose: Restrict deletion of parent tenants and users if dependent internship records exist.

-- Drop existing cascading foreign keys
ALTER TABLE internships DROP CONSTRAINT internships_tenant_id_fkey;
ALTER TABLE internships DROP CONSTRAINT internships_student_id_fkey;

-- Re-create foreign keys with RESTRICT behavior to protect historical OJT data
ALTER TABLE internships 
    ADD CONSTRAINT internships_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

ALTER TABLE internships 
    ADD CONSTRAINT internships_student_id_fkey 
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT;
