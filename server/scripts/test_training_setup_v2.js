// test_training_setup_v2.js
// Automated test suite for OJT Training Setup V2 endpoints.
// Requires: server running with LOCAL_JWT_DEV_MODE=true
// Usage: node scripts/test_training_setup_v2.js

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE_URL = `http://localhost:${process.env.PORT || 5001}/api/v2`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

const isLocal = (DATABASE_URL || '').includes('localhost') || (DATABASE_URL || '').includes('127.0.0.1');

function makeToken(userId) {
  return jwt.sign({ sub: userId, email: 'test@test.com' }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

let passed = 0;
let failed = 0;

function assert(label, condition, got) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} (got: ${JSON.stringify(got)})`);
    failed++;
  }
}

async function run() {
  console.log('\n--- Training Setup V2 Test Suite ---\n');

  if (!V2_SECRET) {
    console.error('[FATAL] V2_LOCAL_JWT_SECRET not set in .env');
    process.exit(1);
  }

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  // Find a student user with tenant membership
  const { rows: studentRows } = await pgClient.query(`
    SELECT tm.user_id, u.email, tm.tenant_id
    FROM tenant_memberships tm
    JOIN users u ON tm.user_id = u.id
    JOIN membership_roles mr ON tm.id = mr.membership_id
    WHERE mr.role = 'STUDENT'
    LIMIT 1
  `);

  if (studentRows.length === 0) {
    console.error('[FATAL] No STUDENT found in local DB. Cannot run tests.');
    await pgClient.end();
    process.exit(1);
  }

  const student = studentRows[0];
  console.log(`[INFO] Testing with Student: ${student.email} (${student.user_id})`);
  console.log(`[INFO] Tenant ID: ${student.tenant_id}\n`);

  const token = makeToken(student.user_id);
  const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

  const trainingUrl = '/student/training';

  // Back up any existing internships for this student to restore later
  const { rows: backupInternships } = await pgClient.query(
    `SELECT * FROM internships WHERE student_id = $1`,
    [student.user_id]
  );
  console.log(`[INFO] Backed up ${backupInternships.length} existing internships for student.`);

  // Clean all internships for this student for test isolation
  await pgClient.query(`DELETE FROM internships WHERE student_id = $1`, [student.user_id]);

  try {
    // ── Test 1: GET without auth ───────────────────────────────────────────
    console.log('Test 1: GET training setup without auth → 401');
    const t1 = await api.get(trainingUrl);
    assert('Status 401', t1.status === 401, t1.status);

    // ── Test 2: GET invalid JWT ───────────────────────────────────────────────
    console.log('\nTest 2: GET training setup with invalid JWT → 401');
    const t2 = await api.get(trainingUrl, { headers: { Authorization: 'Bearer bad.token.here' } });
    assert('Status 401', t2.status === 401, t2.status);

    // ── Test 3: GET with no training setup ───────────────────────────────────
    console.log('\nTest 3: GET training setup (no internship exists) → 404');
    const t3 = await api.get(trainingUrl, { headers: authHeaders(token) });
    assert('Status 404', t3.status === 404, t3.status);

    // ── Test 4: POST training setup (Create new company + active internship) ───
    const testAgencyName = `Setup Company-${Date.now()}`;
    const setupPayload = {
      agencyName: testAgencyName,
      mentor: 'Mentor Company A',
      jobRole: 'Software Intern',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      totalHours: 240
    };

    console.log('\nTest 4: POST training setup (Create new) → 200');
    const t4 = await api.post(trainingUrl, setupPayload, { headers: authHeaders(token) });
    assert('Status 200', t4.status === 200, `${t4.status}: ${JSON.stringify(t4.data)}`);
    assert('Has internship ID', !!t4.data?.id, t4.data);
    assert('agencyName correct', t4.data?.agencyName === testAgencyName, t4.data?.agencyName);
    assert('status is PENDING_VERIFICATION', t4.data?.status === 'PENDING_VERIFICATION', t4.data?.status);
    assert('jobRole correct', t4.data?.jobRole === 'Software Intern', t4.data?.jobRole);
    assert('totalHours correct', t4.data?.totalHours === 240, t4.data?.totalHours);
    assert('mentor correct (fallback default)', t4.data?.mentor === 'Assigned by Coordinator', t4.data?.mentor);

    // Verify company was created in database
    const { rows: newCoRows } = await pgClient.query(
      `SELECT * FROM companies WHERE tenant_id = $1 AND name = $2`,
      [student.tenant_id, testAgencyName]
    );
    assert('Company created in DB', newCoRows.length === 1, newCoRows);
    const resolvedCompanyId = newCoRows[0]?.id;

    // ── Test 5: GET training details (Refresh persistence) ───────────────────
    console.log('\nTest 5: GET training details (Retrieve created setup) → 200');
    const t5 = await api.get(trainingUrl, { headers: authHeaders(token) });
    assert('Status 200', t5.status === 200, t5.status);
    assert('agencyName matches', t5.data?.agencyName === testAgencyName, t5.data);
    assert('totalHours matches', t5.data?.totalHours === 240, t5.data);

    // ── Test 6: POST training setup (Reuse existing company) ───────────────────
    console.log('\nTest 6: POST training setup (Reuse same company name) → 200');
    const updatePayload = {
      ...setupPayload,
      jobRole: 'Senior Software Intern',
      totalHours: 300
    };
    const t6 = await api.post(trainingUrl, updatePayload, { headers: authHeaders(token) });
    assert('Status 200', t6.status === 200, t6.status);
    assert('jobRole updated', t6.data?.jobRole === 'Senior Software Intern', t6.data?.jobRole);
    assert('totalHours updated', t6.data?.totalHours === 300, t6.data?.totalHours);

    // Verify no duplicate company was created
    const { rows: coCountRows } = await pgClient.query(
      `SELECT COUNT(*)::int FROM companies WHERE tenant_id = $1 AND name = $2`,
      [student.tenant_id, testAgencyName]
    );
    assert('No duplicate company created', coCountRows[0].count === 1, coCountRows[0].count);

    // ── Test 7: Validation failures ──────────────────────────────────────────
    console.log('\nTest 7: POST setup with invalid parameters → 400');
    const badPayloads = [
      { ...setupPayload, totalHours: -5 }, // negative hours
      { ...setupPayload, startDate: '2026-10-01', endDate: '2026-09-01' }, // start after end
      { ...setupPayload, agencyName: '' }, // empty agencyName
      { ...setupPayload, id: '1deff4b1-fa3a-4efb-9add-ec29a2ce8e98' } // parameter injection override
    ];

    for (let i = 0; i < badPayloads.length; i++) {
      const t7 = await api.post(trainingUrl, badPayloads[i], { headers: authHeaders(token) });
      assert(`Bad Payload #${i + 1} status is 400`, t7.status === 400, t7.status);
    }

    // ── Test 8: Mentor Display (with assigned mentor) ────────────────────────
    console.log('\nTest 8: Mentor Display (with assigned mentor user)');
    // Find another user in the users table to act as a mock mentor
    const { rows: potentialMentors } = await pgClient.query(`
      SELECT id, first_name, last_name FROM users WHERE id != $1 LIMIT 1
    `, [student.user_id]);

    if (potentialMentors.length === 0) {
      throw new Error('No other users in DB to act as mock mentor');
    }
    const mockMentor = potentialMentors[0];
    const mockMentorId = mockMentor.id;
    const expectedMentorName = `${mockMentor.first_name || ''} ${mockMentor.last_name || ''}`.trim();

    // Assign mentor to the active internship
    await pgClient.query(`
      INSERT INTO internship_mentor_assignments (internship_id, mentor_user_id, mentor_type)
      VALUES ($1, $2, 'COMPANY');
    `, [t6.data.id, mockMentorId]);

    // Fetch details again and check if mentor name is returned instead of "Assigned by Coordinator"
    const t8 = await api.get(trainingUrl, { headers: authHeaders(token) });
    assert(`Mentor name is ${expectedMentorName}`, t8.data?.mentor === expectedMentorName, t8.data?.mentor);

    // Clean up mock mentor assignment
    await pgClient.query(`
      DELETE FROM internship_mentor_assignments 
      WHERE internship_id = $1 AND mentor_user_id = $2;
    `, [t6.data.id, mockMentorId]);

  } finally {
    // Clean up created company and internship
    await pgClient.query(`DELETE FROM internships WHERE student_id = $1`, [student.user_id]);
    // Restore backed up internships
    for (const item of backupInternships) {
      await pgClient.query(`
        INSERT INTO internships (id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        item.id,
        item.tenant_id,
        item.student_id,
        item.company_id,
        item.job_role,
        item.start_date,
        item.end_date,
        item.total_hours,
        item.status,
        item.created_at
      ]);
    }
    console.log('[Cleanup] Restored original student internships.');
    await pgClient.end();
  }

  console.log(`\n--- Results: ${passed} passed / ${failed} failed ---\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('[FATAL] Test runner error:', err.message || err);
  process.exit(1);
});
