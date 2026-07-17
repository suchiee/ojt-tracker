require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function applyMigration() {
  const client = await pool.connect();
  try {
    const file4 = path.join(__dirname, '../../supabase/migrations/20260717004_daily_logs_integrity.sql');
    const sql4 = fs.readFileSync(file4, 'utf8');
    await client.query(sql4);
    console.log('Migration 20260717004_daily_logs_integrity.sql applied successfully!');

    const file5 = path.join(__dirname, '../../supabase/migrations/20260717005_test_role_write_grants.sql');
    const sql5 = fs.readFileSync(file5, 'utf8');
    await client.query(sql5);
    console.log('Migration 20260717005_test_role_write_grants.sql applied successfully!');
  } catch (err) {
    console.error('Error applying migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
applyMigration();
