// Setup test fixtures only (no tests) — for running debug scripts
require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createFixtures() {
  const client = await adminPool.connect();
  try {
    // Pre-cleanup stale
    const { rows: staleTenants } = await client.query(
      `SELECT id FROM public.tenants WHERE domain IN ('test-a.example.com','test-b.example.com')`
    );
    for (const t of staleTenants) {
      await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN (SELECT user_id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.internships WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM public.companies WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM public.batches WHERE program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1))`, [t.id]);
      await client.query(`DELETE FROM public.programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.departments WHERE tenant_id=$1`, [t.id]);
      const { rows: staleMembers } = await client.query(`SELECT user_id FROM tenant_memberships WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM public.membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.tenant_memberships WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM public.tenants WHERE id=$1`, [t.id]);
      for (const m of staleMembers) {
        const { rows: [u] } = await client.query(`SELECT email FROM public.users WHERE id=$1`, [m.user_id]);
        if (u?.email?.includes('test-')) {
          await client.query(`DELETE FROM public.users WHERE id=$1`, [m.user_id]);
          await client.query(`DELETE FROM auth.users WHERE id=$1`, [m.user_id]);
        }
      }
    }

    const { rows: [tenantA] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant A', 'test-a.example.com') ON CONFLICT (domain) DO UPDATE SET name=EXCLUDED.name RETURNING id`);
    const { rows: [tenantB] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant B', 'test-b.example.com') ON CONFLICT (domain) DO UPDATE SET name=EXCLUDED.name RETURNING id`);

    const mkUser = async (email, firstName) => {
      const id = crypto.randomUUID();
      const { rows: [authRow] } = await client.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`, [id, email]);
      await client.query(`INSERT INTO public.users (id, first_name, last_name, email) VALUES ($1, $2, 'Test', $3) ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name`, [authRow.id, firstName, email]);
      return authRow.id;
    };
    const mkMembership = async (tenantId, userId, role) => {
      const { rows: [m] } = await client.query(`INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`, [tenantId, userId]);
      await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)`, [m.id, role]);
      return m.id;
    };

    const studentAId = await mkUser('test-studentA@test-a.com', 'StudentA');
    const studentBId = await mkUser('test-studentB@test-a.com', 'StudentB');
    const studentCId = await mkUser('test-studentC@test-b.com', 'StudentC');
    const adminAId   = await mkUser('test-adminA@test-a.com', 'AdminA');
    const adminBId   = await mkUser('test-adminB@test-b.com', 'AdminB');
    const facultyAId = await mkUser('test-facultyA@test-a.com', 'FacultyA');
    const mentorAId  = await mkUser('test-mentorA@test-a.com', 'MentorA');

    const memStudentA = await mkMembership(tenantA.id, studentAId, 'STUDENT');
    const memStudentB = await mkMembership(tenantA.id, studentBId, 'STUDENT');
    await mkMembership(tenantB.id, studentCId, 'STUDENT');
    await mkMembership(tenantA.id, adminAId, 'ADMIN');
    await mkMembership(tenantB.id, adminBId, 'ADMIN');
    await mkMembership(tenantA.id, facultyAId, 'FACULTY_MENTOR');
    await mkMembership(tenantA.id, mentorAId, 'STUDENT');

    const { rows: [companyA] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company A') RETURNING id`, [tenantA.id]);
    const { rows: [companyB] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company B') RETURNING id`, [tenantB.id]);

    const mkInternship = async (tenantId, studentId, companyId) => {
      const { rows: [i] } = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Test Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantId, studentId, companyId]);
      return i.id;
    };

    const intStudentA = await mkInternship(tenantA.id, studentAId, companyA.id);
    await mkInternship(tenantA.id, studentBId, companyA.id);
    await mkInternship(tenantB.id, studentCId, companyB.id);

    const { rows: [dept] } = await client.query(`INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'Test Dept') RETURNING id`, [tenantA.id]);
    const { rows: [prog] } = await client.query(`INSERT INTO public.programs (department_id, name) VALUES ($1, 'Test Prog') RETURNING id`, [dept.id]);
    const { rows: [batch] } = await client.query(`INSERT INTO public.batches (program_id, name) VALUES ($1, 'Test Batch') RETURNING id`, [prog.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'SID-TEST-A')`, [memStudentA, batch.id]);
    await client.query(`INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`, [facultyAId, batch.id]);
    await client.query(`INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, assigned_at) VALUES ($1, $2, 'COMPANY', NOW())`, [intStudentA, mentorAId]);

    console.log('Fixtures created. studentA:', studentAId, 'faculty:', facultyAId, 'mentor:', mentorAId, 'intA:', intStudentA);
  } finally {
    client.release();
    await adminPool.end();
  }
}

createFixtures().catch(e => { console.error('Error:', e.message); process.exit(1); });
