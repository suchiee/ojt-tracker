const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REACT_APP_SUPABASE_ANON_KEY
} = process.env;

const TEST_PASSWORD = 'StagingPassword123!';

async function testWeeklyReportWorkflow() {
  console.log('=== PHASE 1G.3 WEEKLY REPORT INTEGRATION & SECURITY TEST ===');

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  const supabase = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let passCount = 0;
  let failCount = 0;

  function assertPass(msg) {
    passCount++;
    console.log(`[PASS ${passCount}] ${msg}`);
  }

  function assertFail(msg, detail) {
    failCount++;
    console.error(`[FAIL ${failCount}] ${msg}`, detail || '');
  }

  try {
    // 1. Authenticate users
    console.log('\n--- 1. AUTHENTICATING STAGING USERS ---');
    const { data: studentAuth, error: sErr } = await supabase.auth.signInWithPassword({
      email: 'front-student@integration.com',
      password: TEST_PASSWORD
    });
    if (sErr) throw sErr;
    const studentToken = studentAuth.session.access_token;

    const { data: mentorAuth, error: mErr } = await supabase.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: TEST_PASSWORD
    });
    if (mErr) throw mErr;
    const mentorToken = mentorAuth.session.access_token;

    const { data: facultyAuth, error: fErr } = await supabase.auth.signInWithPassword({
      email: 'front-faculty@integration.com',
      password: TEST_PASSWORD
    });
    if (fErr) throw fErr;
    const facultyToken = facultyAuth.session.access_token;

    const reqStudent = axios.create({
      baseURL: 'http://localhost:5003/api/v2',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const reqMentor = axios.create({
      baseURL: 'http://localhost:5003/api/v2',
      headers: { Authorization: `Bearer ${mentorToken}` }
    });
    const reqFaculty = axios.create({
      baseURL: 'http://localhost:5003/api/v2',
      headers: { Authorization: `Bearer ${facultyToken}` }
    });

    assertPass('Authenticated Student, Mentor, and Faculty users successfully');

    // 2. Resolve Student active internship
    console.log('\n--- 2. RESOLVING ACTIVE INTERNSHIP ---');
    const intRes = await reqStudent.get('/internships');
    const activeInt = (intRes.data?.data || []).find(i => i.status === 'ACTIVE');
    if (!activeInt) throw new Error('No active V2 internship found for front-student');
    const internshipId = activeInt.id;
    assertPass(`Resolved active internship ID: ${internshipId}`);

    // Clean up any old weekly test reports & logs for range 2026-07-06..2026-07-12
    const { rows: oldWr } = await pgClient.query(
      "SELECT id FROM public.weekly_reports WHERE internship_id = $1 AND start_date = '2026-07-06'",
      [internshipId]
    );
    for (const row of oldWr) {
      await pgClient.query("DELETE FROM public.faculty_reviews WHERE weekly_report_id = $1", [row.id]);
      await pgClient.query("DELETE FROM public.weekly_report_log_links WHERE weekly_report_id = $1", [row.id]);
      await pgClient.query("DELETE FROM public.weekly_reports WHERE id = $1", [row.id]);
    }
    await pgClient.query("DELETE FROM public.daily_logs WHERE internship_id = $1 AND date IN ('2026-07-07', '2026-07-08')", [internshipId]);

    // Create 2 test daily logs for week 2026-07-06..2026-07-12
    // Log 1: 2026-07-07 -> Submit & Mentor Approve (4.5 hrs)
    const log1Res = await reqStudent.post(`/internships/${internshipId}/logs`, {
      date: '2026-07-07',
      notes: 'Log 1 notes',
      tasks: [{ description: 'Task 1', hours: 4.5 }]
    });
    const log1Id = log1Res.data.data.id;
    await reqStudent.post(`/internships/${internshipId}/logs/${log1Id}/submit`);
    await reqMentor.post(`/internships/${internshipId}/logs/${log1Id}/reviews`, { decision: 'APPROVED', feedback: 'Approved log 1' });

    // Log 2: 2026-07-08 -> Submit only (3.5 hrs, pending mentor approval)
    const log2Res = await reqStudent.post(`/internships/${internshipId}/logs`, {
      date: '2026-07-08',
      notes: 'Log 2 notes',
      tasks: [{ description: 'Task 2', hours: 3.5 }]
    });
    const log2Id = log2Res.data.data.id;
    await reqStudent.post(`/internships/${internshipId}/logs/${log2Id}/submit`);

    // Log 3 (Out of date range): 2026-06-15 -> Submit & Approve
    await pgClient.query("DELETE FROM public.daily_logs WHERE internship_id = $1 AND date = '2026-06-15'", [internshipId]);
    const log3Res = await reqStudent.post(`/internships/${internshipId}/logs`, {
      date: '2026-06-15',
      notes: 'Out of range log',
      tasks: [{ description: 'Out of range task', hours: 2.0 }]
    });
    const log3Id = log3Res.data.data.id;
    await reqStudent.post(`/internships/${internshipId}/logs/${log3Id}/submit`);
    await reqMentor.post(`/internships/${internshipId}/logs/${log3Id}/reviews`, { decision: 'APPROVED', feedback: 'Approved out of range' });

    assertPass('Created fixture daily logs: Log 1 (APPROVED), Log 2 (SUBMITTED), Log 3 (Out-of-range APPROVED)');

    // 3. Validation Boundaries (Creation)
    console.log('\n--- 3. TESTING CREATION VALIDATION BOUNDARIES ---');

    // Non-Monday start date rejected
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
        start_date: '2026-07-07', // Tuesday
        end_date: '2026-07-13',
        student_notes: 'Bad start date',
        daily_log_ids: [log1Id]
      });
      assertFail('Allowed creation with non-Monday start date!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 422) {
        assertPass('Rejected creation with non-Monday start date (D0010)');
      } else assertFail('Unexpected error format for non-Monday start date', err.response?.data);
    }

    // Mismatched end date rejected
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
        start_date: '2026-07-06',
        end_date: '2026-07-13', // Should be 2026-07-12
        student_notes: 'Bad end date',
        daily_log_ids: [log1Id]
      });
      assertFail('Allowed creation with mismatched end date!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 422) {
        assertPass('Rejected creation with mismatched end date (D0010)');
      } else assertFail('Unexpected error for mismatched end date', err.response?.data);
    }

    // Future start date rejected
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
        start_date: '2099-01-05',
        end_date: '2099-01-11',
        student_notes: 'Future report'
      });
      assertFail('Allowed creation with future date!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 422) {
        assertPass('Rejected creation with future reporting date (D0010)');
      } else assertFail('Unexpected error for future date', err.response?.data);
    }

    // Out of range log link rejected
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
        start_date: '2026-07-06',
        end_date: '2026-07-12',
        student_notes: 'Out of range log link',
        daily_log_ids: [log3Id]
      });
      assertFail('Allowed linking out-of-range log!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 422) {
        assertPass('Rejected linking log outside report date range (D0011)');
      } else assertFail('Unexpected error for out of range log link', err.response?.data);
    }

    // Fake / invalid log ID rejected
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
        start_date: '2026-07-06',
        end_date: '2026-07-12',
        student_notes: 'Invalid log link',
        daily_log_ids: ['00000000-0000-0000-0000-000000000000']
      });
      assertFail('Allowed creation with invalid log link!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 422) {
        assertPass('Rejected creation with invalid log ID (D0011)');
      } else assertFail('Unexpected error for invalid log link', err.response?.data);
    }

    // 4. Create DRAFT report
    console.log('\n--- 4. LIFECYCLE STEP 1: CREATE DRAFT REPORT ---');
    const createWrRes = await reqStudent.post(`/internships/${internshipId}/weekly-reports`, {
      start_date: '2026-07-06',
      end_date: '2026-07-12',
      student_notes: 'Initial weekly report draft',
      daily_log_ids: [log1Id, log2Id]
    });
    const reportId = createWrRes.data.data.id;
    assertPass(`Created DRAFT weekly report ID: ${reportId} (Status: ${createWrRes.data.data.status})`);

    // Verify detail
    const detailWrRes = await reqStudent.get(`/internships/${internshipId}/weekly-reports/${reportId}`);
    const wrData = detailWrRes.data.data;
    if (wrData.status === 'DRAFT' && wrData.linked_hours === 8.0 && wrData.approved_hours === 4.5) {
      assertPass(`Report DRAFT detail verified: status=DRAFT, linked_hours=8.0, approved_hours=4.5`);
    } else {
      assertFail('Report DRAFT detail mismatch!', wrData);
    }

    // 5. Edit DRAFT report
    console.log('\n--- 5. LIFECYCLE STEP 2: EDIT DRAFT REPORT ---');
    const editWrRes = await reqStudent.patch(`/internships/${internshipId}/weekly-reports/${reportId}`, {
      student_notes: 'Updated weekly report draft notes',
      daily_log_ids: [log1Id, log2Id]
    });
    if (editWrRes.data.data.student_notes === 'Updated weekly report draft notes') {
      assertPass('Successfully edited DRAFT weekly report notes and log links');
    } else {
      assertFail('Failed to edit DRAFT report notes');
    }

    // 6. Submit Report & VOID RPC Pre-Checks
    console.log('\n--- 6. LIFECYCLE STEP 3: SUBMIT REPORT & PRE-CHECK VERIFICATION ---');
    const submitWrRes = await reqStudent.post(`/internships/${internshipId}/weekly-reports/${reportId}/submit`);
    if (submitWrRes.data.data.status === 'SUBMITTED') {
      assertPass('Successfully submitted weekly report. Status: SUBMITTED');
    } else {
      assertFail('Failed to submit weekly report', submitWrRes.data);
    }

    // PRE-CHECK: Student CANNOT edit SUBMITTED report
    try {
      await reqStudent.patch(`/internships/${internshipId}/weekly-reports/${reportId}`, {
        student_notes: 'Attempted hack edit while SUBMITTED'
      });
      assertFail('Allowed editing a SUBMITTED weekly report!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Pre-check passed: Blocked edit on SUBMITTED report with 422 error');
      } else assertFail('Unexpected error for editing SUBMITTED report', err.response?.data);
    }

    // PRE-CHECK: Student CANNOT delete SUBMITTED report
    try {
      await reqStudent.delete(`/internships/${internshipId}/weekly-reports/${reportId}`);
      assertFail('Allowed deleting a SUBMITTED weekly report!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Pre-check passed: Blocked delete on SUBMITTED report with 422 error');
      } else assertFail('Unexpected error for deleting SUBMITTED report', err.response?.data);
    }

    // PRE-CHECK: Student CANNOT resubmit SUBMITTED report
    try {
      await reqStudent.post(`/internships/${internshipId}/weekly-reports/${reportId}/submit`);
      assertFail('Allowed re-submitting an already SUBMITTED weekly report!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Pre-check passed: Blocked duplicate submit with 422 error');
      } else assertFail('Unexpected error for duplicate submit', err.response?.data);
    }

    // 7. Faculty Review Queue & Security Checks
    console.log('\n--- 7. FACULTY REVIEW QUEUE & ACCESS CONTROL CHECKS ---');
    const queueRes = await reqFaculty.get('/faculty/review-queue');
    const queueItem = (queueRes.data.data || []).find(q => q.id === reportId);
    if (queueItem) {
      assertPass(`Faculty review queue contains submitted report ID: ${reportId}`);
    } else {
      assertFail('Submitted report missing from faculty review queue!');
    }

    // Confused parent / cross-internship protection check
    try {
      await reqStudent.get(`/internships/00000000-0000-0000-0000-000000000000/weekly-reports/${reportId}`);
      assertFail('Allowed confused-parent internship ID access!');
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 403 || err.response?.status === 422) {
        assertPass('Confused-parent access blocked with proper status code');
      } else assertFail('Unexpected status for confused parent access', err.response?.status);
    }

    // 8. Faculty Approval Blocked by Unapproved Linked Log
    console.log('\n--- 8. FACULTY APPROVAL BLOCK CHECK (LOG UNAPPROVED) ---');
    try {
      await reqFaculty.post(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`, {
        decision: 'APPROVED',
        remarks: 'Attempted approval with unapproved log'
      });
      assertFail('Faculty was able to APPROVE report with an unapproved daily log!');
    } catch (err) {
      if (err.response?.status === 422 || err.response?.data?.message?.includes('APPROVED')) {
        assertPass('Faculty approval blocked because Log 2 is not yet mentor-APPROVED');
      } else assertFail('Unexpected response when approving unapproved log report', err.response?.data);
    }

    // 9. Faculty Requests Correction
    console.log('\n--- 9. LIFECYCLE STEP 4: FACULTY REQUESTS CORRECTION ---');
    const requestCorrRes = await reqFaculty.post(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`, {
      decision: 'CORRECTION_REQUESTED',
      remarks: 'Please elaborate on Wednesday task details.'
    });
    if (requestCorrRes.data.data.status === 'CORRECTION_REQUESTED') {
      assertPass('Faculty successfully requested correction. Status: CORRECTION_REQUESTED');
    } else {
      assertFail('Faculty correction request failed', requestCorrRes.data);
    }

    // Verify student sees correction status and remarks
    const studentCheckCorr = await reqStudent.get(`/internships/${internshipId}/weekly-reports/${reportId}`);
    if (studentCheckCorr.data.data.status === 'CORRECTION_REQUESTED') {
      assertPass('Student sees CORRECTION_REQUESTED status');
    } else assertFail('Student status mismatch after correction request');

    const reviewsRes1 = await reqStudent.get(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`);
    const rev1 = (reviewsRes1.data.data || [])[0];
    if (rev1 && rev1.status === 'CORRECTION_REQUESTED' && rev1.remarks === 'Please elaborate on Wednesday task details.') {
      assertPass(`Student sees faculty correction remark: "${rev1.remarks}"`);
    } else assertFail('Review history mismatch for correction request', reviewsRes1.data);

    // 10. Student Edits Corrected Report & Resubmits
    console.log('\n--- 10. LIFECYCLE STEP 5: STUDENT EDITS & RESUBMITS ---');
    await reqStudent.patch(`/internships/${internshipId}/weekly-reports/${reportId}`, {
      student_notes: 'Initial draft + Elaborated Wednesday task details per faculty feedback.'
    });
    assertPass('Student edited notes on CORRECTION_REQUESTED report');

    // Mentor approves Log 2 so all logs are now APPROVED
    await reqMentor.post(`/internships/${internshipId}/logs/${log2Id}/reviews`, {
      decision: 'APPROVED',
      feedback: 'Approved log 2'
    });
    assertPass('Mentor approved Log 2 (all daily logs are now APPROVED)');

    // Student resubmits report
    const resubmitRes = await reqStudent.post(`/internships/${internshipId}/weekly-reports/${reportId}/submit`);
    if (resubmitRes.data.data.status === 'SUBMITTED') {
      assertPass('Student resubmitted corrected weekly report. Status: SUBMITTED');
    } else assertFail('Student resubmit failed');

    // 11. Faculty Approves Report
    console.log('\n--- 11. LIFECYCLE STEP 6: FACULTY APPROVES REPORT ---');
    const approveWrRes = await reqFaculty.post(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`, {
      decision: 'APPROVED',
      remarks: 'Comprehensive report. Approved!'
    });
    if (approveWrRes.data.data.status === 'APPROVED') {
      assertPass('Faculty successfully APPROVED weekly report!');
    } else assertFail('Faculty approval failed', approveWrRes.data);

    // Verify report removed from faculty review queue
    const queueAfterRes = await reqFaculty.get('/faculty/review-queue');
    const itemInQueueAfter = (queueAfterRes.data.data || []).find(q => q.id === reportId);
    if (!itemInQueueAfter) {
      assertPass('Approved report cleanly removed from faculty review queue');
    } else assertFail('Approved report still present in faculty review queue');

    // 12. Post-Approval Locks & Review History Verification
    console.log('\n--- 12. POST-APPROVAL LOCKS & CHRONOLOGICAL REVIEW HISTORY ---');

    // Student CANNOT edit APPROVED report
    try {
      await reqStudent.patch(`/internships/${internshipId}/weekly-reports/${reportId}`, {
        student_notes: 'Attempted post-approval edit'
      });
      assertFail('Allowed editing an APPROVED report!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Pre-check passed: Blocked edit on APPROVED report with 422 error');
      } else assertFail('Unexpected error for editing APPROVED report', err.response?.data);
    }

    // Student CANNOT delete APPROVED report
    try {
      await reqStudent.delete(`/internships/${internshipId}/weekly-reports/${reportId}`);
      assertFail('Allowed deleting an APPROVED report!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Pre-check passed: Blocked delete on APPROVED report with 422 error');
      } else assertFail('Unexpected error for deleting APPROVED report', err.response?.data);
    }

    // Verify chronological review history has both entries
    const finalReviewsRes = await reqStudent.get(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`);
    const history = finalReviewsRes.data.data || [];
    if (
      history.length === 2 &&
      history[0].status === 'CORRECTION_REQUESTED' &&
      history[1].status === 'APPROVED'
    ) {
      assertPass('Chronological review history contains both decisions: [CORRECTION_REQUESTED, APPROVED]');
    } else {
      assertFail('Chronological review history incorrect', history);
    }

    // 13. Clean up
    console.log('\n--- 13. CLEANUP ---');
    await pgClient.query('DELETE FROM public.faculty_reviews WHERE weekly_report_id = $1', [reportId]);
    await pgClient.query('DELETE FROM public.weekly_report_log_links WHERE weekly_report_id = $1', [reportId]);
    await pgClient.query('DELETE FROM public.weekly_reports WHERE id = $1', [reportId]);
    await pgClient.query('DELETE FROM public.log_reviews WHERE daily_log_id IN ($1, $2, $3)', [log1Id, log2Id, log3Id]);
    await pgClient.query('DELETE FROM public.daily_log_tasks WHERE daily_log_id IN ($1, $2, $3)', [log1Id, log2Id, log3Id]);
    await pgClient.query('DELETE FROM public.daily_logs WHERE id IN ($1, $2, $3)', [log1Id, log2Id, log3Id]);
    assertPass('Cleaned up test weekly report and daily logs');

    console.log(`\n=======================================================`);
    console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log(`=======================================================`);

    if (failCount > 0) process.exit(1);

  } catch (err) {
    console.error('Test execution failed with exception:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

testWeeklyReportWorkflow();
