require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(`SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE tablename IN ('faculty_batch_assignments','internship_mentor_assignments') ORDER BY tablename, policyname`)
  .then(r=>{
    if (r.rows.length === 0) { console.log('NO POLICIES FOUND on these tables'); }
    r.rows.forEach(row=>console.log(JSON.stringify(row)));
  })
  .catch(e=>console.error('ERROR:',e.message))
  .finally(()=>p.end());
