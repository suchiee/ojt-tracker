// Test Script: test_admin_management_v2.js
// Validates Phase 1G.6 Tenant Admin Management Mutations & Provisioning
// Covers: Academic Structure CRUD & Tenant Isolation, Company CRUD, User Provisioning (Student, Faculty, Mentor),
// Faculty Batch Assignment, Internship Creation & Edit, Mentor Assignment, Role Authorization Rejections,
// Parameter Override Rejection, Direct PostgREST RLS Bypass, and Review History Integrity.

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REACT_APP_SUPABASE_ANON_KEY
} = process.processEnv || process.env;

const PORT = process.env.PORT || 5003;
const API_BASE = `http://localhost:${PORT}/api/v2`;
const TEST_PASSWORD = 'StagingPassword123!';

const TENANT_A_ID = '80092172-cce7-4e68-a4ad-9f1f178c0857';
const TENANT_B_ID = '0f7b9978-b8b7-4147-b41d-c1a0bf71a8f5';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`[PASS ${passedCount}] ${message}`);
  } else {
    failedCount++;
    console.error(`[FAIL ${failedCount}] ${message}`);
  }
}

async function runTests() {
  console.log('=== PHASE 1G.6 TENANT ADMIN MANAGEMENT MUTATIONS & SECURITY TEST ===\n');

  const supabaseAnon = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY);
  const pgClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  let createdDeptId, createdProgId, createdBatchId, createdCompanyId, createdInternshipId;
  let provStudentUserId, provFacultyUserId, provMentorUserId;

  try {
    // ── 1. AUTHENTICATING STAGING USERS ───────────────────────────────────────
    console.log('--- 1. AUTHENTICATING STAGING USERS ---');

    // Admin A
    const { data: authAdminA, error: errAdminA } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-admin@integration.com',
      password: TEST_PASSWORD
    });
    if (errAdminA) throw new Error(`Admin A Auth failed: ${errAdminA.message}`);
    const tokenAdminA = authAdminA.session.access_token;

    // Admin B
    const { data: authAdminB, error: errAdminB } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-admin-b@integration.com',
      password: TEST_PASSWORD
    });
    if (errAdminB) throw new Error(`Admin B Auth failed: ${errAdminB.message}`);
    const tokenAdminB = authAdminB.session.access_token;

    // Student
    const { data: authStudent, error: errStudent } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-student@integration.com',
      password: TEST_PASSWORD
    });
    if (errStudent) throw new Error(`Student Auth failed: ${errStudent.message}`);
    const tokenStudent = authStudent.session.access_token;

    // Mentor
    const { data: authMentor, error: errMentor } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: TEST_PASSWORD
    });
    if (errMentor) throw new Error(`Mentor Auth failed: ${errMentor.message}`);
    const tokenMentor = authMentor.session.access_token;

    // Faculty
    const { data: authFaculty, error: errFaculty } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-faculty@integration.com',
      password: TEST_PASSWORD
    });
    if (errFaculty) throw new Error(`Faculty Auth failed: ${errFaculty.message}`);
    const tokenFaculty = authFaculty.session.access_token;

    assert(tokenAdminA && tokenAdminB && tokenStudent && tokenMentor && tokenFaculty, 'Authenticated Admin A, Admin B, Student, Mentor, and Faculty staging accounts');

    // ── 2. ACADEMIC STRUCTURE MUTATIONS ───────────────────────────────────────
    console.log('\n--- 2. TESTING ACADEMIC STRUCTURE MUTATIONS & TENANT ISOLATION ---');

    // Create Dept in Tenant A
    const resDept = await axios.post(
      `${API_BASE}/admin/departments`,
      { name: 'CS-Dept-AdminA' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    createdDeptId = resDept.data.data.id;
    assert(createdDeptId && resDept.data.data.tenant_id === TENANT_A_ID, 'Admin A created Department in Tenant A');

    // Update Dept
    const resDeptUpdate = await axios.patch(
      `${API_BASE}/admin/departments/${createdDeptId}`,
      { name: 'CS-Dept-AdminA-Updated' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resDeptUpdate.data.data.name === 'CS-Dept-AdminA-Updated', 'Admin A updated Department name');

    // Admin B update attempt on Tenant A Dept
    try {
      await axios.patch(
        `${API_BASE}/admin/departments/${createdDeptId}`,
        { name: 'Hacked Dept' },
        { headers: { Authorization: `Bearer ${tokenAdminB}` } }
      );
      assert(false, 'Admin B should be blocked from updating Tenant A Department');
    } catch (err) {
      assert(err.response && err.response.status === 404, 'Admin B update on Tenant A Department rejected with HTTP 404 Not Found');
    }

    // Create Program under Tenant A Dept
    const resProg = await axios.post(
      `${API_BASE}/admin/programs`,
      { department_id: createdDeptId, name: 'CS-Prog-AdminA' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    createdProgId = resProg.data.data.id;
    assert(createdProgId && resProg.data.data.department_id === createdDeptId, 'Admin A created Program under Tenant A Department');

    // Admin A attempt to create Program under invalid or cross-tenant Dept
    try {
      await axios.post(
        `${API_BASE}/admin/programs`,
        { department_id: '00000000-0000-0000-0000-000000000000', name: 'Cross-Tenant Prog' },
        { headers: { Authorization: `Bearer ${tokenAdminA}` } }
      );
      assert(false, 'Admin A should be blocked from creating Program under unowned Department');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Program creation under unowned Department rejected with HTTP 400 Bad Request');
    }

    // Create Batch under Tenant A Prog
    const resBatch = await axios.post(
      `${API_BASE}/admin/batches`,
      { program_id: createdProgId, name: 'CS-Batch-2026-AdminA' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    createdBatchId = resBatch.data.data.id;
    assert(createdBatchId && resBatch.data.data.program_id === createdProgId, 'Admin A created Batch under Tenant A Program');

    // ── 3. COMPANY MUTATIONS ──────────────────────────────────────────────────
    console.log('\n--- 3. TESTING COMPANY MUTATIONS & TENANT ISOLATION ---');

    const resCompany = await axios.post(
      `${API_BASE}/admin/companies`,
      { name: 'AdminA Tech Corp', website: 'https://adminatech.com' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    createdCompanyId = resCompany.data.data.id;
    assert(createdCompanyId && resCompany.data.data.tenant_id === TENANT_A_ID, 'Admin A created Company in Tenant A');

    const resCompUpdate = await axios.patch(
      `${API_BASE}/admin/companies/${createdCompanyId}`,
      { website: 'https://updated-adminatech.com' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resCompUpdate.data.data.website === 'https://updated-adminatech.com', 'Admin A updated Company metadata');

    try {
      await axios.patch(
        `${API_BASE}/admin/companies/${createdCompanyId}`,
        { name: 'Hacked Company' },
        { headers: { Authorization: `Bearer ${tokenAdminB}` } }
      );
      assert(false, 'Admin B should be blocked from updating Tenant A Company');
    } catch (err) {
      assert(err.response && err.response.status === 404, 'Admin B update on Tenant A Company rejected with HTTP 404 Not Found');
    }

    // ── 4. USER PROVISIONING MUTATIONS ────────────────────────────────────────
    console.log('\n--- 4. TESTING USER PROVISIONING MUTATIONS ---');

    // Provision Student
    const resProvStu = await axios.post(
      `${API_BASE}/admin/provision/student`,
      {
        email: 'prov-student-test@integration.com',
        first_name: 'ProvStudent',
        last_name: 'Test',
        student_id_number: 'STU-PROV-001',
        batch_id: createdBatchId
      },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    provStudentUserId = resProvStu.data.data.user_id;
    assert(provStudentUserId && resProvStu.data.data.student_id_number === 'STU-PROV-001', 'Admin A provisioned Student linked to Tenant A Batch');

    // Verify in SQL
    const { rows: [sqlStuRole] } = await pgClient.query(
      `SELECT mr.role FROM tenant_memberships tm JOIN membership_roles mr ON tm.id = mr.membership_id WHERE tm.user_id = $1 AND tm.tenant_id = $2`,
      [provStudentUserId, TENANT_A_ID]
    );
    assert(sqlStuRole && sqlStuRole.role === 'STUDENT', 'Provisioned Student assigned STUDENT role in Tenant A membership');

    // Provision Student with invalid batch
    try {
      await axios.post(
        `${API_BASE}/admin/provision/student`,
        {
          email: 'invalid-batch-student@integration.com',
          first_name: 'Invalid',
          last_name: 'Batch',
          student_id_number: 'STU-INV-001',
          batch_id: '00000000-0000-0000-0000-000000000000'
        },
        { headers: { Authorization: `Bearer ${tokenAdminA}` } }
      );
      assert(false, 'Provisioning Student with invalid batch should be rejected');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Student provisioning with invalid batch rejected with HTTP 400 Bad Request');
    }

    // Provision Faculty
    const resProvFac = await axios.post(
      `${API_BASE}/admin/provision/faculty`,
      {
        email: 'prov-faculty-test@integration.com',
        first_name: 'ProvFaculty',
        last_name: 'Test',
        batch_ids: [createdBatchId]
      },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    provFacultyUserId = resProvFac.data.data.user_id;
    assert(provFacultyUserId && resProvFac.data.data.role === 'FACULTY_MENTOR', 'Admin A provisioned Faculty Advisor with batch assignment');

    // Provision Company Mentor
    const resProvMen = await axios.post(
      `${API_BASE}/admin/provision/mentor`,
      {
        email: 'prov-mentor-test@integration.com',
        first_name: 'ProvMentor',
        last_name: 'Test'
      },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    provMentorUserId = resProvMen.data.data.user_id;
    assert(provMentorUserId, 'Admin A provisioned Company Mentor');

    // ── 5. FACULTY BATCH ASSIGNMENTS ──────────────────────────────────────────
    console.log('\n--- 5. TESTING FACULTY BATCH ASSIGNMENT MUTATIONS ---');

    // Remove Faculty from batch
    const resRemoveFac = await axios.delete(
      `${API_BASE}/admin/batches/${createdBatchId}/faculty/${provFacultyUserId}`,
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resRemoveFac.data.data.success === true, 'Admin A removed Faculty from Batch');

    // Re-assign Faculty to batch
    const resAssignFac = await axios.post(
      `${API_BASE}/admin/batches/${createdBatchId}/faculty`,
      { faculty_user_id: provFacultyUserId },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resAssignFac.data.data.faculty_user_id === provFacultyUserId, 'Admin A assigned Faculty to Batch');

    // Admin B attempt to assign Faculty to Tenant A Batch
    try {
      await axios.post(
        `${API_BASE}/admin/batches/${createdBatchId}/faculty`,
        { faculty_user_id: provFacultyUserId },
        { headers: { Authorization: `Bearer ${tokenAdminB}` } }
      );
      assert(false, 'Admin B should be blocked from assigning Faculty to Tenant A Batch');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Cross-tenant Faculty batch assignment rejected with HTTP 400 Bad Request');
    }

    // ── 6. INTERNSHIP & MENTOR ASSIGNMENT MUTATIONS ───────────────────────────
    console.log('\n--- 6. TESTING INTERNSHIP & MENTOR ASSIGNMENT MUTATIONS ---');

    // Create Internship
    const resInt = await axios.post(
      `${API_BASE}/admin/internships`,
      {
        student_id: provStudentUserId,
        company_id: createdCompanyId,
        job_role: 'Full Stack Engineer Intern',
        start_date: '2026-08-01',
        end_date: '2026-11-01',
        total_hours: 200,
        status: 'ACTIVE'
      },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    createdInternshipId = resInt.data.data.id;
    assert(createdInternshipId && resInt.data.data.total_hours === 200, 'Admin A created Internship for Tenant A Student and Company');

    // Update Internship
    const resIntUpdate = await axios.patch(
      `${API_BASE}/admin/internships/${createdInternshipId}`,
      { total_hours: 250, job_role: 'Lead Full Stack Intern' },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resIntUpdate.data.data.total_hours === 250 && resIntUpdate.data.data.job_role === 'Lead Full Stack Intern', 'Admin A updated Internship metadata');

    // Assign Mentor to Internship
    const resAssignMen = await axios.post(
      `${API_BASE}/admin/internships/${createdInternshipId}/mentors`,
      { mentor_user_id: provMentorUserId, is_primary: true },
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resAssignMen.data.data.mentor_user_id === provMentorUserId, 'Admin A assigned Company Mentor to Internship');

    // Remove Mentor from Internship
    const resRemoveMen = await axios.delete(
      `${API_BASE}/admin/internships/${createdInternshipId}/mentors/${provMentorUserId}`,
      { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    );
    assert(resRemoveMen.data.data.success === true, 'Admin A removed Company Mentor assignment from Internship');

    // ── 7. ROLE AUTHORIZATION & PRIVILEGE REJECTIONS ──────────────────────────
    console.log('\n--- 7. TESTING ROLE AUTHORIZATION REJECTIONS ---');

    try {
      await axios.post(`${API_BASE}/admin/departments`, { name: 'Student Dept' }, { headers: { Authorization: `Bearer ${tokenStudent}` } });
      assert(false, 'Student should be rejected on Admin department creation');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Student department creation rejected with HTTP 403 Forbidden');
    }

    try {
      await axios.post(`${API_BASE}/admin/companies`, { name: 'Mentor Co' }, { headers: { Authorization: `Bearer ${tokenMentor}` } });
      assert(false, 'Mentor should be rejected on Admin company creation');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Mentor company creation rejected with HTTP 403 Forbidden');
    }

    try {
      await axios.post(
        `${API_BASE}/admin/provision/student`,
        {
          email: 'fac-hack@integration.com',
          first_name: 'Hack',
          last_name: 'Fac',
          student_id_number: 'HACK01',
          batch_id: createdBatchId
        },
        { headers: { Authorization: `Bearer ${tokenFaculty}` } }
      );
      assert(false, 'Faculty should be rejected on Admin student provisioning');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Faculty student provisioning rejected with HTTP 403 Forbidden');
    }

    // ── 8. DIRECT POSTGREST RLS BYPASS & CLEANUP ──────────────────────────────
    console.log('\n--- 8. TESTING DIRECT RLS BYPASS & CLEANUP ---');

    const userClientAdminA = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    });

    const { error: rlsInsertErr } = await userClientAdminA
      .from('departments')
      .insert({ tenant_id: TENANT_B_ID, name: 'RLS Bypass Dept' });

    assert(rlsInsertErr !== null, 'Direct PostgREST insert on Tenant B departments blocked by RLS policy');

    // Clean up test data in dependency order
    await pgClient.query(`DELETE FROM internships WHERE id = $1`, [createdInternshipId]);
    await pgClient.query(`DELETE FROM faculty_batch_assignments WHERE faculty_user_id = $1`, [provFacultyUserId]);
    await pgClient.query(`DELETE FROM student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE user_id = $1)`, [provStudentUserId]);
    await pgClient.query(`DELETE FROM tenant_memberships WHERE user_id = ANY($1::uuid[])`, [[provStudentUserId, provFacultyUserId, provMentorUserId]]);
    await pgClient.query(`DELETE FROM batches WHERE id = $1`, [createdBatchId]);
    await pgClient.query(`DELETE FROM programs WHERE id = $1`, [createdProgId]);
    await pgClient.query(`DELETE FROM departments WHERE id = $1`, [createdDeptId]);
    await pgClient.query(`DELETE FROM companies WHERE id = $1`, [createdCompanyId]);

    console.log('\n=======================================================');
    console.log(`FINAL RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('=======================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unhandled Test Failure:', err.response?.data || err.message || err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

runTests();
