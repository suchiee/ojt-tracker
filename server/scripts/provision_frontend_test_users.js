const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DATABASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  REACT_APP_SUPABASE_ANON_KEY
} = process.env;

const TEST_PASSWORD = 'StagingPassword123!';
const TENANT_A_ID = '80092172-cce7-4e68-a4ad-9f1f178c0857';

async function run() {
  console.log('[PROVISION] Starting frontend test users setup...');
  
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    // 1. Verify Tenant A exists
    const { rows: [tenant] } = await pgClient.query(
      'SELECT id FROM public.tenants WHERE id = $1',
      [TENANT_A_ID]
    );
    if (!tenant) {
      console.error('Error: Tenant A not found in database. Run test_v2_cloud.js first.');
      process.exit(1);
    }

    // 2. Helper to create user
    const provisionUser = async (email, firstName, role) => {
      // Check if user already exists in auth.users
      const { rows: [existingAuth] } = await pgClient.query(
        'SELECT id FROM auth.users WHERE email = $1',
        [email]
      );

      let userId;
      if (existingAuth) {
        userId = existingAuth.id;
        console.log(`[PROVISION] Auth user already exists: ${email} (${userId})`);
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: TEST_PASSWORD,
          email_confirm: true
        });
        if (error || !data.user) {
          throw new Error(`Failed to create Auth user ${email}: ${error?.message}`);
        }
        userId = data.user.id;
        console.log(`[PROVISION] Created Auth user: ${email} (${userId})`);
      }

      // Sync public.users record
      const { rows: [existingPublic] } = await pgClient.query(
        'SELECT id FROM public.users WHERE id = $1',
        [userId]
      );
      if (!existingPublic) {
        await pgClient.query(
          `INSERT INTO public.users (id, email, first_name, last_name) VALUES ($1, $2, $3, 'FrontendTest')`,
          [userId, email, firstName]
        );
        console.log(`[PROVISION] Created public user profile for ${email}`);
      } else {
        await pgClient.query(
          `UPDATE public.users SET first_name = $1, last_name = 'FrontendTest' WHERE id = $2`,
          [firstName, userId]
        );
        console.log(`[PROVISION] Updated public user profile for ${email}`);
      }

      // Create membership if not exists
      const { rows: [existingMembership] } = await pgClient.query(
        'SELECT id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
        [TENANT_A_ID, userId]
      );

      let membershipId;
      if (!existingMembership) {
        const { rows: [m] } = await pgClient.query(
          'INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id',
          [TENANT_A_ID, userId]
        );
        membershipId = m.id;
        console.log(`[PROVISION] Created membership for ${email} in Tenant A`);
      } else {
        membershipId = existingMembership.id;
        console.log(`[PROVISION] Membership already exists for ${email}`);
      }

      // Create role if not exists
      const { rows: [existingRole] } = await pgClient.query(
        'SELECT id FROM public.membership_roles WHERE membership_id = $1 AND role = $2',
        [membershipId, role]
      );
      if (!existingRole) {
        await pgClient.query(
          'INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)',
          [membershipId, role]
        );
        console.log(`[PROVISION] Assigned role ${role} to ${email}`);
      } else {
        console.log(`[PROVISION] Role ${role} already assigned to ${email}`);
      }

      return { userId, membershipId };
    };

    const studentUser = await provisionUser('front-student@integration.com', 'FrontStudent', 'STUDENT');
    const mentorUser = await provisionUser('front-mentor@integration.com', 'FrontMentor', 'STUDENT');
    const facultyUser = await provisionUser('front-faculty@integration.com', 'FrontFaculty', 'FACULTY_MENTOR');
    const adminUser = await provisionUser('front-admin@integration.com', 'FrontAdmin', 'ADMIN');

    // Provision Tenant B Admin for tenant isolation testing
    const TENANT_B_ID = '0f7b9978-b8b7-4147-b41d-c1a0bf71a8f5';
    const provisionUserTenantB = async (email, firstName, role) => {
      const { rows: [existingAuth] } = await pgClient.query('SELECT id FROM auth.users WHERE email = $1', [email]);
      let userId;
      if (existingAuth) {
        userId = existingAuth.id;
      } else {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
        if (error || !data.user) throw new Error(`Failed to create Tenant B auth user: ${error?.message}`);
        userId = data.user.id;
      }
      await pgClient.query(`INSERT INTO public.users (id, email, first_name, last_name) VALUES ($1, $2, $3, 'TenantBTest') ON CONFLICT (id) DO NOTHING`, [userId, email, firstName]);
      const { rows: [existingMem] } = await pgClient.query('SELECT id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2', [TENANT_B_ID, userId]);
      let membershipId = existingMem ? existingMem.id : (await pgClient.query('INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id', [TENANT_B_ID, userId])).rows[0].id;
      const { rows: [existingRole] } = await pgClient.query('SELECT id FROM public.membership_roles WHERE membership_id = $1 AND role = $2', [membershipId, role]);
      if (!existingRole) await pgClient.query('INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2)', [membershipId, role]);
      return { userId, membershipId };
    };

    await provisionUserTenantB('front-admin-b@integration.com', 'FrontAdminB', 'ADMIN');

    // 3. Setup Department, Program, Batch & Student Profile for Student
    // Find CS Dept or create
    let deptId;
    const { rows: [dept] } = await pgClient.query(
      `SELECT id FROM public.departments WHERE name = 'CS Dept' AND tenant_id = $1`,
      [TENANT_A_ID]
    );
    if (dept) {
      deptId = dept.id;
    } else {
      const { rows: [newDept] } = await pgClient.query(
        `INSERT INTO public.departments (tenant_id, name) VALUES ($1, 'CS Dept') RETURNING id`,
        [TENANT_A_ID]
      );
      deptId = newDept.id;
    }

    // Find Program or create
    let programId;
    const { rows: [prog] } = await pgClient.query(
      `SELECT id FROM public.programs WHERE name = 'MCA' AND department_id = $1`,
      [deptId]
    );
    if (prog) {
      programId = prog.id;
    } else {
      const { rows: [newProg] } = await pgClient.query(
        `INSERT INTO public.programs (department_id, name) VALUES ($1, 'MCA') RETURNING id`,
        [deptId]
      );
      programId = newProg.id;
    }

    // Find Batch or create
    let batchId;
    const { rows: [batch] } = await pgClient.query(
      `SELECT id FROM public.batches WHERE name = 'MCA-2026' AND program_id = $1`,
      [programId]
    );
    if (batch) {
      batchId = batch.id;
    } else {
      const { rows: [newBatch] } = await pgClient.query(
        `INSERT INTO public.batches (program_id, name) VALUES ($1, 'MCA-2026') RETURNING id`,
        [programId]
      );
      batchId = newBatch.id;
    }

    // Create Student Profile if not exists
    const { rows: [existingProfile] } = await pgClient.query(
      `SELECT id FROM public.student_profiles WHERE tenant_membership_id = $1`,
      [studentUser.membershipId]
    );
    if (!existingProfile) {
      await pgClient.query(
        `INSERT INTO public.student_profiles (tenant_membership_id, batch_id, student_id_number) VALUES ($1, $2, 'STU-FRONT-01')`,
        [studentUser.membershipId, batchId]
      );
      console.log('[PROVISION] Created student profile');
    }

    // Assign faculty to batch if not assigned
    const { rows: [existingFacAssign] } = await pgClient.query(
      `SELECT id FROM public.faculty_batch_assignments WHERE faculty_user_id = $1 AND batch_id = $2`,
      [facultyUser.userId, batchId]
    );
    if (!existingFacAssign) {
      await pgClient.query(
        `INSERT INTO public.faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2)`,
        [facultyUser.userId, batchId]
      );
      console.log('[PROVISION] Created faculty batch assignment');
    }

    // 4. Setup Company, Internship & Mentor Assignment
    // Find or create a company
    let companyId;
    const { rows: [company] } = await pgClient.query(
      `SELECT id FROM public.companies WHERE name = 'Frontend Test Co' AND tenant_id = $1`,
      [TENANT_A_ID]
    );
    if (company) {
      companyId = company.id;
    } else {
      const { rows: [newCompany] } = await pgClient.query(
        `INSERT INTO public.companies (name, tenant_id) VALUES ('Frontend Test Co', $1) RETURNING id`,
        [TENANT_A_ID]
      );
      companyId = newCompany.id;
      console.log('[PROVISION] Created Frontend Test Co company');
    }

    // Find or create internship for student
    let internshipId;
    const { rows: [internship] } = await pgClient.query(
      `SELECT id FROM public.internships WHERE student_id = $1 AND tenant_id = $2`,
      [studentUser.userId, TENANT_A_ID]
    );
    if (internship) {
      internshipId = internship.id;
    } else {
      const { rows: [newInternship] } = await pgClient.query(
        `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status) 
         VALUES ($1, $2, $3, 'Software Engineer', CURRENT_DATE, CURRENT_DATE + INTERVAL '3 months', 150, 'ACTIVE') RETURNING id`,
        [TENANT_A_ID, studentUser.userId, companyId]
      );
      internshipId = newInternship.id;
      console.log('[PROVISION] Created student internship');
    }

    // Create mentor assignment if not exists
    const { rows: [existingAssignment] } = await pgClient.query(
      `SELECT id FROM public.internship_mentor_assignments WHERE internship_id = $1 AND mentor_user_id = $2`,
      [internshipId, mentorUser.userId]
    );
    if (!existingAssignment) {
      await pgClient.query(
        `INSERT INTO public.internship_mentor_assignments (internship_id, mentor_user_id, mentor_type)
         VALUES ($1, $2, 'COMPANY')`,
        [internshipId, mentorUser.userId]
      );
      console.log('[PROVISION] Created mentor assignment for front-mentor');
    } else {
      console.log('[PROVISION] Mentor assignment already exists');
    }

    console.log('[PROVISION] Frontend test users provisioned successfully.');
  } catch (err) {
    console.error('[PROVISION] Setup error:', err.message);
  } finally {
    await pgClient.end();
  }
}

run();
