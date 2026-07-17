require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});

async function run() {
  const r = await p.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin
     FROM pg_roles WHERE rolname='internship_rls_test_user'`
  );
  console.log('Role attributes:', JSON.stringify(r.rows[0], null, 2));
  await p.end();
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
