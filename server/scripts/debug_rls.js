// debug_rls.js — LOCAL DEVELOPMENT DIAGNOSTIC ONLY
// ═══════════════════════════════════════════════════════════════════════════
// PURPOSE: Verify that auth.uid() and set_config() work correctly in the
//          local PostgreSQL environment.
// SECURITY:
//   - Contains NO credentials (reads from .env via process.env)
//   - Contains NO hardcoded real user IDs
//   - Does NOT mutate any data (read-only test)
//   - NOT imported by any application runtime code
//   - Must NOT be run in production
//   - Use only while debugging RLS session setup issues
//
// SUPERSEDED BY: scripts/test_v2_1e1a.js for actual RLS enforcement testing
// ═══════════════════════════════════════════════════════════════════════════

if (process.env.NODE_ENV === 'production') {
  console.error('ABORT: debug_rls.js must not run in production.');
  process.exit(1);
}

require('dotenv').config();
const { Pool } = require('pg');

const p = new Pool({ connectionString: process.env.DATABASE_URL });
const TEST_UUID = '00000000-0000-0000-0000-000000000001'; // synthetic, non-real UUID

async function test() {
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // Test 1: set_config within transaction
    const r1 = await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true) as cfg`,
      [TEST_UUID]
    );
    console.log('set_config result:', r1.rows[0]);

    // Test 2: read it back immediately within transaction
    const r2 = await client.query(
      `SELECT current_setting('request.jwt.claim.sub', true) as sub`
    );
    console.log('current_setting read (should be set):', r2.rows[0]);

    // Test 3: call auth.uid() — should return TEST_UUID
    const r3 = await client.query(`SELECT auth.uid() as uid`);
    console.log('auth.uid() (should equal TEST_UUID):', r3.rows[0]);
    const uidOk = r3.rows[0]?.uid === TEST_UUID;
    console.log('auth.uid() correctness:', uidOk ? 'PASS' : 'FAIL');

    await client.query('ROLLBACK'); // read-only — always rollback

  } catch (e) {
    console.error('ERROR:', e.message);
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
    await p.end();
  }
}

test();
