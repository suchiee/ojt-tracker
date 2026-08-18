// Automated Verification Script for Company Mentor Invitation & Assignment Workflow
// Tests 1-14 covering complete end-to-end lifecycle.

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

async function createTestUser(pgClient, userId, email, firstName, lastName) {
  await pgClient.query(`
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET email = $2
  `, [userId, email, JSON.stringify({ first_name: firstName, last_name: lastName })]);

  await pgClient.query(`
    INSERT INTO public.users (id, email, first_name, last_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET email = $2, first_name = $3, last_name = $4
  `, [userId, email, firstName, lastName]);
}

async function runTestSuite() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  Sprint 1 – Task 3.2: Company Mentor Workflow Integration Tests');
  console.log('════════════════════════════════════════════════════════════════\n');

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  let passedTests = 0;
  let totalTests = 14;

  try {
    // 0. Setup test users and tenant
    const { rows: [tenant] } = await pgClient.query(`SELECT id FROM tenants LIMIT 1`);
    const tenantId = tenant.id;

    // Discover or create student 1
    const student1Id = crypto.randomUUID();
    const student1Email = `test.student1.${Date.now()}@example.com`;
    await createTestUser(pgClient, student1Id, student1Email, 'Student1', 'Tester');

    const { rows: [m1] } = await pgClient.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student1Id]);

    await pgClient.query(`
      INSERT INTO membership_roles (membership_id, role)
      VALUES ($1, 'STUDENT')
    `, [m1.id]);

    // Discover or create student 2 (for multi-student testing)
    const student2Id = crypto.randomUUID();
    const student2Email = `test.student2.${Date.now()}@example.com`;
    await createTestUser(pgClient, student2Id, student2Email, 'Student2', 'Tester');

    const { rows: [m2] } = await pgClient.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student2Id]);

    await pgClient.query(`
      INSERT INTO membership_roles (membership_id, role)
      VALUES ($1, 'STUDENT')
    `, [m2.id]);

    // Discover or create admin
    const adminId = crypto.randomUUID();
    const adminEmail = `test.admin.${Date.now()}@example.com`;
    await createTestUser(pgClient, adminId, adminEmail, 'Admin', 'Tester');

    const { rows: [adminMem] } = await pgClient.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, adminId]);

    await pgClient.query(`
      INSERT INTO membership_roles (membership_id, role)
      VALUES ($1, 'ADMIN')
    `, [adminMem.id]);

    // Discover or create faculty
    const facultyId = crypto.randomUUID();
    const facultyEmail = `test.faculty.${Date.now()}@example.com`;
    await createTestUser(pgClient, facultyId, facultyEmail, 'Faculty', 'Tester');

    const { rows: [facMem] } = await pgClient.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, facultyId]);

    await pgClient.query(`
      INSERT INTO membership_roles (membership_id, role)
      VALUES ($1, 'FACULTY_MENTOR')
    `, [facMem.id]);

    const student1Token = makeV2Token(student1Id, student1Email);
    const student2Token = makeV2Token(student2Id, student2Email);
    const adminToken = makeV2Token(adminId, adminEmail);

    const newMentorEmail = `new.mentor.${Date.now()}@company.test`;
    const newMentorName = 'Sarah Jenkins';

    // ── TEST 1 & 2: Student Training Setup stores mentor_name & mentor_email in PENDING_VERIFICATION ──
    console.log('▶ Test 1 & 2: Student Training Setup submission with mentor details...');
    const setupRes = await api(student1Token).post('/student/training', {
      agencyName: 'Acme Robotics Inc',
      mentor: newMentorName,
      mentorEmail: newMentorEmail,
      jobRole: 'Embedded Software Engineer',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      totalHours: 300
    });

    const setupData1 = setupRes.data?.data || setupRes.data || {};
    if (setupRes.status === 200 && setupData1.mentorEmail === newMentorEmail && setupData1.status === 'PENDING_VERIFICATION') {
      console.log('  ✔ Test 1: Training Setup successfully persisted mentorName & mentorEmail');
      console.log('  ✔ Test 2: Internship status correctly set to PENDING_VERIFICATION');
      passedTests += 2;
    } else {
      console.error('  ✖ Test 1 or 2 Failed:', setupRes.status, setupRes.data);
    }

    const internship1Id = setupData1.id;

    // ── TEST 3: Admin pending list exposes mentor_name and mentor_email ──
    console.log('\n▶ Test 3: Admin pending list exposes mentor contact fields...');
    const pendingRes = await api(adminToken).get('/admin/internships?status=PENDING_VERIFICATION');
    const foundPending = (pendingRes.data?.data || []).find(i => i.id === internship1Id);
    if (foundPending && foundPending.mentor_email === newMentorEmail && foundPending.mentor_name === newMentorName) {
      console.log('  ✔ Test 3: Admin internships query successfully exposes mentor_name & mentor_email');
      passedTests += 1;
    } else {
      console.error('  ✖ Test 3 Failed: Pending internship not found or mentor fields missing:', foundPending);
    }

    // ── TEST 4, 5, 6: Admin approval of internship with NEW mentor creates COMPANY_MENTOR_INVITE ──
    console.log('\n▶ Test 4, 5, 6: Admin approval triggers invitation generation for new mentor...');
    const approveRes = await api(adminToken).post(`/admin/internships/${internship1Id}/approve`, {
      facultyUserId: facultyId
    });

    if (approveRes.status === 200 && approveRes.data?.data?.status === 'ACTIVE') {
      // Check invitation in db
      const { rows: [invite] } = await pgClient.query(`
        SELECT * FROM invitation_codes 
        WHERE internship_id = $1 AND invitation_type = 'COMPANY_MENTOR_INVITE' AND revoked_at IS NULL
      `, [internship1Id]);

      if (invite && invite.intended_email === newMentorEmail && invite.max_uses === 1) {
        console.log('  ✔ Test 4: Approval with new mentor generated COMPANY_MENTOR_INVITE code');
        console.log('  ✔ Test 5: Invitation code is strictly bound to internship_id and intended_email');
        passedTests += 2;
      } else {
        console.error('  ✖ Test 4 or 5 Failed: Invitation record not found in db:', invite);
      }

      // Check audit log for COMPANY_MENTOR_INVITED
      const { rows: auditInvRows } = await pgClient.query(`
        SELECT * FROM audit_logs 
        WHERE action = 'COMPANY_MENTOR_INVITED' AND target_id = $1
      `, [internship1Id]);

      if (auditInvRows.length > 0) {
        console.log('  ✔ Test 6: Audit log recorded COMPANY_MENTOR_INVITED');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 6 Failed: Audit log COMPANY_MENTOR_INVITED not found');
      }
    } else {
      console.error('  ✖ Test 4/5/6 Failed on approval call:', approveRes.status, approveRes.data);
    }

    // ── TEST 7, 8, 9: Consuming COMPANY_MENTOR_INVITE creates user with COMPANY_MENTOR role & links assignment ──
    console.log('\n▶ Test 7, 8, 9: Mentor consumes invitation and gets assigned to internship...');
    // Create new user account for mentor
    const newMentorUserId = crypto.randomUUID();
    await createTestUser(pgClient, newMentorUserId, newMentorEmail, 'Sarah', 'Jenkins');

    const newMentorToken = makeV2Token(newMentorUserId, newMentorEmail);

    // Fetch the code_hash from db
    const { rows: [inviteRecord] } = await pgClient.query(`
      SELECT * FROM invitation_codes WHERE internship_id = $1 AND intended_email = $2
    `, [internship1Id, newMentorEmail]);

    const knownRawToken = 'mentor_token_' + crypto.randomBytes(16).toString('hex');
    const knownHash = crypto.createHash('sha256').update(knownRawToken).digest('hex');

    await pgClient.query(`
      UPDATE invitation_codes 
      SET code_hash = $1 
      WHERE id = $2
    `, [knownHash, inviteRecord.id]);

    const consumeRes = await api(newMentorToken).post('/auth/invite/consume', {
      invitationCode: knownRawToken
    });

    if (consumeRes.status === 200) {
      // Verify membership_roles has COMPANY_MENTOR
      const { rows: roleRows } = await pgClient.query(`
        SELECT mr.role FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = $1 AND tm.tenant_id = $2
      `, [newMentorUserId, tenantId]);

      const hasMentorRole = roleRows.some(r => r.role === 'COMPANY_MENTOR');
      if (hasMentorRole) {
        console.log('  ✔ Test 7: Consuming invitation granted COMPANY_MENTOR role');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 7 Failed: COMPANY_MENTOR role not found in membership_roles:', roleRows);
      }

      // Verify internship_mentor_assignments
      const { rows: [assignment] } = await pgClient.query(`
        SELECT * FROM internship_mentor_assignments 
        WHERE internship_id = $1 AND mentor_user_id = $2 AND mentor_type = 'COMPANY'
      `, [internship1Id, newMentorUserId]);

      if (assignment && assignment.is_primary === true) {
        console.log('  ✔ Test 8: Internship mentor assignment linked new mentor to internship');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 8 Failed: Assignment not created:', assignment);
      }

      // Verify audit log
      const { rows: auditAssignRows } = await pgClient.query(`
        SELECT * FROM audit_logs 
        WHERE action IN ('COMPANY_MENTOR_ASSIGNED', 'COMPANY_MENTOR_INVITE_ACCEPTED') 
          AND target_id IN ($1, $2)
      `, [internship1Id, consumeRes.data.membershipId]);

      if (auditAssignRows.length > 0) {
        console.log('  ✔ Test 9: Audit log recorded assignment / invite acceptance');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 9 Failed: Audit log for assignment not found');
      }
    } else {
      console.error('  ✖ Test 7/8/9 Failed on consume invite:', consumeRes.status, consumeRes.data);
    }

    // ── TEST 10: Admin approval with EXISTING Company Mentor immediately links assignment ──
    console.log('\n▶ Test 10: Student 2 submits setup with same (existing) Company Mentor...');
    const setup2Res = await api(student2Token).post('/student/training', {
      agencyName: 'Acme Robotics Inc',
      mentor: newMentorName,
      mentorEmail: newMentorEmail,
      jobRole: 'QA Automation Engineer',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      totalHours: 300
    });

    const setupData2 = setup2Res.data?.data || setup2Res.data || {};
    const internship2Id = setupData2.id;

    // Admin approves student 2's internship
    const approve2Res = await api(adminToken).post(`/admin/internships/${internship2Id}/approve`, {
      facultyUserId: facultyId
    });

    if (approve2Res.status === 200) {
      // Check that internship_mentor_assignments was created immediately
      const { rows: [assign2] } = await pgClient.query(`
        SELECT * FROM internship_mentor_assignments 
        WHERE internship_id = $1 AND mentor_user_id = $2 AND mentor_type = 'COMPANY'
      `, [internship2Id, newMentorUserId]);

      // Check that NO new invitation was generated
      const { rows: invite2Rows } = await pgClient.query(`
        SELECT * FROM invitation_codes WHERE internship_id = $1
      `, [internship2Id]);

      if (assign2 && invite2Rows.length === 0) {
        console.log('  ✔ Test 10: Existing mentor assigned directly without redundant invitation');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 10 Failed: Direct assignment failed or redundant invite created:', { assign2, invite2Rows });
      }
    } else {
      console.error('  ✖ Test 10 Failed on approve call:', approve2Res.status, approve2Res.data);
    }

    // ── TEST 11: Single Company Mentor can access review queues for all assigned students ──
    console.log('\n▶ Test 11: Multi-student mentor queue visibility...');
    // Create a submitted daily log for Student 1 and Student 2
    const { rows: [log1] } = await pgClient.query(`
      INSERT INTO daily_logs (internship_id, date, notes, status)
      VALUES ($1, '2026-09-02', 'Built motor control firmware', 'SUBMITTED')
      RETURNING id
    `, [internship1Id]);
    await pgClient.query(`
      INSERT INTO daily_log_tasks (daily_log_id, description, hours)
      VALUES ($1, 'Built motor control firmware', 8)
    `, [log1.id]);

    const { rows: [log2] } = await pgClient.query(`
      INSERT INTO daily_logs (internship_id, date, notes, status)
      VALUES ($1, '2026-09-02', 'Wrote automated integration test suite', 'SUBMITTED')
      RETURNING id
    `, [internship2Id]);
    await pgClient.query(`
      INSERT INTO daily_log_tasks (daily_log_id, description, hours)
      VALUES ($1, 'Wrote automated integration test suite', 8)
    `, [log2.id]);

    const mentorQueueRes = await api(newMentorToken).get('/mentor/review-queue');
    const queueLogIds = (mentorQueueRes.data?.data || []).map(l => l.id);

    if (queueLogIds.includes(log1.id) && queueLogIds.includes(log2.id)) {
      console.log('  ✔ Test 11: Mentor successfully sees submitted logs from both assigned students');
      passedTests += 1;
    } else {
      console.error('  ✖ Test 11 Failed: Mentor queue missing logs:', { queueLogIds, expected: [log1.id, log2.id] });
    }

    // ── TEST 12: Admin approval with existing non-mentor user throws role conflict error ──
    console.log('\n▶ Test 12: Role conflict protection for existing non-mentor accounts...');
    const student3Id = crypto.randomUUID();
    const student3Email = `test.student3.${Date.now()}@example.com`;
    await createTestUser(pgClient, student3Id, student3Email, 'Student3', 'Tester');

    const { rows: [m3] } = await pgClient.query(`
      INSERT INTO tenant_memberships (tenant_id, user_id)
      VALUES ($1, $2) RETURNING id
    `, [tenantId, student3Id]);

    await pgClient.query(`
      INSERT INTO membership_roles (membership_id, role)
      VALUES ($1, 'STUDENT')
    `, [m3.id]);

    const student3Token = makeV2Token(student3Id, student3Email);

    // Student 3 enters a mentor email that belongs to a FACULTY member
    const setup3Res = await api(student3Token).post('/student/training', {
      agencyName: 'Test Labs',
      mentor: 'Faculty Mentor As Company Mentor',
      mentorEmail: facultyEmail,
      jobRole: 'Research Assistant',
      startDate: '2026-09-01',
      endDate: '2026-12-15',
      totalHours: 300
    });

    const setupData3 = setup3Res.data?.data || setup3Res.data || {};
    const internship3Id = setupData3.id;
    const approveConflictRes = await api(adminToken).post(`/admin/internships/${internship3Id}/approve`, {
      facultyUserId: facultyId
    });

    if (approveConflictRes.status === 400 && approveConflictRes.data?.message?.includes('already exists with role')) {
      console.log('  ✔ Test 12: Role conflict correctly rejected with 400 error and descriptive message');
      passedTests += 1;
    } else {
      console.error('  ✖ Test 12 Failed: Expected 400 role conflict error, got:', approveConflictRes.status, approveConflictRes.data);
    }

    // ── TEST 13: Rejection sets status to REJECTED and resubmission resets to PENDING_VERIFICATION ──
    console.log('\n▶ Test 13: Rejection & resubmission lifecycle...');
    const rejectRes = await api(adminToken).post(`/admin/internships/${internship3Id}/reject`, {
      rejectionReason: 'Invalid company mentor email. Please provide your supervisor at the company.'
    });

    if (rejectRes.status === 200 && rejectRes.data?.data?.status === 'REJECTED') {
      // Student resubmits with valid new mentor email
      const correctedMentorEmail = `corrected.mentor.${Date.now()}@testlabs.com`;
      const resubmitRes = await api(student3Token).post('/student/training', {
        agencyName: 'Test Labs',
        mentor: 'Dr. Bruce Banner',
        mentorEmail: correctedMentorEmail,
        jobRole: 'Research Assistant',
        startDate: '2026-09-01',
        endDate: '2026-12-15',
        totalHours: 300
      });

      const resubmitData = resubmitRes.data?.data || resubmitRes.data || {};
      if (resubmitRes.status === 200 && resubmitData.status === 'PENDING_VERIFICATION' && resubmitData.mentorEmail === correctedMentorEmail) {
        console.log('  ✔ Test 13: Rejection and resubmission cleanly reset status and updated mentor email');
        passedTests += 1;
      } else {
        console.error('  ✖ Test 13 Failed on resubmission:', resubmitRes.status, resubmitRes.data);
      }
    } else {
      console.error('  ✖ Test 13 Failed on rejection:', rejectRes.status, rejectRes.data);
    }

    // ── TEST 14: Invitation cannot be consumed by a different email or reused ──
    console.log('\n▶ Test 14: Security validations on invitation consumption...');
    // Approve student 3's resubmitted internship to get a fresh invitation
    await api(adminToken).post(`/admin/internships/${internship3Id}/approve`, { facultyUserId: facultyId });
    const { rows: [freshInvite] } = await pgClient.query(`
      SELECT * FROM invitation_codes WHERE internship_id = $1 AND uses_count = 0
    `, [internship3Id]);

    const secretToken3 = 'secret_mentor_' + crypto.randomBytes(16).toString('hex');
    const hash3 = crypto.createHash('sha256').update(secretToken3).digest('hex');
    await pgClient.query(`UPDATE invitation_codes SET code_hash = $1 WHERE id = $2`, [hash3, freshInvite.id]);

    // Unauthorized user trying to consume someone else's invitation
    const hackerUserId = crypto.randomUUID();
    const hackerEmail = `hacker.${Date.now()}@example.com`;
    await createTestUser(pgClient, hackerUserId, hackerEmail, 'Hacker', 'User');
    const hackerToken = makeV2Token(hackerUserId, hackerEmail);

    const stealRes = await api(hackerToken).post('/auth/invite/consume', {
      invitationCode: secretToken3
    });

    // Valid user consuming
    const legitimateMentorUserId = crypto.randomUUID();
    await createTestUser(pgClient, legitimateMentorUserId, freshInvite.intended_email, 'Bruce', 'Banner');
    const legitimateToken = makeV2Token(legitimateMentorUserId, freshInvite.intended_email);

    const legitConsumeRes = await api(legitimateToken).post('/auth/invite/consume', {
      invitationCode: secretToken3
    });

    // Replay attempt
    const replayRes = await api(legitimateToken).post('/auth/invite/consume', {
      invitationCode: secretToken3
    });

    if (stealRes.status === 400 && legitConsumeRes.status === 200 && replayRes.status === 400) {
      console.log('  ✔ Test 14: Email mismatch and reuse attempts were correctly rejected');
      passedTests += 1;
    } else {
      console.error('  ✖ Test 14 Failed:', {
        stealStatus: stealRes.status,
        legitStatus: legitConsumeRes.status,
        replayStatus: replayRes.status
      });
    }

  } catch (err) {
    console.error('\n❌ Unhandled error in test suite:', err);
  } finally {
    await pgClient.end();
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  Test Summary: ${passedTests} / ${totalTests} Passed`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite();
