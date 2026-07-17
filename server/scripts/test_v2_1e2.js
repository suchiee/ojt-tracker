// Phase 1E.2 Comprehensive Test Suite
// Runs API functional tests, direct RLS write tests, RPC RLS tests,
// hours summary verification, historical record protection, and concurrency tests.

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5003}`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const ADMIN_DB_URL = process.env.DATABASE_URL;       // superuser
const RLS_TEST_DB_URL = process.env.RLS_TEST_DB_URL; // internship_rls_test_user (NOBYPASSRLS)

if (!V2_SECRET) { console.error('V2_LOCAL_JWT_SECRET not set'); process.exit(1); }
if (!RLS_TEST_DB_URL) { console.error('RLS_TEST_DB_URL not set'); process.exit(1); }

const makeV2Token = (userId, email = 'test@test.com') =>
  jwt.sign({ sub: userId, email }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const makeLegacyToken = (userId, email = 'test@test.com') =>
  jwt.sign({ id: userId, email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

const api = (token) => axios.create({
  baseURL: BASE_URL,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
});

let matrixA = [], matrixB = [], matrixC = [], matrixD = [], matrixE = [], matrixF = [];
let passA = 0, failA = 0, passB = 0, failB = 0, passC = 0, failC = 0, passD = 0, failD = 0, passE = 0, failE = 0, passF = 0, failF = 0;

const testA = (id, name, ok, extra = '') => {
  if (ok) passA++; else failA++;
  matrixA.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] A-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testB = (id, name, ok, extra = '') => {
  if (ok) passB++; else failB++;
  matrixB.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] RLS-Table-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testC = (id, name, ok, extra = '') => {
  if (ok) passC++; else failC++;
  matrixC.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] RLS-RPC-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testD = (id, name, ok, extra = '') => {
  if (ok) passD++; else failD++;
  matrixD.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Concurrency-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testE = (id, name, ok, extra = '') => {
  if (ok) passE++; else failE++;
  matrixE.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Hours-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testF = (id, name, ok, extra = '') => {
  if (ok) passF++; else failF++;
  matrixF.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Historical-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

let adminPool, rlsPool;
let fixtures = {};

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
    const { rows: staleTenants } = await client.query(
      `SELECT id FROM public.tenants WHERE domain IN ('test-a.example.com','test-b.example.com')`
    );
    for (const t of staleTenants) {
      await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN (SELECT user_id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1))`, [t.id]);
      await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1)`, [t.id]);
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

    console.log('[SETUP] Creating fresh fixtures...');
    const { rows: [tenantA] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant A', 'test-a.example.com') RETURNING id`);
    const { rows: [tenantB] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Test Tenant B', 'test-b.example.com') RETURNING id`);

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

    const intStudentA = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentAId, companyA.id]);
    const intStudentB = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentBId, companyA.id]);
    const intStudentC = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantB.id, studentCId, companyB.id]);
    
    // Create one DRAFT/PENDING internship to verify blocking log creations
    const intDraftStudentA = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Draft Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'DRAFT') RETURNING id`, [tenantA.id, studentAId, companyA.id]);

    const { rows: [dept] } = await client.query(`INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'Test Dept') RETURNING id`, [tenantA.id]);
    const { rows: [prog] } = await client.query(`INSERT INTO public.programs (department_id, name) VALUES ($1, 'Test Prog') RETURNING id`, [dept.id]);
    const { rows: [batch] } = await client.query(`INSERT INTO public.batches (program_id, name) VALUES ($1, 'Test Batch') RETURNING id`, [prog.id]);
    
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'SID-TEST-A')`, [memStudentA, batch.id]);
    await client.query(`INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`, [facultyAId, batch.id]);
    await client.query(`INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, assigned_at) VALUES ($1, $2, 'COMPANY', NOW())`, [intStudentA.rows[0].id, mentorAId]);

    fixtures = {
      tenantAId: tenantA.id, tenantBId: tenantB.id,
      studentAId, studentBId, studentCId,
      adminAId, adminBId, facultyAId, mentorAId,
      intStudentA: intStudentA.rows[0].id, 
      intStudentB: intStudentB.rows[0].id, 
      intStudentC: intStudentC.rows[0].id,
      intDraftStudentA: intDraftStudentA.rows[0].id,
      memStudentA, memStudentB
    };

    console.log('[SETUP] Fixtures created.');
  } finally {
    client.release();
  }
}

