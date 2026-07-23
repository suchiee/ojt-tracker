const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function checkDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const { rows: tenants } = await client.query('SELECT id, name, domain FROM public.tenants');
    console.log('--- TENANTS ---');
    console.log(tenants);

    const { rows: users } = await client.query('SELECT id, email, first_name, last_name FROM public.users');
    console.log('--- PUBLIC USERS ---');
    console.log(users);

    const { rows: memberships } = await client.query(`
      SELECT tm.id, tm.tenant_id, tm.user_id, u.email, mr.role
      FROM public.tenant_memberships tm
      JOIN public.users u ON tm.user_id = u.id
      LEFT JOIN public.membership_roles mr ON tm.id = mr.membership_id
    `);
    console.log('--- MEMBERSHIPS & ROLES ---');
    console.log(memberships);

  } catch (err) {
    console.error('Error checking DB:', err.message);
  } finally {
    await client.end();
  }
}

checkDb();
