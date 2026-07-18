// Script to check existing log_reviews records
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkReviews() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT COUNT(*) FROM public.log_reviews`);
    console.log('Total log_reviews rows:', rows[0].count);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
checkReviews();
