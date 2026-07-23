const { Client } = require('pg');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment from server/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REACT_APP_SUPABASE_ANON_KEY
} = process.env;

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REACT_APP_SUPABASE_ANON_KEY) {
  console.error('[CLOUD TEST] Error: Missing required hosted configuration in server/.env');
  process.exit(1);
}

// Supabase clients
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const supabasePublic = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BASE_URL = 'http://localhost:5003';
const TEST_PASSWORD = 'CloudSecurePassword123!';

const api = (token) => axios.create({
  baseURL: BASE_URL,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  validateStatus: () => true
});

let dbClient;
let fixtures = {};
let auditResults = [];

const logStep = (stepNumber, stepName, status, details = '') => {
  auditResults.push({ stepNumber, stepName, status, details });
  console.log(`[${status}] Step ${stepNumber}: ${stepName}${details ? ` — ${details}` : ''}`);
};

// Clean up any stale auth users and DB fixtures from previous runs
async function preCleanup() {
  console.log('[CLOUD TEST] Running pre-cleanup...');
  
  dbClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await dbClient.connect();

  try {
    const { rows: staleTenants } = await dbClient.query(
      `SELECT id FROM public.tenants WHERE domain IN ('cloud-a.com', 'cloud-b.com')`
    );
    const tenantIds = staleTenants.map(t => t.id);

    if (tenantIds.length > 0) {
      await dbClient.query(`DELETE FROM public.faculty_reviews WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.weekly_report_log_links WHERE weekly_report_id IN (SELECT id FROM weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.weekly_reports WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.log_reviews WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.internship_mentor_assignments WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.faculty_batch_assignments WHERE faculty_user_id IN (SELECT user_id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.daily_log_tasks WHERE daily_log_id IN (SELECT id FROM daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.daily_logs WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.internships WHERE tenant_id = ANY($1)`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.companies WHERE tenant_id = ANY($1)`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.batches WHERE program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id = ANY($1)))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.departments WHERE tenant_id = ANY($1)`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id = ANY($1))`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.tenant_memberships WHERE tenant_id = ANY($1)`, [tenantIds]);
      await dbClient.query(`DELETE FROM public.tenants WHERE id = ANY($1)`, [tenantIds]);
    }

    // List and delete any stale auth users via Supabase Admin API
    const testEmails = [
      'cloud-student-a@example.com',
      'cloud-student-b@example.com',
      'cloud-mentor@example.com',
      'cloud-faculty@example.com',
      'cloud-admin-a@example.com',
      'cloud-admin-b@example.com'
    ];

    for (const email of testEmails) {
      const { rows: [u] } = await dbClient.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);
      if (u) {
        console.log(`[CLOUD TEST] Deleting stale Auth user: ${email} (${u.id})`);
        await supabaseAdmin.auth.admin.deleteUser(u.id);
        await dbClient.query(`DELETE FROM public.users WHERE id = $1`, [u.id]);
      }
    }
  } catch (err) {
    console.warn('[CLOUD TEST] Pre-cleanup warning:', err.message);
  }
}

