// Preflight check for REJECTED records in weekly_reports and faculty_reviews
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function preflightRejected() {
  const client = await pool.connect();
  try {
    const { rows: wr } = await client.query(`SELECT COUNT(*) FROM public.weekly_reports WHERE status = 'REJECTED'`);
    const { rows: fr } = await client.query(`SELECT COUNT(*) FROM public.faculty_reviews WHERE status = 'REJECTED'`);
    console.log(`weekly_reports with REJECTED status count: ${wr[0].count}`);
    console.log(`faculty_reviews with REJECTED status count: ${fr[0].count}`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
preflightRejected();
