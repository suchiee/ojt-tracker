require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function applyMigration() {
  const sqlFile = path.join(__dirname, '../../supabase/migrations/20260718000_append_only_log_reviews.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration 20260718000_append_only_log_reviews.sql applied successfully!');
  } catch (err) {
    console.error('Error applying migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
applyMigration();
