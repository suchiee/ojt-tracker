// Phase 1E.3 Comprehensive Test Suite
// Verified across seven distinct matrices: A (API), B (Direct DB writes),
// C (SECURITY DEFINER RPC), D (Concurrency), E (Hours Lifecycle), F (Audits), G (Append-only).

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5003}`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const ADMIN_DB_URL = process.env.DATABASE_URL;       // superuser (for setups)
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

let matrixA = [], matrixB = [], matrixC = [], matrixD = [], matrixE = [], matrixF = [], matrixG = [];
let passA = 0, failA = 0, passB = 0, failB = 0, passC = 0, failC = 0, passD = 0, failD = 0, passE = 0, failE = 0, passF = 0, failF = 0, passG = 0, failG = 0;

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
  console.log(`[${ok ? 'PASS' : 'FAIL'}] DefinerRPC-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
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
  console.log(`[${ok ? 'PASS' : 'FAIL'}] Audit-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
};

const testG = (id, name, ok, extra = '') => {
  if (ok) passG++; else failG++;
  matrixG.push({ id, name, status: ok ? 'PASS' : 'FAIL', extra });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] AppendOnly-${id}: ${name}${extra ? ` — ${extra}` : ''}`);
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
    const mentorAId  = await mkUser('test-mentorA@test-a.com', 'MentorA'); // assigned mentor on Student A
    const mentorBId  = await mkUser('test-mentorB@test-a.com', 'MentorB'); // unassigned mentor on Student A

    const memStudentA = await mkMembership(tenantA.id, studentAId, 'STUDENT');
    const memStudentB = await mkMembership(tenantA.id, studentBId, 'STUDENT');
    await mkMembership(tenantB.id, studentCId, 'STUDENT');
    await mkMembership(tenantA.id, adminAId, 'ADMIN');
    await mkMembership(tenantB.id, adminBId, 'ADMIN');
    await mkMembership(tenantA.id, facultyAId, 'FACULTY_MENTOR');
    await mkMembership(tenantA.id, mentorAId, 'STUDENT'); // external mentors are standard users
    await mkMembership(tenantA.id, mentorBId, 'STUDENT');

    const { rows: [companyA] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company A') RETURNING id`, [tenantA.id]);
    const { rows: [companyB] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Test Company B') RETURNING id`, [tenantB.id]);

    const intStudentA = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentAId, companyA.id]);
    const intStudentB = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantA.id, studentBId, companyA.id]);
    const intStudentC = await client.query(`INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) VALUES ($1, $2, $3, 'Active Intern', NOW(), NOW() + INTERVAL '3 months', 120, 'ACTIVE') RETURNING id`, [tenantB.id, studentCId, companyB.id]);

    // Assign Mentor A to Student A internship
    await client.query(`INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, assigned_at) VALUES ($1, $2, 'COMPANY', NOW())`, [intStudentA.rows[0].id, mentorAId]);

    // Assigned Faculty A to Student A's batch
    const { rows: [dept] } = await client.query(`INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'Test Dept') RETURNING id`, [tenantA.id]);
    const { rows: [prog] } = await client.query(`INSERT INTO public.programs (department_id, name) VALUES ($1, 'Test Prog') RETURNING id`, [dept.id]);
    const { rows: [batch] } = await client.query(`INSERT INTO public.batches (program_id, name) VALUES ($1, 'Test Batch') RETURNING id`, [prog.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'SID-TEST-A')`, [memStudentA, batch.id]);
    await client.query(`INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`, [facultyAId, batch.id]);

    fixtures = {
      tenantAId: tenantA.id, tenantBId: tenantB.id,
      studentAId, studentBId, studentCId,
      adminAId, adminBId, facultyAId, mentorAId, mentorBId,
      intStudentA: intStudentA.rows[0].id, 
      intStudentB: intStudentB.rows[0].id, 
      intStudentC: intStudentC.rows[0].id,
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
    await client.query(`DELETE FROM public.log_reviews WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2, $3))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2, $3))`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
    await client.query(`DELETE FROM public.internships WHERE id IN ($1, $2, $3)`,
      [fixtures.intStudentA, fixtures.intStudentB, fixtures.intStudentC]);
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
      fixtures.adminAId, fixtures.adminBId, fixtures.facultyAId, fixtures.mentorAId, fixtures.mentorBId
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

  const { studentAId, intStudentA, mentorAId, mentorBId } = fixtures;
  const tokStudent = makeV2Token(studentAId, 'student-a@test.com');
  const tokMentorA = makeV2Token(mentorAId, 'mentor-a@test.com');
  const tokMentorB = makeV2Token(mentorBId, 'mentor-b@test.com');

  // Set up a SUBMITTED daily log to review
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-15', 'SUBMITTED') RETURNING id`,
      [intStudentA]
    );
    logId = r.rows[0].id;
    await adminClient.query(
      `INSERT INTO public.daily_log_tasks (daily_log_id, description, hours) VALUES ($1, 'OJT task', 6.00)`,
      [logId]
    );
  } finally {
    adminClient.release();
  }

  // A-001: Mentor A review queue returns only submitted assigned logs
  const r001 = await api(tokMentorA).get('/api/v2/mentor/review-queue');
  testA('001', 'GET /mentor/review-queue: returns log', 
    r001.status === 200 && r001.data?.data?.length === 1 && r001.data.data[0].id === logId
  );

  // A-002: Unassigned Mentor B review queue returns empty logs list
  const r002 = await api(tokMentorB).get('/api/v2/mentor/review-queue');
  testA('002', 'GET /mentor/review-queue unassigned: returns empty', 
    r002.status === 200 && r002.data?.data?.length === 0
  );

  // A-003: POST review validation (reject metadata injection parameter reviewed_by) -> 400
  const r003 = await api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    reviewed_by: studentAId
  });
  testA('003', 'POST review metadata override check: 400', r003.status === 400);

  // A-004: POST review validation (invalid decision) -> 400
  const r004 = await api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'HACKED'
  });
  testA('004', 'POST review invalid decision check: 400', r004.status === 400);

  // A-005: POST review validation (CORRECTION_REQUESTED requires feedback) -> 400
  const r005 = await api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    feedback: '   ' // empty after trim
  });
  testA('005', 'POST review correction without feedback check: 400', r005.status === 400);

  // A-006: POST review validation (comment too long) -> 400
  const r006 = await api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    feedback: 'a'.repeat(1001)
  });
  testA('006', 'POST review comments size check: 400', r006.status === 400);

  // A-007: Mismatched parent routes (confused-parent attack) -> 404
  const { intStudentB } = fixtures;
  const r007 = await api(tokMentorA).post(`/api/v2/internships/${intStudentB}/logs/${logId}/reviews`, {
    decision: 'APPROVED'
  });
  testA('007', 'POST review parent mismatch protection: 404', r007.status === 404);
}

