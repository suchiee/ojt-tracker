require('dotenv').config();
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});

async function fix() {
  await p.query(`DROP POLICY IF EXISTS internship_mentor_assignments_select_policy ON public.internship_mentor_assignments`);
  await p.query(`CREATE POLICY internship_mentor_assignments_select_policy ON public.internship_mentor_assignments FOR SELECT USING (mentor_user_id = auth.uid())`);
  console.log('IMA policy fixed (mentor_user_id = auth.uid() only — no recursion)');
  await p.end();
}
fix().catch(e=>{ console.error('ERROR:',e.message); process.exit(1); });
