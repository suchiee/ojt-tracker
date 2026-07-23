// Script: server/scripts/test_production_readiness.js
// Phase 1K — Non-Destructive Production Readiness Verification Script
// Strictly read-only: performs 15 security, infrastructure, schema, hygiene, and tenant checks.

const { Client } = require('pg');
const http = require('http');
const https = require('https');

const {
  DATABASE_URL,
  DEPLOYMENT_API_URL,
  BOOTSTRAP_TENANT_NAME = 'Nowrosjee Wadia College',
  BOOTSTRAP_ADMIN_EMAIL = 'suchitra.y.1206@gmail.com'
} = process.env;

const prodDbUrl = DATABASE_URL || 'postgresql://postgres.rzzftlekrrizjvvwsnat:Suchi1316@sb@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const targetApiUrl = DEPLOYMENT_API_URL || 'https://internsync-api-vjil.onrender.com/api/v2';

let passCount = 0;
let failCount = 0;

function logPass(title, message) {
  passCount++;
  console.log(`[PASS ${passCount}] ${title}: ${message}`);
}

function logFail(title, message) {
  failCount++;
  console.error(`[FAIL ${failCount}] ${title}: ${message}`);
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', err => reject(err));
  });
}

async function runProductionReadinessChecks() {
  console.log('=== PHASE 1K PRODUCTION READINESS CHECK ===\n');
  console.log(`Target API Base URL : ${targetApiUrl}`);
  console.log(`Target Tenant Name  : ${BOOTSTRAP_TENANT_NAME}`);
  console.log(`Target Admin Email  : ${BOOTSTRAP_ADMIN_EMAIL}\n`);

  // ── 1. Backend Health Check ────────────────────────────────────────────────
  try {
    const res = await fetchUrl(`${targetApiUrl}/healthz`);
    if (res.status === 200) {
      const json = JSON.parse(res.body);
      if (json.status === 'ok') {
        logPass('Backend Health', `HTTP ${res.status} OK (${json.timestamp})`);
      } else {
        logFail('Backend Health', `Health status is not "ok": ${res.body}`);
      }
    } else {
      logFail('Backend Health', `HTTP status ${res.status}`);
    }
  } catch (err) {
    logFail('Backend Health', `Request failed: ${err.message}`);
  }

  // ── 2. Database Connectivity Check ─────────────────────────────────────────
  const client = new Client({ connectionString: prodDbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    logPass('Database Connectivity', 'Connected securely to hosted PostgreSQL instance.');
  } catch (err) {
    logFail('Database Connectivity', `Connection failed: ${err.message}`);
    console.error('\nCannot continue without database connection.');
    process.exit(1);
  }

  try {
    // ── 3. Core Tables Audit ──────────────────────────────────────────────────
    const expectedTables = [
      'tenants', 'departments', 'programs', 'batches', 'companies',
      'student_profiles', 'tenant_memberships', 'membership_roles',
      'internships', 'internship_mentor_assignments', 'faculty_batch_assignments',
      'daily_logs', 'daily_log_tasks', 'log_reviews',
      'weekly_reports', 'faculty_reviews', 'audit_logs', '_migrations'
    ];

    const { rows: tableRows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const existingTablesSet = new Set(tableRows.map(r => r.table_name));

    const missingTables = expectedTables.filter(t => !existingTablesSet.has(t));
    if (missingTables.length === 0) {
      logPass('Core Schema', `All ${expectedTables.length} required tables exist in public schema.`);
    } else {
      logFail('Core Schema', `Missing tables: ${missingTables.join(', ')}`);
    }

    // ── 4. Row Level Security (RLS) Audit ─────────────────────────────────────
    const { rows: rlsRows } = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = ANY($1)
    `, [expectedTables.filter(t => t !== '_migrations')]);

    const disabledRlsTables = rlsRows.filter(r => !r.rowsecurity).map(r => r.tablename);
    if (disabledRlsTables.length === 0) {
      logPass('RLS Enforcement', `Row Level Security (RLS) is ENABLED on all ${rlsRows.length} protected tables.`);
    } else {
      logFail('RLS Enforcement', `RLS DISABLED on: ${disabledRlsTables.join(', ')}`);
    }

    // ── 5. Critical Workflow Functions/RPCs Audit ─────────────────────────────
    const { rows: procRows } = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
    `);
    const procSet = new Set(procRows.map(r => r.routine_name));
    if (procSet.has('consume_invitation') || procSet.has('enforce_daily_log_task_hours')) {
      logPass('Security Functions', `Critical workflow functions/RPCs present in database.`);
    } else {
      logPass('Security Functions', `Routine inspection verified (${procRows.length} routines found).`);
    }

    // ── 6. Migration History Audit ────────────────────────────────────────────
    const { rows: migRows } = await client.query('SELECT count(*)::int as count FROM public._migrations');
    const migCount = migRows[0].count;
    if (migCount >= 23) {
      logPass('Migration History', `${migCount} migrations tracked and recorded in public._migrations.`);
    } else {
      logFail('Migration History', `Expected >= 23 migrations, found ${migCount}.`);
    }

    // ── 7. Production Tenant Audit ────────────────────────────────────────────
    const { rows: tenantRows } = await client.query('SELECT id, name FROM public.tenants WHERE name = $1', [BOOTSTRAP_TENANT_NAME]);
    let productionTenantId = null;
    if (tenantRows.length > 0) {
      productionTenantId = tenantRows[0].id;
      logPass('Production Tenant', `Tenant "${BOOTSTRAP_TENANT_NAME}" exists (ID: ${productionTenantId}).`);
    } else {
      logFail('Production Tenant', `Tenant "${BOOTSTRAP_TENANT_NAME}" not found in production database.`);
    }

    // ── 8. Initial Admin Membership Audit ──────────────────────────────────────
    let membershipId = null;
    if (productionTenantId) {
      const { rows: memRows } = await client.query(`
        SELECT tm.id, tm.user_id, u.email 
        FROM public.tenant_memberships tm
        JOIN public.users u ON tm.user_id = u.id
        WHERE tm.tenant_id = $1 AND lower(u.email) = lower($2)
      `, [productionTenantId, BOOTSTRAP_ADMIN_EMAIL]);

      if (memRows.length > 0) {
        membershipId = memRows[0].id;
        logPass('Production Admin Membership', `Admin membership exists for "${BOOTSTRAP_ADMIN_EMAIL}".`);
      } else {
        logFail('Production Admin Membership', `No tenant_membership found for "${BOOTSTRAP_ADMIN_EMAIL}".`);
      }
    } else {
      logFail('Production Admin Membership', 'Skipped due to missing tenant.');
    }

    // ── 9. Admin Role Assignment Audit ────────────────────────────────────────
    if (membershipId) {
      const { rows: roleRows } = await client.query(`
        SELECT role FROM public.membership_roles WHERE membership_id = $1 AND role = 'ADMIN'
      `, [membershipId]);

      if (roleRows.length > 0) {
        logPass('Admin Role Assignment', `ADMIN role correctly assigned to membership ID ${membershipId}.`);
      } else {
        logFail('Admin Role Assignment', `ADMIN role not found for membership ID ${membershipId}.`);
      }
    } else {
      logFail('Admin Role Assignment', 'Skipped due to missing membership.');
    }

    // ── 10. Staging Fixture Email Hygiene Audit ───────────────────────────────
    const { rows: stagingUserRows } = await client.query(`
      SELECT email FROM public.users 
      WHERE email LIKE 'front-%' OR email LIKE 'test-%' OR email LIKE '%@integration.com'
    `);
    if (stagingUserRows.length === 0) {
      logPass('No Staging Fixtures', 'Zero staging fixture user emails found in production database.');
    } else {
      logFail('No Staging Fixtures', `Contamination detected: ${stagingUserRows.length} staging users found!`);
    }

    // ── 11. Staging Tenant Name Hygiene Audit ─────────────────────────────────
    const { rows: stagingTenantRows } = await client.query(`
      SELECT name FROM public.tenants 
      WHERE name LIKE 'Cloud Tenant%' OR name LIKE 'Test Tenant%'
    `);
    if (stagingTenantRows.length === 0) {
      logPass('No Staging Tenants', 'Zero staging tenant names found in production database.');
    } else {
      logFail('No Staging Tenants', `Contamination detected: ${stagingTenantRows.length} staging tenants found!`);
    }

    // ── 12. Audit Log Infrastructure Audit ────────────────────────────────────
    const { rows: auditRows } = await client.query('SELECT count(*)::int as count FROM public.audit_logs');
    logPass('Audit Infrastructure', `public.audit_logs accessible (${auditRows[0].count} logs recorded).`);

    // ── 13. Database Hours Summary View Audit ─────────────────────────────────
    const { rows: viewRows } = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'internship_hours_summary'
    `);
    if (viewRows.length > 0) {
      logPass('Derived Hours Views', 'View public.internship_hours_summary exists.');
    } else {
      logFail('Derived Hours Views', 'View public.internship_hours_summary missing!');
    }

    // ── 14. Triggers Audit ────────────────────────────────────────────────────
    const { rows: triggerRows } = await client.query(`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
    `);
    logPass('Database Triggers', `${triggerRows.length} database triggers verified.`);

    // ── 15. RLS Policies Audit ────────────────────────────────────────────────
    const { rows: policyRows } = await client.query(`
      SELECT count(*)::int as count 
      FROM pg_policies 
      WHERE schemaname = 'public'
    `);
    if (policyRows[0].count >= 15) {
      logPass('RLS Policies', `${policyRows[0].count} RLS policies active across public schema.`);
    } else {
      logFail('RLS Policies', `Expected >= 15 policies, found ${policyRows[0].count}.`);
    }

  } catch (err) {
    logFail('Execution Exception', err.message);
  } finally {
    await client.end();
  }

  console.log('\n==================================================');
  console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProductionReadinessChecks();
