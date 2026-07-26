// Automated Verification Script for Student Profile V2 Migration
// Local-DB version: auto-discovers real users from local PostgreSQL.
// Runs assertions on GET/POST /api/v2/student/profile endpoints.

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;
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
  console.log('--- Starting Student Profile V2 Test Suite (Local DB Mode) ---');

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false }
  });
  await pgClient.connect();

  try {
    // 1. Auto-discover test users from local DB
    const { rows: studentRows } = await pgClient.query(`
      SELECT u.id, u.email FROM public.users u
      JOIN public.tenant_memberships tm ON u.id = tm.user_id
      JOIN public.membership_roles mr ON tm.id = mr.membership_id
      WHERE mr.role = 'STUDENT'
      LIMIT 1
    `);

    const { rows: adminRows } = await pgClient.query(`
      SELECT u.id, u.email FROM public.users u
      JOIN public.tenant_memberships tm ON u.id = tm.user_id
      JOIN public.membership_roles mr ON tm.id = mr.membership_id
      WHERE mr.role = 'ADMIN'
      LIMIT 1
    `);

    if (studentRows.length === 0) {
      console.error('Error: No STUDENT users found in local database. Cannot run profile tests.');
      process.exit(1);
    }

    const studentUser = studentRows[0];
    const studentUserId = studentUser.id;
    const studentEmail = studentUser.email;
    console.log(`\n[INFO] Using local student: ${studentEmail} (${studentUserId})`);

    const studentToken = makeV2Token(studentUserId, studentEmail);

    // Non-student token (ADMIN acts as a non-student to verify 404 on profile)
    let nonStudentToken = null;
    if (adminRows.length > 0) {
      const adminUser = adminRows[0];
      nonStudentToken = makeV2Token(adminUser.id, adminUser.email);
      console.log(`[INFO] Using local admin for non-student tests: ${adminUser.email}`);
    }

    // Test 1: Unauthorized access (no token)
    console.log('\nRunning Test 1: Get profile without Authorization header');
    const res1 = await api().get('/api/v2/student/profile');
    console.log(`  Status: ${res1.status} (Expected: 401)`);
    console.assert(res1.status === 401, 'FAIL Test 1: Status is not 401');
    if (res1.status === 401) console.log('  PASS');

    // Test 2: Invalid JWT signature
    console.log('\nRunning Test 2: Get profile with invalid JWT signature');
    const res2 = await api('invalid-token-string').get('/api/v2/student/profile');
    console.log(`  Status: ${res2.status} (Expected: 401)`);
    console.assert(res2.status === 401, 'FAIL Test 2: Status is not 401');
    if (res2.status === 401) console.log('  PASS');

    // Test 3: Non-student user (ADMIN) gets 404 on student profile endpoint
    if (nonStudentToken) {
      console.log('\nRunning Test 3: Admin user tries to access /api/v2/student/profile');
      const res3 = await api(nonStudentToken).get('/api/v2/student/profile');
      console.log(`  Status: ${res3.status} (Expected: 404 — no student profile for this user)`);
      console.assert(res3.status === 404, 'FAIL Test 3: Status is not 404');
      if (res3.status === 404) console.log('  PASS');
    } else {
      console.log('\nTest 3: SKIPPED (no admin user found in local DB)');
    }

    // Test 4: Authorized student access
    console.log('\nRunning Test 4: Student user requests profile');
    const res4 = await api(studentToken).get('/api/v2/student/profile');
    console.log(`  Status: ${res4.status} (Expected: 200)`);
    console.assert(res4.status === 200, `FAIL Test 4: Status is not 200 (got ${res4.status}) — ${JSON.stringify(res4.data)}`);
    if (res4.status === 200) {
      console.log('  PASS');
      console.log('  Response Structure Validations:');
      console.log(`  - user.email: ${res4.data.user?.email}`);
      console.log(`  - profile.personalInfo.fullName: ${res4.data.profile?.personalInfo?.fullName}`);
      console.log(`  - profile.academicInfo.institution: ${res4.data.profile?.academicInfo?.institution}`);
      console.assert(res4.data.user?.email === studentEmail, 'FAIL Test 4: Email mismatch in response');
      console.assert(res4.data.profile?.personalInfo?.fullName !== undefined, 'FAIL Test 4: fullName missing');
    }

    // Test 5: Profile Update (POST /api/v2/student/profile)
    if (res4.status === 200) {
      console.log('\nRunning Test 5: Student updates full name');
      const originalName = res4.data.profile.personalInfo.fullName;
      const testNewName = 'Aarav Sharma';
      const res5 = await api(studentToken).post('/api/v2/student/profile', { fullName: testNewName });
      console.log(`  Status: ${res5.status} (Expected: 200)`);
      console.assert(res5.status === 200, `FAIL Test 5: Status is not 200 (got ${res5.status}) — ${JSON.stringify(res5.data)}`);
      if (res5.status === 200) {
        console.log(`  Updated fullName: ${res5.data.profile?.personalInfo?.fullName} (Expected: ${testNewName})`);
        console.assert(res5.data.profile?.personalInfo?.fullName === testNewName, 'FAIL Test 5: Name mismatch after update');
        console.log('  PASS');

        // Restore original name
        console.log('\n  Restoring original student name...');
        const resRestore = await api(studentToken).post('/api/v2/student/profile', { fullName: originalName });
        if (resRestore.status === 200) {
          console.log('  Restored PASS');
        } else {
          console.warn(`  WARNING: Failed to restore name (status ${resRestore.status})`);
        }
      }
    } else {
      console.log('\nTest 5: SKIPPED (Test 4 failed)');
    }

    // Test 6: Missing fullName in POST returns 400
    console.log('\nRunning Test 6: POST with missing fullName returns 400');
    const res6 = await api(studentToken).post('/api/v2/student/profile', {});
    console.log(`  Status: ${res6.status} (Expected: 400)`);
    console.assert(res6.status === 400, `FAIL Test 6: Status is not 400 (got ${res6.status})`);
    if (res6.status === 400) console.log('  PASS');

    console.log('\n--- All Student Profile V2 Tests Completed ---');
  } catch (err) {
    console.error('Test Suite encountered an error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

testSuite();
