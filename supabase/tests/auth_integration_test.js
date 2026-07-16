// Phase 1C: Authentication, Identity, and RLS Integration Test Suite
// This script performs genuine end-to-end integration tests using real Supabase Auth-issued tokens
// and verifies RLS access controls and Express /api/v2 route protection boundaries.

const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables (mimicking local environment)
require('dotenv').config({ path: '../../.env' });

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPRESS_PORT = process.env.PORT || 5003;
const API_BASE_URL = `http://localhost:${EXPRESS_PORT}`;

// Secure SHA-256 hashing
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

async function runTests() {
  console.log('================================================================');
  console.log('STARTING PHASE 1C AUTHENTICATION & RLS INTEGRATION TESTS');
  console.log('================================================================\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('ERROR: Missing Supabase environment variables. Please check your .env file.');
    console.log('Required: SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Create clients
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const testMatrix = [];
  const logTest = (id, name, result, details = '') => {
    testMatrix.push({ id, name, status: result ? 'PASS' : 'FAIL', details });
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${id}: ${name} ${details ? `(${details})` : ''}`);
  };

  try {
    // -------------------------------------------------------------------------
    -- TEST 1: ANONYMOUS BOUNDARY CHECKS
    // -------------------------------------------------------------------------
    try {
      await axios.get(`${API_BASE_URL}/api/v2/auth/me`);
      logTest('AUTH-001', 'Anonymous request to protected v2 endpoint is rejected', false, 'Allowed unauthenticated query');
    } catch (err) {
      const isRejected = err.response && err.response.status === 401;
      logTest('AUTH-001', 'Anonymous request to protected v2 endpoint is rejected', isRejected, `Status: ${err.response?.status}`);
    }

    // -------------------------------------------------------------------------
    -- TEST 2: LEGACY JWT BOUNDARY ISOLATION
    // -------------------------------------------------------------------------
    try {
      // Mock legacy JWT token signature validation failure
      const mockLegacyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy-payload.signature';
      await axios.get(`${API_BASE_URL}/api/v2/auth/me`, {
        headers: { Authorization: `Bearer ${mockLegacyToken}` }
      });
      logTest('AUTH-002', 'Legacy JWT token rejected on /api/v2 endpoints', false, 'Allowed legacy JWT access');
    } catch (err) {
      const isRejected = err.response && err.response.status === 401;
      logTest('AUTH-002', 'Legacy JWT token rejected on /api/v2 endpoints', isRejected, `Status: ${err.response?.status}`);
    }

    // -------------------------------------------------------------------------
    -- TEST 3: PRIVILEGE ESCALATION ATTEMPTS
    // -------------------------------------------------------------------------
    // Set up a mock student signup metadata containing privileged fields
    const testStudentEmail = `student-${crypto.randomBytes(4).toString('hex')}@wadia.edu`;
    const testPassword = 'Password123!';

    const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
      email: testStudentEmail,
      password: testPassword,
      options: {
        data: {
          first_name: 'Test',
          last_name: 'Student',
          role: 'ADMIN', // Malicious attempt to self-assign role
          tenant_id: '11111111-1111-1111-1111-111111111111' // Malicious attempt to self-join
        }
      }
    });

    if (signUpErr || !signUpData.user) {
      throw new Error(`Failed to create test user: ${signUpErr?.message}`);
    }

    const studentUser = signUpData.user;
    const sessionToken = signUpData.session?.access_token;

    // Login to verify the profile sync trigger successfully completed
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testStudentEmail,
      password: testPassword
    });

    if (loginErr || !loginData.session) {
      throw new Error(`Login failed for test user: ${loginErr?.message}`);
    }

    const token = loginData.session.access_token;

    // Verify synced public profile contains default name attributes but NO self-assigned roles
    const { data: dbMe, error: dbMeErr } = await serviceClient
      .from('users')
      .select('*')
      .eq('id', studentUser.id)
      .single();

    const isSyncSuccess = dbMe && dbMe.first_name === 'Test' && dbMe.last_name === 'Student';
    logTest('SYNC-001', 'PostgreSQL Trigger Handle New User automatically syncs profiles', isSyncSuccess);

    // Fetch v2 auth context and verify role is empty (onboarding required)
    const meResponse = await axios.get(`${API_BASE_URL}/api/v2/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const contextData = meResponse.data;
    const hasPrivilegesEscalated = contextData.roles.includes('ADMIN') || contextData.memberships.length > 0;
    logTest('ESC-001', 'Signup metadata role/tenant configurations ignored (Security Sandbox)', !hasPrivilegesEscalated);

    // -------------------------------------------------------------------------
    -- TEST 4: ONBOARDING SECURITY CONTROLS
    // -------------------------------------------------------------------------
    // Attempt onboarding with an invalid/random invitation code
    try {
      await axios.post(`${API_BASE_URL}/api/v2/student/onboard`, {
        invitationCode: 'INVALID-CODE-XYZ',
        studentIdNumber: 'SID-TEST-001'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      logTest('ONBD-001', 'Student Onboarding rejects invalid invitation codes', false, 'Allowed invalid onboarding code');
    } catch (err) {
      const isRejected = err.response && err.response.status === 400;
      logTest('ONBD-001', 'Student Onboarding rejects invalid invitation codes', isRejected, `Status: ${err.response?.status}`);
    }

    // Clean up test users
    await serviceClient.auth.admin.deleteUser(studentUser.id);
    console.log('\nTest cleanup completed successfully.');

  } catch (err) {
    console.error('\nFatal Error occurred during E2E tests:', err.message);
  }

  // Print Test Matrix
  console.log('\n================================================================');
  console.log('TEST SUMMARY MATRIX');
  console.log('================================================================');
  testMatrix.forEach(t => {
    console.log(`${t.id.padEnd(10)} | ${t.name.padEnd(65)} | [${t.status}] ${t.details}`);
  });
  console.log('================================================================');
}

runTests();
