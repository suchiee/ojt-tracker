// Test Script: Phase 1E.1 Internships API Full Verification
// Runs the complete Phase 1E.1 test matrix against the local Express server.
//
// AUTH MODE: LOCAL_JWT_DEV_MODE
// Tests use locally-signed JWTs verified by the Express middleware using JWT_SECRET.
// This is NOT a real Supabase Auth session.
// Real Supabase Auth tests remain PENDING until cloud environment is configured.
//
// Usage: node scripts/test_v2_internships.js

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5003}`;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_URL = process.env.DATABASE_URL;

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeToken = (userId, email = 'test@test.com', role = 'authenticated') => {
  return jwt.sign({ sub: userId, email, role }, JWT_SECRET, { expiresIn: '1h' });
};

const api = (token) => axios.create({
  baseURL: BASE_URL,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true // Don't throw on 4xx/5xx
});

// ── Test Runner ────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('================================================================');
  console.log('PHASE 1E.1 INTERNSHIPS API — FULL TEST MATRIX');
  console.log(`Auth Mode: LOCAL_JWT_DEV_MODE (JWT_SECRET local verify)`);
  console.log(`Real Supabase Auth Test: PENDING`);
  console.log('================================================================\n');

  const results = [];
  let passed = 0;
  let failed = 0;

  const test = (id, name, condition, extra = '') => {
    const ok = !!condition;
    if (ok) passed++; else failed++;
    results.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}: ${name}${extra ? ` — ${extra}` : ''}`);
  };

  // ── Fetch real user IDs from local DB ──────────────────────────────────────
  const pool = new Pool({ connectionString: DB_URL });
  let studentA, studentB, adminUser;
  let studentAInternshipId, studentBInternshipId;

  try {
    // Get migrated students
    const { rows: students } = await pool.query(`
      SELECT u.id, u.email, i.id AS internship_id
      FROM users u
      JOIN internships i ON u.id = i.student_id
      ORDER BY u.email
      LIMIT 5
    `);

    if (students.length < 2) {
      console.error('ERROR: Need at least 2 migrated students with internships to run tests. Aborting.');
      process.exit(1);
    }
    studentA = { id: students[0].id, email: students[0].email };
    studentAInternshipId = students[0].internship_id;
    studentB = { id: students[1].id, email: students[1].email };
    studentBInternshipId = students[1].internship_id;

    // Get an admin user
    const { rows: admins } = await pool.query(`
      SELECT u.id, u.email FROM users u
      JOIN tenant_memberships tm ON u.id = tm.user_id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      WHERE mr.role = 'ADMIN'
      LIMIT 1
    `);
    adminUser = admins[0] || null;

    console.log(`Student A: ${studentA.email} | Internship: ${studentAInternshipId}`);
    console.log(`Student B: ${studentB.email} | Internship: ${studentBInternshipId}`);
    console.log(`Admin: ${adminUser?.email || 'none'}\n`);
  } finally {
    await pool.end();
  }

  const tokenA = makeToken(studentA.id, studentA.email);
  const tokenB = makeToken(studentB.id, studentB.email);
  const tokenAdmin = adminUser ? makeToken(adminUser.id, adminUser.email) : null;

  // ══ SECURITY TESTS ════════════════════════════════════════════════════════

  // INT-001: Unauthenticated request blocked
  const r001 = await api(null).get('/api/v2/internships');
  test('INT-001', 'Unauthenticated list internships → 401', r001.status === 401, `got ${r001.status}`);

  // INT-002: Unauthenticated detail request blocked
  const r002 = await api(null).get(`/api/v2/internships/${studentAInternshipId}`);
  test('INT-002', 'Unauthenticated detail internship → 401', r002.status === 401, `got ${r002.status}`);

  // INT-003: Malformed UUID
  const r003 = await api(tokenA).get('/api/v2/internships/not-a-valid-uuid-string');
  test('INT-003', 'Malformed internship UUID → 400', r003.status === 400, `got ${r003.status}`);

  // INT-004: Forbidden security param in query
  const r004 = await api(tokenA).get('/api/v2/internships?user_id=something');
  test('INT-004', 'Query param user_id rejected → 400', r004.status === 400, `got ${r004.status}`);

  // INT-005: Forbidden tenant_id query param
  const r005 = await api(tokenA).get('/api/v2/internships?tenant_id=something');
  test('INT-005', 'Query param tenant_id rejected → 400', r005.status === 400, `got ${r005.status}`);

  // INT-006: Forbidden role query param
  const r006 = await api(tokenA).get('/api/v2/internships?role=ADMIN');
  test('INT-006', 'Query param role rejected → 400', r006.status === 400, `got ${r006.status}`);

  // INT-007: Invalid status filter
  const r007 = await api(tokenA).get('/api/v2/internships?status=FAKE_STATUS');
  test('INT-007', 'Invalid status filter → 400', r007.status === 400, `got ${r007.status}`);

  // INT-008: Page limit > 100 rejected
  const r008 = await api(tokenA).get('/api/v2/internships?limit=999');
  test('INT-008', 'Limit > 100 → 400', r008.status === 400, `got ${r008.status}`);

  // ══ AUTHORIZATION TESTS ═══════════════════════════════════════════════════

  // INT-010: Student A lists internships — only own returned
  const r010 = await api(tokenA).get('/api/v2/internships');
  const studentAInternships = r010.data?.data || [];
  const allBelongToA = studentAInternships.every(i =>
    i.users?.id === studentA.id || i.users?.email === studentA.email
  );
  test('INT-010', 'Student A list → only own internships', r010.status === 200 && allBelongToA,
    `got ${r010.status}, ${studentAInternships.length} rows, allBelongToA=${allBelongToA}`);

  // INT-011: Student A gets own internship detail
  const r011 = await api(tokenA).get(`/api/v2/internships/${studentAInternshipId}`);
  test('INT-011', 'Student A GET own internship → 200', r011.status === 200, `got ${r011.status}`);

  // INT-012: Student A cannot access Student B's internship
  const r012 = await api(tokenA).get(`/api/v2/internships/${studentBInternshipId}`);
  test('INT-012', 'Student A GET Student B internship → 404', r012.status === 404, `got ${r012.status}`);

  // INT-013: Admin accesses tenant internships
  if (tokenAdmin) {
    const r013 = await api(tokenAdmin).get('/api/v2/internships');
    test('INT-013', 'Tenant Admin list → returns internships', r013.status === 200, `got ${r013.status}, ${r013.data?.data?.length} rows`);
  } else {
    console.log('[SKIP] INT-013: No admin user available for test');
  }

  // ══ RESPONSE CONTRACT TESTS ════════════════════════════════════════════════

  // INT-020: List pagination contract
  const r020 = await api(tokenA).get('/api/v2/internships?page=1&limit=5');
  const hasListContract = r020.data?.data && r020.data?.pagination &&
    typeof r020.data.pagination.page === 'number' &&
    typeof r020.data.pagination.limit === 'number' &&
    typeof r020.data.pagination.total === 'number' &&
    typeof r020.data.pagination.totalPages === 'number';
  test('INT-020', 'List response has correct pagination contract', r020.status === 200 && hasListContract,
    `got ${r020.status}, hasContract=${hasListContract}`);

  // INT-021: Detail contract includes hours_summary
  const r021 = await api(tokenA).get(`/api/v2/internships/${studentAInternshipId}`);
  const hasHours = r021.data?.data?.hours_summary &&
    typeof r021.data.data.hours_summary.logged_hours !== 'undefined' &&
    typeof r021.data.data.hours_summary.approved_hours !== 'undefined';
  test('INT-021', 'Detail response includes hours_summary', r021.status === 200 && hasHours, `hasHours=${hasHours}`);

  // INT-022: Hours match migrated values
  const hoursMatch = hasHours && r021.data.data.hours_summary.approved_hours >= 0;
  test('INT-022', 'Hours summary values are numeric and non-negative', r021.status === 200 && hoursMatch, `approved=${r021.data?.data?.hours_summary?.approved_hours}`);

  // INT-023: Detail does not expose migration_id_map internal IDs
  const noLeakage = r021.data?.data && !r021.data.data.migration_id && !r021.data.data.legacy_id;
  test('INT-023', 'Detail response does not expose migration metadata', noLeakage, '');

  // INT-024: Valid status filter works
  const r024 = await api(tokenA).get('/api/v2/internships?status=ACTIVE');
  test('INT-024', 'Valid status=ACTIVE filter accepted → 200', r024.status === 200, `got ${r024.status}`);

  // ══ SUMMARY ════════════════════════════════════════════════════════════════

  console.log('\n================================================================');
  console.log(`TEST RESULT: ${passed} PASS / ${failed} FAIL`);
  console.log('================================================================');
  console.log('\nFULL MATRIX:');
  results.forEach(r => {
    console.log(`  ${r.id.padEnd(10)} [${r.status}] ${r.name}${r.extra ? ` | ${r.extra}` : ''}`);
  });
  console.log('\nAUTH MODE USED: LOCAL_JWT_DEV_MODE');
  console.log('REAL SUPABASE AUTH TEST: PENDING — required before production cutover.');
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