// ── MATRIX B — Direct Table Security (Bypass Prevention) ────────────────────────
async function runMatrixB() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX B — DIRECT TABLE SECURITY (Bypass Prevention)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, mentorAId, adminAId, intStudentA } = fixtures;

  // Insert a test log for direct write attempts
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-16', 'SUBMITTED') RETURNING id`,
      [intStudentA]
    );
    logId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // B-001: Student direct INSERT to log_reviews -> DENY (fails because direct insert is blocked/revoked)
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `INSERT INTO public.log_reviews (daily_log_id, reviewed_by, status, feedback)
         VALUES ($1, $2, 'APPROVED', 'Notes')`, [logId, studentAId]
      );
    });
    testB('001', 'Student direct INSERT to log_reviews: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('001', 'Student direct INSERT to log_reviews: DENY', true, err.message);
  }

  // B-002: Mentor direct INSERT to log_reviews -> DENY (direct INSERT policy dropped, only RPC permitted)
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `INSERT INTO public.log_reviews (daily_log_id, reviewed_by, status, feedback)
         VALUES ($1, $2, 'APPROVED', 'Notes')`, [logId, mentorAId]
      );
    });
    testB('002', 'Mentor direct INSERT to log_reviews: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('002', 'Mentor direct INSERT to log_reviews: DENY', true, err.message);
  }

  // B-003: Student direct INSERT to audit_logs -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
         VALUES ($1, $2, 'LOG_APPROVED', 'daily_logs', $3)`, [fixtures.tenantAId, studentAId, logId]
      );
    });
    testB('003', 'Student direct INSERT to audit_logs: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('003', 'Student direct INSERT to audit_logs: DENY', true, err.message);
  }

  // B-004: Mentor direct INSERT to audit_logs -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
         VALUES ($1, $2, 'LOG_APPROVED', 'daily_logs', $3)`, [fixtures.tenantAId, mentorAId, logId]
      );
    });
    testB('004', 'Mentor direct INSERT to audit_logs: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('004', 'Mentor direct INSERT to audit_logs: DENY', true, err.message);
  }

  // B-005: Admin direct INSERT to audit_logs -> DENY
  try {
    await withRlsSession(adminAId, async (client) => {
      await client.query(
        `INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id)
         VALUES ($1, $2, 'LOG_APPROVED', 'daily_logs', $3)`, [fixtures.tenantAId, adminAId, logId]
      );
    });
    testB('005', 'Admin direct INSERT to audit_logs: DENY', false, 'Insert succeeded');
  } catch (err) {
    testB('005', 'Admin direct INSERT to audit_logs: DENY', true, err.message);
  }
}

