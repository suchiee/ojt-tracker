// Phase 1E.4 Comprehensive Automated Test Suite
// Covers all nine matrices: A (API), B (Direct Table Security), C (Student RPC),
// D (Faculty RPC), E (Concurrency), F (Lifecycle), G (Faculty Review History), H (Audits), I (Cross-Tenant).

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

const api = (token) => axios.create({
  baseURL: BASE_URL,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
});

let matrixA = [], matrixB = [], matrixC = [], matrixD = [], matrixE = [], matrixF = [], matrixG = [], matrixH = [], matrixI = [];
let passA = 0, failA = 0, passB = 0, failB = 0, passC = 0, failC = 0, passD = 0, failD = 0, passE = 0, failE = 0, passF = 0, failF = 0, passG = 0, failG = 0, passH = 0, failH = 0, passI = 0, failI = 0;

const testA = (id, name, ok, extra = '') => {
  if (ok) passA++; else failA++;
  matrixA.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] A-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testB = (id, name, ok, extra = '') => {
  if (ok) passB++; else failB++;
  matrixB.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] DirectSecurity-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testC = (id, name, ok, extra = '') => {
  if (ok) passC++; else failC++;
  matrixC.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] StudentRPC-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testD = (id, name, ok, extra = '') => {
  if (ok) passD++; else failD++;
  matrixD.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] FacultyRPC-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testE = (id, name, ok, extra = '') => {
  if (ok) passE++; else failE++;
  matrixE.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Concurrency-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testF = (id, name, ok, extra = '') => {
  if (ok) passF++; else failF++;
  matrixF.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Lifecycle-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testG = (id, name, ok, extra = '') => {
  if (ok) passG++; else failG++;
  matrixG.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] RevHistory-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testH = (id, name, ok, extra = '') => {
  if (ok) passH++; else failH++;
  matrixH.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] AuditAtomicity-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testI = (id, name, ok, extra = '') => {
  if (ok) passI++; else failI++;
  matrixI.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] CrossTenant-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
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

// ── Fixtures Setup ───────────────────────────────────────────────────────────────
async function createFixtures() {
  const client = await adminPool.connect();
  try {
    console.log('\n[SETUP] Pre-cleanup any stale test fixtures...');
    const { rows: staleTenants } = await client.query(
      `SELECT id FROM public.tenants WHERE domain IN ('test-a.example.com','test-b.example.com')`
    );
    for (const t of staleTenants) {
      await client.query(`DELETE FROM public.faculty_reviews WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1))`, [t.id]);
      await client.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1))`, [t.id]);
      await client.query(`DELETE FROM public.weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM public.log_reviews WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1))`, [t.id]);
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
      const { rows: [authRow] } = await client.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [id, email]
      );
      await client.query(
        `INSERT INTO public.users (id, first_name, last_name, email) 
         VALUES ($1, $2, 'Test', $3) ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name`,
        [authRow.id, firstName, email]
      );
      return authRow.id;
    };
    const mkMembership = async (tenantId, userId, role) => {
      const { rows: [m] } = await client.query(`INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`, [tenantId, userId]);
      await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)`, [m.id, role]);
      return m.id;
    };

    const studentAId = await mkUser('test-studentA@test-a.com', 'StudentA');
    const studentBId = await mkUser('test-studentB@test-a.com', 'StudentB');
    const studentCId = await mkUser('test-studentC@test-b.com', 'StudentC'); // Tenant B student
    const adminAId   = await mkUser('test-adminA@test-a.com', 'AdminA');     // Tenant A Admin
    const adminBId   = await mkUser('test-adminB@test-b.com', 'AdminB');     // Tenant B Admin
    const facultyAId = await mkUser('test-facultyA@test-a.com', 'FacultyA'); // assigned to Student A batch
    const facultyBId = await mkUser('test-facultyB@test-a.com', 'FacultyB'); // unassigned

    const memStudentA = await mkMembership(tenantA.id, studentAId, 'STUDENT');
    const memStudentB = await mkMembership(tenantA.id, studentBId, 'STUDENT');
    const memStudentC = await mkMembership(tenantB.id, studentCId, 'STUDENT');
    await mkMembership(tenantA.id, adminAId, 'ADMIN');
    await mkMembership(tenantB.id, adminBId, 'ADMIN');
    await mkMembership(tenantA.id, facultyAId, 'FACULTY_MENTOR');
    await mkMembership(tenantA.id, facultyBId, 'FACULTY_MENTOR');

    const { rows: [companyA] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company A') RETURNING id`, [tenantA.id]);
    const { rows: [companyB] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company B') RETURNING id`, [tenantB.id]);

    const intStudentA = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern A', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentAId, companyA.id]);
    const intStudentB = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern B', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentBId, companyA.id]);
    const intStudentC = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern C', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`, [tenantB.id, studentCId, companyB.id]);

    // Assigned Faculty A to Student A's batch
    const { rows: [dept] } = await client.query(`INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'Test Dept') RETURNING id`, [tenantA.id]);
    const { rows: [prog] } = await client.query(`INSERT INTO public.programs (department_id, name) VALUES ($1, 'Test Prog') RETURNING id`, [dept.id]);
    const { rows: [batch] } = await client.query(`INSERT INTO public.batches (program_id, name) VALUES ($1, 'Test Batch') RETURNING id`, [prog.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'SID-1E4-A')`, [memStudentA, batch.id]);
    await client.query(`INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`, [facultyAId, batch.id]);

    fixtures = {
      tenantAId: tenantA.id, tenantBId: tenantB.id,
      studentAId, studentBId, studentCId,
      adminAId, adminBId, facultyAId, facultyBId,
      intStudentA: intStudentA.rows[0].id, 
      intStudentB: intStudentB.rows[0].id, 
      intStudentC: intStudentC.rows[0].id,
      memStudentA, memStudentB, memStudentC
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
    await client.query(`DELETE FROM public.faculty_reviews WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN ($1, $2, $3))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN ($1, $2, $3))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.weekly_reports WHERE internship_id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2, $3))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.internships WHERE id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN ($1, $2, $3)`,
      [fixtures.memStudentA, fixtures.memStudentB, fixtures.memStudentC]);
    await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN ($1, $2)`, [fixtures.facultyAId, fixtures.facultyBId]);
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
      fixtures.adminAId, fixtures.adminBId, fixtures.facultyAId, fixtures.facultyBId
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

