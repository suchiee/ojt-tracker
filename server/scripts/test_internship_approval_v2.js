// Automated Verification Script for Internship Approval Workflow
// Local-DB version: auto-discovers/creates real users from local PostgreSQL.

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}/api/v2`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!V2_SECRET) {
  console.error('Error: V2_LOCAL_JWT_SECRET is not configured in .env');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL is not configured in .env');
  process.exit(1);
}

const makeV2Token = (userId, email) => {
  return jwt.sign({ sub: userId, email }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
};

const api = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true
  });
};

async function testSuite() {
  console.log('--- Starting Internship Approval V2 Test Suite ---');

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  let roleId = crypto.randomUUID();
  let facUser = null;

  try {
    // 1. Discover student and admin
    const studentRes = await pgClient.query(`
      SELECT tm.user_id, u.email, tm.tenant_id FROM tenant_memberships tm
      JOIN membership_roles mr ON tm.id = mr.membership_id
      JOIN users u ON tm.user_id = u.id
      WHERE mr.role = 'STUDENT' LIMIT 1
    `);
    const adminRes = await pgClient.query(`
      SELECT tm.user_id, u.email, tm.tenant_id FROM tenant_memberships tm
      JOIN membership_roles mr ON tm.id = mr.membership_id
      JOIN users u ON tm.user_id = u.id
      WHERE mr.role = 'ADMIN' LIMIT 1
    `);

    if (studentRes.rows.length === 0 || adminRes.rows.length === 0) {
      throw new Error('Test requires at least one student and one admin in local database');
    }

    const student = studentRes.rows[0];
    const admin = adminRes.rows[0];

    // Find a third user in the database to act as faculty advisor
    const facultyUserRes = await pgClient.query(`
      SELECT tm.user_id, u.email, tm.id as membership_id FROM tenant_memberships tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.user_id != $1 AND tm.user_id != $2
      LIMIT 1
    `, [student.user_id, admin.user_id]);

    if (facultyUserRes.rows.length === 0) {
      throw new Error('Test requires at least 3 users in the database to run (student, admin, and one other user to act as faculty)');
    }

    facUser = facultyUserRes.rows[0];
    await pgClient.query(`
      INSERT INTO membership_roles (id, membership_id, role)
      VALUES ($1, $2, 'FACULTY_MENTOR')
      ON CONFLICT DO NOTHING
    `, [roleId, facUser.membership_id]);

    const faculty = { user_id: facUser.user_id, email: facUser.email };

    console.log(`[INFO] Student: ${student.email} (${student.user_id})`);
    console.log(`[INFO] Admin: ${admin.email} (${admin.user_id})`);
    console.log(`[INFO] Faculty: ${faculty.email} (${faculty.user_id})`);

    const studentToken = makeV2Token(student.user_id, student.email);
    const adminToken = makeV2Token(admin.user_id, admin.email);

    // Clean up old internships for the test student to start fresh
    await pgClient.query('DELETE FROM internships WHERE student_id = $1', [student.user_id]);

    // Test 1: Submit Training Setup (returns PENDING_VERIFICATION)
    console.log('\nRunning Test 1: Student submits Training Setup');
    const setupPayload = {
      agencyName: 'Acme Corp V2',
      mentor: 'John Doe',
      jobRole: 'Software Engineer Intern',
      startDate: '2026-06-01',
      endDate: '2026-08-31',
      totalHours: 240
    };
    const setupRes = await api(studentToken).post('/student/training', setupPayload);
    if (setupRes.status !== 200) {
      throw new Error(`Failed to submit training setup: ${setupRes.status} ${JSON.stringify(setupRes.data)}`);
    }
    const internship = setupRes.data;
    console.log(`  Placement Created ID: ${internship.id}`);
    console.log(`  Initial Status: ${internship.status}`);
    if (internship.status !== 'PENDING_VERIFICATION') {
      throw new Error(`Expected status 'PENDING_VERIFICATION', got '${internship.status}'`);
    }
    console.log('  ✅ PASS');

    // Test 2: Student tries to log daily hours (should fail with 422 because internship is not ACTIVE)
    console.log('\nRunning Test 2: Student attempts to log work hours under pending placement');
    const logPayload = {
      date: '2026-06-02',
      notes: 'Worked on approval verification features',
      tasks: [{ description: 'Writing code', hours: 4.5 }]
    };
    const logRes = await api(studentToken).post(`/internships/${internship.id}/logs`, logPayload);
    console.log(`  Log creation status code: ${logRes.status}`);
    if (logRes.status !== 422) {
      throw new Error(`Expected log creation to be rejected with 422, but got ${logRes.status}`);
    }
    console.log('  ✅ PASS (Rejection verified)');

    // Test 3: Admin approves the internship placement (status becomes ACTIVE)
    console.log('\nRunning Test 3: Admin approves and activates the placement');
    const approveRes = await api(adminToken).post(`/admin/internships/${internship.id}/approve`, { facultyUserId: faculty.user_id });
    if (approveRes.status !== 200) {
      throw new Error(`Admin approval failed: ${approveRes.status} ${JSON.stringify(approveRes.data)}`);
    }
    const approvedInt = approveRes.data.data;
    console.log(`  Approved Internship Status: ${approvedInt.status}`);
    if (approvedInt.status !== 'ACTIVE') {
      throw new Error(`Expected status 'ACTIVE' after approval, got '${approvedInt.status}'`);
    }
    console.log('  ✅ PASS');

    // Test 4: Verify Faculty Advisor assignment was created in database
    console.log('\nRunning Test 4: Verify Faculty Advisor assignment in DB');
    const assignRes = await pgClient.query(
      `SELECT mentor_user_id, mentor_type FROM internship_mentor_assignments WHERE internship_id = $1 AND mentor_user_id = $2`,
      [internship.id, faculty.user_id]
    );
    if (assignRes.rows.length === 0 || assignRes.rows[0].mentor_type !== 'FACULTY') {
      throw new Error('Faculty Advisor assignment was not created in database during approval');
    }
    console.log('  ✅ PASS');

    // Test 5: Student creates a daily log (should succeed now)
    console.log('\nRunning Test 5: Student logs hours under active placement');
    const activeLogRes = await api(studentToken).post(`/internships/${internship.id}/logs`, logPayload);
    console.log(`  Log creation status: ${activeLogRes.status}`);
    if (activeLogRes.status !== 201) {
      throw new Error(`Expected log creation to succeed with 201, but got ${activeLogRes.status} ${JSON.stringify(activeLogRes.data)}`);
    }
    console.log('  ✅ PASS');

    // Test 6: Student resubmits setup details (resets status to PENDING_VERIFICATION and clears rejection remarks)
    console.log('\nRunning Test 6: Student updates setup details (should reset to pending)');
    const updateRes = await api(studentToken).post('/student/training', { ...setupPayload, jobRole: 'Senior Intern' });
    if (updateRes.status !== 200) {
      throw new Error(`Resubmission failed: ${updateRes.status}`);
    }
    const updatedInt = updateRes.data;
    console.log(`  Updated Status: ${updatedInt.status}`);
    if (updatedInt.status !== 'PENDING_VERIFICATION') {
      throw new Error(`Expected status reset to 'PENDING_VERIFICATION', got '${updatedInt.status}'`);
    }
    console.log('  ✅ PASS');

    // Test 7: Admin rejects placement with reason
    console.log('\nRunning Test 7: Admin rejects placement with reason');
    const rejectRes = await api(adminToken).post(`/admin/internships/${internship.id}/reject`, {
      rejectionReason: 'Invalid supervisor email address provided.'
    });
    if (rejectRes.status !== 200) {
      throw new Error(`Rejection endpoint failed: ${rejectRes.status}`);
    }
    const rejectedInt = rejectRes.data.data;
    console.log(`  Rejected Internship Status: ${rejectedInt.status}`);
    console.log(`  Rejection Reason: ${rejectedInt.rejection_reason}`);
    if (rejectedInt.status !== 'REJECTED' || rejectedInt.rejection_reason !== 'Invalid supervisor email address provided.') {
      throw new Error('Rejection status or remarks mismatch');
    }
    console.log('  ✅ PASS');

    // Test 8: Verify repeated/invalid state transition validations
    console.log('\nRunning Test 8: Verify repeated/invalid state transition validations');
    // Try to reject the already rejected internship (should fail with 400)
    const repeatedRejectRes = await api(adminToken).post(`/admin/internships/${internship.id}/reject`, {
      rejectionReason: 'Already rejected.'
    });
    console.log(`  Repeated rejection status code: ${repeatedRejectRes.status} (expected 400)`);
    if (repeatedRejectRes.status !== 400) {
      throw new Error(`Expected repeated rejection to fail with 400, got ${repeatedRejectRes.status}`);
    }

    // Approve the placement
    const postApproveRes = await api(adminToken).post(`/admin/internships/${internship.id}/approve`, { facultyUserId: faculty.user_id });
    if (postApproveRes.status !== 200) {
      throw new Error(`Admin re-approval failed`);
    }
    // Try to approve again (should fail with 400)
    const repeatedApproveRes = await api(adminToken).post(`/admin/internships/${internship.id}/approve`, { facultyUserId: faculty.user_id });
    console.log(`  Repeated approval status code: ${repeatedApproveRes.status} (expected 400)`);
    if (repeatedApproveRes.status !== 400) {
      throw new Error(`Expected repeated approval to fail with 400, got ${repeatedApproveRes.status}`);
    }
    console.log('  ✅ PASS');

    // Verify audit logs were written
    console.log('\nRunning Test 9: Verify audit logs database entries');
    const auditRes = await pgClient.query(
      `SELECT action FROM public.audit_logs WHERE target_id = $1 ORDER BY created_at ASC`,
      [internship.id]
    );
    const actions = auditRes.rows.map(r => r.action);
    console.log(`  Audit Actions Recorded: ${actions.join(', ')}`);
    const expectedActions = ['STUDENT_SUBMIT_SETUP', 'ADMIN_APPROVE_INTERNSHIP', 'STUDENT_RESUBMIT_SETUP', 'ADMIN_REJECT_INTERNSHIP', 'ADMIN_APPROVE_INTERNSHIP'];
    for (const expectedAction of expectedActions) {
      if (!actions.includes(expectedAction)) {
        throw new Error(`Expected audit actions to contain '${expectedAction}'`);
      }
    }
    console.log('  ✅ PASS');

    // Clean up
    console.log('\nCleaning up database records...');
    await pgClient.query('DELETE FROM daily_logs WHERE internship_id = $1', [internship.id]);
    await pgClient.query('DELETE FROM internship_mentor_assignments WHERE internship_id = $1', [internship.id]);
    await pgClient.query('DELETE FROM internships WHERE id = $1', [internship.id]);
    console.log('Cleaned up. All tests passed!');

  } catch (err) {
    console.error('Test Suite Failed:', err.message || err);
    process.exit(1);
  } finally {
    if (facUser) {
      await pgClient.query('DELETE FROM membership_roles WHERE id = $1', [roleId]).catch(() => {});
    }
    await pgClient.end();
  }
}

testSuite();