// ── MATRIX C — SECURITY DEFINER RPC AUTHORIZATION ──────────────────────────────
async function runMatrixC() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX C — SECURITY DEFINER RPC AUTHORIZATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, mentorAId, mentorBId, facultyAId, adminAId, intStudentA, intStudentB } = fixtures;

  // Insert a clean log to review
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-17', 'SUBMITTED') RETURNING id`,
      [intStudentA]
    );
    logId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // C-001: Assigned Company Mentor -> APPROVE own assigned log: ALLOW
  try {
    const rId = await withRlsSession(mentorAId, async (client) => {
      const { rows } = await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'RPC approved') as id`,
        [intStudentA, logId]
      );
      return rows[0].id;
    });
    testC('001', 'Assigned Mentor APPROVE own log: ALLOW', !!rId);
  } catch (err) {
    testC('001', 'Assigned Mentor APPROVE own log: ALLOW', false, err.message);
  }

  // Re-submit the log for correction test
  const adminClient2 = await adminPool.connect();
  try {
    await adminClient2.query(`UPDATE daily_logs SET status = 'SUBMITTED' WHERE id = $1`, [logId]);
  } finally {
    adminClient2.release();
  }

  // C-002: Assigned Company Mentor -> REQUEST_CORRECTION on own assigned log: ALLOW
  try {
    const rId = await withRlsSession(mentorAId, async (client) => {
      const { rows } = await client.query(
        `SELECT public.review_daily_log($1, $2, 'CORRECTION_REQUESTED', 'Please add detail') as id`,
        [intStudentA, logId]
      );
      return rows[0].id;
    });
    testC('002', 'Assigned Mentor REQUEST_CORRECTION: ALLOW', !!rId);
  } catch (err) {
    testC('002', 'Assigned Mentor REQUEST_CORRECTION: ALLOW', false, err.message);
  }

  // Re-submit log for denial tests
  const adminClient3 = await adminPool.connect();
  try {
    await adminClient3.query(`UPDATE daily_logs SET status = 'SUBMITTED' WHERE id = $1`, [logId]);
  } finally {
    adminClient3.release();
  }

  // C-003: Unassigned Mentor calls RPC -> DENY
  try {
    await withRlsSession(mentorBId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'Unassigned approve') as id`,
        [intStudentA, logId]
      );
    });
    testC('003', 'Unassigned Mentor review RPC: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('003', 'Unassigned Mentor review RPC: DENY', true, err.message);
  }

  // C-004: Student calls RPC -> DENY
  try {
    await withRlsSession(studentAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'Student approve') as id`,
        [intStudentA, logId]
      );
    });
    testC('004', 'Student review RPC: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('004', 'Student review RPC: DENY', true, err.message);
  }

  // C-005: Faculty calls RPC -> DENY
  try {
    await withRlsSession(facultyAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'Faculty approve') as id`,
        [intStudentA, logId]
      );
    });
    testC('005', 'Faculty review RPC: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('005', 'Faculty review RPC: DENY', true, err.message);
  }

  // C-006: Tenant Admin calls RPC -> DENY
  try {
    await withRlsSession(adminAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'Admin approve') as id`,
        [intStudentA, logId]
      );
    });
    testC('006', 'Admin review RPC: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('006', 'Admin review RPC: DENY', true, err.message);
  }

  // C-007: Direct RPC invalid decision parameter -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'HACKED_STATUS', 'hack') as id`,
        [intStudentA, logId]
      );
    });
    testC('007', 'RPC invalid decision check: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('007', 'RPC invalid decision check: DENY', true, err.message);
  }

  // C-008: Direct RPC missing correction feedback -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'CORRECTION_REQUESTED', '') as id`,
        [intStudentA, logId]
      );
    });
    testC('008', 'RPC missing correction feedback check: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('008', 'RPC missing correction feedback check: DENY', true, err.message);
  }

  // C-009: Direct RPC oversized feedback -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', $3) as id`,
        [intStudentA, logId, 'a'.repeat(1001)]
      );
    });
    testC('009', 'RPC oversized feedback check: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('009', 'RPC oversized feedback check: DENY', true, err.message);
  }

  // C-010: Confused-parent internship UUID mismatch -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(
        `SELECT public.review_daily_log($1, $2, 'APPROVED', 'mismatch') as id`,
        [intStudentB, logId] // Internship B mismatch for Log A
      );
    });
    testC('010', 'RPC mismatched parent internship check: DENY', false, 'RPC succeeded');
  } catch (err) {
    testC('010', 'RPC mismatched parent internship check: DENY', true, err.message);
  }
}

