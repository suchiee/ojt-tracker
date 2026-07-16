// Phase 1D: Legacy Data Migration and Reconciliation Script
// Extracts data from MongoDB, transforms into the target relational structure,
// validates constraints, performs reconciliation, and loads into Supabase/PostgreSQL.

const mongoose = require('mongoose');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '../../.env' });
dotenv.config({ path: '../.env' });

const { getAdminClient } = require('../../config/supabase');
const User = require('../../models/User');
const TrainingDetails = require('../../models/TrainingDetails');
const DailyLog = require('../../models/DailyLog');

const DRY_RUN = process.argv.includes('--execute') ? false : true;

// Setup Hashing / ID mapping dictionary
const idMap = {
  users: {},         // legacy_user_id -> supabase_user_id
  memberships: {},   // legacy_user_id -> membership_id
  companies: {},     // normalized_company_name -> company_id
  internships: {},   // legacy_training_id -> internship_id
  dailyLogs: {}      // legacy_log_id -> daily_log_id
};

async function migrate() {
  console.log('================================================================');
  console.log(`STARTING MIGRATION PROCESS [${DRY_RUN ? 'DRY-RUN MODE' : 'EXECUTE MODE'}]`);
  console.log('================================================================\n');

  try {
    // 1. Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ccis-ojt-tracker';
    await mongoose.connect(mongoUri);
    console.log('[1/5] Connected to MongoDB database successfully.');

    // 2. Initialize Supabase Admin Client
    let supabase = null;
    if (!DRY_RUN) {
      supabase = getAdminClient();
      console.log('[2/5] Initialized Supabase Admin Client.');
    } else {
      console.log('[2/5] Bypassed Supabase Admin Client initialization (Dry Run).');
    }

    // 3. Extract Legacy Data
    const legacyUsers = await User.find({}).lean();
    const legacyTrainings = await TrainingDetails.find({}).lean();
    const legacyLogs = await DailyLog.find({}).lean();

    console.log(`\nLegacy Inventory:`);
    console.log(`- MongoDB Users: ${legacyUsers.length}`);
    console.log(`- MongoDB Training Details: ${legacyTrainings.length}`);
    console.log(`- MongoDB Daily Logs: ${legacyLogs.length}\n`);

    // 4. Resolve Default Tenant & Academic Hierarchy
    let tenantId;
    let batchId;
    let deptId;
    let programId;

    if (!DRY_RUN) {
      // Fetch or Create Default Tenant (Nowrosjee Wadia College)
      const { data: tenant, error: tenantErr } = await supabase
        .from('tenants')
        .select('id')
        .eq('name', 'Nowrosjee Wadia College')
        .maybeSingle();

      if (tenant) {
        tenantId = tenant.id;
      } else {
        const { data: newTenant, error: createTenantErr } = await supabase
          .from('tenants')
          .insert({ name: 'Nowrosjee Wadia College', domain: 'wadia.edu' })
          .select('id')
          .single();
        if (createTenantErr) throw createTenantErr;
        tenantId = newTenant.id;
      }

      // Fetch or Create Department
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', 'Computer Science')
        .maybeSingle();

      if (dept) {
        deptId = dept.id;
      } else {
        const { data: newDept } = await supabase
          .from('departments')
          .insert({ tenant_id: tenantId, name: 'Computer Science' })
          .select('id')
          .single();
        deptId = newDept.id;
      }

      // Fetch or Create Program
      const { data: program } = await supabase
        .from('programs')
        .select('id')
        .eq('department_id', deptId)
        .eq('name', 'BSc Computer Science')
        .maybeSingle();

      if (program) {
        programId = program.id;
      } else {
        const { data: newProg } = await supabase
          .from('programs')
          .insert({ department_id: deptId, name: 'BSc Computer Science' })
          .select('id')
          .single();
        programId = newProg.id;
      }

      // Fetch or Create Batch
      const { data: batch } = await supabase
        .from('batches')
        .select('id')
        .eq('program_id', programId)
        .eq('name', 'BSc CS Batch 2026')
        .maybeSingle();

      if (batch) {
        batchId = batch.id;
      } else {
        const { data: newBatch } = await supabase
          .from('batches')
          .insert({ program_id: programId, name: 'BSc CS Batch 2026' })
          .select('id')
          .single();
        batchId = newBatch.id;
      }
    } else {
      tenantId = '11111111-1111-1111-1111-111111111111';
      batchId = '22222222-2222-2222-2222-222222222222';
    }

    // 5. Migrate Users
    console.log('[3/5] Migrating Users & Roles...');
    for (const u of legacyUsers) {
      const email = u.email;
      let targetUserId;

      if (!DRY_RUN) {
        // Idempotency check: see if user already exists in auth.users
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingUser) {
          targetUserId = existingUser.id;
        } else {
          // Create user in Supabase Auth via official admin API
          const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
            email,
            email_confirm: true,
            password: 'TemporaryPassword123!',
            user_metadata: { first_name: u.firstName, last_name: u.lastName }
          });

          if (authErr) {
            console.error(`Failed to migrate user ${email}:`, authErr.message);
            continue;
          }
          targetUserId = authUser.user.id;
        }

        // Map memberships and roles
        const { data: membership, error: memErr } = await supabase
          .from('tenant_memberships')
          .insert({ tenant_id: tenantId, user_id: targetUserId })
          .select('id')
          .single();

        if (memErr && memErr.code !== '23505') { // Ignore unique violations (already member)
          console.error(`Membership linkage failed for ${email}:`, memErr.message);
        } else {
          const memId = membership?.id || (await supabase.from('tenant_memberships').select('id').eq('tenant_id', tenantId).eq('user_id', targetUserId).single()).data.id;
          idMap.memberships[u._id.toString()] = memId;

          // Map roles (Student vs Admin/Coordinator)
          let targetRole = 'STUDENT';
          if (u.role === 'admin' || u.role === 'coordinator') {
            targetRole = 'ADMIN';
          }

          await supabase
            .from('membership_roles')
            .insert({ membership_id: memId, role: targetRole })
            .select('*');

          // If student, link student profile
          if (targetRole === 'STUDENT') {
            await supabase
              .from('student_profiles')
              .insert({
                tenant_membership_id: memId,
                student_id_number: u.studentId || `SID-${crypto.randomInt(1000, 9999)}`,
                batch_id: batchId
              });
          }
        }
      } else {
        targetUserId = crypto.randomUUID();
      }

      idMap.users[u._id.toString()] = targetUserId;
    }

    // 6. Migrate Companies
    console.log('[4/5] Normalizing and migrating companies...');
    for (const t of legacyTrainings) {
      const rawName = t.agencyName;
      const normalizedName = rawName.trim().replace(/\s+/g, ' '); // Clean duplicate spaces
      
      let companyId;
      if (!DRY_RUN) {
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('name', normalizedName)
          .maybeSingle();

        if (company) {
          companyId = company.id;
        } else {
          const { data: newCompany } = await supabase
            .from('companies')
            .insert({ tenant_id: tenantId, name: normalizedName, website: '' })
            .select('id')
            .single();
          companyId = newCompany.id;
        }
      } else {
        companyId = crypto.randomUUID();
      }

      idMap.companies[normalizedName] = companyId;
    }

    // 7. Migrate Internships (TrainingDetails)
    console.log('[5/5] Migrating Internships...');
    for (const t of legacyTrainings) {
      const legacyStudentId = t.student.toString();
      const targetStudentId = idMap.users[legacyStudentId];

      if (!targetStudentId) {
        console.warn(`Skipping internship ${t._id}: student record missing in mappings.`);
        continue;
      }

      const normalizedCompany = t.agencyName.trim().replace(/\s+/g, ' ');
      const companyId = idMap.companies[normalizedCompany];

      let targetInternshipId;
      if (!DRY_RUN) {
        const { data: internship } = await supabase
          .from('internships')
          .insert({
            tenant_id: tenantId,
            student_id: targetStudentId,
            company_id: companyId,
            job_role: t.jobRole || 'Intern',
            start_date: t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            end_date: t.endDate ? new Date(t.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            total_hours: t.totalHours || 120,
            status: t.status === 'active' ? 'ACTIVE' : 'COMPLETED'
          })
          .select('id')
          .single();

        targetInternshipId = internship.id;
      } else {
        targetInternshipId = crypto.randomUUID();
      }

      idMap.internships[t._id.toString()] = targetInternshipId;
    }

    // 8. Migrate Daily Logs & Sub-tasks
    console.log('Migrating Daily Logs & Sub-tasks...');
    for (const dl of legacyLogs) {
      const legacyStudentId = dl.student.toString();
      // Locate the internship for this student
      const training = legacyTrainings.find(t => t.student.toString() === legacyStudentId);
      if (!training) {
        console.warn(`Skipping daily log ${dl._id}: student has no associated training details.`);
        continue;
      }

      const targetInternshipId = idMap.internships[training._id.toString()];
      if (!targetInternshipId) continue;

      if (!DRY_RUN) {
        // Business Rule: Historical daily logs migrated are marked as APPROVED to preserve hours
        const { data: log } = await supabase
          .from('daily_logs')
          .insert({
            internship_id: targetInternshipId,
            date: dl.date ? new Date(dl.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            notes: dl.notes || '',
            status: 'APPROVED'
          })
          .select('id')
          .single();

        const logId = log.id;

        // Map sub-tasks
        for (const t of dl.tasks) {
          await supabase
            .from('daily_log_tasks')
            .insert({
              daily_log_id: logId,
              description: t.description || 'OJT task',
              hours: t.hours || 1.0
            });
        }
      }
    }

    // 9. Hours Reconciliation Comparison
    console.log('\n================================================================');
    console.log('HOURS RECONCILIATION REPORT');
    console.log('================================================================');
    
    for (const t of legacyTrainings) {
      const student = legacyUsers.find(u => u._id.toString() === t.student.toString());
      const studentEmail = student ? student.email : 'Unknown';

      // Sum actual tasks hours in MongoDB DailyLogs
      const studentLogs = legacyLogs.filter(l => l.student.toString() === t.student.toString());
      const totalTaskHours = studentLogs.reduce((sum, log) => {
        return sum + log.tasks.reduce((s, task) => s + (task.hours || 0), 0);
      }, 0);

      console.log(`Student: ${studentEmail}`);
      console.log(`- MongoDB Training completedHours: ${t.completedHours}`);
      console.log(`- MongoDB DailyLogs Tasks Sum:     ${totalTaskHours}`);
      
      if (!DRY_RUN) {
        // Fetch values from Supabase View
        const targetInternshipId = idMap.internships[t._id.toString()];
        const { data: viewHours } = await supabase
          .from('internship_hours_summary')
          .select('logged_hours, approved_hours')
          .eq('internship_id', targetInternshipId)
          .maybeSingle();

        console.log(`- Supabase View Logged Hours:     ${viewHours?.logged_hours || 0}`);
        console.log(`- Supabase View Approved Hours:   ${viewHours?.approved_hours || 0}`);
      }
      console.log('----------------------------------------------------------------');
    }

    console.log('\nMigration complete.');

  } catch (err) {
    console.error('\nFatal migration error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();
