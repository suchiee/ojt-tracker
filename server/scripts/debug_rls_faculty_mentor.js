// Debug script for RLS-008 and RLS-010 failures
// Diagnoses why faculty batch-linked access and mentor access fail under internship_rls_test_user
require('dotenv').config();
const { Pool } = require('pg');

const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
const rlsPool = new Pool({ connectionString: process.env.RLS_TEST_DB_URL });

async function withRlsSession(userId, queryFn) {
  const client = await rlsPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const result = await queryFn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  // Get test fixture IDs
  const { rows: fixtures } = await adminPool.query(`
    SELECT
      (SELECT id FROM auth.users WHERE email='test-facultyA@test-a.com') as faculty_id,
      (SELECT id FROM auth.users WHERE email='test-mentorA@test-a.com') as mentor_id,
      (SELECT id FROM auth.users WHERE email='test-studentA@test-a.com') as student_id,
      (SELECT id FROM internships WHERE student_id=(SELECT id FROM auth.users WHERE email='test-studentA@test-a.com')) as int_student_a
  `);
  const { faculty_id, mentor_id, student_id, int_student_a } = fixtures[0];
  console.log('Faculty ID:', faculty_id);
  console.log('Mentor ID:', mentor_id);
  console.log('Student A ID:', student_id);
  console.log('Internship A ID:', int_student_a);

  if (!faculty_id) { console.log('No test fixtures found — run tests first'); process.exit(1); }

  // 1. Check faculty_batch_assignments
  const adminCheck = await adminPool.query(
    `SELECT fba.* FROM faculty_batch_assignments fba WHERE fba.faculty_user_id=$1`, [faculty_id]
  );
  console.log('\nfaculty_batch_assignments (as admin):', adminCheck.rows);

  // 2. Check student_profiles
  const spCheck = await adminPool.query(
    `SELECT sp.* FROM student_profiles sp JOIN tenant_memberships tm ON sp.tenant_membership_id=tm.id WHERE tm.user_id=$1`, [student_id]
  );
  console.log('student_profiles for studentA (as admin):', spCheck.rows);

  // 3. Try the exact faculty RLS subquery directly (as admin, no RLS)
  const subqueryCheck = await adminPool.query(`
    SELECT tm.user_id
    FROM tenant_memberships tm
    JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
    JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
    WHERE fba.faculty_user_id=$1
  `, [faculty_id]);
  console.log('\nFaculty subquery result (admin, no RLS) - should list student IDs:', subqueryCheck.rows);

  // 4. Test what faculty sees with RLS
  console.log('\nTesting faculty RLS session...');
  const facultySees = await withRlsSession(faculty_id, async (client) => {
    // First check if faculty can see their batch assignments
    const fbaCheck = await client.query('SELECT * FROM faculty_batch_assignments WHERE faculty_user_id=$1', [faculty_id]);
    console.log('faculty_batch_assignments visible to faculty (RLS):', fbaCheck.rows);

    // Check student_profiles
    const spRls = await client.query('SELECT sp.batch_id FROM student_profiles sp LIMIT 5');
    console.log('student_profiles visible to faculty (RLS):', spRls.rows);

    // Check internships
    const internships = await adminPool.query('SELECT id FROM internships');
    console.log('internships (no where, admin):', internships.rows.map(r=>r.id));
    const rlsInternships = await client.query('SELECT id FROM internships');
    return rlsInternships.rows;
  });
  console.log('Faculty sees internships:', facultySees.map(r=>r.id));

  // 5. Test mentor assignment
  const mentorCheck = await adminPool.query(
    `SELECT * FROM internship_mentor_assignments WHERE mentor_user_id=$1`, [mentor_id]
  );
  console.log('\ninternship_mentor_assignments for mentor (admin):', mentorCheck.rows);

  const mentorSees = await withRlsSession(mentor_id, async (client) => {
    const imaCheck = await client.query('SELECT * FROM internship_mentor_assignments WHERE mentor_user_id=$1', [mentor_id]);
    console.log('IMA visible to mentor (RLS):', imaCheck.rows);
    const rows = await client.query('SELECT id FROM internships');
    return rows.rows;
  });
  console.log('Mentor sees internships:', mentorSees.map(r=>r.id));

  await adminPool.end();
  await rlsPool.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
