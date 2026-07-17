// Script to check if there are duplicate daily logs per internship per date
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDuplicates() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT internship_id, date, COUNT(*) 
      FROM public.daily_logs 
      GROUP BY internship_id, date 
      HAVING COUNT(*) > 1
    `);
    console.log('Duplicate daily logs:', rows);
    
    // Check internships status constraint
    const statusConstraint = await client.query(`
      SELECT pg_get_constraintdef(c.oid) as def 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'internships' AND c.conname = 'internships_status_check'
    `);
    console.log('Internships status check constraint:', statusConstraint.rows[0]?.def || 'None found');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
checkDuplicates();
