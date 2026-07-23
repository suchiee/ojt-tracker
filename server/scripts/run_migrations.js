const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function sanitizeSql(sql) {
  let cleaned = sql;

  // 1. Replace "authenticated, internship_rls_test_user" with "authenticated"
  cleaned = cleaned.replace(/authenticated,\s*internship_rls_test_user/gi, 'authenticated');

  // 2. Remove standalone GRANT/REVOKE statements targeting only internship_rls_test_user
  cleaned = cleaned.replace(/GRANT\s+[^;]+TO\s+internship_rls_test_user\s*;/gi, '-- [SANUTIZED LOCAL GRANT] Removed local-only test grant');
  cleaned = cleaned.replace(/REVOKE\s+[^;]+FROM\s+internship_rls_test_user\s*;/gi, '-- [SANUTIZED LOCAL REVOKE] Removed local-only test revoke');

  // 3. Remove any role alterations targeting internship_rls_test_user
  cleaned = cleaned.replace(/ALTER\s+ROLE\s+internship_rls_test_user[^;]+;/gi, '-- [SANUTIZED LOCAL ALTER] Removed local-only role alter');
  cleaned = cleaned.replace(/CREATE\s+ROLE\s+internship_rls_test_user[^;]+;/gi, '-- [SANUTIZED LOCAL CREATE] Removed local-only role create');
  cleaned = cleaned.replace(/DROP\s+ROLE\s+internship_rls_test_user[^;]+;/gi, '-- [SANUTIZED LOCAL DROP] Removed local-only role drop');

  return cleaned;
}

async function run() {
  const migrationsDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  
  // Read database URL from server/.env
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('[MIGRATION] Error: DATABASE_URL not set in server/.env');
    process.exit(1);
  }

  // Get list of migration files in order
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[MIGRATION] Found ${files.length} migration files.`);

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[MIGRATION] Successfully connected to hosted PostgreSQL database.');
  } catch (err) {
    console.error('[MIGRATION] Database connection failed:', err.message);
    process.exit(1);
  }

  // Track applied migrations
  try {
    // Create migrations tracker table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.error('[MIGRATION] Failed to initialize migration tracker table:', err.message);
    await client.end();
    process.exit(1);
  }

  const localOnlyFiles = [
    '20260716000_supabase_auth_mock.sql',
    '20260717000_rls_test_role.sql',
    '20260717005_test_role_write_grants.sql'
  ];

  for (const file of files) {
    if (localOnlyFiles.includes(file)) {
      console.log(`[MIGRATION] Skipping local-only/mock file: ${file}`);
      
      // We will record it as skipped in _migrations to prevent future attempts if we want,
      // but actually let's just log it and mark it as skipped.
      try {
        await client.query(
          'INSERT INTO public._migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [file]
        );
      } catch (err) {
        // Ignore errors on recording skip
      }
      continue;
    }

    // Check if already applied
    try {
      const res = await client.query('SELECT 1 FROM public._migrations WHERE filename = $1', [file]);
      if (res.rowCount > 0) {
        console.log(`[MIGRATION] Already applied: ${file}`);
        continue;
      }
    } catch (err) {
      console.error(`[MIGRATION] Error checking migration status for ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }

    console.log(`[MIGRATION] Applying: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const sanitizedSql = sanitizeSql(sql);

    // Run within a transaction
    try {
      await client.query('BEGIN');
      await client.query(sanitizedSql);
      await client.query('INSERT INTO public._migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[MIGRATION] Successfully applied and committed: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('\n════════════════════════════════════════════════════════════════');
      console.error(`MIGRATION FAILED: ${file}`);
      console.error(`PostgreSQL Error: ${err.message}`);
      console.error(`Error Code: ${err.code}`);
      console.error('════════════════════════════════════════════════════════════════\n');
      await client.end();
      process.exit(1); // STOP the sequence
    }
  }

  console.log('[MIGRATION] All migrations successfully deployed to hosted Supabase!');
  await client.end();
}

run();
