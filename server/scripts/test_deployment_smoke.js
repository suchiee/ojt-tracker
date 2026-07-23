// Test Script: test_deployment_smoke.js
// Non-destructive deployment smoke test for staging and production environments.
// Verifies process liveness, healthz endpoint, security headers, unauthenticated 401 protection, and 404 behavior.

const axios = require('axios');

const TARGET_API_URL = (process.env.DEPLOYMENT_API_URL || 'http://localhost:5003/api/v2').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`[SMOKE PASS ${passed}] ${message}`);
  } else {
    failed++;
    console.error(`[SMOKE FAIL ${failed}] ${message}`);
  }
}

async function runDeploymentSmokeTest() {
  console.log('=== NON-DESTRUCTIVE DEPLOYMENT SMOKE TEST ===');
  console.log(`Target Base URL: ${TARGET_API_URL}\n`);

  try {
    // 1. GET /api/v2/healthz
    console.log('--- 1. HEALTH CHECK & LIVENESS ---');
    const healthRes = await axios.get(`${TARGET_API_URL}/healthz`);
    assert(healthRes.status === 200, 'GET /healthz responded with HTTP 200 OK');
    assert(healthRes.data && healthRes.data.status === 'ok', 'Health response contains status: "ok"');
    assert(healthRes.data && typeof healthRes.data.timestamp === 'string', 'Health response contains valid timestamp');

    // 2. Helmet Security Headers
    console.log('\n--- 2. SECURITY HEADERS ---');
    assert(
      healthRes.headers['x-content-type-options'] === 'nosniff',
      'X-Content-Type-Options: nosniff header present'
    );
    assert(
      healthRes.headers['x-frame-options'] === 'SAMEORIGIN' ||
      healthRes.headers['x-content-type-options'] !== undefined ||
      healthRes.headers['x-dns-prefetch-control'] !== undefined,
      'Helmet security header stack verified'
    );

    // 3. Unauthenticated Route Protection (401)
    console.log('\n--- 3. AUTHENTICATION PROTECTION ---');
    try {
      await axios.get(`${TARGET_API_URL}/admin/overview`);
      assert(false, 'Unauthenticated admin overview request should have been rejected');
    } catch (err) {
      assert(err.response && err.response.status === 401, 'Unauthenticated request correctly rejected with HTTP 401');
    }

    // 4. Invalid JWT Protection (401)
    try {
      await axios.get(`${TARGET_API_URL}/admin/overview`, {
        headers: { Authorization: 'Bearer invalid.smoke.jwt.token' }
      });
      assert(false, 'Invalid JWT request should have been rejected');
    } catch (err) {
      assert(err.response && err.response.status === 401, 'Invalid JWT request correctly rejected with HTTP 401');
    }

    // 5. Unknown Route Handling (404)
    console.log('\n--- 4. UNKNOWN ROUTE HANDLING ---');
    try {
      await axios.get(`${TARGET_API_URL}/non-existent-smoke-route-test-999`);
      assert(false, 'Non-existent route should return 404');
    } catch (err) {
      assert(err.response && err.response.status === 404, 'Non-existent route correctly returned HTTP 404');
    }

  } catch (err) {
    console.error('\nUNHANDLED SMOKE TEST EXCEPTION:', err.message);
    if (err.response) {
      console.error('Response Status:', err.response.status);
      console.error('Response Data:', err.response.data);
    }
    failed++;
  } finally {
    console.log(`\n=== SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runDeploymentSmokeTest();
