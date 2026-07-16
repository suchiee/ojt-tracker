// pgPool.js — Shared pg.Pool for direct local-PostgreSQL access
// Used when SUPABASE_URL is not configured (local dev / RLS testing via session variables).

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:***@localhost:5432/postgre'
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool client error', err);
});

module.exports = pool;