async function cleanupFixtures() {
  const client = await adminPool.connect();
  try {
    console.log('\n[CLEANUP] Removing test fixtures...');
    await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN ($1, $2, $3, $4)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC, fixtures.intDraftStudentA]);
    await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2, $3, $4))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC, fixtures.intDraftStudentA]);
    await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN ($1, $2, $3, $4)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC, fixtures.intDraftStudentA]);
    await client.query(`DELETE FROM public.internships WHERE id IN ($1, $2, $3, $4)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC, fixtures.intDraftStudentA]);
    await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id=$1 OR tenant_membership_id=$2`,
      [fixtures.memStudentA, fixtures.memStudentB]);
    await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id=$1`, [fixtures.facultyAId]);
    await client.query(`DELETE FROM public.membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2)`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.companies WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.batches WHERE program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1 OR tenant_id=$2))`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1 OR tenant_id=$2)`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.departments WHERE tenant_id=$1 OR tenant_id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.tenants WHERE id=$1 OR id=$2`,
      [fixtures.tenantAId, fixtures.tenantBId]);

    const testUsers = [
      fixtures.studentAId, fixtures.studentBId, fixtures.studentCId,
      fixtures.adminAId, fixtures.adminBId, fixtures.facultyAId, fixtures.mentorAId
    ];
    for (const uid of testUsers) {
      if (uid) {
        await client.query(`DELETE FROM public.users WHERE id=$1`, [uid]);
        await client.query(`DELETE FROM auth.users WHERE id=$1`, [uid]);
      }
    }
    console.log('[CLEANUP] Done.');
  } catch (err) {
    console.error('[CLEANUP] Error:', err.message);
  } finally {
    client.release();
  }
}

