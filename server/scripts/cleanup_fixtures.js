// Cleanup leftover test fixtures
require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});

async function cleanup() {
  const client = await p.connect();
  try {
    // Cleanup by domain (idempotent)
    const {rows: tenants} = await client.query(
      `SELECT id FROM tenants WHERE domain IN ('test-a.example.com','test-b.example.com')`
    );
    for (const t of tenants) {
      await client.query(`DELETE FROM internship_mentor_assignments WHERE internship_id IN (SELECT id FROM internships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM faculty_batch_assignments WHERE faculty_user_id IN (SELECT user_id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM student_profiles WHERE tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM internships WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM companies WHERE tenant_id=$1`, [t.id]);
      const {rows: batches} = await client.query(`SELECT b.id FROM batches b JOIN programs pr ON b.program_id=pr.id JOIN departments d ON pr.department_id=d.id WHERE d.tenant_id=$1`, [t.id]);
      for (const b of batches) await client.query(`DELETE FROM batches WHERE id=$1`, [b.id]);
      const {rows: progs} = await client.query(`SELECT pr.id FROM programs pr JOIN departments d ON pr.department_id=d.id WHERE d.tenant_id=$1`, [t.id]);
      for (const pr of progs) await client.query(`DELETE FROM programs WHERE id=$1`, [pr.id]);
      await client.query(`DELETE FROM departments WHERE tenant_id=$1`, [t.id]);
      const {rows: members} = await client.query(`SELECT user_id FROM tenant_memberships WHERE tenant_id=$1`, [t.id]);
      await client.query(`DELETE FROM membership_roles WHERE membership_id IN (SELECT id FROM tenant_memberships WHERE tenant_id=$1)`, [t.id]);
      await client.query(`DELETE FROM tenant_memberships WHERE tenant_id=$1`, [t.id]);
      for (const m of members) {
        if ((await client.query(`SELECT email FROM users WHERE id=$1`, [m.user_id])).rows[0]?.email?.includes('test-')) {
          await client.query(`DELETE FROM public.users WHERE id=$1`, [m.user_id]);
          await client.query(`DELETE FROM auth.users WHERE id=$1`, [m.user_id]);
        }
      }
      await client.query(`DELETE FROM tenants WHERE id=$1`, [t.id]);
    }
    console.log('Cleanup complete. Removed', tenants.length, 'test tenants.');
  } finally {
    client.release();
    await p.end();
  }
}
cleanup().catch(e => { console.error('Cleanup error:', e.message); process.exit(1); });
