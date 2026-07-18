// Script to check constraints on log_reviews
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkConstraints() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint 
      WHERE conrelid = 'public.log_reviews'::regclass
    `);
    console.log('log_reviews constraints:');
    rows.forEach(r => console.log(`- ${r.conname}: ${r.def}`));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
checkConstraints();