// ── MATRIX D — CONCURRENCY ──────────────────────────────────────────────────────
async function runMatrixD() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX D — CONCURRENCY TESTS (Matrix D)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA, mentorAId } = fixtures;
  const tokMentorA = makeV2Token(mentorAId, 'mentor-a@test.com');

  // Setup a clean log to review concurrently
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-14', 'SUBMITTED') RETURNING id`,
      [intStudentA]
    );
    logId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // Run initial query count to establish base numbers
  const adminClientCount = await adminPool.connect();
  let initialReviewsCount = 0;
  let initialAuditsCount = 0;
  try {
    const rReviews = await adminClientCount.query(`SELECT COUNT(*) FROM log_reviews WHERE daily_log_id = $1`, [logId]);
    initialReviewsCount = parseInt(rReviews.rows[0].count, 10);
    const rAudits = await adminClientCount.query(`SELECT COUNT(*) FROM audit_logs WHERE target_table = 'daily_logs' AND target_id = $1`, [logId]);
    initialAuditsCount = parseInt(rAudits.rows[0].count, 10);
  } finally {
    adminClientCount.release();
  }

  console.log(`[CONCURRENCY] Initial reviews: ${initialReviewsCount}, audits: ${initialAuditsCount}`);

  // Trigger concurrent requests: APPROVED and CORRECTION_REQUESTED
  const req1 = api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    feedback: 'Approve concurrent'
  });
  const req2 = api(tokMentorA).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    feedback: 'Correction concurrent'
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const statuses = [res1.status, res2.status];

  // Verify that exactly one transaction succeeded (201) and one failed (422)
  const okCodes = statuses.includes(201) && statuses.includes(422);

  // Check final database state
  const adminClientFinal = await adminPool.connect();
  let finalLogStatus = null;
  let finalReviewsCount = 0;
  let finalAuditsCount = 0;
  let auditAction = null;
  try {
    const rLog = await adminClientFinal.query(`SELECT status FROM daily_logs WHERE id = $1`, [logId]);
    finalLogStatus = rLog.rows[0].status;
    const rReviews = await adminClientFinal.query(`SELECT COUNT(*) FROM log_reviews WHERE daily_log_id = $1`, [logId]);
    finalReviewsCount = parseInt(rReviews.rows[0].count, 10);
    const rAudits = await adminClientFinal.query(`SELECT action FROM audit_logs WHERE target_table = 'daily_logs' AND target_id = $1`, [logId]);
    finalAuditsCount = rAudits.rows.length;
    auditAction = rAudits.rows[0]?.action;
  } finally {
    adminClientFinal.release();
  }

  testD('001', 'Concurrent review HTTP status codes check (one 201, one 422)', okCodes, `statuses: ${statuses.join(', ')}`);
  testD('001-db-reviews', 'Exactly one new review record created', finalReviewsCount === initialReviewsCount + 1, `final count: ${finalReviewsCount}`);
  testD('001-db-audits', 'Exactly one new audit log created', finalAuditsCount === initialAuditsCount + 1, `final count: ${finalAuditsCount}`);
  testD('001-db-sync', 'Review status matches final Daily Log status and Audit Action', 
    finalLogStatus === (auditAction === 'LOG_APPROVED' ? 'APPROVED' : 'CORRECTION_REQUESTED')
  );
}

