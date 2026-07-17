// Phase 1E.1A Test Suite
// Runs two separate test matrices:
//
// MATRIX A — API Functional Tests
//   Authentication, validation, pagination, status filters, forbidden parameters,
//   response shape, hours summary, 404 behavior.
//   Uses LOCAL_JWT_DEV_MODE with V2_LOCAL_JWT_SECRET tokens.
//   Auth mode: LOCAL_JWT_DEV_MODE
//
// MATRIX B — Actual PostgreSQL RLS Enforcement Tests
//   Uses the non-superuser internship_rls_test_user role (NOBYPASSRLS, NOSUPERUSER).
//   Queries internships table WITHOUT any WHERE-clause mirrors.
//   PostgreSQL itself must filter rows via RLS policies.
//   Covers: Student A/B isolation, Admin tenant scope, cross-tenant denial, anon denial.
//   Uses disposable test fixtures for Tenant A and Tenant B.
//   Auth mode: LOCAL PostgreSQL SET request.jwt.claim.sub (non-superuser role)
//
// REAL SUPABASE AUTH TEST: PENDING — required before production cutover.

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5003}`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const ADMIN_DB_URL = process.env.DATABASE_URL;       // postgres superuser (for fixtures)
const RLS_TEST_DB_URL = process.env.RLS_TEST_DB_URL; // internship_rls_test_user (NOBYPASSRLS)

if (!V2_SECRET) { console.error('V2_LOCAL_JWT_SECRET not set'); process.exit(1); }
if (!RLS_TEST_DB_URL) { console.error('RLS_TEST_DB_URL not set'); process.exit(1); }

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeV2Token = (userId, email = 'test@test.com') =>
  jwt.sign({ sub: userId, email }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const makeLegacyToken = (userId, email = 'test@test.com') =>
  jwt.sign({ id: userId, email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const api = (token) => axios.create({
  baseURL: BASE_URL,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
});

let matrixA = [], matrixB = [];
let aPassed = 0, aFailed = 0, bPassed = 0, bFailed = 0;

const testA = (id, name, ok, extra = '') => {
  if (ok) aPassed++; else aFailed++;
  matrixA.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testB = (id, name, ok, extra = '') => {
  if (ok) bPassed++; else bFailed++;
  matrixB.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] RLS-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

// ── DB Helpers ─────────────────────────────────────────────────────────────────

let adminPool, rlsPool;
let fixtures = {};  // stores created fixture IDs for cleanup

async function withRlsSession(userId, queryFn) {
  const client = await rlsPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await queryFn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Fixture Setup ───────────────────────────────────────────────────────────────

async function createFixtures() {
  const client = await adminPool.connect();
  try {
    console.log('\n[SETUP] Pre-cleanup any stale test fixtures...');
    // Delete in FK order: mentors → internships → memberships → tenants → users
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

    console.log('[SETUP] Creating disposable test fixtures for Tenant A and Tenant B...');

    // Tenant A — use ON CONFLICT UPDATE to handle any residual FK from failed runs
    const { rows: [tenantA] } = await client.query(
      `INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant A', 'test-a.example.com')
       ON CONFLICT (domain) DO UPDATE SET name=EXCLUDED.name RETURNING id`
    );
    // Tenant B
    const { rows: [tenantB] } = await client.query(
      `INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant B', 'test-b.example.com')
       ON CONFLICT (domain) DO UPDATE SET name=EXCLUDED.name RETURNING id`
    );

    // Users — idempotent upsert on email
    const mkUser = async (email, firstName) => {
      const id = crypto.randomUUID();
      // auth.users: ON CONFLICT on email returns existing id
      const { rows: [authRow] } = await client.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [id, email]
      );
      const actualId = authRow.id;
      await client.query(
        `INSERT INTO public.users (id, first_name, last_name, email) VALUES ($1, $2, 'Test', $3)
         ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name`,
        [actualId, firstName, email]
      );
      return actualId;
    };

    const studentAId = await mkUser('test-studentA@test-a.com', 'StudentA');
    const studentBId = await mkUser('test-studentB@test-a.com', 'StudentB');
    const studentCId = await mkUser('test-studentC@test-b.com', 'StudentC'); // Tenant B student
    const adminAId   = await mkUser('test-adminA@test-a.com', 'AdminA');
    const adminBId   = await mkUser('test-adminB@test-b.com', 'AdminB');
    const facultyAId = await mkUser('test-facultyA@test-a.com', 'FacultyA');
    const mentorAId  = await mkUser('test-mentorA@test-a.com', 'MentorA');

    // Memberships and roles
    const mkMembership = async (tenantId, userId, role) => {
      const { rows: [m] } = await client.query(
        `INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`,
        [tenantId, userId]
      );
      await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)`,
        [m.id, role]);
      return m.id;
    };

    const memStudentA = await mkMembership(tenantA.id, studentAId, 'STUDENT');
    const memStudentB = await mkMembership(tenantA.id, studentBId, 'STUDENT');
    const memStudentC = await mkMembership(tenantB.id, studentCId, 'STUDENT');
    await mkMembership(tenantA.id, adminAId, 'ADMIN');
    await mkMembership(tenantB.id, adminBId, 'ADMIN');
    const memFacultyA = await mkMembership(tenantA.id, facultyAId, 'FACULTY_MENTOR');
    await mkMembership(tenantA.id, mentorAId, 'STUDENT'); // Mentors are external; use STUDENT placeholder or any valid role

    // Companies
    const { rows: [companyA] } = await client.query(
      `INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company A') RETURNING id`, [tenantA.id]
    );
    const { rows: [companyB] } = await client.query(
      `INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company B') RETURNING id`, [tenantB.id]
    );

    // Internships
    const mkInternship = async (tenantId, studentId, companyId) => {
      const { rows: [i] } = await client.query(
        `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
         VALUES ($1, $2, $3, 'Test Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`,
        [tenantId, studentId, companyId]
      );
      return i.id;
    };

    const intStudentA = await mkInternship(tenantA.id, studentAId, companyA.id);
    const intStudentB = await mkInternship(tenantA.id, studentBId, companyA.id);
    const intStudentC = await mkInternship(tenantB.id, studentCId, companyB.id);

    // Batch/program/dept/faculty assignment for Faculty test
    const { rows: [dept] } = await client.query(
      `INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'Test Dept') RETURNING id`, [tenantA.id]
    );
    const { rows: [prog] } = await client.query(
      `INSERT INTO public.programs (department_id, name) VALUES ($1, 'Test Prog') RETURNING id`, [dept.id]
    );
    const { rows: [batch] } = await client.query(
      `INSERT INTO public.batches (program_id, name) VALUES ($1, 'Test Batch') RETURNING id`, [prog.id]
    );
    // Assign studentA to batch
    await client.query(
      `INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'SID-TEST-A')`,
      [memStudentA, batch.id]
    );
    // Assign faculty to batch
    await client.query(
      `INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`,
      [facultyAId, batch.id]
    );

    // Mentor assignment (mentor → studentA's internship, type COMPANY)
    await client.query(
      `INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, assigned_at)
       VALUES ($1, $2, 'COMPANY', NOW())`,
      [intStudentA, mentorAId]
    );

    fixtures = {
      tenantAId: tenantA.id, tenantBId: tenantB.id,
      studentAId, studentBId, studentCId,
      adminAId, adminBId, facultyAId, mentorAId,
      intStudentA, intStudentB, intStudentC,
      memStudentA, memStudentB
    };

    console.log('[SETUP] Fixtures created. Tenant A:', tenantA.id, '| Tenant B:', tenantB.id);
  } finally {
    client.release();
  }
}