// ── MATRIX A — API HTTP / Validations ──────────────────────────────────────────
async function runMatrixA() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX A — API FUNCTIONAL & VALIDATOR TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA, intDraftStudentA, studentBId, intStudentB } = fixtures;
  const tokA = makeV2Token(studentAId, 'test-studentA@test-a.com');
  const tokB = makeV2Token(studentBId, 'test-studentB@test-a.com');

  // A-001: No token -> 401
  const r001 = await api(null).get(`/api/v2/internships/${intStudentA}/logs`);
  testA('001', 'No token rejection', r001.status === 401);

  // A-002: Malformed UUID path parameter -> 400
  const r002 = await api(tokA).get(`/api/v2/internships/invalid-uuid/logs`);
  testA('002', 'Malformed internship UUID path rejected', r002.status === 400);

  // A-003: Malformed log UUID path parameter -> 400
  const r003 = await api(tokA).get(`/api/v2/internships/${intStudentA}/logs/invalid-log-uuid`);
  testA('003', 'Malformed daily log UUID path rejected', r003.status === 400);

  // A-004: Forbidden query params (tenant_id) -> 400
  const r004 = await api(tokA).get(`/api/v2/internships/${intStudentA}/logs?tenant_id=foo`);
  testA('004', 'Forbidden query params rejected', r004.status === 400);

  // A-005: Create log on DRAFT internship status -> 422
  const r005 = await api(tokA).post(`/api/v2/internships/${intDraftStudentA}/logs`, {
    date: '2026-07-15',
    notes: 'Draft internship attempt',
    tasks: [{ description: 'Some task', hours: 4.5 }]
  });
  testA('005', 'Rejects daily log creation on non-ACTIVE internships', r005.status === 422, `got ${r005.status}`);

  // A-006: Invalid calendar date format (YYYY-MM-DD strict check) -> 400
  const r006 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026/07/15',
    tasks: [{ description: 'task', hours: 2.0 }]
  });
  testA('006', 'Rejects bad date format', r006.status === 400);

  // A-007: Invalid day of month (2026-02-30 calendar check) -> 400
  const r007 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-02-30',
    tasks: [{ description: 'task', hours: 2.0 }]
  });
  testA('007', 'Rejects non-existent calendar date (2026-02-30)', r007.status === 400, `got ${r007.status}`);

  // A-008: Future date rejection -> 400
  // Today is 2026-07-17 (per user timestamp). Let's use 2026-07-20 (which is in the future)
  const r008 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-20',
    tasks: [{ description: 'task', hours: 2.0 }]
  });
  testA('008', 'Rejects future date logs', r008.status === 400, `got ${r008.status}`);

  // A-009: Trimming task descriptions & rejecting empty description after trim -> 400
  const r009 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [{ description: '     ', hours: 2.0 }]
  });
  testA('009', 'Rejects empty/whitespace task descriptions', r009.status === 400);

  // A-010: Task decimal validation (> 2 decimals) -> 400
  const r010 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [{ description: 'task', hours: 1.123 }]
  });
  testA('010', 'Rejects task hours with > 2 decimal places', r010.status === 400);

  // A-011: Task hours <= 0 check -> 400
  const r011 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [{ description: 'task', hours: 0 }]
  });
  testA('011', 'Rejects task hours <= 0', r011.status === 400);

  // A-012: Task hours > 24 check -> 400
  const r012 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [{ description: 'task', hours: 24.5 }]
  });
  testA('012', 'Rejects individual task hours > 24', r012.status === 400);

  // A-013: Sum of task hours per log > 24 -> 400
  const r013 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [
      { description: 'task1', hours: 12.5 },
      { description: 'task2', hours: 12.0 }
    ]
  });
  testA('013', 'Rejects total task hours > 24 per log', r013.status === 400);

  // A-014: Body parameters confused-resource protection (trying to force status to APPROVED on create) -> 400
  const r014 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    status: 'APPROVED',
    tasks: [{ description: 'task', hours: 1.0 }]
  });
  testA('014', 'Rejects status injection in creation request body', r014.status === 400);

  // A-015: Create log successfully -> 201
  const r015 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    notes: '   My first ojt day  ', // leading/trailing spaces to test trim
    tasks: [
      { description: '  Coding a backend  ', hours: 4.5 },
      { description: 'Testing APIs', hours: 3.75 }
    ]
  });
  testA('015', 'Creates daily log with tasks (201)', r015.status === 201, `status: ${r015.status}`);
  const createdLog = r015.data?.data;
  testA('015-detail', 'Notes and tasks trimmed in response', 
    createdLog && createdLog.notes === 'My first ojt day' && createdLog.tasks[0].description === 'Coding a backend'
  );

  // A-016: Unique constraint validation (duplicate date for same internship) -> 409 Conflict
  const r016 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-15',
    tasks: [{ description: 'Duplicate day', hours: 1.0 }]
  });
  testA('016', 'Rejects duplicate date log (409 Conflict)', r016.status === 409, `got ${r016.status}`);

  // A-017: Get log detail -> 200, includes tasks, hours summary, no migration metadata
  const r017 = await api(tokA).get(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}`);
  testA('017', 'Reads daily log detail (200)', r017.status === 200);
  testA('017-shape', 'Log detail shape and metadata rules', 
    r017.data?.data && 
    Array.isArray(r017.data.data.tasks) && 
    r017.data.data.total_task_hours === 8.25 &&
    r017.data.data.legacy_id === undefined && 
    r017.data.data.migration_id === undefined
  );

  // A-018: Confused parent route protection (Internship B URL + Log A UUID) -> 404
  const r018 = await api(tokA).get(`/api/v2/internships/${intStudentB}/logs/${createdLog?.id}`);
  testA('018', 'Confused parent resource mismatch check on read -> 404', r018.status === 404, `got ${r018.status}`);

  // A-019: PATCH update log (tasks-only patch) -> 200, notes preserved
  const r019 = await api(tokA).patch(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}`, {
    tasks: [{ description: 'Updated single task', hours: 5.5 }]
  });
  testA('019', 'Updates tasks and preserves notes (200)', 
    r019.status === 200 && r019.data?.data?.notes === 'My first ojt day' && r019.data?.data?.total_task_hours === 5.5
  );

  // A-020: PATCH update log (notes-only patch) -> 200, tasks preserved
  const r020 = await api(tokA).patch(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}`, {
    notes: 'Updated notes only'
  });
  testA('020', 'Updates notes and preserves tasks (200)', 
    r020.status === 200 && r020.data?.data?.notes === 'Updated notes only' && r020.data?.data?.total_task_hours === 5.5
  );

  // A-021: Submit log (DRAFT -> SUBMITTED) -> 200
  const r021 = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}/submit`);
  testA('021', 'Submits DRAFT daily log (200)', r021.status === 200 && r021.data?.data?.status === 'SUBMITTED');

  // A-022: Update SUBMITTED log -> 422 Unprocessable Entity
  const r022 = await api(tokA).patch(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}`, {
    notes: 'Trying to hack notes on submitted log'
  });
  testA('022', 'Rejects update on SUBMITTED log (422)', r022.status === 422, `got ${r022.status}`);

  // A-023: Delete SUBMITTED log -> 422 Unprocessable Entity
  const r023 = await api(tokA).delete(`/api/v2/internships/${intStudentA}/logs/${createdLog?.id}`);
  testA('023', 'Rejects delete on SUBMITTED log (422)', r023.status === 422, `got ${r023.status}`);

  // A-024: Student A tries to read/write Student B's logs -> 404 (isolation check)
  const r024Read = await api(tokA).get(`/api/v2/internships/${intStudentB}/logs`);
  testA('024-read', 'Student A blocked from Student B logs -> 404', r024Read.status === 404 || r024Read.data?.data?.length === 0);

  const r024Write = await api(tokA).post(`/api/v2/internships/${intStudentB}/logs`, {
    date: '2026-07-16',
    tasks: [{ description: 'Hacked log', hours: 1.0 }]
  });
  testA('024-write', 'Student A blocked from inserting into Student B internship -> 404', r024Write.status === 404, `got ${r024Write.status}`);
}

// ── MATRIX B — Direct PostgreSQL Table RLS Writes ──────────────────────────────
async function runMatrixB() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX B — DIRECT TABLE RLS WRITE TESTS (non-superuser)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, studentBId, facultyAId, mentorAId, adminAId, intStudentA, intStudentB } = fixtures;

  // B-001: Student A INSERT own daily log -> ALLOW
  try {
    const logId = await withRlsSession(studentAId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO public.daily_logs (internship_id, date, notes, status)
         VALUES ($1, '2026-07-11', 'Own daily log', 'DRAFT') RETURNING id`,
        [intStudentA]
      );
      return rows[0].id;
    });
    testB('001', 'Student A insert own log: ALLOW', !!logId);
  } catch (err) {
    testB('001', 'Student A insert own log: ALLOW', false, err.message);
  }

  // B-002: Student A INSERT Student B daily log -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `INSERT INTO public.daily_logs (internship_id, date, notes, status)
         VALUES ($1, '2026-07-11', 'Hacked log', 'DRAFT')`,
        [intStudentB]
      );
    });
    testB('002', 'Student A insert Student B log: DENY', false, 'Insert succeeded but should fail');
  } catch (err) {
    testB('002', 'Student A insert Student B log: DENY', true, err.message);
  }

  // Set up an own editable log and a Student B editable log for update/delete tests
  let ownDraftId, studentBDraftId;
  const adminClient = await adminPool.connect();
  try {
    const r1 = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-12', 'DRAFT') RETURNING id`, [intStudentA]
    );
    ownDraftId = r1.rows[0].id;

    const r2 = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-12', 'DRAFT') RETURNING id`, [intStudentB]
    );
    studentBDraftId = r2.rows[0].id;
  } finally {
    adminClient.release();
  }

  // B-003: Student A UPDATE own editable daily log -> ALLOW
  try {
    const ok = await withRlsSession(studentAId, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE public.daily_logs SET notes = 'Edited notes' WHERE id = $1`, [ownDraftId]
      );
      return rowCount === 1;
    });
    testB('003', 'Student A update own log: ALLOW', ok);
  } catch (err) {
    testB('003', 'Student A update own log: ALLOW', false, err.message);
  }

  // B-004: Student A UPDATE Student B daily log -> DENY
  try {
    const ok = await withRlsSession(studentAId, async (client) => {
      const { rowCount } = await client.query(
        `UPDATE public.daily_logs SET notes = 'Hacked edit' WHERE id = $1`, [studentBDraftId]
      );
      return rowCount === 0;
    });
    testB('004', 'Student A update Student B log: DENY', ok, 'No row modified');
  } catch (err) {
    testB('004', 'Student A update Student B log: DENY', true, err.message);
  }

  // B-005: Student A DELETE own DRAFT log -> ALLOW
  try {
    const ok = await withRlsSession(studentAId, async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM public.daily_logs WHERE id = $1`, [ownDraftId]
      );
      return rowCount === 1;
    });
    testB('005', 'Student A delete own DRAFT log: ALLOW', ok);
  } catch (err) {
    testB('005', 'Student A delete own DRAFT log: ALLOW', false, err.message);
  }

  // B-006: Student A DELETE Student B log -> DENY
  try {
    const ok = await withRlsSession(studentAId, async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM public.daily_logs WHERE id = $1`, [studentBDraftId]
      );
      return rowCount === 0;
    });
    testB('006', 'Student A delete Student B log: DENY', ok);
  } catch (err) {
    testB('006', 'Student A delete Student B log: DENY', true, err.message);
  }

  // Set up a SUBMITTED own log to verify DB level DRAFT status check for delete
  let ownSubmittedId;
  const adminClient2 = await adminPool.connect();
  try {
    const r = await adminClient2.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-13', 'SUBMITTED') RETURNING id`, [intStudentA]
    );
    ownSubmittedId = r.rows[0].id;
  } finally {
    adminClient2.release();
  }

  // B-007: Student A DELETE own SUBMITTED log -> DENY (DB RLS check: status = DRAFT)
  try {
    const ok = await withRlsSession(studentAId, async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM public.daily_logs WHERE id = $1`, [ownSubmittedId]
      );
      return rowCount === 0;
    });
    testB('007', 'Student A delete own SUBMITTED log: DENY (DB RLS status = DRAFT rule)', ok);
  } catch (err) {
    testB('007', 'Student A delete own SUBMITTED log: DENY', true, err.message);
  }

  // B-008: Faculty INSERT student daily log -> DENY
  try {
    await withRlsSession(facultyAId, async (client) => {
      await client.query(
        `INSERT INTO public.daily_logs (internship_id, date, notes, status)
         VALUES ($1, '2026-07-14', 'Faculty insert', 'DRAFT')`,
        [intStudentA]
      );
    });
    testB('008', 'Faculty insert student log: DENY', false, 'Insert succeeded but should fail');
  } catch (err) {
    testB('008', 'Faculty insert student log: DENY', true, err.message);
  }

  // B-009: Mentor INSERT student daily log -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `INSERT INTO public.daily_logs (internship_id, date, notes, status)
         VALUES ($1, '2026-07-14', 'Mentor insert', 'DRAFT')`,
        [intStudentA]
      );
    });
    testB('009', 'Mentor insert student log: DENY', false, 'Insert succeeded but should fail');
  } catch (err) {
    testB('009', 'Mentor insert student log: DENY', true, err.message);
  }

  // B-010: Admin INSERT student daily log -> DENY
  try {
    await withRlsSession(adminAId, async (client) => {
      await client.query(
        `INSERT INTO public.daily_logs (internship_id, date, notes, status)
         VALUES ($1, '2026-07-14', 'Admin insert', 'DRAFT')`,
        [intStudentA]
      );
    });
    testB('010', 'Admin insert student log: DENY', false, 'Insert succeeded but should fail');
  } catch (err) {
    testB('010', 'Admin insert student log: DENY', true, err.message);
  }

  // B-011: Task-table write RLS tests (Student A inserts task for Student B log) -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `INSERT INTO public.daily_log_tasks (daily_log_id, description, hours)
         VALUES ($1, 'Hacked task', 2.0)`,
        [studentBDraftId]
      );
    });
    testB('011', 'Student A insert task into Student B log: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('011', 'Student A insert task into Student B log: DENY', true, err.message);
  }
}

// ── MATRIX C — SECURITY INVOKER RPC RLS Authorization Tests ────────────────────
async function runMatrixC() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX C — SECURITY INVOKER RPC AUTHORIZATION TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, studentBId, mentorAId, intStudentA, intStudentB } = fixtures;
  const jsonTasks = JSON.stringify([{ description: 'Task via RPC', hours: 4.0 }]);

  // C-001: Student A runs create RPC for own internship -> ALLOW
  try {
    const logId = await withRlsSession(studentAId, async (client) => {
      const { rows } = await client.query(
        `SELECT public.create_daily_log_with_tasks($1, '2026-07-01', 'RPC Log', $2) as id`,
        [intStudentA, jsonTasks]
      );
      return rows[0].id;
    });
    testC('001', 'Student A calls create RPC for own internship: ALLOW', !!logId);
  } catch (err) {
    testC('001', 'Student A calls create RPC for own internship: ALLOW', false, err.message);
  }

  // C-002: Student A runs create RPC with Student B internship ID -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.create_daily_log_with_tasks($1, '2026-07-02', 'RPC Hack', $2) as id`,
        [intStudentB, jsonTasks]
      );
    });
    testC('002', 'Student A calls create RPC for Student B: DENY', false, 'RPC execution succeeded');
  } catch (err) {
    testC('002', 'Student A calls create RPC for Student B: DENY', true, err.message);
  }

  // C-003: Mentor runs create RPC for student -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `SELECT public.create_daily_log_with_tasks($1, '2026-07-03', 'RPC Hack Mentor', $2) as id`,
        [intStudentA, jsonTasks]
      );
    });
    testC('003', 'Mentor calls create RPC: DENY', false, 'RPC execution succeeded');
  } catch (err) {
    testC('003', 'Mentor calls create RPC: DENY', true, err.message);
  }

  // Insert a test log for update/submit RPC tests
  let rpcLogId;
  const adminClient = await adminPool.connect();
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-04', 'DRAFT') RETURNING id`, [intStudentA]
    );
    rpcLogId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // C-004: Student A calls update RPC for own log -> ALLOW
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.update_daily_log_with_tasks($1, $2, 'Updated RPC Notes', true, $3, true)`,
        [intStudentA, rpcLogId, jsonTasks]
      );
    });
    testC('004', 'Student A calls update RPC on own log: ALLOW', true);
  } catch (err) {
    testC('004', 'Student A calls update RPC on own log: ALLOW', false, err.message);
  }

  // C-005: Student A calls update RPC with Student B internship ID (confused parent mismatch check) -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.update_daily_log_with_tasks($1, $2, 'RPC Notes Mismatch', true, $3, true)`,
        [intStudentB, rpcLogId, jsonTasks] // Internship B mismatch for Log A
      );
    });
    testC('005', 'Student A calls update RPC with mismatched internship: DENY', false, 'RPC execution succeeded');
  } catch (err) {
    testC('005', 'Student A calls update RPC with mismatched internship: DENY', true, err.message);
  }

  // C-006: Student A calls submit RPC for own log -> ALLOW
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.submit_daily_log($1, $2)`,
        [intStudentA, rpcLogId]
      );
    });
    testC('006', 'Student A calls submit RPC on own log: ALLOW', true);
  } catch (err) {
    testC('006', 'Student A calls submit RPC on own log: ALLOW', false, err.message);
  }
}

// ── MATRIX D — Concurrency Matrix ──────────────────────────────────────────────
async function runMatrixD() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX D — CONCURRENCY TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA } = fixtures;
  const tokA = makeV2Token(studentAId, 'test-studentA@test-a.com');

  // D-001: Concurrent duplicate log creation -> exactly 1 succeeds, other fails, exactly 1 row in DB
  console.log('[CONCURRENCY] Running concurrent duplicate creations...');
  const req1 = api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-10',
    tasks: [{ description: 'Concurrency task 1', hours: 4.0 }]
  });
  const req2 = api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-10',
    tasks: [{ description: 'Concurrency task 2', hours: 5.0 }]
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const statuses = [res1.status, res2.status];
  const ok1 = statuses.includes(201) && statuses.includes(409);

  // Query database to verify exactly 1 log exists for 2026-07-10
  const adminClient = await adminPool.connect();
  let rowCount = 0;
  let finalLog = null;
  try {
    const { rows } = await adminClient.query(
      `SELECT dl.*, count(t.id)::int as t_count, sum(t.hours)::float as sum_h 
       FROM daily_logs dl 
       LEFT JOIN daily_log_tasks t ON dl.id = t.daily_log_id
       WHERE dl.internship_id = $1 AND dl.date = '2026-07-10'
       GROUP BY dl.id`,
      [intStudentA]
    );
    rowCount = rows.length;
    finalLog = rows[0];
  } finally {
    adminClient.release();
  }

  testD('001', 'Concurrent duplicate creation HTTP codes check (one 201, one 409)', ok1, `statuses: ${statuses.join(', ')}`);
  testD('001-db', 'Database confirms exactly one daily log entry exists for this date', rowCount === 1, `found: ${rowCount} rows`);

  // D-002: Concurrent PATCH vs SUBMIT -> serialized safely, status = SUBMITTED, notes/tasks consistent
  console.log('[CONCURRENCY] Running concurrent PATCH vs SUBMIT...');
  // Create a new DRAFT log first
  const createRes = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-09',
    notes: 'Initial notes',
    tasks: [{ description: 'Initial task', hours: 2.0 }]
  });
  const testLog = createRes.data?.data;

  // Run PATCH and SUBMIT concurrently
  const patchReq = api(tokA).patch(`/api/v2/internships/${intStudentA}/logs/${testLog?.id}`, {
    notes: 'Concurrently updated notes',
    tasks: [{ description: 'Concurrently updated task', hours: 3.5 }]
  });
  const submitReq = api(tokA).post(`/api/v2/internships/${intStudentA}/logs/${testLog?.id}/submit`);

  const [patchRes, submitRes] = await Promise.all([patchReq, submitReq]);
  
  // Verify final database state
  const adminClient2 = await adminPool.connect();
  let finalState = null;
  try {
    const { rows } = await adminClient2.query(
      `SELECT dl.*, count(t.id)::int as t_count, sum(t.hours)::float as sum_h, json_agg(t.description) as t_desc
       FROM daily_logs dl 
       LEFT JOIN daily_log_tasks t ON dl.id = t.daily_log_id
       WHERE dl.id = $1
       GROUP BY dl.id`,
      [testLog?.id]
    );
    finalState = rows[0];
  } finally {
    adminClient2.release();
  }

  // The final state must be:
  // EITHER:
  // 1. Submit completed first, then Patch failed with 422. (Final status = SUBMITTED, notes = 'Initial notes', hours = 2.0)
  // 2. Patch completed first, then Submit completed. (Final status = SUBMITTED, notes = 'Concurrently updated notes', hours = 3.5)
  // System must NEVER end with SUBMITTED status but with patch modified tasks (if PATCH went through after submit).
  let validState = false;
  if (finalState) {
    const isSubmitted = finalState.status === 'SUBMITTED';
    const matchesInitial = finalState.notes === 'Initial notes' && finalState.sum_h === 2.0;
    const matchesUpdated = finalState.notes === 'Concurrently updated notes' && finalState.sum_h === 3.5;
    if (isSubmitted && (matchesInitial || matchesUpdated)) {
      validState = true;
    }
  }
  
  testD('002', 'Concurrent PATCH vs SUBMIT database consistency check', validState, 
    `final: status=${finalState?.status}, notes="${finalState?.notes}", hours=${finalState?.sum_h}`);
}

// ── MATRIX E — Hours Summary Verification ──────────────────────────────────────
async function runMatrixE() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX E — HOURS SUMMARY VERIFICATION (Matrix E)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA } = fixtures;
  const tokA = makeV2Token(studentAId, 'test-studentA@test-a.com');

  const getHours = async () => {
    const client = await adminPool.connect();
    try {
      const { rows } = await client.query(
        `SELECT logged_hours::float as logged, approved_hours::float as approved 
         FROM internship_hours_summary WHERE internship_id = $1`, [intStudentA]
      );
      return rows[0] || { logged: 0, approved: 0 };
    } finally {
      client.release();
    }
  };

  // E-001: Initial state check (should be 0 logged, 0 approved)
  const h0 = await getHours();
  console.log('Initial summary hours:', h0);

  // E-002: Create DRAFT daily log -> 0 logged, 0 approved
  const logRes = await api(tokA).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-08',
    tasks: [{ description: 'Draft tasks', hours: 5.25 }]
  });
  const logId = logRes.data?.data?.id;
  const h1 = await getHours();
  testE('001', 'DRAFT log does not affect hours summary', h1.logged === h0.logged && h1.approved === h0.approved, `logged: ${h1.logged}, approved: ${h1.approved}`);

  // E-003: Submit DRAFT log -> logged_hours includes the log tasks, approved is 0
  await api(tokA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/submit`);
  const h2 = await getHours();
  testE('002', 'SUBMITTED log increments logged_hours only', h2.logged === h1.logged + 5.25 && h2.approved === h1.approved, `logged: ${h2.logged}, approved: ${h2.approved}`);

  // E-004: CORRECTION_REQUESTED log -> logged = 0, approved = 0 (status moves out of SUBMITTED/APPROVED)
  // For testing, update status to CORRECTION_REQUESTED as admin
  const adminClient = await adminPool.connect();
  try {
    await adminClient.query(`UPDATE daily_logs SET status = 'CORRECTION_REQUESTED' WHERE id = $1`, [logId]);
  } finally {
    adminClient.release();
  }
  const h3 = await getHours();
  testE('003', 'CORRECTION_REQUESTED log does not count towards logged/approved hours', h3.logged === h0.logged && h3.approved === h0.approved, `logged: ${h3.logged}, approved: ${h3.approved}`);

  // E-005: Resubmit CORRECTION_REQUESTED -> SUBMITTED -> logged_hours increments again, approved is 0
  await api(tokA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/submit`);
  const h4 = await getHours();
  testE('004', 'Resubmitted log increments logged_hours again', h4.logged === h0.logged + 5.25 && h4.approved === h0.approved, `logged: ${h4.logged}, approved: ${h4.approved}`);

  // E-006: Approve log (Admin fixture) -> logged remains, approved increments
  const adminClient2 = await adminPool.connect();
  try {
    await adminClient2.query(`UPDATE daily_logs SET status = 'APPROVED' WHERE id = $1`, [logId]);
  } finally {
    adminClient2.release();
  }
  const h5 = await getHours();
  testE('005', 'APPROVED log increments both logged_hours and approved_hours', h5.logged === h0.logged + 5.25 && h5.approved === h0.approved + 5.25, `logged: ${h5.logged}, approved: ${h5.approved}`);
}

// ── MATRIX F — Migrated Historical APPROVED Record Protection ──────────────────
async function runMatrixF() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX F — HISTORICAL APPROVED RECORD PROTECTION');
  console.log('════════════════════════════════════════════════════════════════\n');

  // We retrieved a real APPROVED historical log:
  // ID: e95c8d2c-4fac-45e4-bfc0-5c2f96f6e64d
  // Parent Internship: 0c1f3f3c-6371-43dc-a745-f6c3daa34bdb
  // Student ID: 1deff4b1-fa3a-4efb-9add-ec29a2ce8e98
  const histLogId = 'e95c8d2c-4fac-45e4-bfc0-5c2f96f6e64d';
  const histIntId = '0c1f3f3c-6371-43dc-a745-f6c3daa34bdb';
  const histStudentId = '1deff4b1-fa3a-4efb-9add-ec29a2ce8e98';

  const tok = makeV2Token(histStudentId, 'avdhoot13@gmail.com');

  // F-001: Student attempts to PATCH APPROVED historical log -> denied (422)
  const rPatch = await api(tok).patch(`/api/v2/internships/${histIntId}/logs/${histLogId}`, {
    notes: 'Malicious note modification'
  });
  testF('001', 'Student block editing APPROVED historical log (422)', rPatch.status === 422, `got ${rPatch.status}`);

  // F-002: Student attempts to DELETE APPROVED historical log -> denied (422/404)
  const rDelete = await api(tok).delete(`/api/v2/internships/${histIntId}/logs/${histLogId}`);
  testF('002', 'Student block deleting APPROVED historical log (422/404)', rDelete.status === 422 || rDelete.status === 404, `got ${rDelete.status}`);

  // F-003: Student attempts to SUBMIT APPROVED historical log -> denied (422)
  const rSubmit = await api(tok).post(`/api/v2/internships/${histIntId}/logs/${histLogId}/submit`);
  testF('003', 'Student block submitting APPROVED historical log (422)', rSubmit.status === 422, `got ${rSubmit.status}`);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
async function runAll() {
  adminPool = new Pool({ connectionString: ADMIN_DB_URL });
  rlsPool = new Pool({ connectionString: RLS_TEST_DB_URL });

  try {
    await createFixtures();

    await runMatrixA();
    await runMatrixB();
    await runMatrixC();
    await runMatrixD();
    await runMatrixE();
    await runMatrixF();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`MATRIX A (API HTTP/Val):  ${passA} PASS / ${failA} FAIL`);
    console.log(`MATRIX B (Direct RLS):    ${passB} PASS / ${failB} FAIL`);
    console.log(`MATRIX C (RPC RLS):       ${passC} PASS / ${failC} FAIL`);
    console.log(`MATRIX D (Concurrency):   ${passD} PASS / ${failD} FAIL`);
    console.log(`MATRIX E (Hours sum):     ${passE} PASS / ${failE} FAIL`);
    console.log(`MATRIX F (Historical):    ${passF} PASS / ${failF} FAIL`);
    console.log('════════════════════════════════════════════════════════════════\n');

    const totalFailed = failA + failB + failC + failD + failE + failF;
    if (totalFailed > 0) {
      console.error(`Test suite failed with ${totalFailed} errors.`);
      process.exit(1);
    } else {
      console.log('All tests passed successfully!');
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    await cleanupFixtures();
    await adminPool.end();
    await rlsPool.end();
  }
}

runAll();
