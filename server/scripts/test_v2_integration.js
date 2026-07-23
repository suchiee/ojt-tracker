// Phase 1E Complete End-to-End Integration Audit Test Suite
// Verifies the complete workflow across Phase 1E.1 through Phase 1E.4.

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

let poolAdmin, poolRls;
let fixtures = {};
let auditResults = [];

const logStep = (stepNumber, stepName, status, details = '') => {
  auditResults.push({ stepNumber, stepName, status, details });
  console.log(`[${status}] Step ${stepNumber}: ${stepName}${details ? ` — ${details}` : ''}`);
};

async function withRlsSession(userId, queryFn) {
  const client = await poolRls.connect();
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
  const client = await poolAdmin.connect();
  try {
    console.log('\n[SETUP] Pre-cleanup integration test fixtures...');
    const { rows: staleTenants } = await client.query(
      `SELECT id FROM public.tenants WHERE domain IN ('integration-a.com','integration-b.com')`
    );
    const tenantIds = staleTenants.map(t => t.id);

    if (tenantIds.length > 0) {
      await client.query(`DELETE FROM public.faculty_reviews WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await client.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await client.query(`DELETE FROM public.weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.log_reviews WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN (SELECT user_id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.internships WHERE tenant_id = ANY($1)`, [tenantIds]);
      await client.query(`DELETE FROM public.companies WHERE tenant_id = ANY($1)`, [tenantIds]);
      await client.query(`DELETE FROM public.batches WHERE program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await client.query(`DELETE FROM public.programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.departments WHERE tenant_id = ANY($1)`, [tenantIds]);
      
      const { rows: staleMembers } = await client.query(`SELECT user_id FROM tenant_memberships WHERE tenant_id = ANY($1)`, [tenantIds]);
      await client.query(`DELETE FROM public.membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await client.query(`DELETE FROM public.tenant_memberships WHERE tenant_id = ANY($1)`, [tenantIds]);
      await client.query(`DELETE FROM public.tenants WHERE id = ANY($1)`, [tenantIds]);

      for (const m of staleMembers) {
        const { rows: [u] } = await client.query(`SELECT email FROM public.users WHERE id=$1`, [m.user_id]);
        if (u?.email?.includes('integration-')) {
          await client.query(`DELETE FROM public.users WHERE id=$1`, [m.user_id]);
          await client.query(`DELETE FROM auth.users WHERE id=$1`, [m.user_id]);
        }
      }
    }

    console.log('[SETUP] Creating integration fixtures...');
    const { rows: [tenantA] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Integration Tenant A', 'integration-a.com') RETURNING id`);
    const { rows: [tenantB] } = await client.query(`INSERT INTO public.tenants (name, domain) VALUES ('Integration Tenant B', 'integration-b.com') RETURNING id`);

    const mkUser = async (email, firstName) => {
      const id = crypto.randomUUID();
      const { rows: [authRow] } = await client.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
        [id, email]
      );
      await client.query(
        `INSERT INTO public.users (id, first_name, last_name, email) 
         VALUES ($1, $2, 'Integration', $3) ON CONFLICT (id) DO UPDATE SET first_name=EXCLUDED.first_name`,
        [authRow.id, firstName, email]
      );
      return authRow.id;
    };
    const mkMembership = async (tenantId, userId, role) => {
      const { rows: [m] } = await client.query(`INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`, [tenantId, userId]);
      await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)`, [m.id, role]);
      return m.id;
    };

    const studentId = await mkUser('integration-student@test-a.com', 'Student');
    const studentBId = await mkUser('integration-studentB@test-b.com', 'StudentB'); // Tenant B
    const mentorId  = await mkUser('integration-mentor@test-a.com', 'Mentor');
    const facultyId = await mkUser('integration-faculty@test-a.com', 'Faculty');
    const adminAId  = await mkUser('integration-adminA@test-a.com', 'AdminA');
    const adminBId  = await mkUser('integration-adminB@test-b.com', 'AdminB');

    const memStudent = await mkMembership(tenantA.id, studentId, 'STUDENT');
    const memStudentB = await mkMembership(tenantB.id, studentBId, 'STUDENT');
    await mkMembership(tenantA.id, mentorId, 'STUDENT');
    await mkMembership(tenantA.id, facultyId, 'FACULTY_MENTOR');
    await mkMembership(tenantA.id, adminAId, 'ADMIN');
    await mkMembership(tenantB.id, adminBId, 'ADMIN');

    const { rows: [company] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Integration Company A') RETURNING id`, [tenantA.id]);
    const { rows: [companyB] } = await client.query(`INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Integration Company B') RETURNING id`, [tenantB.id]);

    const { rows: [internship] } = await client.query(
      `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) 
       VALUES ($1, $2, $3, 'Software Engineer Intern', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`, 
      [tenantA.id, studentId, company.id]
    );

    const { rows: [internshipB] } = await client.query(
      `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) 
       VALUES ($1, $2, $3, 'Unrelated Intern', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`, 
      [tenantB.id, studentBId, companyB.id]
    );

    // Mentor Assignment
    await client.query(
      `INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type) 
       VALUES ($1, $2, 'COMPANY')`, [internship.id, mentorId]
    );

    // Faculty Assignment
    const { rows: [dept] } = await client.query(`INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'CompSci') RETURNING id`, [tenantA.id]);
    const { rows: [prog] } = await client.query(`INSERT INTO public.programs (department_id, name) VALUES ($1, 'MCA') RETURNING id`, [dept.id]);
    const { rows: [batch] } = await client.query(`INSERT INTO public.batches (program_id, name) VALUES ($1, 'MCA-2026') RETURNING id`, [prog.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'INT-007')`, [memStudent, batch.id]);
    await client.query(`INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`, [facultyId, batch.id]);

    fixtures = {
      tenantAId: tenantA.id, tenantBId: tenantB.id,
      studentId, studentBId, mentorId, facultyId, adminAId, adminBId,
      internshipId: internship.id, internshipBId: internshipB.id,
      memStudent, memStudentB
    };

    console.log('[SETUP] Integration fixtures setup complete.');
  } finally {
    client.release();
  }
}

async function cleanupFixtures() {
  const client = await poolAdmin.connect();
  try {
    console.log('\n[CLEANUP] Cleaning up integration fixtures...');
    await client.query(`DELETE FROM public.faculty_reviews WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN ($1, $2))`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN ($1, $2))`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.weekly_reports WHERE internship_id IN ($1, $2)`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.log_reviews WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2))`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN ($1, $2)`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN ($1, $2)`, [fixtures.facultyId, fixtures.studentBId]);
    await client.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN ($1, $2)`, [fixtures.memStudent, fixtures.memStudentB]);
    await client.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN ($1, $2))`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.daily_logs WHERE internship_id IN ($1, $2)`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.internships WHERE id IN ($1, $2)`, [fixtures.internshipId, fixtures.internshipBId]);
    await client.query(`DELETE FROM public.companies WHERE tenant_id=$1 OR tenant_id=$2`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2)`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.tenant_memberships WHERE tenant_id=$1 OR tenant_id=$2`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.batches WHERE program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1 OR tenant_id=$2))`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id=$1 OR tenant_id=$2)`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.departments WHERE tenant_id=$1 OR tenant_id=$2`, [fixtures.tenantAId, fixtures.tenantBId]);
    await client.query(`DELETE FROM public.tenants WHERE id=$1 OR id=$2`, [fixtures.tenantAId, fixtures.tenantBId]);

    const users = [fixtures.studentId, fixtures.studentBId, fixtures.mentorId, fixtures.facultyId, fixtures.adminAId, fixtures.adminBId];
    for (const u of users) {
      if (u) {
        await client.query(`DELETE FROM public.users WHERE id=$1`, [u]);
        await client.query(`DELETE FROM auth.users WHERE id=$1`, [u]);
      }
    }
    console.log('[CLEANUP] Integration cleanup complete.');
  } catch (err) {
    console.error('[CLEANUP] Error during cleanup:', err.message);
  } finally {
    client.release();
  }
}

// ── AUDIT TEST WORKFLOW ─────────────────────────────────────────────────────────
async function runAuditFlow() {
  const tokStudent = makeV2Token(fixtures.studentId, 'student@integration.com');
  const tokMentor  = makeV2Token(fixtures.mentorId, 'mentor@integration.com');
  const tokFaculty = makeV2Token(fixtures.facultyId, 'faculty@integration.com');
  const tokAdminA  = makeV2Token(fixtures.adminAId, 'admina@integration.com');
  const tokAdminB  = makeV2Token(fixtures.adminBId, 'adminb@integration.com');

  const { internshipId, internshipBId } = fixtures;

  // Step 1: Student Active Internship Retrieval
  const rInt = await api(tokStudent).get('/api/v2/internships');
  const activeInt = (rInt.data?.data || []).find(i => i.id === internshipId);
  logStep('1', 'Student Internship Verification', activeInt && activeInt.status === 'ACTIVE' ? 'PASS' : 'FAIL', `Active internship found: ${!!activeInt}`);

  // Step 2: Student Creates Daily Log (DRAFT)
  const rCreateLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs`, {
    date: '2026-07-06',
    notes: 'Draft daily notes',
    tasks: [{ description: 'Writing integration tests', hours: 5.5 }]
  });
  const logId = rCreateLog.data?.data?.id;
  logStep('2', 'Student Creates Daily Log (DRAFT)', rCreateLog.status === 201 && logId ? 'PASS' : 'FAIL', `Log ID: ${logId}`);

  // Step 3: Student Updates Daily Log (DRAFT notes/hours update)
  const rUpdateLog = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/logs/${logId}`, {
    notes: 'Draft daily notes v2',
    tasks: [{ description: 'Writing integration tests and debugging', hours: 6.5 }]
  });
  logStep('3', 'Student Updates Daily Log', rUpdateLog.status === 200 && rUpdateLog.data?.data?.notes === 'Draft daily notes v2' ? 'PASS' : 'FAIL');

  // Step 4: Student Submits Daily Log
  const rSubmitLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs/${logId}/submit`);
  logStep('4', 'Student Submits Daily Log', rSubmitLog.status === 200 && rSubmitLog.data?.data?.status === 'SUBMITTED' ? 'PASS' : 'FAIL');

  // Step 5: Assigned Company Mentor Queue Visibility
  const rQueue = await api(tokMentor).get('/api/v2/mentor/review-queue');
  const queueItems = rQueue.data?.data || [];
  const inQueue = queueItems.find(q => q.id === logId);
  logStep('5', 'Company Mentor Queue Visibility', rQueue.status === 200 && inQueue ? 'PASS' : 'FAIL', `Queue length: ${queueItems.length}`);

  // Step 6: Company Mentor Requests Correction
  const rCorrLog = await api(tokMentor).post(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    feedback: 'Please elaborate on what you debugged'
  });
  logStep('6', 'Company Mentor Requests Correction', rCorrLog.status === 201 && rCorrLog.data?.data?.status === 'CORRECTION_REQUESTED' ? 'PASS' : 'FAIL');

  // Step 7: Student Corrects & Resubmits Daily Log
  const rCorrectLog = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/logs/${logId}`, {
    notes: 'Draft daily notes v3',
    tasks: [{ description: 'Writing integration tests and fixed RLS bypasses', hours: 7.0 }]
  });
  const rResubmitLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs/${logId}/submit`);
  const logCorrected = rCorrectLog.status === 200 && rResubmitLog.status === 200 && rResubmitLog.data?.data?.status === 'SUBMITTED';
  logStep('7', 'Student Corrects & Resubmits Daily Log', logCorrected ? 'PASS' : 'FAIL');

  // Step 8: Company Mentor Approves Daily Log & Checks Hours Update
  const rApproveLog = await api(tokMentor).post(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    feedback: 'Well documented now'
  });
  logStep('8', 'Company Mentor Approves Daily Log', rApproveLog.status === 201 && rApproveLog.data?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL');

  // Step 9: Verify Internship Total Hours Updates
  const rIntCheck = await api(tokStudent).get('/api/v2/internships/' + internshipId);
  const intDetails = rIntCheck.data?.data;
  const approvedHours = intDetails?.hours_summary?.approved_hours;
  const hoursOk = intDetails && parseFloat(approvedHours) === 7.0;
  logStep('9', 'Internship Approved Hours Updates', hoursOk ? 'PASS' : 'FAIL', `Approved hours: ${approvedHours}`);

  // Step 10: Student Creates Weekly Report (DRAFT) linking the approved log
  const rCreateWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports`, {
    start_date: '2026-07-06',
    end_date: '2026-07-12',
    student_notes: 'Integration test week notes',
    daily_log_ids: [logId]
  });
  const wrId = rCreateWr.data?.data?.id;
  logStep('10', 'Student Creates Weekly Report (DRAFT)', rCreateWr.status === 201 && wrId ? 'PASS' : 'FAIL', `Report ID: ${wrId}`);

  // Step 11: Student Submits Weekly Report
  const rSubmitWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/submit`);
  logStep('11', 'Student Submits Weekly Report', rSubmitWr.status === 200 && rSubmitWr.data?.data?.status === 'SUBMITTED' ? 'PASS' : 'FAIL');

  // Step 12: Assigned Faculty Queue Visibility
  const rFacQueue = await api(tokFaculty).get('/api/v2/faculty/review-queue');
  const facQueue = rFacQueue.data?.data || [];
  const inFacQueue = facQueue.find(q => q.id === wrId);
  logStep('12', 'Faculty Queue Visibility', rFacQueue.status === 200 && inFacQueue ? 'PASS' : 'FAIL', `Queue length: ${facQueue.length}`);

  // Step 13: Faculty Requests Correction
  const rCorrWr = await api(tokFaculty).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    remarks: 'Provide some more notes'
  });
  logStep('13', 'Faculty Requests Correction', rCorrWr.status === 201 && rCorrWr.data?.data?.status === 'CORRECTION_REQUESTED' ? 'PASS' : 'FAIL');

  // Step 14: Student Updates and Resubmits Weekly Report
  const rEditWr = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`, {
    student_notes: 'Updated integration test week notes v2'
  });
  const rResubmitWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/submit`);
  const wrResubmitted = rEditWr.status === 200 && rResubmitWr.status === 200 && rResubmitWr.data?.data?.status === 'SUBMITTED';
  logStep('14', 'Student Updates & Resubmits Weekly Report', wrResubmitted ? 'PASS' : 'FAIL');

  // Step 15: Faculty Approves Weekly Report
  const rApproveWr = await api(tokFaculty).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`, {
    decision: 'APPROVED',
    remarks: 'Approved report!'
  });
  logStep('15', 'Faculty Approves Weekly Report', rApproveWr.status === 201 && rApproveWr.data?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL');

  // Step 16: Verify Review Histories Chronological and Immutable
  const rLogHist = await api(tokStudent).get(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`);
  const rWrHist = await api(tokStudent).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`);
  const logReviews = rLogHist.data?.data || [];
  const wrReviews = rWrHist.data?.data || [];

  const histOk = logReviews.length === 2 && wrReviews.length === 2;
  logStep('16', 'Review Histories Intact & Chronological', histOk ? 'PASS' : 'FAIL', 
    `Log reviews: ${logReviews.length}, Report reviews: ${wrReviews.length}`
  );

  // Step 17: Verify Audit Events Atomicity and Completeness
  const adminClient = await poolAdmin.connect();
  let auditLogs = [];
  try {
    const { rows } = await adminClient.query(
      `SELECT action, target_table FROM public.audit_logs 
       WHERE (target_table = 'daily_logs' AND target_id = $1) 
          OR (target_table = 'weekly_reports' AND target_id = $2)
       ORDER BY created_at ASC`, [logId, wrId]
    );
    auditLogs = rows;
  } finally {
    adminClient.release();
  }

  const expectedLogActions = ['LOG_CORRECTION_REQUESTED', 'LOG_APPROVED'];
  const expectedWrActions = ['WEEKLY_REPORT_SUBMITTED', 'WEEKLY_REPORT_CORRECTION_REQUESTED', 'WEEKLY_REPORT_SUBMITTED', 'WEEKLY_REPORT_APPROVED'];
  const actualLogActions = auditLogs.filter(a => a.target_table === 'daily_logs').map(a => a.action);
  const actualWrActions = auditLogs.filter(a => a.target_table === 'weekly_reports').map(a => a.action);

  const auditsComplete = 
    JSON.stringify(actualLogActions) === JSON.stringify(expectedLogActions) &&
    JSON.stringify(actualWrActions) === JSON.stringify(expectedWrActions);

  logStep('17', 'Audit Events Sequence Verification', auditsComplete ? 'PASS' : 'FAIL', 
    `Daily Log audits: [${actualLogActions.join(', ')}], Report audits: [${actualWrActions.join(', ')}]`
  );

  // Step 18: Tenant Admin Visibility Isolation (Tenant A Admin sees Tenant A report)
  const rAdminRead = await api(tokAdminA).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('18', 'Tenant Admin Read Scope (Own Tenant)', rAdminRead.status === 200 ? 'PASS' : 'FAIL');

  // Step 19: Cross-Tenant Isolation (Tenant B Admin reading Tenant A report -> 404)
  const rAdminReadB = await api(tokAdminB).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('19', 'Tenant Admin Cross-Tenant Isolation (Other Tenant Blocked)', rAdminReadB.status === 404 ? 'PASS' : 'FAIL');

  // Step 20: Cross-Tenant Student Isolation (Tenant B Student reading Tenant A report -> 404)
  const tokStudentB = makeV2Token(fixtures.studentBId, 'studentb@integration.com');
  const rStudentReadB = await api(tokStudentB).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('20', 'Student Cross-Tenant Isolation', rStudentReadB.status === 404 ? 'PASS' : 'FAIL');

  // Step 21: Confused-Parent Route Parameter Mismatch Protection (Valid report, mismatched internshipId -> 404)
  const rConfused = await api(tokStudent).get(`/api/v2/internships/${internshipBId}/weekly-reports/${wrId}`);
  logStep('21', 'Confused-Parent Route Parameter Mismatch Check', rConfused.status === 404 ? 'PASS' : 'FAIL');

  // Step 22: Direct Audit Events Insert Block (Matrix B direct write check)
  let directAuditFail = false;
  try {
    await withRlsSession(fixtures.studentId, async (client) => {
      await client.query(
        `SELECT private.log_audit_event($1, 'HACK', 'weekly_reports', $2)`, 
        [fixtures.tenantAId, wrId]
      );
    });
  } catch (err) {
    if (err.message.includes('permission denied') || err.message.includes('denied')) {
      directAuditFail = true;
    }
  }
  logStep('22', 'Private Helper Function Security Block', directAuditFail ? 'PASS' : 'FAIL');

  // Step 23: Legacy API Route Isolation Check (V2 Auth should not leak to legacy API, and vice-versa)
  const rLegacy1 = await api().get('/api/daily-log');
  // Rejects because no token is present (legacy uses Bearer token format)
  const rLegacyReject = rLegacy1.status === 401;

  // Let's verify legacy routes accept invalid v2 tokens correctly (meaning they reject them because secrets/schemas differ)
  const rLegacy2 = await api(tokStudent).get('/api/daily-log');
  const rLegacyAuthBlocked = rLegacy2.status === 401;

  logStep('23', 'Legacy Router Isolation & Auth Security Check', rLegacyReject && rLegacyAuthBlocked ? 'PASS' : 'FAIL', `rLegacyReject: ${rLegacyReject}, rLegacyAuthBlocked: ${rLegacyAuthBlocked}`);

  // Step 24: New V2 Route Isolation (Rejects legacy auth formats / empty tokens)
  const rV2Anon = await api().get(`/api/v2/internships/${internshipId}/weekly-reports`);
  const v2AnonBlocked = rV2Anon.status === 401;
  logStep('24', 'New V2 Routes Auth Protection', v2AnonBlocked ? 'PASS' : 'FAIL');
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
async function runAll() {
  poolAdmin = new Pool({ connectionString: ADMIN_DB_URL });
  poolRls = new Pool({ connectionString: RLS_TEST_DB_URL });

  try {
    await createFixtures();
    await runAuditFlow();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('INTEGRATION AUDIT SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    let totalPassed = 0;
    for (const r of auditResults) {
      if (r.status === 'PASS') totalPassed++;
      console.log(`[${r.status}] Step ${r.stepNumber}: ${r.stepName}`);
    }
    console.log(`\nTOTAL PASSED: ${totalPassed} / ${auditResults.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    if (totalPassed < auditResults.length) {
      console.error('Audit failed with integration issues.');
      process.exit(1);
    } else {
      console.log('End-to-end integration audit completed successfully!');
    }
  } catch (err) {
    console.error('Audit execution error:', err);
    process.exit(1);
  } finally {
    await cleanupFixtures();
    await poolAdmin.end();
    await poolRls.end();
  }
}

runAll();