async function createFixtures() {
  console.log('[CLOUD TEST] Creating cloud fixtures...');

  // 1. Create tenants
  const { rows: [tenantA] } = await dbClient.query(
    `INSERT INTO public.tenants (name, domain) VALUES ('Cloud Tenant A', 'cloud-a.com') RETURNING id`
  );
  const { rows: [tenantB] } = await dbClient.query(
    `INSERT INTO public.tenants (name, domain) VALUES ('Cloud Tenant B', 'cloud-b.com') RETURNING id`
  );

  // 2. Helper to create Auth users & public user profiles
  const createTestUser = async (email, firstName) => {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true
    });

    if (error || !data.user) {
      throw new Error(`Failed to create Auth user ${email}: ${error?.message}`);
    }

    const userId = data.user.id;

    // Verify if the public.users record exists and update the names (synced by database trigger)
    let retries = 5;
    while (retries > 0) {
      const { rows: [pu] } = await dbClient.query(`SELECT id FROM public.users WHERE id = $1`, [userId]);
      if (pu) {
        await dbClient.query(
          `UPDATE public.users SET first_name = $1, last_name = 'CloudTest' WHERE id = $2`,
          [firstName, userId]
        );
        break;
      }
      await new Promise(r => setTimeout(r, 500));
      retries--;
    }

    if (retries === 0) {
      await dbClient.query(
        `INSERT INTO public.users (id, email, first_name, last_name) VALUES ($1, $2, $3, 'CloudTest')
         ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name`,
        [userId, email, firstName]
      );
    }

    return userId;
  };

  const studentId = await createTestUser('cloud-student-a@example.com', 'StudentA');
  const studentBId = await createTestUser('cloud-student-b@example.com', 'StudentB');
  const mentorId = await createTestUser('cloud-mentor@example.com', 'Mentor');
  const facultyId = await createTestUser('cloud-faculty@example.com', 'Faculty');
  const adminAId = await createTestUser('cloud-admin-a@example.com', 'AdminA');
  const adminBId = await createTestUser('cloud-admin-b@example.com', 'AdminB');

  // 3. Helper to create membership & roles
  const mkMembership = async (tenantId, userId, role) => {
    const { rows: [m] } = await dbClient.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`,
      [tenantId, userId]
    );
    await dbClient.query(
      `INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)`,
      [m.id, role]
    );
    return m.id;
  };

  const memStudent = await mkMembership(tenantA.id, studentId, 'STUDENT');
  const memStudentB = await mkMembership(tenantB.id, studentBId, 'STUDENT');
  const memMentor = await mkMembership(tenantA.id, mentorId, 'STUDENT');
  const memFaculty = await mkMembership(tenantA.id, facultyId, 'FACULTY_MENTOR');
  const memAdminA = await mkMembership(tenantA.id, adminAId, 'ADMIN');
  const memAdminB = await mkMembership(tenantB.id, adminBId, 'ADMIN');

  // 4. Create companies & internships
  const { rows: [company] } = await dbClient.query(
    `INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Cloud Tech A') RETURNING id`,
    [tenantA.id]
  );
  const { rows: [companyB] } = await dbClient.query(
    `INSERT INTO public.companies (tenant_id, name) VALUES ($1, 'Cloud Tech B') RETURNING id`,
    [tenantB.id]
  );

  const { rows: [internship] } = await dbClient.query(
    `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
     VALUES ($1, $2, $3, 'Software Engineer Intern', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`,
    [tenantA.id, studentId, company.id]
  );
  const { rows: [internshipB] } = await dbClient.query(
    `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
     VALUES ($1, $2, $3, 'QA Intern', '2026-07-01', '2026-10-01', 120, 'ACTIVE') RETURNING id`,
    [tenantB.id, studentBId, companyB.id]
  );

  // 5. Mentor Assignment
  await dbClient.query(
    `INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type)
     VALUES ($1, $2, 'COMPANY')`,
    [internship.id, mentorId]
  );

  // 6. Faculty Assignment
  const { rows: [dept] } = await dbClient.query(
    `INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'CS Dept') RETURNING id`,
    [tenantA.id]
  );
  const { rows: [prog] } = await dbClient.query(
    `INSERT INTO public.programs (department_id, name) VALUES ($1, 'MCA') RETURNING id`,
    [dept.id]
  );
  const { rows: [batch] } = await dbClient.query(
    `INSERT INTO public.batches (program_id, name) VALUES ($1, 'MCA-2026') RETURNING id`,
    [prog.id]
  );
  await dbClient.query(
    `INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'STU-001')`,
    [memStudent, batch.id]
  );
  await dbClient.query(
    `INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`,
    [facultyId, batch.id]
  );

  fixtures = {
    tenantAId: tenantA.id, tenantBId: tenantB.id,
    studentId, studentBId, mentorId, facultyId, adminAId, adminBId,
    internshipId: internship.id, internshipBId: internshipB.id,
    memStudent, memStudentB
  };

  console.log('[CLOUD TEST] Cloud fixtures setup complete.');
}

async function getRealTokens() {
  console.log('[CLOUD TEST] Authenticating test users via real Supabase Auth...');
  
  const acquireToken = async (email) => {
    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password: TEST_PASSWORD
    });
    if (error || !data.session) {
      throw new Error(`Auth sign-in failed for ${email}: ${error?.message}`);
    }
    return data.session.access_token;
  };

  const tokStudent = await acquireToken('cloud-student-a@example.com');
  const tokStudentB = await acquireToken('cloud-student-b@example.com');
  const tokMentor = await acquireToken('cloud-mentor@example.com');
  const tokFaculty = await acquireToken('cloud-faculty@example.com');
  const tokAdminA = await acquireToken('cloud-admin-a@example.com');
  const tokAdminB = await acquireToken('cloud-admin-b@example.com');

  return { tokStudent, tokStudentB, tokMentor, tokFaculty, tokAdminA, tokAdminB };
}

