// Script: server/scripts/audit_prod_records.js
// Read-only inventory of production entity counts for tenant "Nowrosjee Wadia College"

const { Client } = require('pg');

const prodDbUrl = process.env.DATABASE_URL || 'postgresql://postgres.rzzftlekrrizjvvwsnat:Suchi1316@sb@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const TENANT_ID = '19013867-1aca-41d8-a0db-da33c8b6ba26';

async function auditProductionRecords() {
  const client = new Client({ connectionString: prodDbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows: dept } = await client.query('SELECT count(*)::int as c FROM public.departments');
    const { rows: prog } = await client.query('SELECT count(*)::int as c FROM public.programs');
    const { rows: batch } = await client.query('SELECT count(*)::int as c FROM public.batches');
    const { rows: comp } = await client.query('SELECT count(*)::int as c FROM public.companies');
    const { rows: stud } = await client.query('SELECT count(*)::int as c FROM public.student_profiles');
    const { rows: fac } = await client.query("SELECT count(*)::int as c FROM public.membership_roles WHERE role = 'FACULTY_MENTOR'");
    const { rows: men } = await client.query("SELECT count(*)::int as c FROM public.internship_mentor_assignments WHERE mentor_type = 'COMPANY'");
    const { rows: intern } = await client.query('SELECT count(*)::int as c FROM public.internships');
    const { rows: logs } = await client.query('SELECT count(*)::int as c FROM public.daily_logs');
    const { rows: reps } = await client.query('SELECT count(*)::int as c FROM public.weekly_reports');

    console.log('=== PRODUCTION TENANT DATA INVENTORY ===');
    console.log(`Tenant: Nowrosjee Wadia College (${TENANT_ID})\n`);
    console.log(`Departments     : ${dept[0].c}`);
    console.log(`Programs        : ${prog[0].c}`);
    console.log(`Batches         : ${batch[0].c}`);
    console.log(`Companies       : ${comp[0].c}`);
    console.log(`Students        : ${stud[0].c}`);
    console.log(`Faculty Advisors: ${fac[0].c}`);
    console.log(`Company Mentors : ${men[0].c}`);
    console.log(`Internships     : ${intern[0].c}`);
    console.log(`Daily Logs      : ${logs[0].c}`);
    console.log(`Weekly Reports  : ${reps[0].c}`);
    console.log('========================================');
  } finally {
    await client.end();
  }
}

auditProductionRecords();
