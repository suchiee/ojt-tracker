require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function findApprovedLog() {
  const { rows } = await pool.query(`
    SELECT dl.id, dl.internship_id, i.student_id 
    FROM daily_logs dl 
    JOIN internships i ON dl.internship_id = i.id 
    WHERE dl.status = 'APPROVED' 
    LIMIT 1
  `);
  console.log('APPROVED log:', rows[0] || 'None found');
  await pool.end();
}
findApprovedLog();
