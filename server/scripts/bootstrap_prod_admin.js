// Script: server/scripts/bootstrap_prod_admin.js
// Production Tenant Admin Bootstrap Script
// Features:
// 1. Native Supabase Auth Password Setup/Invite Flow (No terminal passwords).
// 2. Verified Production Redirect URL (https://client-lemon-one-64.vercel.app).
// 3. Cross-system Rollback & Cleanup Safeguard (deletes newly created Auth user if DB transaction fails).
// 4. Idempotent Retryability (safe to rerun if user or tenant already exists).

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL
} = process.env;

const PROD_FRONTEND_URL = process.env.PROD_FRONTEND_URL || 'https://client-lemon-one-64.vercel.app';

async function bootstrapProductionAdmin() {
  const targetEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'suchitra.y.1206@gmail.com').trim().toLowerCase();
  const tenantName = (process.env.BOOTSTRAP_TENANT_NAME || 'Nowrosjee Wadia College').trim();

  console.log('=== PRODUCTION TENANT ADMIN BOOTSTRAP PROCESS ===');
  console.log(`Target Institution : ${tenantName}`);
  console.log(`Target Admin Email : ${targetEmail}`);
  console.log(`Redirect Base URL  : ${PROD_FRONTEND_URL}\n`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
    console.error('[ERROR] Required production environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL) are missing.');
    process.exit(1);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const pgClient = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  let userId = null;
  let isNewlyCreatedAuthUser = false;

  await pgClient.connect();

  try {
    // ── 1. CHECK / CREATE SUPABASE AUTH USER ─────────────────────────────────
    const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(`Supabase Auth listUsers failed: ${listErr.message}`);

    let existingUser = users ? users.find(u => u.email.toLowerCase() === targetEmail) : null;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[BOOTSTRAP] Auth user already exists: ${userId}`);
    } else {
      // Invite user via native Supabase Auth invite flow with production redirect
      console.log(`[BOOTSTRAP] Inviting user via Supabase Auth Admin API...`);
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(targetEmail, {
        redirectTo: PROD_FRONTEND_URL,
        data: {
          first_name: tenantName,
          last_name: 'Administrator'
        }
      });

      if (inviteErr) {
        // Fallback: If SMTP is unconfigured on Supabase project, use generateLink (type: invite)
        console.warn(`[BOOTSTRAP NOTICE] inviteUserByEmail direct mailer: ${inviteErr.message}`);
        console.log(`[BOOTSTRAP] Generating secure invite setup link via generateLink...`);
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: targetEmail,
          options: {
            redirectTo: PROD_FRONTEND_URL,
            data: {
              first_name: tenantName,
              last_name: 'Administrator'
            }
          }
        });

        if (linkErr) throw new Error(`Supabase Auth generateLink failed: ${linkErr.message}`);
        userId = linkData.user.id;
        isNewlyCreatedAuthUser = true;
        console.log(`[BOOTSTRAP] Created Auth user ID: ${userId} via generateLink`);
        if (linkData.properties?.action_link) {
          console.log(`[BOOTSTRAP] Generated Secure Setup Link: ${linkData.properties.action_link}`);
        }
      } else {
        userId = inviteData.user.id;
        isNewlyCreatedAuthUser = true;
        console.log(`[BOOTSTRAP] Invited Auth user ID: ${userId} (native email sent to ${targetEmail})`);
      }
    }

    // ── 2. POSTGRESQL TRANSACTION (TENANT + MEMBERSHIP + ROLE + AUDIT) ────────
    await pgClient.query('BEGIN');

    // Ensure Tenant exists
    let tenantId;
    const { rows: existingTenants } = await pgClient.query(
      'SELECT id FROM public.tenants WHERE name = $1 LIMIT 1',
      [tenantName]
    );

    if (existingTenants.length > 0) {
      tenantId = existingTenants[0].id;
      console.log(`[BOOTSTRAP] Found existing tenant ID: ${tenantId}`);
    } else {
      const { rows: newTenants } = await pgClient.query(
        'INSERT INTO public.tenants (name) VALUES ($1) RETURNING id',
        [tenantName]
      );
      tenantId = newTenants[0].id;
      console.log(`[BOOTSTRAP] Created production tenant "${tenantName}" with ID: ${tenantId}`);
    }

    // Ensure public.users record exists
    await pgClient.query(
      `INSERT INTO public.users (id, first_name, last_name, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email`,
      [userId, tenantName, 'Administrator', targetEmail]
    );

    // Ensure tenant_memberships record
    let membershipId;
    const { rows: existingMemberships } = await pgClient.query(
      'SELECT id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
      [tenantId, userId]
    );

    if (existingMemberships.length > 0) {
      membershipId = existingMemberships[0].id;
      console.log(`[BOOTSTRAP] Found existing tenant membership ID: ${membershipId}`);
    } else {
      const { rows: newMemberships } = await pgClient.query(
        'INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id',
        [tenantId, userId]
      );
      membershipId = newMemberships[0].id;
      console.log(`[BOOTSTRAP] Created tenant_membership ID: ${membershipId}`);
    }

    // Ensure ADMIN membership_role
    const { rows: existingRoles } = await pgClient.query(
      'SELECT id FROM public.membership_roles WHERE membership_id = $1 AND role = $2 LIMIT 1',
      [membershipId, 'ADMIN']
    );

    if (existingRoles.length === 0) {
      await pgClient.query(
        'INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)',
        [membershipId, 'ADMIN']
      );
      console.log(`[BOOTSTRAP] Assigned ADMIN membership role to membership ID: ${membershipId}`);
    } else {
      console.log(`[BOOTSTRAP] ADMIN membership role already assigned.`);
    }

    // Atomic Audit Logging
    await pgClient.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, after_state)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        userId,
        'ADMIN_PROVISION_INITIAL_TENANT_ADMIN',
        'tenant_memberships',
        membershipId,
        JSON.stringify({ tenant_name: tenantName, email: targetEmail, role: 'ADMIN' })
      ]
    );

    await pgClient.query('COMMIT');
    console.log('\n[SUCCESS] Production Tenant Admin Provisioning completed cleanly!');
    console.log(`Admin Email : ${targetEmail}`);
    console.log(`Tenant Name : ${tenantName}`);
    console.log(`Redirect URL: ${PROD_FRONTEND_URL}`);

  } catch (err) {
    console.error('\n[BOOTSTRAP ERROR]:', err.message);
    await pgClient.query('ROLLBACK').catch(() => {});

    // Cross-system cleanup: If Auth user was created in this run but DB setup failed, remove Auth user
    if (isNewlyCreatedAuthUser && userId) {
      console.log(`[CLEANUP] Rolling back created Auth user ${userId} to preserve atomic consistency...`);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(delErr => {
        console.error(`[CLEANUP ERROR] Failed to delete Auth user ${userId}:`, delErr.message);
      });
      console.log(`[CLEANUP] Auth user ${userId} deleted. Operation is clean and retryable.`);
    }

    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

bootstrapProductionAdmin();
