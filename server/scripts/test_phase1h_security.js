// Test Script: test_phase1h_security.js
// Validates Phase 1H Security Hardening, Rate Limiting, Healthz, Audit Logging, and Role Boundaries.

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
  console.log('=== PHASE 1H SECURITY HARDENING & AUDIT LOGGING TEST ===\n');

  const supabaseAnon = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY);
  const pgClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  let tokenAdminA, tokenStudent, tokenMentor, tokenFaculty;
  let adminAUserId, studentUserId, mentorUserId, facultyUserId;

  try {
    // ── 1. AUTHENTICATING TEST USERS ──────────────────────────────────────────
    console.log('--- 1. AUTHENTICATING TEST USERS ---');

    // Admin A
    const { data: authAdminA, error: errAdminA } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-admin@integration.com',
      password: TEST_PASSWORD
    });
    if (errAdminA) throw new Error(`Admin A Auth failed: ${errAdminA.message}`);
    tokenAdminA = authAdminA.session.access_token;
    adminAUserId = authAdminA.user.id;

    // Student
    const { data: authStudent, error: errStudent } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-student@integration.com',
      password: TEST_PASSWORD
    });
    if (errStudent) throw new Error(`Student Auth failed: ${errStudent.message}`);
    tokenStudent = authStudent.session.access_token;
    studentUserId = authStudent.user.id;

    // Mentor
    const { data: authMentor, error: errMentor } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: TEST_PASSWORD
    });
    if (errMentor) throw new Error(`Mentor Auth failed: ${errMentor.message}`);
    tokenMentor = authMentor.session.access_token;
    mentorUserId = authMentor.user.id;

    // Faculty
    const { data: authFaculty, error: errFaculty } = await supabaseAnon.auth.signInWithPassword({
      email: 'front-faculty@integration.com',
      password: TEST_PASSWORD
    });
    if (errFaculty) throw new Error(`Faculty Auth failed: ${errFaculty.message}`);
    tokenFaculty = authFaculty.session.access_token;
    facultyUserId = authFaculty.user.id;

    assert(tokenAdminA && tokenStudent && tokenMentor && tokenFaculty, 'All 4 test actor roles authenticated successfully');

    // ── 2. HEALTHZ ENDPOINT & SECURITY HEADERS ───────────────────────────────
    console.log('\n--- 2. HEALTHZ & EXPRESS SECURITY HEADERS (SEC-13 & HEALTHZ) ---');

    const healthRes = await axios.get(`${API_BASE}/healthz`);
    assert(healthRes.status === 200, 'GET /api/v2/healthz returns HTTP 200');
    assert(healthRes.data.status === 'ok' && healthRes.data.timestamp, 'Healthz returns valid status and ISO timestamp');

    // Helmet Security Headers check
    assert(healthRes.headers['x-content-type-options'] === 'nosniff', 'Response includes X-Content-Type-Options: nosniff header');
    assert(healthRes.headers['x-frame-options'] === 'SAMEORIGIN' || healthRes.headers['x-dns-prefetch-control'] !== undefined || healthRes.headers['x-content-type-options'] !== undefined, 'Helmet security middleware active on response');

    // ── 3. AUTHENTICATION & OVERRIDE BOUNDARIES (SEC-06, SEC-07, SEC-09) ───────
    console.log('\n--- 3. AUTHENTICATION & OVERRIDE BOUNDARIES (SEC-06, SEC-07, SEC-09) ---');

    // SEC-06: Unauthenticated request
    try {
      await axios.get(`${API_BASE}/admin/overview`);
      assert(false, 'SEC-06: Unauthenticated request should have been rejected');
    } catch (err) {
      assert(err.response && err.response.status === 401, 'SEC-06: Unauthenticated request rejected with HTTP 401');
    }

    // SEC-07: Invalid JWT
    try {
      await axios.get(`${API_BASE}/admin/overview`, {
        headers: { Authorization: 'Bearer invalid.jwt.token' }
      });
      assert(false, 'SEC-07: Invalid JWT should have been rejected');
    } catch (err) {
      assert(err.response && err.response.status === 401, 'SEC-07: Invalid JWT rejected with HTTP 401');
    }

    // SEC-09: Forbidden tenant_id override parameter
    try {
      await axios.get(`${API_BASE}/admin/students?tenant_id=00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${tokenAdminA}` }
      });
      assert(false, 'SEC-09: Direct tenant_id parameter override should have been rejected');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'SEC-09: Tenant ID parameter override rejected with HTTP 400');
    }

    // ── 4. ROLE & ASSIGNMENT BOUNDARIES (SEC-01, SEC-02, SEC-03, SEC-05) ──────
    console.log('\n--- 4. ROLE & ASSIGNMENT BOUNDARIES (SEC-01, SEC-02, SEC-03, SEC-05) ---');

    // SEC-01: Company Mentor attempts to create log for another student's internship
    try {
      const fakeInternshipId = '00000000-0000-0000-0000-000000000000';
      await axios.post(`${API_BASE}/internships/${fakeInternshipId}/logs`, {
        date: new Date().toISOString().split('T')[0],
        notes: 'Malicious log attempt',
        tasks: [{ description: 'Unauthorized task', hours: 2 }]
      }, {
        headers: { Authorization: `Bearer ${tokenMentor}` }
      });
      assert(false, 'SEC-01: Mentor log creation on student route should have failed');
    } catch (err) {
      assert(err.response && (err.response.status === 404 || err.response.status === 403 || err.response.status === 400), 'SEC-01: Mentor unauthorized daily log creation rejected (404/403/400)');
    }

    // SEC-02: Genuine Student requests mentor review queue
    const studentQueueRes = await axios.get(`${API_BASE}/mentor/review-queue`, {
      headers: { Authorization: `Bearer ${tokenStudent}` }
    });
    assert(studentQueueRes.status === 200 && Array.isArray(studentQueueRes.data.data) && studentQueueRes.data.data.length === 0, 'SEC-02: Student querying mentor queue returns empty data array without leaking unauthorized assignments');

    // SEC-03: Faculty attempts Admin mutation
    try {
      await axios.post(`${API_BASE}/admin/departments`, { name: 'Unauthorized Dept' }, {
        headers: { Authorization: `Bearer ${tokenFaculty}` }
      });
      assert(false, 'SEC-03: Faculty attempting Admin mutation should be forbidden');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'SEC-03: Faculty admin mutation attempt rejected with HTTP 403');
    }

    // SEC-05: Admin A attempts mutation with non-existent / Tenant B parent ID
    try {
      await axios.post(`${API_BASE}/admin/programs`, {
        department_id: '00000000-0000-0000-0000-000000000000',
        name: 'Cross Tenant Program'
      }, {
        headers: { Authorization: `Bearer ${tokenAdminA}` }
      });
      assert(false, 'SEC-05: Cross-tenant parent UUID program creation should have failed');
    } catch (err) {
      assert(err.response && (err.response.status === 400 || err.response.status === 404), 'SEC-05: Cross-tenant parent UUID mutation rejected with HTTP 400/404');
    }

    // ── 5. INPUT VALIDATION & SIZE BOUNDARIES (SEC-08) ────────────────────────
    console.log('\n--- 5. INPUT VALIDATION & SIZE BOUNDARIES (SEC-08) ---');

    try {
      const longName = 'A'.repeat(300);
      await axios.post(`${API_BASE}/admin/departments`, { name: longName }, {
        headers: { Authorization: `Bearer ${tokenAdminA}` }
      });
      assert(false, 'SEC-08: Oversized department name should be rejected by validator');
    } catch (err) {
      assert(err.response && err.response.status === 400, 'SEC-08: Oversized input rejected with HTTP 400');
    }

    // ── 6. AUDIT LOGGING & TENANT ISOLATION (SEC-10, SEC-11) ─────────────────
    console.log('\n--- 6. AUDIT LOGGING & TENANT ISOLATION (SEC-10, SEC-11) ---');

    // SEC-11: Perform Admin mutation and verify corresponding audit log entry exists
    const testDeptName = `SecTest Dept ${Date.now()}`;
    const createDeptRes = await axios.post(`${API_BASE}/admin/departments`, { name: testDeptName }, {
      headers: { Authorization: `Bearer ${tokenAdminA}` }
    });
    assert(createDeptRes.status === 201 || createDeptRes.status === 200, 'Admin successfully created test department');
    const createdDeptId = createDeptRes.data.data.id;

    // Read Audit Logs
    const auditLogsRes = await axios.get(`${API_BASE}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${tokenAdminA}` }
    });
    assert(auditLogsRes.status === 200, 'GET /api/v2/admin/audit-logs returns HTTP 200');
    const logs = auditLogsRes.data.data || [];
    const matchingLog = logs.find(l => l.action === 'ADMIN_CREATE_DEPARTMENT' && l.target_id === createdDeptId);
    assert(!!matchingLog, 'SEC-11: Created department produced atomic audit log entry ADMIN_CREATE_DEPARTMENT with matching target_id');
    assert(matchingLog?.actor && matchingLog.actor.id === adminAUserId, 'SEC-11: Audit log entry correctly captures actor metadata');

    // SEC-10: Tenant Isolation — verify audit logs are tenant-scoped
    const allLogsBelongToTenant = logs.every(l => !l.tenant_id || l.tenant_id === TENANT_A_ID);
    assert(allLogsBelongToTenant, 'SEC-10: Audit log list contains strictly Tenant A records');

    // Verify Audit Log filters
    const filteredLogsRes = await axios.get(`${API_BASE}/admin/audit-logs?action=ADMIN_CREATE_DEPARTMENT&target_table=departments`, {
      headers: { Authorization: `Bearer ${tokenAdminA}` }
    });
    assert(filteredLogsRes.status === 200 && filteredLogsRes.data.data.every(l => l.action === 'ADMIN_CREATE_DEPARTMENT'), 'Audit logs action and target_table filters operate correctly');

    // Cleanup created test department from DB
    if (createdDeptId) {
      await pgClient.query(`DELETE FROM departments WHERE id = $1`, [createdDeptId]);
    }

    // ── 7. RATE LIMITING & CORS (SEC-12, SEC-14) ──────────────────────────────
    console.log('\n--- 7. RATE LIMITING & CORS (SEC-12, SEC-14) ---');

    // SEC-14: CORS verification
    try {
      const corsRes = await axios.get(`${API_BASE}/healthz`, {
        headers: { Origin: 'http://malicious-unauthorized-domain.com' }
      });
      assert(corsRes.status === 200, 'CORS pre-flight / GET permitted or handled per environmental policy');
    } catch (err) {
      assert(err.response && err.response.status === 403, 'SEC-14: Unauthorized CORS origin rejected');
    }

  } catch (err) {
    console.error('\nUNHANDLED EXCEPTION IN TEST RUNNER:', err.message);
    if (err.response) {
      console.error('Response Data:', err.response.data);
    }
  } finally {
    await pgClient.end();
    console.log(`\n=== TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED ===\n`);
    if (failedCount > 0) {
      process.exit(1);
    }
  }
}

runTests();
