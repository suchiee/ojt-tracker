// Script: server/scripts/bootstrap_local_admin.js
// Idempotent seeding script for local demo admin user

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('[BOOTSTRAP LOCAL] Error: DATABASE_URL is not configured in .env');
  process.exit(1);
}

const ADMIN_EMAIL = 'suchitra.y.1206@gmail.com';
const ADMIN_UUID = '9d8858a5-2458-425f-b02d-0634392f3b26';
const INSTITUTION_NAME = 'Nowrosjee Wadia College';

async function bootstrapLocalAdmin() {
  console.log('=== LOCAL TENANT ADMIN BOOTSTRAP PROCESS ===');
  console.log(`Target Institution : ${INSTITUTION_NAME}`);
  console.log(`Target Admin Email : ${ADMIN_EMAIL}`);
  console.log(`Target Admin UUID  : ${ADMIN_UUID}\n`);

  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });

  await pgClient.connect();

  try {
    await pgClient.query('BEGIN');

    // 1. Get or Create Tenant
    let tenantId;
    const { rows: tenants } = await pgClient.query(
      'SELECT id FROM public.tenants WHERE name = $1 LIMIT 1',
      [INSTITUTION_NAME]
    );

    if (tenants.length > 0) {
      tenantId = tenants[0].id;
      console.log(`[BOOTSTRAP] Found existing tenant ID: ${tenantId}`);
    } else {
      const { rows: newTenants } = await pgClient.query(
        "INSERT INTO public.tenants (name, domain) VALUES ($1, 'wadia.edu') RETURNING id",
        [INSTITUTION_NAME]
      );
      tenantId = newTenants[0].id;
      console.log(`[BOOTSTRAP] Created local tenant with ID: ${tenantId}`);
    }

    // 2. Get or Create Auth User
    const { rows: authUsers } = await pgClient.query(
      'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
      [ADMIN_EMAIL]
    );

    if (authUsers.length > 0) {
      console.log(`[BOOTSTRAP] Auth user already exists with ID: ${authUsers[0].id}`);
    } else {
      await pgClient.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data)
         VALUES ($1, $2, $3)`,
        [
          ADMIN_UUID,
          ADMIN_EMAIL,
          JSON.stringify({ first_name: INSTITUTION_NAME, last_name: 'Administrator' })
        ]
      );
      console.log(`[BOOTSTRAP] Created mock auth.users record: ${ADMIN_UUID}`);
    }

    // 3. Get or Create Public User Profile
    const { rows: publicUsers } = await pgClient.query(
      'SELECT id FROM public.users WHERE id = $1 LIMIT 1',
      [ADMIN_UUID]
    );

    if (publicUsers.length > 0) {
      console.log(`[BOOTSTRAP] Public user profile already exists.`);
    } else {
      await pgClient.query(
        `INSERT INTO public.users (id, first_name, last_name, email)
         VALUES ($1, $2, $3, $4)`,
        [ADMIN_UUID, INSTITUTION_NAME, 'Administrator', ADMIN_EMAIL]
      );
      console.log(`[BOOTSTRAP] Created public.users record linked to auth user`);
    }

    // 4. Get or Create Tenant Membership
    let membershipId;
    const { rows: memberships } = await pgClient.query(
      'SELECT id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
      [tenantId, ADMIN_UUID]
    );

    if (memberships.length > 0) {
      membershipId = memberships[0].id;
      console.log(`[BOOTSTRAP] Found existing membership ID: ${membershipId}`);
    } else {
      const { rows: newMemberships } = await pgClient.query(
        'INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id',
        [tenantId, ADMIN_UUID]
      );
      membershipId = newMemberships[0].id;
      console.log(`[BOOTSTRAP] Created tenant_membership ID: ${membershipId}`);
    }

    // 5. Get or Create ADMIN membership role
    const { rows: roles } = await pgClient.query(
      'SELECT id FROM public.membership_roles WHERE membership_id = $1 AND role = $2 LIMIT 1',
      [membershipId, 'ADMIN']
    );

    if (roles.length > 0) {
      console.log(`[BOOTSTRAP] ADMIN role already assigned to membership.`);
    } else {
      await pgClient.query(
        'INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)',
        [membershipId, 'ADMIN']
      );
      console.log(`[BOOTSTRAP] Assigned ADMIN role to membership ID: ${membershipId}`);
    }

    await pgClient.query('COMMIT');
    console.log('\n[SUCCESS] Local Tenant Admin seeding completed cleanly!');
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    console.error('\n[BOOTSTRAP ERROR]:', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

bootstrapLocalAdmin();
