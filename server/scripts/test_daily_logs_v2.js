// test_daily_logs_v2.js
// Automated test suite for GET/POST/PATCH/DELETE/SUBMIT daily logs V2 endpoints.
// Requires: server running with LOCAL_JWT_DEV_MODE=true
// Usage: node scripts/test_daily_logs_v2.js

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
  console.log('\n--- Daily Logs V2 Test Suite ---\n');

  if (!V2_SECRET) {
    console.error('[FATAL] V2_LOCAL_JWT_SECRET not set in .env');
    process.exit(1);
  }

  // ── Resolve a student with an active internship ─────────────────────────
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  // Find a student user who has an ACTIVE internship
  const { rows: internshipRows } = await pgClient.query(`
    SELECT i.id AS internship_id, i.student_id, u.email
    FROM internships i
    JOIN users u ON i.student_id = u.id
    WHERE i.status = 'ACTIVE'
    LIMIT 1
  `);

  if (internshipRows.length === 0) {
    console.error('[FATAL] No ACTIVE internship found in local DB. Cannot run tests.');
    await pgClient.end();
    process.exit(1);
  }

  const { internship_id, student_id, email } = internshipRows[0];
  console.log(`[INFO] Student: ${email} (${student_id})`);
  console.log(`[INFO] Internship: ${internship_id}\n`);

  const token = makeToken(student_id);
  const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

  const logsUrl = `/internships/${internship_id}/logs`;

  // ── Test 1: No auth ──────────────────────────────────────────────────────
  console.log('Test 1: GET logs without auth → 401');
  const t1 = await api.get(logsUrl);
  assert('Status 401', t1.status === 401, t1.status);

  // ── Test 2: Invalid JWT ──────────────────────────────────────────────────
  console.log('\nTest 2: GET logs with invalid JWT → 401');
  const t2 = await api.get(logsUrl, { headers: { Authorization: 'Bearer bad.token.here' } });
  assert('Status 401', t2.status === 401, t2.status);

  // ── Test 3: List logs ────────────────────────────────────────────────────
  console.log('\nTest 3: GET logs (authenticated student) → 200');
  const t3 = await api.get(logsUrl, { headers: authHeaders(token), params: { page: 1, limit: 5 } });
  assert('Status 200', t3.status === 200, t3.status);
  assert('Has data array', Array.isArray(t3.data?.data), t3.data);
  assert('Has pagination', typeof t3.data?.pagination?.total === 'number', t3.data?.pagination);
  const initialCount = t3.data.pagination.total;
  console.log(`  [INFO] Existing logs: ${initialCount}`);

  // ── Test 4: Create log ───────────────────────────────────────────────────
  const testDate = new Date();
  testDate.setDate(testDate.getDate() - 2); // 2 days ago to avoid conflicts
  const testDateStr = testDate.toISOString().split('T')[0];

  // Clean up any existing log for this date first
  await pgClient.query(
    `DELETE FROM daily_logs WHERE internship_id = $1 AND date = $2`,
    [internship_id, testDateStr]
  );

  console.log(`\nTest 4: POST create log (${testDateStr}) → 201`);
  const t4 = await api.post(logsUrl, {
    date: testDateStr,
    tasks: [
      { description: 'V2 Test Task A', hours: 2.5 },
      { description: 'V2 Test Task B', hours: 1.5 }
    ],
    notes: 'Automated test log — V2'
  }, { headers: authHeaders(token) });
  assert('Status 201', t4.status === 201, `${t4.status}: ${JSON.stringify(t4.data)}`);
  assert('Has log id', !!t4.data?.data?.id, t4.data?.data);
  assert('Tasks present', Array.isArray(t4.data?.data?.tasks), t4.data?.data);
  assert('total_task_hours = 4.0', parseFloat(t4.data?.data?.total_task_hours) === 4.0, t4.data?.data?.total_task_hours);
  const createdLogId = t4.data?.data?.id;

  // ── Test 5: Duplicate date → 409 ─────────────────────────────────────────
  console.log('\nTest 5: POST duplicate date → 409');
  const t5 = await api.post(logsUrl, {
    date: testDateStr,
    tasks: [{ description: 'Duplicate', hours: 1 }]
  }, { headers: authHeaders(token) });
  assert('Status 409', t5.status === 409, t5.status);

  // ── Test 6: Get log detail ────────────────────────────────────────────────
  console.log('\nTest 6: GET log detail → 200 with tasks');
  const t6 = await api.get(`${logsUrl}/${createdLogId}`, { headers: authHeaders(token) });
  assert('Status 200', t6.status === 200, t6.status);
  assert('Tasks array', Array.isArray(t6.data?.data?.tasks), t6.data?.data);
  assert('Task count = 2', t6.data?.data?.tasks?.length === 2, t6.data?.data?.tasks?.length);

  // ── Test 7: PATCH update notes ────────────────────────────────────────────
  console.log('\nTest 7: PATCH update log notes → 200');
  const t7 = await api.patch(`${logsUrl}/${createdLogId}`, {
    notes: 'Updated by automated test',
    tasks: [{ description: 'Updated Task', hours: 3.0 }]
  }, { headers: authHeaders(token) });
  assert('Status 200', t7.status === 200, `${t7.status}: ${JSON.stringify(t7.data)}`);
  assert('Notes updated', t7.data?.data?.notes === 'Updated by automated test', t7.data?.data?.notes);

  // ── Test 8: GET reviews (empty for new log) ───────────────────────────────
  console.log('\nTest 8: GET reviews history → 200 (empty array)');
  const t8 = await api.get(`${logsUrl}/${createdLogId}/reviews`, { headers: authHeaders(token) });
  assert('Status 200', t8.status === 200, t8.status);
  assert('Reviews is array', Array.isArray(t8.data?.data), t8.data);

  // ── Test 9: Submit log ────────────────────────────────────────────────────
  console.log('\nTest 9: POST submit log → 200 (status becomes SUBMITTED)');
  const t9 = await api.post(`${logsUrl}/${createdLogId}/submit`, {}, { headers: authHeaders(token) });
  assert('Status 200', t9.status === 200, `${t9.status}: ${JSON.stringify(t9.data)}`);
  assert('Status = SUBMITTED', t9.data?.data?.status === 'SUBMITTED', t9.data?.data?.status);

  // ── Test 10: Cannot delete submitted log ──────────────────────────────────
  console.log('\nTest 10: DELETE submitted log → 422 (workflow lock)');
  const t10 = await api.delete(`${logsUrl}/${createdLogId}`, { headers: authHeaders(token) });
  assert('Status 422', t10.status === 422, `${t10.status}: ${JSON.stringify(t10.data)}`);

  // ── Test 11: Cannot patch submitted log ───────────────────────────────────
  console.log('\nTest 11: PATCH submitted log → 422 (locked for editing)');
  const t11 = await api.patch(`${logsUrl}/${createdLogId}`, {
    notes: 'Should be rejected'
  }, { headers: authHeaders(token) });
  assert('Status 422', t11.status === 422, `${t11.status}: ${JSON.stringify(t11.data)}`);

  // ── Test 12: POST with empty tasks array → 400 ────────────────────────
  console.log('\nTest 12: POST with empty tasks array → 400 validation error');
  const t12 = await api.post(logsUrl, {
    date: new Date().toISOString().split('T')[0],
    tasks: []
  }, { headers: authHeaders(token) });
  assert('Status 400', t12.status === 400, `${t12.status}: ${JSON.stringify(t12.data)}`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n[Cleanup] Deleting test log from database...');
  await pgClient.query(`DELETE FROM daily_logs WHERE id = $1`, [createdLogId]);
  console.log('[Cleanup] Done.');

  await pgClient.end();

  console.log(`\n--- Results: ${passed} passed / ${failed} failed ---\n`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('[FATAL] Test runner error:', err.message);
  process.exit(1);
});
