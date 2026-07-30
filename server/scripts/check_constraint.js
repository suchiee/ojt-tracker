require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(`SELECT c.conname, pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid WHERE t.relname='membership_roles' AND c.contype='c'`)
  .then(r=>r.rows.forEach(row=>console.log(row.conname, ':', row.def)))
  .catch(e=>console.error(e.message))
  .finally(()=>p.end());