// ── MATRIX A — API FUNCTIONAL ──────────────────────────────────────────────────
async function runMatrixA() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX A — API FUNCTIONAL & VALIDATOR TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA, facultyAId } = fixtures;
  const tokStudent = makeV2Token(studentAId, 'student-a@test.com');
  const tokFaculty = makeV2Token(facultyAId, 'faculty-a@test.com');

  // A-001: Date validation start_date must be Monday
  const r001 = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports`, {
    start_date: '2026-07-14', // Tuesday
    end_date: '2026-07-20',
    student_notes: 'Wadia Monday test'
  });
  testA('001', 'POST start_date Monday constraint validation: 400', r001.status === 400, r001.data?.message);

  // A-002: Date validation end_date must be corresponding Sunday
  const r002 = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports`, {
    start_date: '2026-07-13', // Monday
    end_date: '2026-07-18',   // Saturday
    student_notes: 'Wadia Sunday test'
  });
  testA('002', 'POST end_date Sunday range validation: 400', r002.status === 400, r002.data?.message);

  // A-003: Parameters override rejection in body (status = APPROVED) -> 400
  const r003 = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports`, {
    start_date: '2026-07-13',
    end_date: '2026-07-19',
    status: 'APPROVED'
  });
  testA('003', 'POST status escalation body parameter rejection: 400', r003.status === 400, r003.data?.message);

  // A-004: Confused-parent route parameter protection -> 404
  const { intStudentC } = fixtures;
  const r004 = await api(tokStudent).get(`/api/v2/internships/${intStudentC}/weekly-reports`);
  testA('004', 'GET confused-parent scope validation check: 404', r004.status === 404, r004.data?.message);
}

// ── MATRIX B — DIRECT TABLE SECURITY ───────────────────────────────────────────
async function runMatrixB() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX B — DIRECT TABLE SECURITY (Bypass Prevention)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, facultyAId, intStudentA } = fixtures;

  // Set up a report row for tests
  const adminClient = await adminPool.connect();
  let reportId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.weekly_reports (internship_id, start_date, end_date, status)
       VALUES ($1, '2026-07-20', '2026-07-26', 'DRAFT') RETURNING id`, [intStudentA]
    );
    reportId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // B-001: Student direct update status to APPROVED -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(`UPDATE public.weekly_reports SET status = 'APPROVED' WHERE id = $1`, [reportId]);
    });
    testB('001', 'Student direct update status = APPROVED: DENY', false, 'Update succeeded');
  } catch (err) {
    testB('001', 'Student direct update status = APPROVED: DENY', true, err.message);
  }

  // B-002: Student direct insert to faculty_reviews -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `INSERT INTO public.faculty_reviews (weekly_report_id, reviewed_by, status, remarks)
         VALUES ($1, $2, 'APPROVED', 'Hacked')`, [reportId, studentAId]
      );
    });
    testB('002', 'Student direct insert to faculty_reviews: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('002', 'Student direct insert to faculty_reviews: DENY', true, err.message);
  }

  // B-003: Faculty direct insert to faculty_reviews (policy dropped) -> DENY
  try {
    await withRlsSession(facultyAId, async (client) => {
      await client.query(
        `INSERT INTO public.faculty_reviews (weekly_report_id, reviewed_by, status, remarks)
         VALUES ($1, $2, 'APPROVED', 'Hacked')`, [reportId, facultyAId]
      );
    });
    testB('003', 'Faculty direct insert to faculty_reviews: DENY (must use RPC)', false, 'Insert succeeded');
  } catch (err) {
    testB('003', 'Faculty direct insert to faculty_reviews: DENY (must use RPC)', true, err.message);
  }

  // B-004: Standard user calls private.log_audit_event directly -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT private.log_audit_event($1, 'HACK', 'weekly_reports', $2)`, [fixtures.tenantAId, reportId]
      );
    });
    testB('004', 'Direct call to private.log_audit_event: DENY', false, 'Call succeeded');
  } catch (err) {
    testB('004', 'Direct call to private.log_audit_event: DENY', true, err.message);
  }
}