async function cleanupFixtures() {
  const client = await adminPool.connect();
  try {
    console.log('\n[CLEANUP] Removing disposable test fixtures...');
    // Delete in reverse FK order
    if (fixtures.intStudentA) await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id=$1`, [fixtures.intStudentA]);
    await client.query(`DELETE FROM public.internships WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id=$1 OR tenant_membership_id=$2`,
      [fixtures.memStudentA||'00000000-0000-0000-0000-000000000000', fixtures.memStudentB||'00000000-0000-0000-0000-000000000000']);
    await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id=$1`, [fixtures.facultyAId]);
    await client.query(`DELETE FROM public.membership_roles WHERE membership_id IN
      (SELECT id FROM public.tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2)`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.companies WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.batches WHERE program_id IN
      (SELECT id FROM public.programs WHERE department_id IN
        (SELECT id FROM public.departments WHERE tenant_id=$1))`, [fixtures.tenantAId]);
    await client.query(`DELETE FROM public.programs WHERE department_id IN
      (SELECT id FROM public.departments WHERE tenant_id=$1)`, [fixtures.tenantAId]);
    await client.query(`DELETE FROM public.departments WHERE tenant_id=$1`, [fixtures.tenantAId]);
    await client.query(`DELETE FROM public.tenants WHERE id=$1 OR id=$2`, [fixtures.tenantAId, fixtures.tenantBId]);
    // Remove test users from both auth.users and public.users
    const testUserIds = [fixtures.studentAId, fixtures.studentBId, fixtures.studentCId,
      fixtures.adminAId, fixtures.adminBId, fixtures.facultyAId, fixtures.mentorAId].filter(Boolean);
    for (const uid of testUserIds) {
      await client.query(`DELETE FROM public.users WHERE id=$1`, [uid]);
      await client.query(`DELETE FROM auth.users WHERE id=$1`, [uid]);
    }
    console.log('[CLEANUP] Fixtures removed successfully.');
  } finally {
    client.release();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MATRIX A — API FUNCTIONAL TESTS
// ════════════════════════════════════════════════════════════════════════════

async function runMatrixA() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX A — API FUNCTIONAL TESTS (Auth: LOCAL_JWT_DEV_MODE)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Fetch real migrated student for hours test
  const { rows: migrants } = await adminPool.query(
    `SELECT u.id, u.email, i.id AS internship_id
     FROM users u JOIN internships i ON u.id=i.student_id
     WHERE u.email='avdhoot13@gmail.com' LIMIT 1`
  );
  const migrant = migrants[0];
  const tokenMigrant = migrant ? makeV2Token(migrant.id, migrant.email) : null;

  // ── Authentication tests ──
  const r001 = await api(null).get('/api/v2/internships');
  testA('A-001', 'No token → 401', r001.status === 401, `got ${r001.status}`);

  const r002 = await api(null).get(`/api/v2/internships/${crypto.randomUUID()}`);
  testA('A-002', 'No token on detail → 401', r002.status === 401, `got ${r002.status}`);

  // Legacy JWT must NOT authorize /api/v2 (different secret)
  const legacyTok = migrant ? makeLegacyToken(migrant.id, migrant.email) : 'x.y.z';
  const r003 = await api(legacyTok).get('/api/v2/internships');
  testA('A-003', 'Legacy JWT rejected on /api/v2 → 401', r003.status === 401, `got ${r003.status}`);

  // Expired token (short ttl)
  const expiredTok = jwt.sign({ sub: crypto.randomUUID(), email: 'x@x.com' }, V2_SECRET, { algorithm: 'HS256', expiresIn: '-1s' });
  const r004 = await api(expiredTok).get('/api/v2/internships');
  testA('A-004', 'Expired token → 401', r004.status === 401, `got ${r004.status}`);

  // Token signed with wrong secret (correct algorithm, wrong secret → invalid signature)
  const badAlgoTok = jwt.sign({ sub: crypto.randomUUID(), email: 'x@x.com' }, 'wrong-secret', { algorithm: 'HS256', expiresIn: '1h' });
  const r005 = await api(badAlgoTok).get('/api/v2/internships');
  testA('A-005', 'Wrong secret → 401', r005.status === 401, `got ${r005.status}`);

  // Token with non-UUID sub
  const badSubTok = jwt.sign({ sub: 'not-a-uuid', email: 'x@x.com' }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  const r006 = await api(badSubTok).get('/api/v2/internships');
  testA('A-006', 'Non-UUID subject → 401', r006.status === 401, `got ${r006.status}`);

  // Token with missing sub
  const noSubTok = jwt.sign({ email: 'x@x.com' }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  const r007 = await api(noSubTok).get('/api/v2/internships');
  testA('A-007', 'Missing sub claim → 401', r007.status === 401, `got ${r007.status}`);

  // ── UUID validation ──
  if (migrant) {
    const validTok = makeV2Token(migrant.id, migrant.email);
    const r010 = await api(validTok).get('/api/v2/internships/not-a-valid-uuid');
    testA('A-010', 'Malformed UUID → 400', r010.status === 400, `got ${r010.status}`);

    // ── Forbidden query parameters ──
    const r011 = await api(validTok).get('/api/v2/internships?user_id=x');
    testA('A-011', 'Forbidden ?user_id → 400', r011.status === 400, `got ${r011.status}`);
    const r012 = await api(validTok).get('/api/v2/internships?tenant_id=x');
    testA('A-012', 'Forbidden ?tenant_id → 400', r012.status === 400, `got ${r012.status}`);
    const r013 = await api(validTok).get('/api/v2/internships?role=ADMIN');
    testA('A-013', 'Forbidden ?role → 400', r013.status === 400, `got ${r013.status}`);
    const r014 = await api(validTok).get('/api/v2/internships?student_id=x');
    testA('A-014', 'Forbidden ?student_id → 400', r014.status === 400, `got ${r014.status}`);

    // ── Pagination validation ──
    const r020 = await api(validTok).get('/api/v2/internships?limit=999');
    testA('A-020', 'Limit > 100 → 400', r020.status === 400, `got ${r020.status}`);
    const r021 = await api(validTok).get('/api/v2/internships?page=0');
    testA('A-021', 'page=0 → 400', r021.status === 400, `got ${r021.status}`);

    // ── Status filter ──
    const r022 = await api(validTok).get('/api/v2/internships?status=INVALID');
    testA('A-022', 'Invalid status → 400', r022.status === 400, `got ${r022.status}`);
    const r023 = await api(validTok).get('/api/v2/internships?status=ACTIVE');
    testA('A-023', 'Valid status=ACTIVE → 200', r023.status === 200, `got ${r023.status}`);

    // ── Response shape ──
    const rList = await api(validTok).get('/api/v2/internships');
    const hasPagination = rList.data?.pagination &&
      typeof rList.data.pagination.page === 'number' &&
      typeof rList.data.pagination.total === 'number';
    testA('A-030', 'List response has correct pagination contract', rList.status === 200 && hasPagination,
      `page=${rList.data?.pagination?.page}`);

    const rDetail = await api(validTok).get(`/api/v2/internships/${migrant.internship_id}`);
    const hasHours = rDetail.data?.data?.hours_summary &&
      typeof rDetail.data.data.hours_summary.logged_hours === 'number' &&
      typeof rDetail.data.data.hours_summary.approved_hours === 'number';
    testA('A-031', 'Detail response includes hours_summary', rDetail.status === 200 && hasHours, `hasHours=${hasHours}`);

    // ── No migration metadata leakage ──
    const noLeak = rDetail.data?.data && !rDetail.data.data.legacy_id && !rDetail.data.data.migration_id;
    testA('A-032', 'No migration metadata in detail response', noLeak, '');

    // ── Hours match migrated values ──
    testA('A-033', 'Hours values are non-negative numbers',
      rDetail.status === 200 && rDetail.data.data.hours_summary.approved_hours >= 0,
      `approved=${rDetail.data?.data?.hours_summary?.approved_hours}`);
  } else {
    console.log('[SKIP] A-010 through A-033: No migrated student found');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MATRIX B — ACTUAL POSTGRESQL RLS ENFORCEMENT (non-superuser, no WHERE mirrors)
// ════════════════════════════════════════════════════════════════════════════

async function runMatrixB() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX B — ACTUAL POSTGRESQL RLS ENFORCEMENT');
  console.log('Role: internship_rls_test_user (NOBYPASSRLS, NOSUPERUSER)');
  console.log('Query: SELECT id FROM internships (no WHERE clause mirrors)');
  console.log('RLS policy enforces all row filtering.');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Simple query — no WHERE clause mirrors. RLS does all filtering.
  const getInternships = async (userId) => withRlsSession(userId, async (client) => {
    const { rows } = await client.query(`SELECT id FROM public.internships`);
    return rows.map(r => r.id);
  });

  const { intStudentA, intStudentB, intStudentC,
          studentAId, studentBId, studentCId,
          adminAId, adminBId, facultyAId, mentorAId } = fixtures;

  // B-001: Student A sees own internship
  const aSees = await getInternships(studentAId);
  testB('001', 'Student A sees own internship', aSees.includes(intStudentA),
    `visible: ${aSees.length} rows, includes own: ${aSees.includes(intStudentA)}`);

  // B-002: Student A cannot see Student B's internship
  testB('002', 'Student A cannot see Student B internship', !aSees.includes(intStudentB),
    `includes B: ${aSees.includes(intStudentB)}`);

  // B-003: Student A cannot see cross-tenant (Tenant B) internship
  testB('003', 'Student A cannot see Tenant B internship', !aSees.includes(intStudentC),
    `includes C: ${aSees.includes(intStudentC)}`);

  // B-004: Student B sees own internship only
  const bSees = await getInternships(studentBId);
  testB('004', 'Student B sees own internship only', bSees.includes(intStudentB) && !bSees.includes(intStudentA),
    `owns B: ${bSees.includes(intStudentB)}, sees A: ${bSees.includes(intStudentA)}`);

  // B-005: Admin A sees Tenant A internships
  const adminASees = await getInternships(adminAId);
  testB('005', 'Admin A sees Tenant A internships (A and B)',
    adminASees.includes(intStudentA) && adminASees.includes(intStudentB),
    `includes A: ${adminASees.includes(intStudentA)}, B: ${adminASees.includes(intStudentB)}`);

  // B-006: Admin A cannot see Tenant B internship (cross-tenant isolation)
  testB('006', 'Admin A cannot see Tenant B internship (cross-tenant isolation)',
    !adminASees.includes(intStudentC),
    `includes C (TenantB): ${adminASees.includes(intStudentC)}`);

  // B-007: Admin B sees Tenant B internship only
  const adminBSees = await getInternships(adminBId);
  testB('007', 'Admin B sees only Tenant B internship',
    adminBSees.includes(intStudentC) && !adminBSees.includes(intStudentA),
    `includes C: ${adminBSees.includes(intStudentC)}, includes A: ${adminBSees.includes(intStudentA)}`);

  // B-008: Assigned Faculty A sees Student A's internship (via batch assignment)
  const facultySees = await getInternships(facultyAId);
  testB('008', 'Assigned Faculty A can see Student A internship (batch-linked)',
    facultySees.includes(intStudentA),
    `includes A: ${facultySees.includes(intStudentA)}, rows: ${facultySees.length}`);

  // B-009: Faculty A cannot see Student B internship (not in assigned batch)
  testB('009', 'Faculty A cannot see Student B internship (not in batch)',
    !facultySees.includes(intStudentB),
    `includes B: ${facultySees.includes(intStudentB)}`);

  // B-010: Assigned Mentor A sees Student A's internship
  const mentorSees = await getInternships(mentorAId);
  testB('010', 'Assigned Mentor A can see Student A internship',
    mentorSees.includes(intStudentA),
    `includes A: ${mentorSees.includes(intStudentA)}`);

  // B-011: Mentor A cannot see Student B's internship (not assigned)
  testB('011', 'Mentor A cannot see unassigned Student B internship',
    !mentorSees.includes(intStudentB),
    `includes B: ${mentorSees.includes(intStudentB)}`);

  // B-012: Mentor A cannot see Tenant B internship
  testB('012', 'Mentor A cannot see Tenant B internship (cross-tenant)',
    !mentorSees.includes(intStudentC),
    `includes C: ${mentorSees.includes(intStudentC)}`);

  // B-013: Anonymous / unrecognized user sees nothing
  const anonId = crypto.randomUUID(); // UUID that has no memberships
  const anonSees = await getInternships(anonId);
  testB('013', 'Anonymous user (no memberships) sees no internships',
    anonSees.length === 0,
    `visible rows: ${anonSees.length}`);
}

// ════════════════════════════════════════════════════════════════════════════
// ROLE INCONSISTENCY CHECK: shubhangi@gmail.com
// ════════════════════════════════════════════════════════════════════════════

async function checkRoleInconsistency() {
  console.log('\n[CHECK] Resolving shubhangi@gmail.com role inconsistency...');
  const { rows } = await adminPool.query(`
    SELECT u.email, mr.role, u.id
    FROM users u
    JOIN tenant_memberships tm ON u.id = tm.user_id
    JOIN membership_roles mr ON tm.id = mr.membership_id
    WHERE u.email = 'shubhangi@gmail.com'
  `);
  console.log('shubhangi@gmail.com migrated role(s):',
    rows.length > 0 ? rows.map(r => r.role).join(', ') : 'NOT FOUND');
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runAll() {
  adminPool = new Pool({ connectionString: ADMIN_DB_URL });
  rlsPool   = new Pool({ connectionString: RLS_TEST_DB_URL });

  try {
    await createFixtures();
    await runMatrixA();
    const shubhRows = await checkRoleInconsistency();
    await runMatrixB();
    await cleanupFixtures();

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`MATRIX A RESULT: ${aPassed} PASS / ${aFailed} FAIL`);
    console.log(`MATRIX B RESULT: ${bPassed} PASS / ${bFailed} FAIL`);
    console.log('════════════════════════════════════════════════════════════════');

    console.log('\nMATRIX A — API FUNCTIONAL TESTS:');
    matrixA.forEach(t => console.log(`  ${t.id.padEnd(8)} [${t.status}] ${t.name}${t.extra ? ' | ' + t.extra : ''}`));

    console.log('\nMATRIX B — ACTUAL POSTGRESQL RLS ENFORCEMENT (NOBYPASSRLS role):');
    matrixB.forEach(t => console.log(`  RLS-${t.id} [${t.status}] ${t.name}${t.extra ? ' | ' + t.extra : ''}`));

    console.log('\nROLE CHECK: shubhangi@gmail.com');
    if (shubhRows.length > 0) {
      shubhRows.forEach(r => console.log(`  Migrated as: ${r.role}`));
    } else {
      console.log('  NOT FOUND in migrated data');
    }

    console.log('\nAUTH MODES USED:');
    console.log('  Matrix A: LOCAL_JWT_DEV_MODE with V2_LOCAL_JWT_SECRET');
    console.log('  Matrix B: internship_rls_test_user (NOBYPASSRLS) via pg pool');
    console.log('\nREAL SUPABASE AUTH TEST: PENDING — required before production cutover.');
    console.log('════════════════════════════════════════════════════════════════\n');

    process.exit(aFailed + bFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test suite error:', err);
    try { await cleanupFixtures(); } catch (_) {}
    process.exit(1);
  } finally {
    await adminPool.end();
    await rlsPool.end();
  }
}

runAll();
