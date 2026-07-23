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

async function verifyStudentWorkflow() {
  console.log('[WORKFLOW TEST] Authenticating student and mentor...');
  
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  const supabase = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    // 1. Authenticate student
    const { data: studentAuth, error: studentAuthErr } = await supabase.auth.signInWithPassword({
      email: 'front-student@integration.com',
      password: TEST_PASSWORD
    });
    if (studentAuthErr) throw studentAuthErr;
    const studentToken = studentAuth.session.access_token;
    const studentId = studentAuth.user.id;

    // Authenticate mentor
    const { data: mentorAuth, error: mentorAuthErr } = await supabase.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: TEST_PASSWORD
    });
    if (mentorAuthErr) throw mentorAuthErr;
    const mentorToken = mentorAuth.session.access_token;
    const mentorId = mentorAuth.user.id;

    const reqStudent = axios.create({
      baseURL: 'http://localhost:5003/api/v2',
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    const reqMentor = axios.create({
      baseURL: 'http://localhost:5003/api/v2',
      headers: { Authorization: `Bearer ${mentorToken}` }
    });

    // 2. Retrieve student's active internship
    console.log('[WORKFLOW TEST] Resolving active internship...');
    const internshipsRes = await reqStudent.get('/internships');
    const active = (internshipsRes.data?.data || []).find(i => i.status === 'ACTIVE');
    if (!active) {
      throw new Error('No active internship found for front-student.');
    }
    const internshipId = active.id;
    console.log(`[WORKFLOW TEST] Active internship resolved: ${internshipId}`);

    // Check baseline hours summary
    let detailsRes = await reqStudent.get(`/internships/${internshipId}`);
    console.log('[WORKFLOW TEST] Baseline approved hours:', detailsRes.data?.data?.hours_summary?.approved_hours);

    // 3. Create a clean DRAFT daily log for testing workflow
    console.log('[WORKFLOW TEST] Creating DRAFT log...');
    // Delete existing logs for '2026-07-21' to avoid duplicate date constraint
    await pgClient.query("DELETE FROM public.daily_logs WHERE internship_id = $1 AND date = '2026-07-21'", [internshipId]);

    const createRes = await reqStudent.post(`/internships/${internshipId}/logs`, {
      date: '2026-07-21',
      notes: 'Workflow test notes',
      tasks: [{ description: 'Workflow integration tasks', hours: 5.5 }]
    });
    const logId = createRes.data?.data?.id;
    console.log(`[WORKFLOW TEST] Created log ID: ${logId} (Status: ${createRes.data?.data?.status})`);

    // 4. Edit DRAFT daily log (strip date validation check)
    console.log('[WORKFLOW TEST] Editing DRAFT log...');
    const editRes = await reqStudent.patch(`/internships/${internshipId}/logs/${logId}`, {
      notes: 'Workflow test notes updated',
      tasks: [{ description: 'Workflow integration tasks edited', hours: 6.0 }]
    });
    console.log(`[WORKFLOW TEST] Edited log ID: ${logId} (New hours: ${editRes.data?.data?.total_task_hours})`);

    // 5. Submit log
    console.log('[WORKFLOW TEST] Submitting log...');
    const submitRes = await reqStudent.post(`/internships/${internshipId}/logs/${logId}/submit`);
    console.log(`[WORKFLOW TEST] Submitted log status: ${submitRes.data?.data?.status}`);

    // Verify student cannot edit SUBMITTED log (server-side pre-check must return 422)
    try {
      await reqStudent.patch(`/internships/${internshipId}/logs/${logId}`, {
        notes: 'Attempted hack notes'
      });
      throw new Error('Security failure: Student was able to edit a SUBMITTED log!');
    } catch (err) {
      if (err.response?.status === 422) {
        console.log('[PASS] Security check: Student is blocked from editing a SUBMITTED log.');
      } else {
        throw err;
      }
    }


    // 6. Mentor requests correction
    console.log('[WORKFLOW TEST] Mentor requesting correction...');
    const rejectRes = await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
      decision: 'CORRECTION_REQUESTED',
      feedback: 'Please clarify your description.'
    });
    console.log(`[WORKFLOW TEST] Mentor review created ID: ${rejectRes.data?.data?.id} (Status: ${rejectRes.data?.data?.status})`);

    // Verify log status is now CORRECTION_REQUESTED
    const checkLogRes = await reqStudent.get(`/internships/${internshipId}/logs/${logId}`);
    console.log(`[WORKFLOW TEST] Log status after mentor review: ${checkLogRes.data?.data?.status}`);

    // Verify student can read reviews history
    const reviewsRes = await reqStudent.get(`/internships/${internshipId}/logs/${logId}/reviews`);
    console.log('[WORKFLOW TEST] Review History for student:');
    reviewsRes.data?.data?.forEach((r, idx) => {
      console.log(`  Review #${idx + 1}: Decision: ${r.status}, Comment: "${r.feedback}"`);
    });

    // 7. Student corrects and resubmits
    console.log('[WORKFLOW TEST] Student correcting and resubmitting...');
    await reqStudent.patch(`/internships/${internshipId}/logs/${logId}`, {
      notes: 'Clarified notes',
      tasks: [{ description: 'Workflow integration tasks: clarified testing framework details', hours: 6.0 }]
    });
    const resubmitRes = await reqStudent.post(`/internships/${internshipId}/logs/${logId}/submit`);
    console.log(`[WORKFLOW TEST] Resubmitted log status: ${resubmitRes.data?.data?.status}`);

    // 8. Mentor approves log
    console.log('[WORKFLOW TEST] Mentor approving log...');
    const approveRes = await reqMentor.post(`/internships/${internshipId}/logs/${logId}/reviews`, {
      decision: 'APPROVED',
      feedback: 'Excellent work.'
    });
    console.log(`[WORKFLOW TEST] Log approved: status is now ${approveRes.data?.data?.status}`);

    // Verify student cannot edit APPROVED log
    try {
      await reqStudent.patch(`/internships/${internshipId}/logs/${logId}`, {
        notes: 'Attempted post-approval edit'
      });
      throw new Error('Security failure: Student was able to edit an APPROVED log!');
    } catch (err) {
      if (err.response?.status === 422) {
        console.log('[PASS] Security check: Student is blocked from editing an APPROVED log.');
      } else {
        throw err;
      }
    }

    // 9. Verify internship approved hours updates in overview
    detailsRes = await reqStudent.get(`/internships/${internshipId}`);
    const finalApprovedHours = detailsRes.data?.data?.hours_summary?.approved_hours;
    console.log('[WORKFLOW TEST] Final approved hours in overview:', finalApprovedHours);

    if (finalApprovedHours === 6.0) {
      console.log('[PASS] Student overview hours successfully refreshed and updated to 6.0!');
    } else {
      throw new Error(`Approved hours mismatches! Expected 6.0, got ${finalApprovedHours}`);
    }

    // 10. Clean up test log
    console.log('[WORKFLOW TEST] Cleaning up daily logs workflow test log...');
    await pgClient.query("DELETE FROM public.log_reviews WHERE daily_log_id = $1", [logId]);
    await pgClient.query("DELETE FROM public.daily_log_tasks WHERE daily_log_id = $1", [logId]);
    await pgClient.query("DELETE FROM public.daily_logs WHERE id = $1", [logId]);
    console.log('[WORKFLOW TEST] Cleanup successful.');
    console.log('[PASS] All student Daily Log V2 frontend integration workflow tests completed successfully!');

  } catch (err) {
    console.error('[WORKFLOW TEST] Test failed with error:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

verifyStudentWorkflow();