// ── MATRIX C & D — STUDENT & FACULTY RPC AUTHORIZATION ─────────────────────────
async function runMatrixCD() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX C & D — RPC AUTHORIZATION VALIDATIONS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, studentBId, facultyAId, facultyBId, intStudentA, intStudentB, intStudentC } = fixtures;

  // Insert a logs for linking checks
  const adminClient = await adminPool.connect();
  let logAId, logBId;
  try {
    const rA = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-06', 'APPROVED') RETURNING id`, [intStudentA]
    );
    logAId = rA.rows[0].id;
    await adminClient.query(`INSERT INTO public.daily_log_tasks (daily_log_id, description, hours) VALUES ($1, 'OJT task 1', 4.5)`, [logAId]);

    const rB = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-06', 'APPROVED') RETURNING id`, [intStudentC]
    );
    logBId = rB.rows[0].id;
  } finally {
    adminClient.release();
  }

  // C-001: Student A creates report for Student C internship -> DENY (404/P0002)
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.create_weekly_report_with_logs($1, '2026-07-06', '2026-07-12', 'Notes', ARRAY[]::UUID[])`,
        [intStudentC]
      );
    });
    testC('001', 'Student creates report on other student internship: DENY', false);
  } catch (err) {
    testC('001', 'Student creates report on other student internship: DENY', true, err.message);
  }

  // C-002: Student A links Student C's daily log -> DENY (D0011)
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.create_weekly_report_with_logs($1, '2026-07-06', '2026-07-12', 'Notes', $2)`,
        [intStudentA, [logBId]]
      );
    });
    testC('002', 'Student links other student daily log: DENY', false);
  } catch (err) {
    testC('002', 'Student links other student daily log: DENY', true, err.message);
  }

  // Set up Student A weekly report DRAFT
  let reportAId;
  try {
    reportAId = await withRlsSession(studentAId, async (client) => {
      const { rows } = await client.query(
        `SELECT public.create_weekly_report_with_logs($1, '2026-07-06', '2026-07-12', 'Notes A', $2) as id`,
        [intStudentA, [logAId]]
      );
      return rows[0].id;
    });
    testC('003', 'Student creates report on own internship: ALLOW', !!reportAId);
  } catch (err) {
    testC('003', 'Student creates report on own internship: ALLOW', false, err.message);
  }

  // D-001: Unassigned Faculty reviews report -> DENY
  try {
    await withRlsSession(facultyBId, async (client) => {
      await client.query(`SELECT public.review_weekly_report($1, 'APPROVED', 'Fine')`, [reportAId]);
    });
    testD('001', 'Unassigned Faculty review: DENY', false);
  } catch (err) {
    testD('001', 'Unassigned Faculty review: DENY', true, err.message);
  }

  // Cleanup Matrix C fixtures so Matrix F can reuse the July 6-12 week cleanly
  const cleanupClient = await adminPool.connect();
  try {
    await cleanupClient.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id = $1`, [reportAId]);
    await cleanupClient.query(`DELETE FROM public.weekly_reports WHERE id = $1`, [reportAId]);
    await cleanupClient.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id = $1`, [logAId]);
    await cleanupClient.query(`DELETE FROM public.daily_logs WHERE id = $1`, [logAId]);
  } finally {
    cleanupClient.release();
  }
}

