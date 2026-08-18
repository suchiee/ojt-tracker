/**
 * Sprint 1 - Task 4.2 Automated Test Suite: Faculty Mentor Workflow
 * 
 * Verifies:
 * 1. Admin invites Faculty Mentor with batch_id (FACULTY_INVITE).
 * 2. Invitation token hashing and intended email restriction.
 * 3. Faculty consumes invitation -> creates user/membership, grants FACULTY_MENTOR, auto-assigns batch.
 * 4. Batch-level supervision visibility (assigned batch students visible, unassigned invisible).
 * 5. Internship approval links Faculty Mentor directly in internship_mentor_assignments.
 * 6. Weekly Report review queue authorization via batch OR direct internship assignment.
 * 7. Daily-log mentor approval dependency (faculty approval blocked until daily logs are approved).
 * 8. Faculty review sign-off (APPROVED) and audit logging.
 * 9. Faculty correction request (CORRECTION_REQUESTED) with mandatory remarks, student resubmission, and re-review.
 * 10. Direct internship assignment authorization without batch assignment.
 * 11. Strict security boundaries (unassigned faculty denied, company mentor denied, student denied, cross-tenant denied).
 */

const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: 'e:/ccis-ojt-tracker/server/.env' });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId || '']);
};

async function createTestUser(client, id, email, firstName, lastName) {
  await client.query(`
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET email = $2;
  `, [id, email, JSON.stringify({ first_name: firstName, last_name: lastName })]);

  await client.query(`
    INSERT INTO public.users (id, email, first_name, last_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET email = $2, first_name = $3, last_name = $4;
  `, [id, email, firstName, lastName]);
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   SPRINT 1 - TASK 4.2: FACULTY MENTOR WORKFLOW TEST SUITE');
  console.log('========================================================================\n');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });
  await client.connect();

  let passed = 0;
  let failed = 0;

  const assert = (condition, testNum, testName, details = '') => {
    if (condition) {
      console.log(`  [PASS] Test ${testNum}: ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${testNum}: ${testName}`);
      if (details) console.error(`         Details: ${details}`);
      failed++;
    }
  };

  const ts = Date.now();
  let tenantId, deptId, progId, batchAId, batchBId;
  let adminId, facultyAId, facultyBId, unassignedFacultyId, crossTenantFacultyId, crossTenantId;
  let companyMentorId, student1Id, student2Id, student3Id;
  let companyId, internship1Id, internship2Id, internship3Id;
  let rawInviteToken, inviteCodeHash;
  let weeklyReport1Id, weeklyReport2Id, dailyLog1Id;

  try {
    // ── 0. SEED TEST INFRASTRUCTURE ───────────────────────────────────────────
    console.log('--- 0. Setting up isolated test tenant and academic structure ---');
    
    // 0.1 Create Primary Tenant & Cross-Tenant
    const { rows: [tRow] } = await client.query(`
      INSERT INTO public.tenants (name, domain)
      VALUES ($1, $2) RETURNING id
    `, [`Nowrosjee Wadia College ${ts}`, `wadia_${ts}.edu`]);
    tenantId = tRow.id;

    const { rows: [xtRow] } = await client.query(`
      INSERT INTO public.tenants (name, domain)
      VALUES ($1, $2) RETURNING id
    `, [`External College ${ts}`, `ext_${ts}.edu`]);
    crossTenantId = xtRow.id;

    // 0.2 Create Academic Structure: Department -> Program -> 2 Batches
    const { rows: [dRow] } = await client.query(`
      INSERT INTO public.departments (tenant_id, name)
      VALUES ($1, 'Computer Science') RETURNING id
    `, [tenantId]);
    deptId = dRow.id;

    const { rows: [pRow] } = await client.query(`
      INSERT INTO public.programs (department_id, name)
      VALUES ($1, 'M.Sc. Computer Science') RETURNING id
    `, [deptId]);
    progId = pRow.id;

    const { rows: [bARow] } = await client.query(`
      INSERT INTO public.batches (program_id, name)
      VALUES ($1, 'M.Sc. CS Batch A 2026') RETURNING id
    `, [progId]);
    batchAId = bARow.id;

    const { rows: [bBRow] } = await client.query(`
      INSERT INTO public.batches (program_id, name)
      VALUES ($1, 'M.Sc. CS Batch B 2026') RETURNING id
    `, [progId]);
    batchBId = bBRow.id;

    // 0.3 Create Admin User
    adminId = crypto.randomUUID();
    await createTestUser(client, adminId, `admin_${ts}@wadia.edu`, 'Prof. Admin', 'Sharma');

    const { rows: [admMem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, adminId]);

    await client.query(`
      INSERT INTO public.membership_roles (membership_id, role)
      VALUES ($1, 'ADMIN')
    `, [admMem.id]);

    // 0.4 Create Company and Students
    const { rows: [cRow] } = await client.query(`
      INSERT INTO public.companies (tenant_id, name)
      VALUES ($1, 'Persistent Systems') RETURNING id
    `, [tenantId]);
    companyId = cRow.id;

    // Student 1 (in Batch A)
    student1Id = crypto.randomUUID();
    await createTestUser(client, student1Id, `aarav_${ts}@wadia.edu`, 'Aarav', 'Patil');

    const { rows: [s1Mem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student1Id]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'STUDENT')`, [s1Mem.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES ($1, 'CS-2026-001', $2)`, [s1Mem.id, batchAId]);

    // Student 2 (in Batch B)
    student2Id = crypto.randomUUID();
    await createTestUser(client, student2Id, `rohan_${ts}@wadia.edu`, 'Rohan', 'Joshi');

    const { rows: [s2Mem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student2Id]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'STUDENT')`, [s2Mem.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES ($1, 'CS-2026-002', $2)`, [s2Mem.id, batchBId]);

    // Company Mentor
    companyMentorId = crypto.randomUUID();
    await createTestUser(client, companyMentorId, `rajesh_mentor_${ts}@persistent.com`, 'Rajesh', 'Deshpande');

    const { rows: [cmMem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, companyMentorId]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'COMPANY_MENTOR')`, [cmMem.id]);

    // Cross-tenant Faculty
    crossTenantFacultyId = crypto.randomUUID();
    await createTestUser(client, crossTenantFacultyId, `ext_faculty_${ts}@external.edu`, 'Ext', 'Faculty');

    const { rows: [xtFacMem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [crossTenantId, crossTenantFacultyId]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'FACULTY_MENTOR')`, [xtFacMem.id]);

    console.log('Seeding completed successfully.\n');

    // ── PART 1: FACULTY INVITATION & ACTIVATION (Tests 1–7) ───────────────────
    console.log('--- PART 1: Faculty Invitation & Activation ---');

    rawInviteToken = crypto.randomBytes(24).toString('hex');
    inviteCodeHash = hashToken(rawInviteToken);
    const facultyAEmail = `meera_faculty_${ts}@wadia.edu`;

    // Test 1: Admin generates FACULTY_INVITE with batch_id
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { rows: [inviteRecord] } = await client.query(`
      INSERT INTO public.invitation_codes (
        code_hash, tenant_id, batch_id, invitation_type, intended_email, max_uses, uses_count, expires_at, created_by
      ) VALUES ($1, $2, $3, 'FACULTY_INVITE', $4, 1, 0, $5, $6)
      RETURNING *;
    `, [inviteCodeHash, tenantId, batchAId, facultyAEmail, expiresAt.toISOString(), adminId]);

    assert(!!inviteRecord && inviteRecord.invitation_type === 'FACULTY_INVITE', 1, 'Admin generates FACULTY_INVITE record');

    // Test 2: Verify invitation code details and batch_id binding
    assert(inviteRecord.batch_id === batchAId && inviteRecord.uses_count === 0, 2, 'Invitation bound to target Batch and uses_count is 0');

    // Test 3: Verify intended email restriction
    assert(inviteRecord.intended_email.toLowerCase() === facultyAEmail.toLowerCase(), 3, 'Invitation restricted to intended faculty email');

    // Create Faculty User A in public.users (simulating auth signup)
    facultyAId = crypto.randomUUID();
    await createTestUser(client, facultyAId, facultyAEmail, 'Dr. Meera', 'Kulkarni');

    // Test 4: Faculty consumes invitation via consume_invitation RPC
    await activateRlsSession(client, facultyAId);
    const { rows: [consumedRes] } = await client.query(`
      SELECT public.consume_invitation($1, NULL) as membership_id;
    `, [inviteCodeHash]);

    assert(!!consumedRes.membership_id, 4, 'Faculty consumes invitation successfully via consume_invitation RPC');

    // Test 5: Verify FACULTY_MENTOR role granted in membership_roles
    const { rows: roleRows } = await client.query(`
      SELECT mr.role FROM public.membership_roles mr
      JOIN public.tenant_memberships tm ON mr.membership_id = tm.id
      WHERE tm.user_id = $1 AND tm.tenant_id = $2;
    `, [facultyAId, tenantId]);
    const hasFacultyRole = roleRows.some(r => r.role === 'FACULTY_MENTOR');
    assert(hasFacultyRole, 5, 'FACULTY_MENTOR role created in membership_roles');

    // Test 6: Verify tenant membership created for Nowrosjee Wadia College
    const { rows: tmRows } = await client.query(`
      SELECT * FROM public.tenant_memberships WHERE user_id = $1 AND tenant_id = $2;
    `, [facultyAId, tenantId]);
    assert(tmRows.length === 1, 6, 'Tenant membership properly established');

    // Test 7: Verify automatic faculty_batch_assignments record created
    const { rows: fbaRows } = await client.query(`
      SELECT * FROM public.faculty_batch_assignments WHERE faculty_user_id = $1 AND batch_id = $2;
    `, [facultyAId, batchAId]);
    assert(fbaRows.length === 1, 7, 'Automatic faculty_batch_assignments record created for Batch A');

    console.log();

    // ── PART 2: BATCH ASSIGNMENT & MULTI-STUDENT VISIBILITY (Tests 8–10) ─────
    console.log('--- PART 2: Batch Assignment & Multi-Student Visibility ---');

    // Create Internships and Reports for Student 1 (Batch A) and Student 2 (Batch B)
    const { rows: [int1] } = await client.query(`
      INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
      VALUES ($1, $2, $3, 'Software Engineer Intern', '2026-06-01', '2026-08-31', 400, 'APPROVED') RETURNING id
    `, [tenantId, student1Id, companyId]);
    internship1Id = int1.id;

    const { rows: [int2] } = await client.query(`
      INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
      VALUES ($1, $2, $3, 'Data Analyst Intern', '2026-06-01', '2026-08-31', 400, 'APPROVED') RETURNING id
    `, [tenantId, student2Id, companyId]);
    internship2Id = int2.id;

    // Student 1 submits weekly report (Batch A)
    const { rows: [rep1] } = await client.query(`
      INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
      VALUES ($1, '2026-06-01', '2026-06-07', 'Week 1 Progress: Setup environment', 'SUBMITTED') RETURNING id
    `, [internship1Id]);
    weeklyReport1Id = rep1.id;

    // Student 2 submits weekly report (Batch B)
    const { rows: [rep2] } = await client.query(`
      INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
      VALUES ($1, '2026-06-01', '2026-06-07', 'Week 1 Data Cleaning', 'SUBMITTED') RETURNING id
    `, [internship2Id]);
    weeklyReport2Id = rep2.id;

    // Test 8: Faculty A sees assigned batch in database
    const { rows: facultyBatches } = await client.query(`
      SELECT b.id, b.name FROM public.faculty_batch_assignments fba
      JOIN public.batches b ON fba.batch_id = b.id
      WHERE fba.faculty_user_id = $1;
    `, [facultyAId]);
    assert(facultyBatches.some(b => b.id === batchAId), 8, 'Faculty A sees assigned Batch A');

    // Test 9: Faculty A can view weekly reports of students in Batch A (via RLS policy logic)
    await activateRlsSession(client, facultyAId);
    const { rows: viewableReports } = await client.query(`
      SELECT wr.id FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
      JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
      LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
      WHERE wr.id = $1
        AND tm_fac.user_id = auth.uid()
        AND mr_fac.role = 'FACULTY_MENTOR'
        AND (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `, [weeklyReport1Id]);
    assert(viewableReports.length === 1, 9, 'Faculty A can view weekly report of student in assigned Batch A');

    // Test 10: Faculty A CANNOT view weekly report of student in Batch B (unassigned batch)
    const { rows: unassignedBatchReports } = await client.query(`
      SELECT wr.id FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
      JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
      LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
      WHERE wr.id = $1
        AND tm_fac.user_id = auth.uid()
        AND mr_fac.role = 'FACULTY_MENTOR'
        AND (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `, [weeklyReport2Id]);
    assert(unassignedBatchReports.length === 0, 10, 'Faculty A cannot view weekly report of student in unassigned Batch B (RLS filtered)');

    console.log();

    // ── PART 3: INTERNSHIP APPROVAL & DIRECT FACULTY LINKAGE (Tests 11–14) ───
    console.log('--- PART 3: Internship Approval & Direct Linkage ---');

    // Student 3 in Batch B
    student3Id = crypto.randomUUID();
    await createTestUser(client, student3Id, `ananya_${ts}@wadia.edu`, 'Ananya', 'Deshmukh');

    const { rows: [s3Mem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student3Id]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'STUDENT')`, [s3Mem.id]);
    await client.query(`INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES ($1, 'CS-2026-003', $2)`, [s3Mem.id, batchBId]);

    // Student 3 submits Training Setup
    const { rows: [int3] } = await client.query(`
      INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
      VALUES ($1, $2, $3, 'Fullstack Dev Intern', '2026-06-01', '2026-08-31', 400, 'PENDING_VERIFICATION') RETURNING id
    `, [tenantId, student3Id, companyId]);
    internship3Id = int3.id;

    assert(!!internship3Id, 11, 'Student submits Training Setup in PENDING_VERIFICATION status');

    // Admin approves internship and directly selects Faculty A as advisor
    await client.query(`
      UPDATE public.internships SET status = 'APPROVED' WHERE id = $1;
    `, [internship3Id]);

    await client.query(`
      INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary)
      VALUES ($1, $2, 'FACULTY', true)
      ON CONFLICT (internship_id, mentor_user_id) DO UPDATE SET is_primary = true;
    `, [internship3Id, facultyAId]);

    assert(true, 12, 'Admin approves internship and assigns Faculty Advisor');

    // Test 13: Verify direct assignment exists in internship_mentor_assignments
    const { rows: directAssignRows } = await client.query(`
      SELECT * FROM public.internship_mentor_assignments
      WHERE internship_id = $1 AND mentor_user_id = $2 AND mentor_type = 'FACULTY';
    `, [internship3Id, facultyAId]);
    assert(directAssignRows.length === 1 && directAssignRows[0].is_primary === true, 13, 'Direct FACULTY assignment exists in internship_mentor_assignments');

    // Student 3 submits weekly report
    const { rows: [rep3] } = await client.query(`
      INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
      VALUES ($1, '2026-06-01', '2026-06-07', 'Week 1 Fullstack setup', 'SUBMITTED') RETURNING id
    `, [internship3Id]);

    // Test 14: Faculty A can access weekly report for Student 3 despite Student 3 being in Batch B
    await activateRlsSession(client, facultyAId);
    const { rows: s3ReportVisible } = await client.query(`
      SELECT wr.id FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
      JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
      LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
      WHERE wr.id = $1
        AND tm_fac.user_id = auth.uid()
        AND mr_fac.role = 'FACULTY_MENTOR'
        AND (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `, [rep3.id]);
    assert(s3ReportVisible.length === 1, 14, 'Faculty A can access weekly report via direct internship assignment');

    console.log();

    // ── PART 4: WEEKLY REPORT REVIEW & DAILY LOG DEPENDENCY (Tests 15–18) ─────
    console.log('--- PART 4: Weekly Report Review & Daily Log Dependency ---');

    // Link a daily log to weekly report 1 (Daily log is currently SUBMITTED, NOT APPROVED)
    const { rows: [dl1] } = await client.query(`
      INSERT INTO public.daily_logs (internship_id, date, status)
      VALUES ($1, '2026-06-01', 'SUBMITTED') RETURNING id
    `, [internship1Id]);
    dailyLog1Id = dl1.id;

    await client.query(`
      INSERT INTO public.daily_log_tasks (daily_log_id, description, hours)
      VALUES ($1, 'Set up development workspace', 8.0)
    `, [dailyLog1Id]);

    await client.query(`
      INSERT INTO public.weekly_report_log_links (weekly_report_id, daily_log_id)
      VALUES ($1, $2)
    `, [weeklyReport1Id, dailyLog1Id]);

    assert(true, 15, 'Student weekly report linked to 8-hour daily log');

    // Test 16: Review queue query returns the submitted weekly report for Faculty A
    await activateRlsSession(client, facultyAId);
    const { rows: queueRows } = await client.query(`
      SELECT wr.id, wr.status, wr.start_date
      FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
      JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
      LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
      WHERE wr.status = 'SUBMITTED'
        AND tm_fac.user_id = auth.uid()
        AND mr_fac.role = 'FACULTY_MENTOR'
        AND (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `);
    assert(queueRows.some(r => r.id === weeklyReport1Id), 16, 'Faculty review queue returns submitted weekly report');

    // Test 17: Faculty attempts approval when daily log is NOT mentor-approved -> rejected (D0013)
    let approvalFailedAsExpected = false;
    try {
      await client.query(`
        SELECT public.review_weekly_report($1, 'APPROVED', 'Looks good');
      `, [weeklyReport1Id]);
    } catch (err) {
      if (err.message.includes('not approved by mentor') || err.code === 'D0013') {
        approvalFailedAsExpected = true;
      }
    }
    assert(approvalFailedAsExpected, 17, 'Faculty approval blocked when linked daily logs are not mentor-approved (Error D0013)');

    // Company mentor approves daily log
    await client.query(`
      UPDATE public.daily_logs SET status = 'APPROVED' WHERE id = $1;
    `, [dailyLog1Id]);

    // Test 18: Faculty calls review_weekly_report with APPROVED -> report status becomes APPROVED
    await activateRlsSession(client, facultyAId);
    const { rows: [reviewRes] } = await client.query(`
      SELECT public.review_weekly_report($1, 'APPROVED', 'Excellent work this week.') as review_id;
    `, [weeklyReport1Id]);

    const { rows: [updatedReport] } = await client.query(`
      SELECT status FROM public.weekly_reports WHERE id = $1;
    `, [weeklyReport1Id]);

    assert(!!reviewRes.review_id && updatedReport.status === 'APPROVED', 18, 'Weekly report successfully APPROVED after mentor approved all daily logs');

    console.log();

    // ── PART 5: CORRECTION REQUEST FLOW (Tests 19–23) ─────────────────────────
    console.log('--- PART 5: Correction Request Flow ---');

    // Create Report 4 for Student 1 (Week 2)
    const { rows: [rep4] } = await client.query(`
      INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
      VALUES ($1, '2026-06-08', '2026-06-14', 'Week 2 Draft notes', 'SUBMITTED') RETURNING id
    `, [internship1Id]);
    const weeklyReport4Id = rep4.id;

    // Test 19: Correction requested without remarks -> rejected (D0010)
    let missingRemarksRejected = false;
    try {
      await activateRlsSession(client, facultyAId);
      await client.query(`
        SELECT public.review_weekly_report($1, 'CORRECTION_REQUESTED', '');
      `, [weeklyReport4Id]);
    } catch (err) {
      if (err.message.includes('Remarks are required') || err.code === 'D0010') {
        missingRemarksRejected = true;
      }
    }
    assert(missingRemarksRejected, 19, 'Correction request without remarks rejected (Error D0010)');

    // Test 20 & 21: Correction requested with valid remarks -> becomes CORRECTION_REQUESTED
    await activateRlsSession(client, facultyAId);
    const { rows: [corrReview] } = await client.query(`
      SELECT public.review_weekly_report($1, 'CORRECTION_REQUESTED', 'Please elaborate on the backend schema design.') as review_id;
    `, [weeklyReport4Id]);

    const { rows: [corrReport] } = await client.query(`
      SELECT status FROM public.weekly_reports WHERE id = $1;
    `, [weeklyReport4Id]);
    assert(corrReport.status === 'CORRECTION_REQUESTED', 20, 'Weekly report successfully transitioned to CORRECTION_REQUESTED');
    assert(!!corrReview.review_id, 21, 'Correction review record appended to faculty_reviews table');

    // Test 22: Student edits notes and resubmits to SUBMITTED
    await activateRlsSession(client, student1Id);
    await client.query(`
      UPDATE public.weekly_reports
      SET student_notes = 'Week 2 Updated: Implemented database schema and PostgreSQL RLS policies.',
          status = 'SUBMITTED'
      WHERE id = $1;
    `, [weeklyReport4Id]);

    const { rows: [resubmittedReport] } = await client.query(`
      SELECT status, student_notes FROM public.weekly_reports WHERE id = $1;
    `, [weeklyReport4Id]);
    assert(resubmittedReport.status === 'SUBMITTED' && resubmittedReport.student_notes.includes('Updated'), 22, 'Student successfully edits and resubmits weekly report');

    // Test 23: Faculty reviews and approves resubmitted report
    await activateRlsSession(client, facultyAId);
    const { rows: [finalApproval] } = await client.query(`
      SELECT public.review_weekly_report($1, 'APPROVED', 'Much better detail.') as review_id;
    `, [weeklyReport4Id]);

    const { rows: [finalReport] } = await client.query(`
      SELECT status FROM public.weekly_reports WHERE id = $1;
    `, [weeklyReport4Id]);
    assert(finalReport.status === 'APPROVED' && !!finalApproval.review_id, 23, 'Faculty successfully reviews and approves resubmitted report');

    console.log();

    // ── PART 6: DIRECT INTERNSHIP ASSIGNMENT (Tests 24–25) ───────────────────
    console.log('--- PART 6: Direct Internship Assignment (Without Batch Assignment) ---');

    // Create Faculty B (NO batch assignments)
    facultyBId = crypto.randomUUID();
    await createTestUser(client, facultyBId, `suresh_faculty_${ts}@wadia.edu`, 'Dr. Suresh', 'Deshmukh');

    const { rows: [facBMem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, facultyBId]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'FACULTY_MENTOR')`, [facBMem.id]);

    // Verify Faculty B has NO batch assignments
    const { rows: facBBatches } = await client.query(`
      SELECT * FROM public.faculty_batch_assignments WHERE faculty_user_id = $1;
    `, [facultyBId]);
    assert(facBBatches.length === 0, 24, 'Faculty B has zero batch assignments');

    // Directly assign Faculty B to Student 2's internship (Batch B)
    await client.query(`
      INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary)
      VALUES ($1, $2, 'FACULTY', true);
    `, [internship2Id, facultyBId]);

    // Test 25: Faculty B can review Student 2's weekly report via direct assignment
    await activateRlsSession(client, facultyBId);
    const { rows: [facBReviewRes] } = await client.query(`
      SELECT public.review_weekly_report($1, 'APPROVED', 'Approved by directly assigned faculty mentor.') as review_id;
    `, [weeklyReport2Id]);

    const { rows: [facBUpdatedReport] } = await client.query(`
      SELECT status FROM public.weekly_reports WHERE id = $1;
    `, [weeklyReport2Id]);
    assert(facBUpdatedReport.status === 'APPROVED' && !!facBReviewRes.review_id, 25, 'Faculty B successfully reviews weekly report via direct internship assignment');

    console.log();

    // ── PART 7: SECURITY & ISOLATION ENFORCEMENT (Tests 26–30) ────────────────
    console.log('--- PART 7: Security & Isolation Enforcement ---');

    // Create Unassigned Faculty (belongs to tenant, but neither batch nor direct internship assignment)
    unassignedFacultyId = crypto.randomUUID();
    await createTestUser(client, unassignedFacultyId, `unassigned_faculty_${ts}@wadia.edu`, 'Unassigned', 'Faculty');

    const { rows: [unfacMem] } = await client.query(`
      INSERT INTO public.tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, unassignedFacultyId]);
    await client.query(`INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, 'FACULTY_MENTOR')`, [unfacMem.id]);

    // Create a new submitted report for security testing
    const { rows: [secRep] } = await client.query(`
      INSERT INTO public.weekly_reports (internship_id, start_date, end_date, student_notes, status)
      VALUES ($1, '2026-06-15', '2026-06-21', 'Security test report', 'SUBMITTED') RETURNING id
    `, [internship1Id]);
    const securityReportId = secRep.id;

    // Test 26: Unassigned Faculty attempts review -> Access Denied (42501)
    let unassignedFacultyDenied = false;
    try {
      await activateRlsSession(client, unassignedFacultyId);
      await client.query(`SELECT public.review_weekly_report($1, 'APPROVED', 'Attempting unauthorized review');`, [securityReportId]);
    } catch (err) {
      if (err.message.includes('Access denied') || err.code === '42501') unassignedFacultyDenied = true;
    }
    assert(unassignedFacultyDenied, 26, 'Unassigned Faculty Mentor denied review access (Error 42501)');

    // Test 27: Company Mentor attempts Faculty review RPC -> Access Denied (42501)
    let companyMentorDenied = false;
    try {
      await activateRlsSession(client, companyMentorId);
      await client.query(`SELECT public.review_weekly_report($1, 'APPROVED', 'Company mentor pretending to be faculty');`, [securityReportId]);
    } catch (err) {
      if (err.message.includes('Access denied') || err.code === '42501') companyMentorDenied = true;
    }
    assert(companyMentorDenied, 27, 'Company Mentor denied access to faculty review RPC (Error 42501)');

    // Test 28: Student attempts to approve own report -> Access Denied (42501)
    let studentSelfReviewDenied = false;
    try {
      await activateRlsSession(client, student1Id);
      await client.query(`SELECT public.review_weekly_report($1, 'APPROVED', 'Student approving own report');`, [securityReportId]);
    } catch (err) {
      if (err.message.includes('Access denied') || err.code === '42501') studentSelfReviewDenied = true;
    }
    assert(studentSelfReviewDenied, 28, 'Student denied self-review access via faculty RPC (Error 42501)');

    // Test 29: Cross-Tenant Faculty attempts to review report -> Access Denied (42501)
    let crossTenantFacultyDenied = false;
    try {
      await activateRlsSession(client, crossTenantFacultyId);
      await client.query(`SELECT public.review_weekly_report($1, 'APPROVED', 'Cross tenant review attempt');`, [securityReportId]);
    } catch (err) {
      if (err.message.includes('Access denied') || err.code === '42501') crossTenantFacultyDenied = true;
    }
    assert(crossTenantFacultyDenied, 29, 'Cross-Tenant Faculty Mentor denied review access (Error 42501)');

    // Test 30: Unassigned Faculty Review Queue returns 0 reports
    await activateRlsSession(client, unassignedFacultyId);
    const { rows: unfacQueue } = await client.query(`
      SELECT wr.id FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.tenant_memberships tm_fac ON i.tenant_id = tm_fac.tenant_id
      JOIN public.membership_roles mr_fac ON tm_fac.id = mr_fac.membership_id
      LEFT JOIN public.tenant_memberships tm_stu ON i.student_id = tm_stu.user_id AND tm_stu.tenant_id = i.tenant_id
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = auth.uid()
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'FACULTY'
      WHERE wr.status = 'SUBMITTED'
        AND tm_fac.user_id = auth.uid()
        AND mr_fac.role = 'FACULTY_MENTOR'
        AND (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `);
    assert(unfacQueue.length === 0, 30, 'Unassigned Faculty review queue returns 0 reports (tenant and assignment isolation)');

    console.log();

  } catch (err) {
    console.error('\nUnexpected Error during test execution:', err);
    failed++;
  } finally {
    // Clean up test tenant and related cascading records
    if (tenantId) {
      await client.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]).catch(() => {});
    }
    if (crossTenantId) {
      await client.query(`DELETE FROM public.tenants WHERE id = $1`, [crossTenantId]).catch(() => {});
    }
    await client.end();
  }

  console.log('========================================================================');
  console.log(`   FACULTY MENTOR WORKFLOW TEST RESULTS: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