// ── MATRIX E & G — COMPLETE CORRECTION LIFECYCLE & IMMUTABILITY ───────────────
async function runMatrixEG() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX E & G — LIFECYCLE & IMMUTABILITY TESTS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA, mentorAId } = fixtures;
  const tokStudent = makeV2Token(studentAId, 'student-a@test.com');
  const tokMentor = makeV2Token(mentorAId, 'mentor-a@test.com');

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

  // E-001: Student creates DRAFT
  const draftRes = await api(tokStudent).post(`/api/v2/internships/${intStudentA}/logs`, {
    date: '2026-07-13',
    notes: 'Lifecycle check day',
    tasks: [{ description: 'Writing logs', hours: 5.5 }]
  });
  const logId = draftRes.data?.data?.id;

  const h0 = await getHours();

  // Student submits log
  await api(tokStudent).post(`/api/v2/internships/${intStudentA}/logs/${logId}/submit`);
  const hSubmitted = await getHours();
  testE('001', 'SUBMITTED log adds to logged_hours', hSubmitted.logged === h0.logged + 5.5 && hSubmitted.approved === h0.approved);

  // Mentor requests correction
  const rev1Res = await api(tokMentor).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    feedback: 'Please clarify task details'
  });
  const reviewAId = rev1Res.data?.data?.id;
  const hCorr = await getHours();
  testE('002', 'CORRECTION_REQUESTED log removes hours from logged_hours', hCorr.logged === h0.logged && hCorr.approved === h0.approved);

  // Student edits tasks (removes old task and replaces with 6.5 hours task)
  await api(tokStudent).patch(`/api/v2/internships/${intStudentA}/logs/${logId}`, {
    tasks: [{ description: 'Writing refined logs', hours: 6.5 }]
  });

  // Student resubmits log
  await api(tokStudent).post(`/api/v2/internships/${intStudentA}/logs/${logId}/submit`);
  const hResubmitted = await getHours();
  testE('003', 'Resubmitted log adds new hours to logged_hours', hResubmitted.logged === h0.logged + 6.5 && hResubmitted.approved === h0.approved);

  // Mentor approves log
  const rev2Res = await api(tokMentor).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    feedback: 'Perfect now'
  });
  const reviewBId = rev2Res.data?.data?.id;
  const hApproved = await getHours();
  testE('004', 'APPROVED log adds hours to both logged and approved', hApproved.logged === h0.logged + 6.5 && hApproved.approved === h0.approved + 6.5);

  // G-001: Get review history returns both reviews chronologically
  const histRes = await api(tokStudent).get(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`);
  const reviews = histRes.data?.data || [];
  testG('001', 'History returns exactly 2 chronological reviews', 
    reviews.length === 2 && reviews[0].id === reviewAId && reviews[1].id === reviewBId
  );

  // G-002: Review A is unmodified
  testG('002', 'Review A properties preserved', 
    reviews[0].status === 'CORRECTION_REQUESTED' && reviews[0].feedback === 'Please clarify task details'
  );

  // G-003: Verify normal application roles cannot UPDATE/DELETE Review A
  // Direct UPDATE on log_reviews -> DENY
  const adminClient = await adminPool.connect();
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(`UPDATE log_reviews SET feedback = 'Hacked comment' WHERE id = $1`, [reviewAId]);
    });
    testG('003-update', 'Mentor cannot directly UPDATE log_reviews: DENY', false);
  } catch (err) {
    testG('003-update', 'Mentor cannot directly UPDATE log_reviews: DENY', true, err.message);
  }

  // Direct DELETE on log_reviews -> DENY
  try {
    await withRlsSession(mentorAId, async (client) => {
      await client.query(`DELETE FROM log_reviews WHERE id = $1`, [reviewAId]);
    });
    testG('003-delete', 'Mentor cannot directly DELETE log_reviews: DENY', false);
  } catch (err) {
    testG('003-delete', 'Mentor cannot directly DELETE log_reviews: DENY', true, err.message);
  }
  adminClient.release();
}

// ── MATRIX F — AUDIT ATOMICITY ──────────────────────────────────────────────────
async function runMatrixF() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('MATRIX F — AUDIT ATOMICITY');
  console.log('════════════════════════════════════════════════════════════════\n');

  const { studentAId, intStudentA, mentorAId, mentorBId } = fixtures;
  const tokMentorA = makeV2Token(mentorAId, 'mentor-a@test.com');

  // Create a log to submit and fail review
  const adminClient = await adminPool.connect();
  let logId;
  try {
    const r = await adminClient.query(
      `INSERT INTO public.daily_logs (internship_id, date, status) VALUES ($1, '2026-07-12', 'SUBMITTED') RETURNING id`,
      [intStudentA]
    );
    logId = r.rows[0].id;
  } finally {
    adminClient.release();
  }

  // Get audit count before failed attempt
  const adminClient2 = await adminPool.connect();
  let auditCountBefore = 0;
  try {
    const r = await adminClient2.query(`SELECT COUNT(*) FROM audit_logs WHERE target_id = $1`, [logId]);
    auditCountBefore = parseInt(r.rows[0].count, 10);
  } finally {
    adminClient2.release();
  }

  // F-001: Trigger failed review (unassigned mentor)
  await api(makeV2Token(mentorBId, 'mentor-b@test.com')).post(`/api/v2/internships/${intStudentA}/logs/${logId}/reviews`, {
    decision: 'APPROVED'
  });

  // Verify that audit log was NOT created on failure
  const adminClient3 = await adminPool.connect();
  let auditCountAfter = 0;
  try {
    const r = await adminClient3.query(`SELECT COUNT(*) FROM audit_logs WHERE target_id = $1`, [logId]);
    auditCountAfter = parseInt(r.rows[0].count, 10);
  } finally {
    adminClient3.release();
  }

  testF('001', 'Failed review attempts do not create phantom audit logs', auditCountAfter === auditCountBefore, `before: ${auditCountBefore}, after: ${auditCountAfter}`);
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
    await runMatrixEG();
    await runMatrixF();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('TEST SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`MATRIX A (API Validations): ${passA} PASS / ${failA} FAIL`);
    console.log(`MATRIX B (Direct RLS):      ${passB} PASS / ${failB} FAIL`);
    console.log(`MATRIX C (Definer RPC RLS): ${passC} PASS / ${failC} FAIL`);
    console.log(`MATRIX D (Concurrency):     ${passD} PASS / ${failD} FAIL`);
    console.log(`MATRIX E (Hours lifecycle): ${passE} PASS / ${failE} FAIL`);
    console.log(`MATRIX F (Audit Atomicity): ${passF} PASS / ${failF} FAIL`);
    console.log(`MATRIX G (Append-only):     ${passG} PASS / ${failG} FAIL`);
    console.log('════════════════════════════════════════════════════════════════\n');

    const totalFailed = failA + failB + failC + failD + failE + failF + failG;
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
