// Test Script: test_admin_workflow_v2.js
// Validates Phase 1G.5 Tenant Admin V2 Dashboard & Management Integration
// Covers: Authentication, Non-Admin Authorization Rejection, Overview Metrics, Students List & Detail,
// Internships List, Faculty List, Mentors List, Academic Structure, Tenant A vs Tenant B Isolation,
// Parameter Override Rejection, Direct PostgREST RLS Bypass, and Derived Hours Verification.

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
} = process.env;

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
  console.log('=== PHASE 1G.5 TENANT ADMIN V2 INTEGRATION & SECURITY TEST ===\n');

  const supabaseAnon = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY);
  const pgClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

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

    // ── 2. NON-ADMIN ROLE AUTHORIZATION REJECTIONS ────────────────────────────
    console.log('\n--- 2. TESTING NON-ADMIN ROLE AUTHORIZATION REJECTIONS ---');

    try {
      await axios.get(`${API_BASE}/admin/overview`, { headers: { Authorization: `Bearer ${tokenStudent}` } });
      assert(false, 'Student should be denied Admin overview access');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Student access to Admin overview rejected with HTTP 403 Forbidden');
    }

    try {
      await axios.get(`${API_BASE}/admin/overview`, { headers: { Authorization: `Bearer ${tokenMentor}` } });
      assert(false, 'Mentor should be denied Admin overview access');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Mentor access to Admin overview rejected with HTTP 403 Forbidden');
    }

    try {
      await axios.get(`${API_BASE}/admin/overview`, { headers: { Authorization: `Bearer ${tokenFaculty}` } });
      assert(false, 'Faculty without ADMIN role should be denied Admin overview access');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Faculty access to Admin overview rejected with HTTP 403 Forbidden');
    }

    // ── 3. ADMIN A OVERVIEW & SQL VERIFICATION ────────────────────────────────
    console.log('\n--- 3. TESTING ADMIN A OVERVIEW & DIRECT SQL VERIFICATION ---');

    const resOverview = await axios.get(`${API_BASE}/admin/overview`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const overview = resOverview.data.data;
    assert(overview && overview.tenant_id === TENANT_A_ID, 'Admin A overview returns Tenant A metrics');

    // Directly query SQL counts for Tenant A
    const { rows: [sqlStudents] } = await pgClient.query(
      `SELECT COUNT(DISTINCT tm.user_id)::int as count FROM tenant_memberships tm JOIN membership_roles mr ON tm.id = mr.membership_id WHERE tm.tenant_id = $1 AND mr.role = 'STUDENT'`,
      [TENANT_A_ID]
    );
    const { rows: [sqlActiveInt] } = await pgClient.query(
      `SELECT COUNT(*)::int as count FROM internships WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [TENANT_A_ID]
    );

    assert(
      overview.total_students === sqlStudents.count && overview.active_internships === sqlActiveInt.count,
      `Overview counts match direct SQL database verification (Students: ${overview.total_students}, Active Internships: ${overview.active_internships})`
    );

    // ── 4. ADMIN A DATA ENDPOINTS ─────────────────────────────────────────────
    console.log('\n--- 4. TESTING ADMIN A DATA ENDPOINTS ---');

    // Students list
    const resStudents = await axios.get(`${API_BASE}/admin/students?page=1&limit=10`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const studentList = resStudents.data.data;
    const studentPagination = resStudents.data.pagination;
    assert(Array.isArray(studentList) && studentPagination.total >= 1, `Admin A retrieved ${studentList.length} students (Total: ${studentPagination.total})`);

    // Student detail
    const studentA = studentList[0];
    const resDetail = await axios.get(`${API_BASE}/admin/students/${studentA.id}`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const studentDetail = resDetail.data.data;
    assert(studentDetail && studentDetail.student_id === studentA.id, `Admin A retrieved student detail for ${studentDetail.first_name} ${studentDetail.last_name}`);

    // Internships list
    const resInternships = await axios.get(`${API_BASE}/admin/internships?page=1&limit=10`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const internshipList = resInternships.data.data;
    assert(Array.isArray(internshipList) && internshipList.length >= 1, `Admin A retrieved ${internshipList.length} internships`);

    // Faculty list
    const resFaculty = await axios.get(`${API_BASE}/admin/faculty`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const facultyList = resFaculty.data.data;
    assert(Array.isArray(facultyList), `Admin A retrieved ${facultyList.length} faculty members with batch assignments`);

    // Mentors list
    const resMentors = await axios.get(`${API_BASE}/admin/mentors`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const mentorList = resMentors.data.data;
    assert(Array.isArray(mentorList), `Admin A retrieved ${mentorList.length} company mentors with assigned interns`);

    // Academic structure
    const resStruct = await axios.get(`${API_BASE}/admin/academic-structure`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
    const structList = resStruct.data.data;
    assert(Array.isArray(structList), `Admin A retrieved academic structure (${structList.length} departments)`);

    // ── 5. TENANT ISOLATION (ADMIN A vs ADMIN B) ──────────────────────────────
    console.log('\n--- 5. TESTING TENANT ISOLATION (ADMIN A vs ADMIN B) ---');

    const resStudentsB = await axios.get(`${API_BASE}/admin/students`, { headers: { Authorization: `Bearer ${tokenAdminB}` } });
    const studentListB = resStudentsB.data.data;

    const tenantAStudentIds = new Set(studentList.map(s => s.id));
    const tenantBStudentIds = new Set(studentListB.map(s => s.id));

    const overlap = studentListB.filter(s => tenantAStudentIds.has(s.id));
    assert(overlap.length === 0, 'Admin B student list contains ZERO Tenant A students');

    // Admin B attempts to access Admin A student detail
    try {
      await axios.get(`${API_BASE}/admin/students/${studentA.id}`, { headers: { Authorization: `Bearer ${tokenAdminB}` } });
      assert(false, 'Admin B should be blocked from accessing Admin A student detail');
    } catch (err) {
      assert(err.response && err.response.status === 404, 'Admin B cross-tenant student detail access rejected with HTTP 404 Not Found');
    }

    // ── 6. INPUT SECURITY & PARAMETER OVERRIDE REJECTION ──────────────────────
    console.log('\n--- 6. TESTING INPUT SECURITY & PARAMETER OVERRIDE REJECTIONS ---');

    // Admin A sends tenant_id=TENANT_B_ID in query string (Phase 1H hardening explicitly rejects with 400)
    try {
      const resOverride = await axios.get(`${API_BASE}/admin/students?tenant_id=${TENANT_B_ID}`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
      const overrideList = resOverride.data.data;
      const hasTenantBStudent = overrideList.some(s => tenantBStudentIds.has(s.id));
      assert(!hasTenantBStudent, 'Frontend-supplied tenant_id parameter override attempt ignored; returns Tenant A data only');
    } catch (err) {
      assert(err.response && (err.response.status === 400 || err.response.status === 403), 'Frontend-supplied tenant_id parameter override attempt rejected with HTTP 400 Bad Request');
    }


    // Student sends role=ADMIN in query string
    try {
      await axios.get(`${API_BASE}/admin/overview?role=ADMIN`, { headers: { Authorization: `Bearer ${tokenStudent}` } });
      assert(false, 'Student with role=ADMIN query param should be rejected');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'Frontend-supplied role parameter privilege escalation attempt rejected with HTTP 403');
    }

    // Invalid UUID
    try {
      await axios.get(`${API_BASE}/admin/students/invalid-uuid-format`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
      assert(false, 'Invalid studentId UUID should be rejected');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Invalid studentId UUID parameter rejected with HTTP 400 Bad Request');
    }

    // Invalid Page
    try {
      await axios.get(`${API_BASE}/admin/students?page=-1`, { headers: { Authorization: `Bearer ${tokenAdminA}` } });
      assert(false, 'Invalid page number should be rejected');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'Invalid pagination bound rejected with HTTP 400 Bad Request');
    }

    // ── 7. DIRECT POSTGREST RLS BYPASS & DERIVED HOURS ───────────────────────
    console.log('\n--- 7. TESTING DIRECT RLS BYPASS & DERIVED HOURS ACCURACY ---');

    // Create user-context client for Admin A
    const userClientAdminA = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${tokenAdminA}` } }
    });

    const { data: rlsBypassData } = await userClientAdminA
      .from('student_profiles')
      .select('id, student_id_number, tenant_membership_id')
      .in('tenant_membership_id', Array.from(tenantBStudentIds));

    assert(!rlsBypassData || rlsBypassData.length === 0, 'Direct PostgREST read attempt on Tenant B student profiles blocked by RLS policy');

    // Verify derived hours match database SQL view
    if (internshipList.length > 0) {
      const sampleInt = internshipList[0];
      const { rows: [sqlHours] } = await pgClient.query(
        `SELECT COALESCE(approved_hours, 0) as app_hrs, COALESCE(logged_hours, 0) as log_hrs FROM internship_hours_summary WHERE internship_id = $1`,
        [sampleInt.id]
      );
      const expectedApp = sqlHours ? parseFloat(sqlHours.app_hrs) : 0;
      const expectedLog = sqlHours ? parseFloat(sqlHours.log_hrs) : 0;

      assert(
        sampleInt.approved_hours === expectedApp && sampleInt.logged_hours === expectedLog,
        `Derived approved (${sampleInt.approved_hours}h) and logged (${sampleInt.logged_hours}h) hours match database internship_hours_summary view`
      );
    } else {
      assert(true, 'Skipped derived hours check (no internships present)');
    }

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
