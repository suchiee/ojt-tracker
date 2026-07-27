// Script: server/scripts/execute_phase1l_pilot.js
// Phase 1L Controlled Production Pilot Execution Script

const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const SUPABASE_URL = 'https://rzzftlekrrizjvvwsnat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';
const RENDER_API_URL = 'https://internsync-api-vjil.onrender.com/api/v2';
const prodDbUrl = process.env.DATABASE_URL || 'postgresql://postgres.rzzftlekrrizjvvwsnat:Suchi1316@sb@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const adminEmail = 'suchitra.y.1206@gmail.com';
const adminPass = 'WadiaAdmin2026!';

// Approved Pilot Dataset Configuration
const pilotData = {
  department: { name: 'Department of Computer Science', code: 'CS' },
  program: { name: 'M.Sc. Computer Science', code: 'MSC-CS' },
  batch: { name: 'M.Sc. Computer Science 2024-2026', academic_year: '2024-2026' },
  student: {
    first_name: 'Aarav',
    last_name: 'Sharma',
    email: 'aarav.sharma.demo@internsync.app',
    student_id_number: 'MSC-CS-2024-001'
  },
  faculty: {
    first_name: 'Dr. Meera',
    last_name: 'Kulkarni',
    email: 'meera.kulkarni.demo@internsync.app'
  },
  company: {
    name: 'Persistent Systems Ltd.',
    website: 'https://www.persistent.com'
  },
  mentor: {
    first_name: 'Rahul',
    last_name: 'Deshpande',
    email: 'rahul.deshpande.demo@internsync.app'
  },
  internship: {
    job_role: 'Software Developer Intern',
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    total_hours: 300
  }
};

let passCount = 0;
let failCount = 0;

function logPass(title, message) {
  passCount++;
  console.log(`[PILOT PASS ${passCount}] ${title}: ${message}`);
}

function logFail(title, message) {
  failCount++;
  console.error(`[PILOT FAIL ${failCount}] ${title}: ${message}`);
}