async function runE2EWorkflow(tokens) {
  const { tokStudent, tokStudentB, tokMentor, tokFaculty, tokAdminA, tokAdminB } = tokens;
  const { internshipId, internshipBId, studentId, studentBId } = fixtures;

  // Step 1: Student Active Internship Retrieval
  const rInt = await api(tokStudent).get('/api/v2/internships');
  const activeInt = (rInt.data?.data || []).find(i => i.id === internshipId);
  logStep('1', 'Student Internship Verification', activeInt && activeInt.status === 'ACTIVE' ? 'PASS' : 'FAIL', `Active internship found: ${!!activeInt}`);

  // ── TASK 3: Direct PostgREST Bypass Auditing ─────────────────────────────
  const userClient = createUserContextClient(tokStudent);

  // A. Student direct INSERT with APPROVED status -> BLOCKED
  const { data: directInsertData, error: directInsertError } = await userClient
    .from('daily_logs')
    .insert({
      internship_id: internshipId,
      date: '2026-07-07',
      notes: 'Direct bypass attempt',
      status: 'APPROVED'
    })
    .select();
  const directInsertBlocked = directInsertError || !directInsertData || directInsertData.length === 0;
  const { rows: directInsertedRows } = await dbClient.query(
    `SELECT 1 FROM public.daily_logs WHERE internship_id = $1 AND date = '2026-07-07'`,
    [internshipId]
  );
  const dbVerifiedInsertBlocked = directInsertedRows.length === 0;
  logStep('A', 'Student direct INSERT with APPROVED status', (directInsertBlocked && dbVerifiedInsertBlocked) ? 'PASS' : 'FAIL');

  // B. Student direct UPDATE DRAFT -> APPROVED -> BLOCKED
  const { rows: [draftLogB] } = await dbClient.query(
    `INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, '2026-07-08', 'DRAFT log B', 'DRAFT') RETURNING id`,
    [internshipId]
  );
  const { data: updateApprovedData, error: updateApprovedErr } = await userClient
    .from('daily_logs')
    .update({ status: 'APPROVED' })
    .eq('id', draftLogB.id)
    .select();
  const updateApprovedBlocked = updateApprovedErr || !updateApprovedData || updateApprovedData.length === 0;
  const { rows: [dbDraftLogB] } = await dbClient.query(`SELECT status FROM public.daily_logs WHERE id = $1`, [draftLogB.id]);
  const dbVerifiedBApprovedBlocked = dbDraftLogB && dbDraftLogB.status === 'DRAFT';
  logStep('B', 'Student direct UPDATE DRAFT -> APPROVED', (updateApprovedBlocked && dbVerifiedBApprovedBlocked) ? 'PASS' : 'FAIL');
  await dbClient.query(`DELETE FROM public.daily_logs WHERE id = $1`, [draftLogB.id]);

  // C. Student direct UPDATE DRAFT -> CORRECTION_REQUESTED -> BLOCKED
  const { rows: [draftLogC] } = await dbClient.query(
    `INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, '2026-07-08', 'DRAFT log C', 'DRAFT') RETURNING id`,
    [internshipId]
  );
  const { data: updateCorrData, error: updateCorrErr } = await userClient
    .from('daily_logs')
    .update({ status: 'CORRECTION_REQUESTED' })
    .eq('id', draftLogC.id)
    .select();
  const updateCorrBlocked = updateCorrErr || !updateCorrData || updateCorrData.length === 0;
  const { rows: [dbDraftLogC] } = await dbClient.query(`SELECT status FROM public.daily_logs WHERE id = $1`, [draftLogC.id]);
  const dbVerifiedBCorrBlocked = dbDraftLogC && dbDraftLogC.status === 'DRAFT';
  logStep('C', 'Student direct UPDATE DRAFT -> CORRECTION_REQUESTED', (updateCorrBlocked && dbVerifiedBCorrBlocked) ? 'PASS' : 'FAIL');
  await dbClient.query(`DELETE FROM public.daily_logs WHERE id = $1`, [draftLogC.id]);

  // D. Student direct unauthorized status transition (DRAFT -> SUBMITTED) -> BLOCKED
  const { rows: [draftLogD] } = await dbClient.query(
    `INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, '2026-07-08', 'DRAFT log D', 'DRAFT') RETURNING id`,
    [internshipId]
  );
  const { data: updateSubData, error: updateSubErr } = await userClient
    .from('daily_logs')
    .update({ status: 'SUBMITTED' })
    .eq('id', draftLogD.id)
    .select();
  const updateSubBlocked = updateSubErr || !updateSubData || updateSubData.length === 0;
  const { rows: [dbDraftLogD] } = await dbClient.query(`SELECT status FROM public.daily_logs WHERE id = $1`, [draftLogD.id]);
  const dbVerifiedBSubBlocked = dbDraftLogD && dbDraftLogD.status === 'DRAFT';
  logStep('D', 'Student direct unauthorized status transition', (updateSubBlocked && dbVerifiedBSubBlocked) ? 'PASS' : 'FAIL');
  await dbClient.query(`DELETE FROM public.daily_logs WHERE id = $1`, [draftLogD.id]);

  // E. Student direct modification of another student's log -> BLOCKED
  const { rows: [logStudentB] } = await dbClient.query(
    `INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, '2026-07-09', 'Student B log', 'DRAFT') RETURNING id`,
    [internshipBId]
  );
  const { data: updateOtherData, error: updateOtherErr } = await userClient
    .from('daily_logs')
    .update({ notes: 'Hacked notes' })
    .eq('id', logStudentB.id)
    .select();
  const updateOtherBlocked = updateOtherErr || !updateOtherData || updateOtherData.length === 0;
  const { rows: [dbOtherLog] } = await dbClient.query(`SELECT notes FROM public.daily_logs WHERE id = $1`, [logStudentB.id]);
  const dbVerifiedOtherBlocked = dbOtherLog && dbOtherLog.notes === 'Student B log';
  logStep('E', 'Student direct modification of another student\'s log', (updateOtherBlocked && dbVerifiedOtherBlocked) ? 'PASS' : 'FAIL');

  // F. Cross-tenant daily-log modification -> BLOCKED
  const { rows: [draftLogF] } = await dbClient.query(
    `INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, '2026-07-08', 'DRAFT log F', 'DRAFT') RETURNING id`,
    [internshipId]
  );
  const adminBClient = createUserContextClient(tokAdminB);
  const { data: updateTenantData, error: updateTenantErr } = await adminBClient
    .from('daily_logs')
    .update({ notes: 'Cross tenant admin hack' })
    .eq('id', draftLogF.id)
    .select();
  const updateTenantBlocked = updateTenantErr || !updateTenantData || updateTenantData.length === 0;
  logStep('F', 'Cross-tenant daily-log modification', updateTenantBlocked ? 'PASS' : 'FAIL');

  // Clean up temporary check logs
  await dbClient.query(`DELETE FROM public.daily_logs WHERE id IN ($1, $2)`, [draftLogF.id, logStudentB.id]);

  // ── G. Legitimate student create/edit/submit RPC lifecycle ────────────────
  // Step 2: Student Creates Daily Log (DRAFT)
  const rCreateLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs`, {
    date: '2026-07-06',
    notes: 'Draft daily notes',
    tasks: [{ description: 'Cloud deployment testing', hours: 5.5 }]
  });
  const logId = rCreateLog.data?.data?.id;
  logStep('2', 'Student Creates Daily Log (DRAFT)', rCreateLog.status === 201 && logId ? 'PASS' : 'FAIL', `Log ID: ${logId}`);

  // Step 3: Student Updates Daily Log
  const rUpdateLog = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/logs/${logId}`, {
    notes: 'Draft daily notes v2',
    tasks: [{ description: 'Cloud deployment testing and RLS audit', hours: 6.5 }]
  });
  logStep('3', 'Student Updates Daily Log', rUpdateLog.status === 200 && rUpdateLog.data?.data?.notes === 'Draft daily notes v2' ? 'PASS' : 'FAIL');

  // Step 4: Student Submits Daily Log
  const rSubmitLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs/${logId}/submit`);
  logStep('4', 'Student Submits Daily Log', rSubmitLog.status === 200 && rSubmitLog.data?.data?.status === 'SUBMITTED' ? 'PASS' : 'FAIL');

  logStep('G', 'Legitimate student create/edit/submit RPC lifecycle', 
    (rCreateLog.status === 201 && rUpdateLog.status === 200 && rSubmitLog.status === 200) ? 'PASS' : 'FAIL'
  );

  // Step 5: Assigned Company Mentor Review Queue Visibility
  const rQueue = await api(tokMentor).get('/api/v2/mentor/review-queue');
  const queueItems = rQueue.data?.data || [];
  const inQueue = queueItems.find(q => q.id === logId);
  logStep('5', 'Company Mentor Queue Visibility', rQueue.status === 200 && inQueue ? 'PASS' : 'FAIL', `Queue length: ${queueItems.length}`);

  // ── H. Legitimate assigned Company Mentor correction ──────────────────────
  // Step 6: Company Mentor Requests Correction
  const rCorrLog = await api(tokMentor).post(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    feedback: 'Please explain what RLS scenarios were tested.'
  });
  logStep('6', 'Company Mentor Requests Correction', rCorrLog.status === 201 && rCorrLog.data?.data?.status === 'CORRECTION_REQUESTED' ? 'PASS' : 'FAIL');
  logStep('H', 'Legitimate assigned Company Mentor correction', rCorrLog.status === 201 ? 'PASS' : 'FAIL');

  // ── I. Student correction edit/resubmit ───────────────────────────────────
  // Step 7: Student Corrects & Resubmits
  const rCorrectLog = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/logs/${logId}`, {
    notes: 'Draft daily notes v3',
    tasks: [{ description: 'Cloud deployment testing and tested RLS policies', hours: 7.0 }]
  });
  const rResubmitLog = await api(tokStudent).post(`/api/v2/internships/${internshipId}/logs/${logId}/submit`);
  const logCorrected = rCorrectLog.status === 200 && rResubmitLog.status === 200 && rResubmitLog.data?.data?.status === 'SUBMITTED';
  logStep('7', 'Student Corrects & Resubmits Daily Log', logCorrected ? 'PASS' : 'FAIL');
  logStep('I', 'Student correction edit/resubmit', logCorrected ? 'PASS' : 'FAIL');

  // ── J. Legitimate assigned Company Mentor approval ────────────────────────
  // Step 8: Company Mentor Approves Daily Log
  const rApproveLog = await api(tokMentor).post(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`, {
    decision: 'APPROVED',
    feedback: 'Excellent details.'
  });
  logStep('8', 'Company Mentor Approves Daily Log', rApproveLog.status === 201 && rApproveLog.data?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL');
  logStep('J', 'Legitimate assigned Company Mentor approval', rApproveLog.status === 201 ? 'PASS' : 'FAIL');

  // Step 9: Verify Approved Hours Update
  const rIntCheck = await api(tokStudent).get(`/api/v2/internships/${internshipId}`);
  const intDetails = rIntCheck.data?.data;
  const approvedHours = intDetails?.hours_summary?.approved_hours;
  const hoursOk = intDetails && parseFloat(approvedHours) === 7.0;
  logStep('9', 'Internship Approved Hours Updates', hoursOk ? 'PASS' : 'FAIL', `Approved hours: ${approvedHours}`);

  // Step 10: Student Creates Weekly Report
  const rCreateWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports`, {
    start_date: '2026-07-06',
    end_date: '2026-07-12',
    student_notes: 'Cloud deployment week notes',
    daily_log_ids: [logId]
  });
  const wrId = rCreateWr.data?.data?.id;
  logStep('10', 'Student Creates Weekly Report (DRAFT)', rCreateWr.status === 201 && wrId ? 'PASS' : 'FAIL', `Report ID: ${wrId}`);

  // Step 11: Student Submits Weekly Report
  const rSubmitWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/submit`);
  logStep('11', 'Student Submits Weekly Report', rSubmitWr.status === 200 && rSubmitWr.data?.data?.status === 'SUBMITTED' ? 'PASS' : 'FAIL');

  // Step 12: Faculty Queue Visibility
  const rFacQueue = await api(tokFaculty).get('/api/v2/faculty/review-queue');
  const facQueue = rFacQueue.data?.data || [];
  const inFacQueue = facQueue.find(q => q.id === wrId);
  logStep('12', 'Faculty Queue Visibility', rFacQueue.status === 200 && inFacQueue ? 'PASS' : 'FAIL', `Queue length: ${facQueue.length}`);

  // Step 13: Faculty Requests Correction
  const rCorrWr = await api(tokFaculty).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`, {
    decision: 'CORRECTION_REQUESTED',
    remarks: 'Please expand your student notes.'
  });
  logStep('13', 'Faculty Requests Correction', rCorrWr.status === 201 && rCorrWr.data?.data?.status === 'CORRECTION_REQUESTED' ? 'PASS' : 'FAIL');

  // Step 14: Student Updates and Resubmits Weekly Report
  const rEditWr = await api(tokStudent).patch(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`, {
    student_notes: 'Updated cloud deployment week notes v2'
  });
  const rResubmitWr = await api(tokStudent).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/submit`);
  const wrResubmitted = rEditWr.status === 200 && rResubmitWr.status === 200 && rResubmitWr.data?.data?.status === 'SUBMITTED';
  logStep('14', 'Student Updates & Resubmits Weekly Report', wrResubmitted ? 'PASS' : 'FAIL');

  // Step 15: Faculty Approves Weekly Report
  const rApproveWr = await api(tokFaculty).post(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`, {
    decision: 'APPROVED',
    remarks: 'Approved weekly report!'
  });
  logStep('15', 'Faculty Approves Weekly Report', rApproveWr.status === 201 && rApproveWr.data?.data?.status === 'APPROVED' ? 'PASS' : 'FAIL');

  // Step 16: Verify Review Histories
  const rLogHist = await api(tokStudent).get(`/api/v2/internships/${internshipId}/logs/${logId}/reviews`);
  const rWrHist = await api(tokStudent).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}/reviews`);
  const logReviews = rLogHist.data?.data || [];
  const wrReviews = rWrHist.data?.data || [];
  const histOk = logReviews.length === 2 && wrReviews.length === 2;
  logStep('16', 'Review Histories Intact & Chronological', histOk ? 'PASS' : 'FAIL', `Log reviews: ${logReviews.length}, Report reviews: ${wrReviews.length}`);

  // Step 17: Verify Audit Events Sequence
  const { rows: auditLogs } = await dbClient.query(
    `SELECT action, target_table FROM public.audit_logs 
     WHERE (target_table = 'daily_logs' AND target_id = $1) 
        OR (target_table = 'weekly_reports' AND target_id = $2)
     ORDER BY created_at ASC`, [logId, wrId]
  );
  const expectedLogActions = ['LOG_CORRECTION_REQUESTED', 'LOG_APPROVED'];
  const expectedWrActions = ['WEEKLY_REPORT_SUBMITTED', 'WEEKLY_REPORT_CORRECTION_REQUESTED', 'WEEKLY_REPORT_SUBMITTED', 'WEEKLY_REPORT_APPROVED'];
  const actualLogActions = auditLogs.filter(a => a.target_table === 'daily_logs').map(a => a.action);
  const actualWrActions = auditLogs.filter(a => a.target_table === 'weekly_reports').map(a => a.action);
  const auditsComplete = 
    JSON.stringify(actualLogActions) === JSON.stringify(expectedLogActions) &&
    JSON.stringify(actualWrActions) === JSON.stringify(expectedWrActions);
  logStep('17', 'Audit Events Sequence Verification', auditsComplete ? 'PASS' : 'FAIL');

  // Step 18: Tenant Admin Visibility Scope
  const rAdminRead = await api(tokAdminA).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('18', 'Tenant Admin Read Scope (Own Tenant)', rAdminRead.status === 200 ? 'PASS' : 'FAIL');

  // Step 19: Cross-Tenant Isolation
  const rAdminReadB = await api(tokAdminB).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('19', 'Tenant Admin Cross-Tenant Isolation (Other Tenant Blocked)', rAdminReadB.status === 404 ? 'PASS' : 'FAIL');

  // Step 20: Cross-Tenant Student Isolation
  const rStudentReadB = await api(tokStudentB).get(`/api/v2/internships/${internshipId}/weekly-reports/${wrId}`);
  logStep('20', 'Student Cross-Tenant Isolation', rStudentReadB.status === 404 ? 'PASS' : 'FAIL');

  // Step 21: Confused-Parent Route Parameter Mismatch Protection
  const rConfused = await api(tokStudent).get(`/api/v2/internships/${internshipBId}/weekly-reports/${wrId}`);
  logStep('21', 'Confused-Parent Route Parameter Mismatch Check', rConfused.status === 404 ? 'PASS' : 'FAIL');

  // Step 22: Private Audit Event Helper Direct Execution Block
  let directAuditFail = false;
  try {
    const { error } = await userClient.rpc('log_audit_event', {
      p_tenant_id: fixtures.tenantAId,
      p_action: 'HACK',
      p_target_table: 'weekly_reports',
      p_target_id: wrId
    });
    if (error) {
      directAuditFail = true;
    }
  } catch (err) {
    directAuditFail = true;
  }
  logStep('22', 'Private Helper Function Security Block', directAuditFail ? 'PASS' : 'FAIL');

  // Step 23: Direct PostgREST Write-Bypass Prevention (Try to directly approve Weekly Report via PostgREST)
  let directWriteFail = false;
  try {
    const { data: updateData, error } = await userClient
      .from('weekly_reports')
      .update({ status: 'APPROVED' })
      .eq('id', wrId)
      .select();
    if (error || !updateData || updateData.length === 0) {
      directWriteFail = true;
    }
  } catch (err) {
    directWriteFail = true;
  }
  logStep('23', 'Direct PostgREST Write-Bypass Prevention', directWriteFail ? 'PASS' : 'FAIL');

  // Step 24: Legacy API Route Isolation Check
  const rLegacy1 = await api().get('/api/daily-log');
  const rLegacy2 = await api(tokStudent).get('/api/daily-log');
  const legacyBlocked = rLegacy1.status === 401 && rLegacy2.status === 401;
  logStep('24', 'Legacy Router Isolation & Auth Security Check', legacyBlocked ? 'PASS' : 'FAIL');

  // Step 25: New V2 Route Auth Protection
  const rV2Anon = await api().get(`/api/v2/internships/${internshipId}/weekly-reports`);
  const v2AnonBlocked = rV2Anon.status === 401;
  logStep('25', 'New V2 Routes Auth Protection', v2AnonBlocked ? 'PASS' : 'FAIL');

  // ── Direct log_reviews and audit_logs direct write block checks ───────────
  const { error: directReviewErr } = await userClient
    .from('log_reviews')
    .insert({
      daily_log_id: logId,
      reviewed_by: studentId,
      status: 'APPROVED',
      feedback: 'Self approved'
    });
  const directReviewBlocked = !!directReviewErr;
  logStep('K', 'Direct log_reviews insert block', directReviewBlocked ? 'PASS' : 'FAIL');

  const { error: directAuditLogErr } = await userClient
    .from('audit_logs')
    .insert({
      tenant_id: fixtures.tenantAId,
      action: 'LOG_APPROVED',
      target_table: 'daily_logs',
      target_id: logId
    });
  const directAuditLogBlocked = !!directAuditLogErr;
  logStep('L', 'Direct audit_logs insert block', directAuditLogBlocked ? 'PASS' : 'FAIL');
}

// User-context client factory helper
function createUserContextClient(jwtToken) {
  return createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`
      }
    }
  });
}

async function runAll() {
  try {
    await preCleanup();
    await createFixtures();
    const tokens = await getRealTokens();
    await runE2EWorkflow(tokens);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('CLOUD INTEGRATION VERIFICATION SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    let totalPassed = 0;
    for (const r of auditResults) {
      if (r.status === 'PASS') totalPassed++;
      console.log(`[${r.status}] Step ${r.stepNumber}: ${r.stepName}`);
    }
    console.log(`\nTOTAL PASSED: ${totalPassed} / ${auditResults.length}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    if (totalPassed < auditResults.length) {
      console.error('[CLOUD TEST] Test suite failed with integration issues.');
      process.exit(1);
    } else {
      console.log('[CLOUD TEST] End-to-end cloud integration verification completed successfully!');
    }
  } catch (err) {
    console.error('[CLOUD TEST] Critical execution error:', err.message);
    process.exit(1);
  } finally {
    await preCleanup().catch(() => {});
    if (dbClient) await dbClient.end().catch(() => {});
  }
}

runAll();
