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

async function testMentorWorkflow() {
  console.log('=== PHASE 1G.4 COMPANY MENTOR DAILY LOG REVIEW INTEGRATION & SECURITY TEST ===');

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  const supabaseStudent = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const supabaseMentor = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
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
    // 1. Authenticate staging users
    console.log('\n--- 1. AUTHENTICATING STAGING USERS ---');
    const { data: studentAuth, error: sErr } = await supabaseStudent.auth.signInWithPassword({
      email: 'front-student@integration.com',
      password: TEST_PASSWORD
    });
    if (sErr) throw sErr;
    const studentToken = studentAuth.session.access_token;

    const { data: mentorAuth, error: mErr } = await supabaseMentor.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: TEST_PASSWORD
    });
    if (mErr) throw mErr;
    const mentorToken = mentorAuth.session.access_token;

    const { data: facultyAuth, error: fErr } = await supabaseStudent.auth.signInWithPassword({
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

    assertPass('Authenticated Student, Mentor, and Faculty staging accounts');

    // 2. Resolve active internship
    console.log('\n--- 2. RESOLVING ACTIVE INTERNSHIP ---');
    const intRes = await reqStudent.get('/internships');
    const activeInt = (intRes.data?.data || []).find(i => i.status === 'ACTIVE');
    if (!activeInt) throw new Error('No active V2 internship found for student');
    const internshipId = activeInt.id;
    assertPass(`Resolved active internship ID: ${internshipId}`);

    // Baseline approved hours
    const baselineRes = await reqStudent.get(`/internships/${internshipId}`);
    const baselineHours = baselineRes.data.data.hours_summary.approved_hours || 0;

    // Clean up any pre-existing test log for '2026-07-20'
    const { rows: oldLogs } = await pgClient.query(
      "SELECT id FROM public.daily_logs WHERE internship_id = $1 AND date = '2026-07-20'",
      [internshipId]
    );
    for (const l of oldLogs) {
      await pgClient.query("DELETE FROM public.log_reviews WHERE daily_log_id = $1", [l.id]);
      await pgClient.query("DELETE FROM public.daily_log_tasks WHERE daily_log_id = $1", [l.id]);
      await pgClient.query("DELETE FROM public.daily_logs WHERE id = $1", [l.id]);
    }

    // 3. Create DRAFT daily log
    console.log('\n--- 3. LIFECYCLE STEP 1: CREATE DRAFT DAILY LOG ---');
    const createRes = await reqStudent.post(`/internships/${internshipId}/logs`, {
      date: '2026-07-20',
      notes: 'Initial daily log notes for mentor review test',
      tasks: [
        { description: 'Feature implementation task', hours: 4.0 },
        { description: 'Testing & verification task', hours: 3.5 }
      ]
    });
    const logId = createRes.data.data.id;
    assertPass(`Created DRAFT daily log ID: ${logId} (Total task hours: 7.5)`);

    // 4. Submit Daily Log
    console.log('\n--- 4. LIFECYCLE STEP 2: SUBMIT DAILY LOG ---');
    const submitRes = await reqStudent.post(`/internships/${internshipId}/logs/${logId}/submit`);
    if (submitRes.data.data.status === 'SUBMITTED') {
      assertPass('Successfully submitted daily log. Status: SUBMITTED');
    } else assertFail('Submit daily log failed', submitRes.data);

    // 5. Mentor Review Queue Verification
    console.log('\n--- 5. LIFECYCLE STEP 3: MENTOR REVIEW QUEUE ---');
    const queueRes = await reqMentor.get('/mentor/review-queue');
    const queueItem = (queueRes.data.data || []).find(q => q.id === logId);
    if (queueItem) {
      assertPass(`Daily log ID ${logId} appears in assigned mentor's review queue`);
    } else assertFail('Submitted daily log missing from mentor review queue!');

    // 6. Mentor Open & Inspect Log Detail
    console.log('\n--- 6. LIFECYCLE STEP 4: MENTOR INSPECTS LOG DETAIL ---');
    const detailRes = await reqMentor.get(`/internships/${internshipId}/logs/${logId}`);
    const logDetail = detailRes.data.data;
    if (logDetail.id === logId && logDetail.total_task_hours === 7.5 && (logDetail.tasks || []).length === 2) {
      assertPass(`Mentor inspected log detail: total_task_hours=7.5, task_count=2`);
    } else assertFail('Log detail inspection mismatch', logDetail);

    // 7. Security Checks — Invalid Decisions & Empty Feedback
    console.log('\n--- 7. TESTING REVIEW VALIDATION & SECURITY BOUNDARIES ---');

    // Empty feedback on CORRECTION_REQUESTED rejected
    try {
      await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
        decision: 'CORRECTION_REQUESTED',
        feedback: '   '
      });
      assertFail('Allowed CORRECTION_REQUESTED with empty feedback!');
    } catch (err) {
      if (err.response?.status === 400 || err.response?.data?.message?.includes('feedback')) {
        assertPass('Rejected CORRECTION_REQUESTED with empty feedback (HTTP 400)');
      } else assertFail('Unexpected error for empty feedback', err.response?.data);
    }

    // Invalid decision string rejected
    try {
      await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
        decision: 'INVALID_DECISION',
        feedback: 'Some feedback'
      });
      assertFail('Allowed invalid review decision!');
    } catch (err) {
      if (err.response?.status === 400) {
        assertPass('Rejected invalid review decision (HTTP 400)');
      } else assertFail('Unexpected error for invalid decision', err.response?.data);
    }

    // Unassigned mentor review attempt rejected (Faculty is not company mentor for this student)
    try {
      await reqFaculty.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
        decision: 'APPROVED',
        feedback: 'Unassigned mentor approval attempt'
      });
      assertFail('Allowed unassigned faculty/mentor to review daily log!');
    } catch (err) {
      if (err.response?.status === 422 || err.response?.status === 404 || err.response?.status === 403) {
        assertPass('Rejected review attempt by unassigned user (HTTP 422/404/403)');
      } else assertFail('Unexpected response for unassigned mentor review', err.response?.data);
    }

    // Confused-parent internship ID check
    try {
      await reqMentor.get(`/internships/00000000-0000-0000-0000-000000000000/logs/${logId}`);
      assertFail('Allowed confused-parent internship ID access!');
    } catch (err) {
      if (err.response?.status === 404) {
        assertPass('Confused-parent log access rejected with HTTP 404');
      } else assertFail('Unexpected status for confused parent access', err.response?.status);
    }

    // Direct RLS table write test (direct insert to log_reviews via Supabase client)
    const { error: directInsertErr } = await supabaseMentor
      .from('log_reviews')
      .insert({
        daily_log_id: logId,
        reviewed_by: mentorAuth.user.id,
        status: 'APPROVED',
        feedback: 'Direct RLS bypass attempt'
      });
    if (directInsertErr) {
      assertPass('Direct client write to log_reviews blocked by RLS policy');
    } else assertFail('Security vulnerability: Direct client write to log_reviews succeeded!');

    // 8. Mentor Requests CORRECTION_REQUESTED
    console.log('\n--- 8. LIFECYCLE STEP 5: MENTOR REQUESTS CORRECTION ---');
    const corrRes = await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
      decision: 'CORRECTION_REQUESTED',
      feedback: 'Please clarify your afternoon testing tasks.'
    });
    if (corrRes.data.data.status === 'CORRECTION_REQUESTED') {
      assertPass('Mentor submitted CORRECTION_REQUESTED decision with mandatory feedback');
    } else assertFail('Mentor correction request failed', corrRes.data);

    // Verify log leaves mentor pending queue
    const queueAfterCorr = await reqMentor.get('/mentor/review-queue');
    const itemInQueue1 = (queueAfterCorr.data.data || []).find(q => q.id === logId);
    if (!itemInQueue1) {
      assertPass('Log cleanly removed from mentor pending queue after CORRECTION_REQUESTED');
    } else assertFail('Log still in pending queue after CORRECTION_REQUESTED');

    // Verify student sees CORRECTION_REQUESTED
    const studentCheck1 = await reqStudent.get(`/internships/${internshipId}/logs/${logId}`);
    if (studentCheck1.data.data.status === 'CORRECTION_REQUESTED') {
      assertPass('Student views log status as CORRECTION_REQUESTED');
    } else assertFail('Student status mismatch after correction request');

    // Verify student reads review history entry
    const historyRes1 = await reqStudent.get(`/internships/${internshipId}/logs/${logId}/reviews`);
    const history1 = historyRes1.data.data || [];
    if (history1.length === 1 && history1[0].status === 'CORRECTION_REQUESTED' && history1[0].feedback === 'Please clarify your afternoon testing tasks.') {
      assertPass(`Chronological review history contains entry 1: [CORRECTION_REQUESTED, "${history1[0].feedback}"]`);
    } else assertFail('Review history entry 1 mismatch', history1);

    // 9. Student Edits & Resubmits
    console.log('\n--- 9. LIFECYCLE STEP 6: STUDENT EDITS & RESUBMITS ---');
    await reqStudent.patch(`/internships/${internshipId}/logs/${logId}`, {
      notes: 'Initial daily log notes + Clarified afternoon automated testing tasks.',
      tasks: [
        { description: 'Feature implementation task', hours: 4.0 },
        { description: 'Testing & verification task: written Jest unit tests for components', hours: 4.0 }
      ]
    });
    assertPass('Student edited Daily Log notes and tasks (New total: 8.0 hrs)');

    const resubmitRes = await reqStudent.post(`/internships/${internshipId}/logs/${logId}/submit`);
    if (resubmitRes.data.data.status === 'SUBMITTED') {
      assertPass('Student resubmitted daily log. Status: SUBMITTED');
    } else assertFail('Student resubmit failed');

    // Verify log returns to mentor review queue
    const queueAfterResubmit = await reqMentor.get('/mentor/review-queue');
    const itemInQueue2 = (queueAfterResubmit.data.data || []).find(q => q.id === logId);
    if (itemInQueue2) {
      assertPass('Resubmitted daily log returned to mentor review queue');
    } else assertFail('Resubmitted log missing from mentor review queue');

    // 10. Mentor Approves Log
    console.log('\n--- 10. LIFECYCLE STEP 7: MENTOR APPROVES LOG ---');
    const approveRes = await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
      decision: 'APPROVED',
      feedback: 'Excellent clarification. Approved!'
    });
    if (approveRes.data.data.status === 'APPROVED') {
      assertPass('Mentor successfully APPROVED daily log');
    } else assertFail('Mentor approval failed', approveRes.data);

    // Verify log disappears from mentor review queue
    const queueAfterApprove = await reqMentor.get('/mentor/review-queue');
    const itemInQueue3 = (queueAfterApprove.data.data || []).find(q => q.id === logId);
    if (!itemInQueue3) {
      assertPass('Approved daily log cleanly removed from mentor review queue');
    } else assertFail('Approved log still in mentor review queue');

    // Verify duplicate review on APPROVED log is rejected
    try {
      await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
        decision: 'APPROVED',
        feedback: 'Duplicate approval attempt'
      });
      assertFail('Allowed duplicate review on already APPROVED log!');
    } catch (err) {
      if (err.response?.status === 422) {
        assertPass('Duplicate review on APPROVED log rejected (HTTP 422)');
      } else assertFail('Unexpected status for duplicate review', err.response?.data);
    }

    // 11. Final Verification: Review History & Approved Hours
    console.log('\n--- 11. VERIFYING CHRONOLOGICAL HISTORY & APPROVED HOURS ---');
    const finalHistoryRes = await reqStudent.get(`/internships/${internshipId}/logs/${logId}/reviews`);
    const history2 = finalHistoryRes.data.data || [];
    if (
      history2.length === 2 &&
      history2[0].status === 'CORRECTION_REQUESTED' &&
      history2[1].status === 'APPROVED'
    ) {
      assertPass('Chronological review history contains both entries: [CORRECTION_REQUESTED -> APPROVED]');
    } else assertFail('Final review history timeline mismatch', history2);

    // Verify student approved hours updated in overview
    const finalIntRes = await reqStudent.get(`/internships/${internshipId}`);
    const finalApprovedHours = finalIntRes.data.data.hours_summary.approved_hours || 0;
    if (finalApprovedHours === baselineHours + 8.0) {
      assertPass(`Student internship approved hours updated accurately (+8.0h $\\rightarrow$ total: ${finalApprovedHours}h)`);
    } else assertFail(`Approved hours update mismatch! Expected ${baselineHours + 8.0}, got ${finalApprovedHours}`);

    // 12. Cleanup
    console.log('\n--- 12. CLEANUP ---');
    await pgClient.query('DELETE FROM public.log_reviews WHERE daily_log_id = $1', [logId]);
    await pgClient.query('DELETE FROM public.daily_log_tasks WHERE daily_log_id = $1', [logId]);
    await pgClient.query('DELETE FROM public.daily_logs WHERE id = $1', [logId]);
    assertPass('Cleaned up test daily log and review history');

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

testMentorWorkflow();