async function runControlledPilot() {
  console.log('=== EXECUTING PHASE 1L CONTROLLED PRODUCTION PILOT ===\n');

  // 1. Authenticate Admin
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPass
  });

  if (authError || !authData.session) {
    console.error('Admin authentication failed:', authError?.message);
    process.exit(1);
  }

  const adminToken = authData.session.access_token;
  logPass('Admin Authentication', `Authenticated Admin "${adminEmail}".`);

  const adminApi = axios.create({
    baseURL: RENDER_API_URL,
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // DB client for direct verification queries
  const dbClient = new Client({ connectionString: prodDbUrl, ssl: { rejectUnauthorized: false } });
  await dbClient.connect();

  try {
    // ── STEP 4: Create Academic Structure ────────────────────────────────────
    console.log('\n--- STEP 4: Creating Academic Structure ---');
    let departmentId, programId, batchId;

    try {
      const deptRes = await adminApi.post('/admin/departments', { name: pilotData.department.name });
      departmentId = deptRes.data.data.id;
      logPass('Create Department', `Created Department "${pilotData.department.name}" (ID: ${departmentId}).`);
    } catch (err) {
      const structRes = await adminApi.get('/admin/academic-structure');
      const dept = structRes.data.data.find(d => d.name === pilotData.department.name);
      departmentId = dept.id;
      logPass('Reuse Department', `Reused Department "${pilotData.department.name}" (ID: ${departmentId}).`);
    }

    try {
      const progRes = await adminApi.post('/admin/programs', { department_id: departmentId, name: pilotData.program.name });
      programId = progRes.data.data.id;
      logPass('Create Program', `Created Program "${pilotData.program.name}" (ID: ${programId}).`);
    } catch (err) {
      const structRes = await adminApi.get('/admin/academic-structure');
      const dept = structRes.data.data.find(d => d.id === departmentId);
      const prog = dept.programs.find(p => p.program_name === pilotData.program.name);
      programId = prog.program_id;
      logPass('Reuse Program', `Reused Program "${pilotData.program.name}" (ID: ${programId}).`);
    }

    try {
      const batchRes = await adminApi.post('/admin/batches', { program_id: programId, name: pilotData.batch.name });
      batchId = batchRes.data.data.id;
      logPass('Create Batch', `Created Batch "${pilotData.batch.name}" (ID: ${batchId}).`);
    } catch (err) {
      const structRes = await adminApi.get('/admin/academic-structure');
      const dept = structRes.data.data.find(d => d.id === departmentId);
      const prog = dept.programs.find(p => p.program_id === programId);
      const batch = prog.batches.find(b => b.batch_name === pilotData.batch.name);
      batchId = batch.batch_id;
      logPass('Reuse Batch', `Reused Batch "${pilotData.batch.name}" (ID: ${batchId}).`);
    }

    // ── STEP 5: Provision Controlled Pilot Users ─────────────────────────────
    console.log('\n--- STEP 5: Provisioning Pilot Users ---');
    
    // Provision Student
    const studRes = await adminApi.post('/admin/provision/student', {
      email: pilotData.student.email,
      first_name: pilotData.student.first_name,
      last_name: pilotData.student.last_name,
      student_id_number: pilotData.student.student_id_number,
      batch_id: batchId
    });
    const studentUserId = studRes.data.data.user_id;
    logPass('Provision Student', `Provisioned Student "${pilotData.student.first_name} ${pilotData.student.last_name}" (User ID: ${studentUserId}).`);

    // Provision Faculty Advisor
    const facRes = await adminApi.post('/admin/provision/faculty', {
      email: pilotData.faculty.email,
      first_name: pilotData.faculty.first_name,
      last_name: pilotData.faculty.last_name,
      batch_ids: [batchId]
    });
    const facultyUserId = facRes.data.data.user_id;
    logPass('Provision Faculty Advisor', `Provisioned Faculty "${pilotData.faculty.first_name} ${pilotData.faculty.last_name}" (User ID: ${facultyUserId}).`);

    // Provision Company Mentor
    const menRes = await adminApi.post('/admin/provision/mentor', {
      email: pilotData.mentor.email,
      first_name: pilotData.mentor.first_name,
      last_name: pilotData.mentor.last_name
    });
    const mentorUserId = menRes.data.data.user_id;
    logPass('Provision Company Mentor', `Provisioned Mentor "${pilotData.mentor.first_name} ${pilotData.mentor.last_name}" (User ID: ${mentorUserId}).`);

    // ── STEP 7: Create Pilot Company ──────────────────────────────────────────
    console.log('\n--- STEP 7: Creating Host Company ---');
    const compRes = await adminApi.post('/admin/companies', {
      name: pilotData.company.name,
      website: pilotData.company.website
    });
    const companyId = compRes.data.data.id;
    logPass('Create Company', `Created Company "${pilotData.company.name}" (ID: ${companyId}).`);

    // ── STEP 8: Create Pilot Internship ───────────────────────────────────────
    console.log('\n--- STEP 8: Creating Internship ---');
    const intRes = await adminApi.post('/admin/internships', {
      student_id: studentUserId,
      company_id: companyId,
      job_role: pilotData.internship.job_role,
      start_date: pilotData.internship.start_date,
      end_date: pilotData.internship.end_date,
      total_hours: pilotData.internship.total_hours,
      status: 'ACTIVE'
    });
    const internshipId = intRes.data.data.id;
    logPass('Create Internship', `Created Internship for Student (ID: ${internshipId}).`);

    // ── STEP 9 & 10: Assign Mentor & Faculty ─────────────────────────────────
    console.log('\n--- STEP 9 & 10: Assigning Mentor & Faculty ---');
    await adminApi.post(`/admin/internships/${internshipId}/mentors`, {
      mentor_user_id: mentorUserId,
      is_primary: true
    });
    logPass('Assign Mentor', `Assigned Company Mentor ID ${mentorUserId} to Internship ID ${internshipId}.`);

    await adminApi.post(`/admin/batches/${batchId}/faculty`, {
      faculty_user_id: facultyUserId
    });
    logPass('Assign Faculty', `Assigned Faculty ID ${facultyUserId} to Batch ID ${batchId}.`);

    // ── STEP 12: Controlled Daily Log Workflow ────────────────────────────────
    console.log('\n--- STEP 12: Executing Controlled Daily Log Workflow ---');
    
    // Authenticate Student
    const { data: studentAuth } = await supabase.auth.signInWithPassword({
      email: pilotData.student.email,
      password: 'StagingPassword123!'
    });
    const studentToken = studentAuth.session.access_token;

    const studentApi = axios.create({
      baseURL: RENDER_API_URL,
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    // 1. Create Draft Daily Log
    const logRes = await studentApi.post(`/internships/${internshipId}/logs`, {
      date: '2026-07-15',
      tasks: [{ description: 'Implemented authentication unit tests and fixed refresh token bug', hours: 6 }]
    });
    const dailyLogId = logRes.data.data ? logRes.data.data.id : logRes.data.id;
    logPass('Daily Log Draft', `Student created DRAFT Daily Log (ID: ${dailyLogId}).`);

    // 2. Submit Daily Log
    await studentApi.post(`/internships/${internshipId}/logs/${dailyLogId}/submit`);
    logPass('Submit Daily Log', `Student submitted Daily Log (Status: SUBMITTED).`);

    // 3. Mentor Requests Correction
    const { data: mentorAuth } = await supabase.auth.signInWithPassword({
      email: pilotData.mentor.email,
      password: 'StagingPassword123!'
    });
    const mentorToken = mentorAuth.session.access_token;

    const mentorApi = axios.create({
      baseURL: RENDER_API_URL,
      headers: { Authorization: `Bearer ${mentorToken}` }
    });

    await mentorApi.post(`/internships/${internshipId}/logs/${dailyLogId}/reviews`, {
      decision: 'CORRECTION_REQUESTED',
      feedback: 'Please clarify unit test coverage metrics in task description.'
    });
    logPass('Mentor Correction Request', `Mentor requested correction with comments (Status: CORRECTION_REQUESTED).`);

    // 4. Student Updates and Resubmits
    await studentApi.patch(`/internships/${internshipId}/logs/${dailyLogId}`, {
      tasks: [{ description: 'Implemented authentication unit tests (85% coverage) and fixed refresh token bug', hours: 6 }]
    });
    await studentApi.post(`/internships/${internshipId}/logs/${dailyLogId}/submit`);
    logPass('Student Resubmit', `Student updated description and resubmitted Daily Log (Status: SUBMITTED).`);

    // 5. Mentor Approves
    await mentorApi.post(`/internships/${internshipId}/logs/${dailyLogId}/reviews`, {
      decision: 'APPROVED',
      feedback: 'Excellent work. Test coverage metrics look clear.'
    });
    logPass('Mentor Approve', `Mentor APPROVED Daily Log (Status: APPROVED).`);

    // ── STEP 13: Controlled Weekly Report Workflow ─────────────────────────────
    console.log('\n--- STEP 13: Executing Controlled Weekly Report Workflow ---');
    
    // Create Weekly Report
    const repRes = await studentApi.post(`/internships/${internshipId}/weekly-reports`, {
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      student_notes: 'Completed authentication middleware testing and verified token refresh flows.',
      daily_log_ids: [dailyLogId]
    });
    const weeklyReportId = repRes.data.data ? repRes.data.data.id : repRes.data.id;
    logPass('Weekly Report Draft', `Student created Weekly Report (ID: ${weeklyReportId}).`);

    // Submit Weekly Report
    await studentApi.post(`/internships/${internshipId}/weekly-reports/${weeklyReportId}/submit`);
    logPass('Submit Weekly Report', `Student submitted Weekly Report (Status: SUBMITTED).`);

    // Faculty Approves Weekly Report
    const { data: facultyAuth } = await supabase.auth.signInWithPassword({
      email: pilotData.faculty.email,
      password: 'StagingPassword123!'
    });
    const facultyToken = facultyAuth.session.access_token;

    const facultyApi = axios.create({
      baseURL: RENDER_API_URL,
      headers: { Authorization: `Bearer ${facultyToken}` }
    });

    await facultyApi.post(`/internships/${internshipId}/weekly-reports/${weeklyReportId}/reviews`, {
      decision: 'APPROVED',
      remarks: 'Comprehensive weekly summary and log verification approved.'
    });
    logPass('Faculty Approve', `Faculty APPROVED Weekly Report (Status: APPROVED).`);

    // ── STEP 14: Approved Hours Verification ─────────────────────────────────
    console.log('\n--- STEP 14: Verifying Hours & Dashboard Metrics ---');
    const { rows: [hours] } = await dbClient.query('SELECT logged_hours, approved_hours FROM public.internship_hours_summary WHERE internship_id = $1', [internshipId]);
    if (parseFloat(hours.logged_hours) === 6 && parseFloat(hours.approved_hours) === 6) {
      logPass('Derived Hours Calculation', `PostgreSQL view resolved 6 Logged Hours, 6 Approved Hours.`);
    } else {
      logFail('Derived Hours Calculation', `Expected 6/6, got ${hours.logged_hours}/${hours.approved_hours}`);
    }

    // ── STEP 15: Admin Overview Metrics Verification ──────────────────────────
    const overviewRes = await adminApi.get('/admin/overview');
    const overview = overviewRes.data.data || overviewRes.data;
    if (overview.total_students >= 1 && overview.active_internships >= 1 && overview.company_mentors >= 1 && overview.faculty_mentors >= 1) {
      logPass('Admin Dashboard Metrics', `Admin Overview returned ${overview.total_students} Students, ${overview.active_internships} Internships, ${overview.company_mentors} Mentors, ${overview.faculty_mentors} Faculty Advisors.`);
    } else {
      logFail('Admin Dashboard Metrics', `Unexpected metrics: ${JSON.stringify(overview)}`);
    }

    // ── STEP 16: Audit Trail Verification ─────────────────────────────────────
    const { rows: auditRows } = await dbClient.query('SELECT count(*)::int as count FROM public.audit_logs WHERE tenant_id = $1', [overview.tenant_id]);
    if (auditRows[0].count >= 1) {
      logPass('Audit Trail Verification', `${auditRows[0].count} transactional audit records logged in public.audit_logs.`);
    } else {
      logFail('Audit Trail Verification', `Expected >= 1 audit records, found ${auditRows[0].count}`);
    }

  } catch (err) {
    logFail('Pilot Execution Error', err.response?.data?.message || err.message);
    console.error(err.response?.data || err);
  } finally {
    await dbClient.end();
  }

  console.log('\n==================================================');
  console.log(`PILOT EXECUTION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runControlledPilot();
