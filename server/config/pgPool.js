// pgPool.js — Shared pg.Pool for direct PostgreSQL access
// Used in LOCAL_JWT_DEV_MODE=true (local dev / RLS testing) and when SUPABASE_URL is not configured.

const { Pool } = require('pg');

const isLocal = (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool client error', err);
});

module.exports = pool;
