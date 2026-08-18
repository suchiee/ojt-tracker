// server/scripts/test_evaluations_v2.js
// Integration test suite for the Phase 2 V2 Student Internship Evaluation workflow.

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE_URL = `http://localhost:${process.env.PORT || 5001}/api/v2`;
const V2_SECRET = process.env.V2_LOCAL_JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

const isLocal = (DATABASE_URL || '').includes('localhost') || (DATABASE_URL || '').includes('127.0.0.1');

function makeToken(userId, email) {
  return jwt.sign({ sub: userId, email }, V2_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
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
  console.log('\n--- Student Evaluation V2 Test Suite ---\n');

  if (!V2_SECRET) {
    console.error('[FATAL] V2_LOCAL_JWT_SECRET not set in .env');
    process.exit(1);
  }

  // 1. Resolve student, internship, and other role IDs from the DB
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  // Find student Aarav Sharma (local StudentA)
  const { rows: studentRows } = await pgClient.query("SELECT id, email FROM users WHERE email = 'test-studentA@test-a.com'");
  if (studentRows.length === 0) {
    console.error('[FATAL] test-studentA@test-a.com demo user not found in DB.');
    await pgClient.end();
    process.exit(1);
  }
  const aarav = studentRows[0];

  // Find active internship
  const { rows: intRows } = await pgClient.query("SELECT id FROM internships WHERE student_id = $1 AND status = 'ACTIVE'", [aarav.id]);
  if (intRows.length === 0) {
    console.error('[FATAL] No ACTIVE internship found for StudentA in DB.');
    await pgClient.end();
    process.exit(1);
  }
  const internshipId = intRows[0].id;

  // Find another student (StudentB)
  const { rows: rahulRows } = await pgClient.query("SELECT id, email FROM users WHERE email = 'test-studentB@test-a.com'");
  const rahul = rahulRows[0] || { id: '00000000-0000-0000-0000-000000000000', email: 'rahul@test.com' };

  // Find company mentor (MentorA)
  const { rows: mentorRows } = await pgClient.query("SELECT id, email FROM users WHERE email = 'test-mentorA@test-a.com'");
  const mentor = mentorRows[0] || { id: '00000000-0000-0000-0000-000000000001', email: 'mentor@test.com' };

  // Find faculty mentor (FacultyA)
  const { rows: facultyRows } = await pgClient.query("SELECT id, email FROM users WHERE email = 'test-facultyA@test-a.com'");
  const faculty = facultyRows[0] || { id: '00000000-0000-0000-0000-000000000002', email: 'faculty@test.com' };

  // Clean up any existing evaluation rows for this internship first
  await pgClient.query("DELETE FROM public.evaluations WHERE internship_id = $1", [internshipId]);

  const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });
  const evalUrl = `/internships/${internshipId}/evaluation`;

  const aaravToken = makeToken(aarav.id, aarav.email);
  const rahulToken = makeToken(rahul.id, rahul.email);
  const mentorToken = makeToken(mentor.id, mentor.email);
  const facultyToken = makeToken(faculty.id, faculty.email);

  const payload = {
    agencyName: 'Persistent Systems Ltd.',
    supervisorName: 'Demo Company Mentor',
    trainingPeriod: 'June 2026 - August 2026',
    ratings: {
      workEnvironment: 5,
      supervision: 4,
      learningOpportunities: 5,
      skillDevelopment: 5,
      communication: 4,
      overallExperience: 5
    },
    strengths: 'Excellent mentor support and clear tasks',
    improvements: 'More frequent feedback sessions',
    additionalComments: 'Great experience overall'
  };

  // ── Test 1: Unauthorized GET ─────────────────────────────────────────────
  console.log('Test 1: GET evaluation without auth → 401');
  const t1 = await api.get(evalUrl);
  assert('Status 401', t1.status === 401, t1.status);

  // ── Test 2: Unauthorized POST ────────────────────────────────────────────
  console.log('\nTest 2: POST evaluation without auth → 401');
  const t2 = await api.post(evalUrl, payload);
  assert('Status 401', t2.status === 401, t2.status);

  // ── Test 3: Wrong student GET ────────────────────────────────────────────
  console.log('\nTest 3: GET evaluation with wrong student token → 403 or 404');
  const t3 = await api.get(evalUrl, { headers: authHeaders(rahulToken) });
  assert('Status 403 or 404', t3.status === 403 || t3.status === 404, t3.status);

  // ── Test 4: Wrong student POST ───────────────────────────────────────────
  console.log('\nTest 4: POST evaluation with wrong student token → 403');
  const t4 = await api.post(evalUrl, payload, { headers: authHeaders(rahulToken) });
  assert('Status 403', t4.status === 403, t4.status);

  // ── Test 5: Company Mentor POST ──────────────────────────────────────────
  console.log('\nTest 5: POST evaluation with Company Mentor token → 403');
  const t5 = await api.post(evalUrl, payload, { headers: authHeaders(mentorToken) });
  assert('Status 403', t5.status === 403, t5.status);

  // ── Test 6: Faculty Mentor POST ──────────────────────────────────────────
  console.log('\nTest 6: POST evaluation with Faculty Mentor token → 403');
  const t6 = await api.post(evalUrl, payload, { headers: authHeaders(facultyToken) });
  assert('Status 403', t6.status === 403, t6.status);

  // ── Test 7: Valid student submission ─────────────────────────────────────
  console.log('\nTest 7: POST evaluation with valid student token → 201');
  const t7 = await api.post(evalUrl, payload, { headers: authHeaders(aaravToken) });
  assert('Status 201', t7.status === 201, `${t7.status}: ${JSON.stringify(t7.data)}`);
  assert('Has evaluation ID', !!t7.data?.data?.id, t7.data?.data);

  // ── Test 8: DB integrity verification ────────────────────────────────────
  console.log('\nTest 8: Verify evaluation records in database');
  const { rows: dbEvals } = await pgClient.query("SELECT * FROM public.evaluations WHERE internship_id = $1", [internshipId]);
  assert('Exactly 1 evaluation row created', dbEvals.length === 1, dbEvals.length);
  if (dbEvals.length === 1) {
    assert('Evaluator role is STUDENT', dbEvals[0].evaluator_role === 'STUDENT', dbEvals[0].evaluator_role);
    assert('Evaluator user is Aarav', dbEvals[0].evaluator_user_id === aarav.id, dbEvals[0].evaluator_user_id);
    
    // Check responses count
    const { rows: dbResps } = await pgClient.query("SELECT count(*) FROM public.evaluation_responses WHERE evaluation_id = $1", [dbEvals[0].id]);
    assert('Exactly 9 responses created', parseInt(dbResps[0].count) === 9, dbResps[0].count);
  }

  // ── Test 9: Duplicate submission ─────────────────────────────────────────
  console.log('\nTest 9: POST duplicate evaluation → 400');
  const t9 = await api.post(evalUrl, payload, { headers: authHeaders(aaravToken) });
  assert('Status 400', t9.status === 400, t9.status);

  // ── Test 10: Valid student GET ───────────────────────────────────────────
  console.log('\nTest 10: GET evaluation with valid student token → 200');
  const t10 = await api.get(evalUrl, { headers: authHeaders(aaravToken) });
  assert('Status 200', t10.status === 200, t10.status);
  assert('Has ratings object', typeof t10.data?.data?.ratings === 'object', t10.data?.data);
  assert('overallExperience = 5', t10.data?.data?.ratings?.overallExperience === 5, t10.data?.data?.ratings?.overallExperience);
  assert('strengths match', t10.data?.data?.strengths === 'Excellent mentor support and clear tasks', t10.data?.data?.strengths);

  await pgClient.end();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`EVALUATION INTEGRATION TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