// ── MATRIX E — CONCURRENCY ──────────────────────────────────────────────────────
async function runMatrixE() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX E — CONCURRENCY TESTS (Matrix E)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, facultyAId, intStudentA } = fixtures;
  const tokStudent = makeV2Token(studentAId, 'student-a@test.com');
  const tokFaculty = makeV2Token(facultyAId, 'faculty-a@test.com');

  // Insert a submitted weekly report
  const adminClient = await adminPool.connect();
  let logId, reportId;
  try {
    const rl = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-08-03', 'APPROVED') RETURNING id`, [intStudentA]
    );
    logId = rl.rows[0].id;
    await adminClient.query(`INSERT INTO public.daily_log_tasks (daily_log_id, description, hours) VALUES ($1, 'work task', 5.0)`, [logId]);

    const r = await adminClient.query(
      `INSERT INTO public.weekly_reports (internship_id, start_date, end_date, status)
       VALUES ($1, '2026-08-03', '2026-08-09', 'SUBMITTED') RETURNING id`, [intStudentA]
    );
    reportId = r.rows[0].id;
    await adminClient.query(
      `INSERT INTO public.weekly_report_log_links (weekly_report_id, daily_log_id) VALUES ($1, $2)`, [reportId, logId]
    );
  } finally {
    adminClient.release();
  }

  // E-001: Concurrent reviews: APPROVED vs CORRECTION_REQUESTED
  const req1 = api(tokFaculty).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`, {
    decision: 'APPROVED',
    remarks: 'Approved concurrent'
  });
  const req2 = api(tokFaculty).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    remarks: 'Correction concurrent'
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const statuses = [res1.status, res2.status];

  const okCon = statuses.includes(201) && statuses.includes(422);
  testE('001', 'Concurrent Faculty review serialization (one 201, one 422)', okCon, `statuses: ${statuses.join(', ')}`);

  // Verify counts in DB
  const adminClientFinal = await adminPool.connect();
  let finalStatus, reviewCount, auditCount;
  try {
    const rWr = await adminClientFinal.query(`SELECT status FROM public.weekly_reports WHERE id = $1`, [reportId]);
    finalStatus = rWr.rows[0].status;
    const rRev = await adminClientFinal.query(`SELECT COUNT(*) FROM public.faculty_reviews WHERE weekly_report_id = $1`, [reportId]);
    reviewCount = parseInt(rRev.rows[0].count, 10);
    const rAud = await adminClientFinal.query(`SELECT COUNT(*) FROM public.audit_logs WHERE target_table = 'weekly_reports' AND target_id = $1`, [reportId]);
    auditCount = parseInt(rAud.rows[0].count, 10);
  } finally {
    adminClientFinal.release();
  }

  testE('001-db-reviews', 'Exactly one faculty review record created', reviewCount === 1, `count: ${reviewCount}`);
  testE('001-db-audits', 'Exactly one audit log event generated', auditCount === 1, `count: ${auditCount}`);
  testE('001-db-sync', 'Report status matches committed review status', finalStatus === 'APPROVED' || finalStatus === 'CORRECTION_REQUESTED');
}

// ── MATRIX F, G, H, I — COMPLETE LIFECYCLE, HISTORY, AUDITS, CROSS-TENANT ──────
async function runMatrixFGHI() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX F, G, H, I — COMPLETE LIFE CYCLE & SECURITY MATRICES');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, facultyAId, adminAId, adminBId, intStudentA } = fixtures;
  const tokStudent = makeV2Token(studentAId, 'student-a@test.com');
  const tokFaculty = makeV2Token(facultyAId, 'faculty-a@test.com');
  const tokAdminA  = makeV2Token(adminAId, 'admin-a@test-a.com');
  const tokAdminB  = makeV2Token(adminBId, 'admin-b@test-b.com');

  // Insert a submitted daily log to test progressive building
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const rl = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-06', 'SUBMITTED') RETURNING id`, [intStudentA]
    );
    logId = rl.rows[0].id;
    await adminClient.query(`INSERT INTO public.daily_log_tasks (daily_log_id, description, hours) VALUES ($1, 'Progress task', 7.5)`, [logId]);
  } finally {
    adminClient.release();
  }

  // F-001: Student creates DRAFT weekly report
  const rCreate = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports`, {
    start_date: '2026-07-06', // Monday
    end_date: '2026-07-08',   // progressive draft check
    student_notes: 'Draft Notes'
  });
  const rCreateOk = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports`, {
    start_date: '2026-07-06',
    end_date: '2026-07-12',
    student_notes: 'Draft Notes',
    daily_log_ids: [logId]
  });
  const reportId = rCreateOk.data?.data?.id;
  testF('001', 'Student creates DRAFT report with submitted logs: ALLOW', rCreateOk.status === 201 && !!reportId, rCreateOk.data?.message);

  // F-002: Student submits report
  const rSubmit = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/submit`);
  testF('002', 'Student submits report: ALLOW', rSubmit.status === 200);

  // F-003: Faculty requests correction (with remarks) -> CORRECTION_REQUESTED
  const rCorr = await api(tokFaculty).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    remarks: 'Please elaborate'
  });
  const review1Id = rCorr.data?.data?.id;
  testF('003', 'Faculty requests correction: ALLOW', rCorr.status === 201 && rCorr.data?.data?.status === 'CORRECTION_REQUESTED');

  // F-004: Student edits permit fields during correction request
  const rEdit = await api(tokStudent).patch(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}`, {
    student_notes: 'Elaborated Notes content'
  });
  testF('004', 'Student edits notes during correction: ALLOW', rEdit.status === 200 && rEdit.data?.data?.student_notes === 'Elaborated Notes content');

  // F-005: Student resubmits report
  const rResubmit = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/submit`);
  testF('005', 'Student resubmits report: ALLOW', rResubmit.status === 200);

  // F-006: Faculty approve -> blocks because linked log is not APPROVED yet!
  const rApproveFail = await api(tokFaculty).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`, {
    decision: 'APPROVED',
    remarks: 'Approved now'
  });
  testD('002', 'Faculty approval blocked by unapproved log: DENY (422)', rApproveFail.status === 422, rApproveFail.data?.message);

  // Approve daily log via mentor role in DB directly to allow report approval
  const adminClient2 = await adminPool.connect();
  try {
    await adminClient2.query(`UPDATE public.daily_logs SET status = 'APPROVED' WHERE id = $1`, [logId]);
  } finally {
    adminClient2.release();
  }

  // Faculty approves weekly report now
  const rApprove = await api(tokFaculty).post(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`, {
    decision: 'APPROVED',
    remarks: 'Approved now'
  });
  const review2Id = rApprove.data?.data?.id;
  testF('006', 'Faculty approves report once log is approved: ALLOW', rApprove.status === 201 && rApprove.data?.data?.status === 'APPROVED');

  // G-001: Get review history returns both reviews chronologically
  const rHist = await api(tokStudent).get(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}/reviews`);
  const history = rHist.data?.data || [];
  testG('001', 'History returns exactly 2 chronological reviews', 
    history.length === 2 && history[0].id === review1Id && history[1].id === review2Id
  );
  testG('002', 'Review 1 details (CORRECTION_REQUESTED, remarks) are immutable',
    history[0].status === 'CORRECTION_REQUESTED' && history[0].remarks === 'Please elaborate'
  );

  // H-001: Verify audit logs count
  const adminClient3 = await adminPool.connect();
  let auditLogs;
  try {
    const { rows } = await adminClient3.query(
      `SELECT action FROM public.audit_logs 
       WHERE target_table = 'weekly_reports' AND target_id = $1 
       ORDER BY created_at ASC`, [reportId]
    );
    auditLogs = rows.map(r => r.action);
  } finally {
    adminClient3.release();
  }
  const matchAudits = auditLogs.length === 4 &&
    auditLogs[0] === 'WEEKLY_REPORT_SUBMITTED' &&
    auditLogs[1] === 'WEEKLY_REPORT_CORRECTION_REQUESTED' &&
    auditLogs[2] === 'WEEKLY_REPORT_SUBMITTED' &&
    auditLogs[3] === 'WEEKLY_REPORT_APPROVED';
  testH('001', 'Atomically logged four audit events matching transitions', matchAudits, `actions: ${auditLogs.join(', ')}`);

  // I-001: Tenant A Admin can read Tenant A student report
  const rAdminA = await api(tokAdminA).get(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}`);
  testI('001', 'Tenant A Admin reads Tenant A report: ALLOW', rAdminA.status === 200);

  // I-002: Tenant B Admin cannot read Tenant A student report -> 404
  const rAdminB = await api(tokAdminB).get(`/api/v2/internships/${intStudentA}/weekly-reports/${reportId}`);
  testI('002', 'Tenant B Admin reads Tenant A report: DENY', rAdminB.status === 404);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
async function runAll() {
  adminPool = new Pool({ connectionString: ADMIN_DB_URL });
  rlsPool = new Pool({ connectionString: RLS_TEST_DB_URL });

  try {
    await createFixtures();

    await runMatrixA();
    await runMatrixB();
    await runMatrixCD();
    await runMatrixE();
    await runMatrixFGHI();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`MATRIX A (API HTTP/Val):  ${passA} PASS / ${failA} FAIL`);
    console.log(`MATRIX B (Direct RLS):    ${passB} PASS / ${failB} FAIL`);
    console.log(`MATRIX C (Student RPC):   ${passC} PASS / ${failC} FAIL`);
    console.log(`MATRIX D (Faculty RPC):   ${passD} PASS / ${failD} FAIL`);
    console.log(`MATRIX E (Concurrency):   ${passE} PASS / ${failE} FAIL`);
    console.log(`MATRIX F (Lifecycle):     ${passF} PASS / ${failF} FAIL`);
    console.log(`MATRIX G (Reviews Hist):  ${passG} PASS / ${failG} FAIL`);
    console.log(`MATRIX H (Audits):        ${passH} PASS / ${failH} FAIL`);
    console.log(`MATRIX I (Cross-Tenant):  ${passI} PASS / ${failI} FAIL`);
    console.log('════════════════════════════════════════════════════════════════\n');

    const totalFailed = failA + failB + failC + failD + failE + failF + failG + failH + failI;
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
