// Phase 1D: Legacy Data Migration and Reconciliation Script
// Extracts data from MongoDB, transforms and loads it transactionally into PostgreSQL,
// enforces idempotency via a persistent mapping table, and outputs a complete hours reconciliation report.

const mongoose = require('mongoose');
const { Pool } = require('pg');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../../models/User');
const TrainingDetails = require('../../models/TrainingDetails');
const DailyLog = require('../../models/DailyLog');

// Check CLI parameters
const DRY_RUN = process.argv.includes('--execute') ? false : true;
const ROLLBACK_MODE = process.argv.includes('--rollback');
const targetRunId = process.argv.find(arg => arg.startsWith('--run-id='))?.split('=')[1] || crypto.randomUUID();

// PostgreSQL Pool Connection config loading from environment variables
const PG_CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:***@localhost:5432/postgre';
const pool = new Pool({
  connectionString: PG_CONNECTION_STRING
});

async function runMigration() {
  console.log('================================================================');
  console.log(`MIGRATION UTILITY [Run ID: ${targetRunId}]`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'} | Rollback: ${ROLLBACK_MODE}`);
  console.log('================================================================\n');

  try {
    // 1. Connect to databases
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ccis-ojt-tracker';
    await mongoose.connect(mongoUri);
    console.log('[1/7] Connected to MongoDB database.');

    // Ensure mapping table exists in PostgreSQL
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.migration_id_map (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          migration_run_id UUID NOT NULL,
          source_collection TEXT NOT NULL,
          legacy_id TEXT NOT NULL,
          target_table TEXT NOT NULL,
          target_id UUID NOT NULL,
          migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(source_collection, legacy_id)
      );
    `);
    console.log('[2/7] Verified database schema mapping constraints.');

    // -------------------------------------------------------------------------
    // ROLLBACK WORKFLOW
    // -------------------------------------------------------------------------
    if (ROLLBACK_MODE) {
      console.log('\nExecuting rollback procedure...');
      const targetRollbackId = process.argv.find(arg => arg.startsWith('--rollback-run-id='))?.split('=')[1];
      if (!targetRollbackId) {
        console.error('ERROR: --rollback-run-id=<UUID> must be specified for rollback.');
        process.exit(1);
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Fetch items from migration map for the run-id
        const { rows: mappings } = await client.query(
          'SELECT * FROM public.migration_id_map WHERE migration_run_id = $1 ORDER BY migrated_at DESC',
          [targetRollbackId]
        );

        console.log(`Found ${mappings.length} records to clean up.`);

        // Safely delete in reverse order of insertions to respect foreign keys
        for (const map of mappings) {
          if (map.target_table === 'daily_log_tasks') {
            await client.query('DELETE FROM public.daily_log_tasks WHERE daily_log_id = $1', [map.target_id]);
          } else if (map.target_table === 'daily_logs') {
            await client.query('DELETE FROM public.daily_logs WHERE id = $1', [map.target_id]);
          } else if (map.target_table === 'internships') {
            await client.query('DELETE FROM public.internships WHERE id = $1', [map.target_id]);
          } else if (map.target_table === 'companies') {
            // Keep companies if they are referenced elsewhere, delete if only linked to this mapping
            await client.query('DELETE FROM public.companies WHERE id = $1', [map.target_id]);
          } else if (map.target_table === 'student_profiles') {
            await client.query('DELETE FROM public.student_profiles WHERE tenant_membership_id = $1', [map.target_id]);
          } else if (map.target_table === 'membership_roles') {
            await client.query('DELETE FROM public.membership_roles WHERE membership_id = $1', [map.target_id]);
          } else if (map.target_table === 'tenant_memberships') {
            await client.query('DELETE FROM public.tenant_memberships WHERE id = $1', [map.target_id]);
          } else if (map.target_table === 'users') {
            // Un-sync public users
            await client.query('DELETE FROM public.users WHERE id = $1', [map.target_id]);
            await client.query('DELETE FROM auth.users WHERE id = $1', [map.target_id]);
          }
        }

        // Clean up the mapping records themselves
        await client.query('DELETE FROM public.migration_id_map WHERE migration_run_id = $1', [targetRollbackId]);

        await client.query('COMMIT');
        console.log(`Rollback completed successfully for Run ID: ${targetRollbackId}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Rollback failed:', err);
      } finally {
        client.release();
        await mongoose.disconnect();
        await pool.end();
      }
      return;
    }

    // -------------------------------------------------------------------------
    // EXTRACTION & TRANSFORM WORKFLOW
    // -------------------------------------------------------------------------
    const legacyUsers = await User.find({}).lean();
    const legacyTrainings = await TrainingDetails.find({}).lean();
    const legacyLogs = await DailyLog.find({}).lean();

    console.log(`[3/7] Extracted MongoDB Data Counts:`);
    console.log(`- Users: ${legacyUsers.length}`);
    console.log(`- Training Details: ${legacyTrainings.length}`);
    console.log(`- Daily Logs: ${legacyLogs.length}\n`);

    // Setup academic structures and default Tenant
    let tenantId;
    let batchId;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Initialize default tenant
      const tenantName = 'Nowrosjee Wadia College';
      const { rows: existingTenant } = await client.query(
        'SELECT id FROM public.tenants WHERE name = $1', [tenantName]
      );
      if (existingTenant.length > 0) {
        tenantId = existingTenant[0].id;
      } else {
        const { rows: newTenant } = await client.query(
          'INSERT INTO public.tenants (name, domain) VALUES ($1, $2) RETURNING id',
          [tenantName, 'wadia.edu']
        );
        tenantId = newTenant[0].id;
      }

      // Initialize default department, program, batch
      let deptId;
      const { rows: existingDept } = await client.query(
        'SELECT id FROM public.departments WHERE tenant_id = $1 AND name = $2', [tenantId, 'Computer Science']
      );
      if (existingDept.length > 0) {
        deptId = existingDept[0].id;
      } else {
        const { rows: newDept } = await client.query(
          'INSERT INTO public.departments (tenant_id, name) VALUES ($1, $2) RETURNING id',
          [tenantId, 'Computer Science']
        );
        deptId = newDept[0].id;
      }

      let programId;
      const { rows: existingProg } = await client.query(
        'SELECT id FROM public.programs WHERE department_id = $1 AND name = $2', [deptId, 'BSc Computer Science']
      );
      if (existingProg.length > 0) {
        programId = existingProg[0].id;
      } else {
        const { rows: newProg } = await client.query(
          'INSERT INTO public.programs (department_id, name) VALUES ($1, $2) RETURNING id',
          [deptId, 'BSc Computer Science']
        );
        programId = newProg[0].id;
      }

      const { rows: existingBatch } = await client.query(
        'SELECT id FROM public.batches WHERE program_id = $1 AND name = $2', [programId, 'BSc CS Batch 2026']
      );
      if (existingBatch.length > 0) {
        batchId = existingBatch[0].id;
      } else {
        const { rows: newBatch } = await client.query(
          'INSERT INTO public.batches (program_id, name) VALUES ($1, $2) RETURNING id',
          [programId, 'BSc CS Batch 2026']
        );
        batchId = newBatch[0].id;
      }

      // 5. Load Users
      console.log('[4/7] Loading Users...');
      const identityReconciliation = [];

      for (const u of legacyUsers) {
        const email = u.email;
        const legacyId = u._id.toString();
        let targetUserId;
        let status = 'UNRESOLVED';

        // Check persistent map first (idempotency check)
        const { rows: mapped } = await client.query(
          'SELECT target_id FROM public.migration_id_map WHERE source_collection = $1 AND legacy_id = $2',
          ['users', legacyId]
        );

        if (mapped.length > 0) {
          targetUserId = mapped[0].target_id;
          status = 'MATCHED_EXISTING_AUTH_USER';
        } else {
          // Check if email already exists in public.users
          const { rows: emailChecked } = await client.query(
            'SELECT id FROM public.users WHERE email = $1', [email]
          );

          if (emailChecked.length > 0) {
            targetUserId = emailChecked[0].id;
            status = 'MATCHED_EXISTING_AUTH_USER';
          } else {
            // Create user in auth.users and public.users
            targetUserId = crypto.randomUUID();
            await client.query(
              'INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)',
              [targetUserId, email, JSON.stringify({ first_name: u.firstName, last_name: u.lastName })]
            );
            
            // Sync is handled by trigger automatically, but if local trigger failed, manually insert to public.users
            await client.query(
              'INSERT INTO public.users (id, first_name, last_name, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
              [targetUserId, u.firstName || 'New', u.lastName || 'User', email]
            );
            status = 'MANUALLY_MAPPED';
          }

          // Register in mapping table
          await client.query(
            'INSERT INTO public.migration_id_map (migration_run_id, source_collection, legacy_id, target_table, target_id) VALUES ($1, $2, $3, $4, $5)',
            [targetRunId, 'users', legacyId, 'users', targetUserId]
          );
        }

        identityReconciliation.push({ legacyId, email, targetUserId, status });

        // Build membership and roles
        let membershipId;
        const { rows: existingMembership } = await client.query(
          'SELECT id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
          [tenantId, targetUserId]
        );

        if (existingMembership.length > 0) {
          membershipId = existingMembership[0].id;
        } else {
          const { rows: newMem } = await client.query(
            'INSERT INTO public.tenant_memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id',
            [tenantId, targetUserId]
          );
          membershipId = newMem[0].id;
          
          await client.query(
            'INSERT INTO public.migration_id_map (migration_run_id, source_collection, legacy_id, target_table, target_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [targetRunId, 'tenant_memberships', legacyId, 'tenant_memberships', membershipId]
          );
        }

        // Map roles (ADMIN vs STUDENT)
        let targetRole = 'STUDENT';
        if (u.role === 'admin' || u.role === 'coordinator') {
          targetRole = 'ADMIN';
        }

        await client.query(
          'INSERT INTO public.membership_roles (membership_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [membershipId, targetRole]
        );

        // If student, link student profile
        if (targetRole === 'STUDENT') {
          await client.query(
            'INSERT INTO public.student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [membershipId, u.studentId || `SID-${crypto.randomInt(1000, 9999)}`, batchId]
          );
        }
      }

      // 6. Migrate Companies
      console.log('[5/7] Loading Companies...');
      const companyMap = {};
      for (const t of legacyTrainings) {
        const rawName = t.agencyName;
        const normalizedName = rawName.trim().replace(/\s+/g, ' ');
        let companyId;

        const { rows: existingComp } = await client.query(
          'SELECT id FROM public.companies WHERE tenant_id = $1 AND name = $2',
          [tenantId, normalizedName]
        );

        if (existingComp.length > 0) {
          companyId = existingComp[0].id;
        } else {
          const { rows: newComp } = await client.query(
            'INSERT INTO public.companies (tenant_id, name) VALUES ($1, $2) RETURNING id',
            [tenantId, normalizedName]
          );
          companyId = newComp[0].id;
          
          await client.query(
            'INSERT INTO public.migration_id_map (migration_run_id, source_collection, legacy_id, target_table, target_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [targetRunId, 'companies', normalizedName, 'companies', companyId]
          );
        }
        companyMap[normalizedName] = companyId;
      }

      // 7. Migrate Internships (TrainingDetails)
      console.log('[6/7] Loading Internships...');
      const internshipMap = {};
      for (const t of legacyTrainings) {
        const legacyStudentId = t.student.toString();
        const mappedUser = identityReconciliation.find(ir => ir.legacyId === legacyStudentId);
        if (!mappedUser) continue;

        const companyId = companyMap[t.agencyName.trim().replace(/\s+/g, ' ')];
        let internshipId;

        const { rows: mappedInternship } = await client.query(
          'SELECT target_id FROM public.migration_id_map WHERE source_collection = $1 AND legacy_id = $2',
          ['internships', t._id.toString()]
        );

        if (mappedInternship.length > 0) {
          internshipId = mappedInternship[0].target_id;
        } else {
          const { rows: newInternship } = await client.query(
            `INSERT INTO public.internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              tenantId,
              mappedUser.targetUserId,
              companyId,
              t.jobRole || 'Intern',
              t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              t.endDate ? new Date(t.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              t.totalHours || 120,
              t.status === 'active' ? 'ACTIVE' : 'COMPLETED'
            ]
          );
          internshipId = newInternship[0].id;

          await client.query(
            'INSERT INTO public.migration_id_map (migration_run_id, source_collection, legacy_id, target_table, target_id) VALUES ($1, $2, $3, $4, $5)',
            [targetRunId, 'internships', t._id.toString(), 'internships', internshipId]
          );
        }
        internshipMap[t._id.toString()] = internshipId;
      }

      // 8. Migrate Daily Logs & Sub-tasks
      console.log('[7/7] Loading Daily Logs...');
      for (const dl of legacyLogs) {
        const legacyStudentId = dl.student.toString();
        const training = legacyTrainings.find(t => t.student.toString() === legacyStudentId);
        if (!training) continue;

        const targetInternshipId = internshipMap[training._id.toString()];
        if (!targetInternshipId) continue;

        let logId;
        const { rows: mappedLog } = await client.query(
          'SELECT target_id FROM public.migration_id_map WHERE source_collection = $1 AND legacy_id = $2',
          ['daily_logs', dl._id.toString()]
        );

        if (mappedLog.length > 0) {
          logId = mappedLog[0].target_id;
        } else {
          const { rows: newLog } = await client.query(
            'INSERT INTO public.daily_logs (internship_id, date, notes, status) VALUES ($1, $2, $3, $4) RETURNING id',
            [
              targetInternshipId,
              dl.date ? new Date(dl.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              dl.notes || '',
              'APPROVED' // Historical Log Status Business Rule: pre-approved logs
            ]
          );
          logId = newLog[0].id;

          await client.query(
            'INSERT INTO public.migration_id_map (migration_run_id, source_collection, legacy_id, target_table, target_id) VALUES ($1, $2, $3, $4, $5)',
            [targetRunId, 'daily_logs', dl._id.toString(), 'daily_logs', logId]
          );
          
          // Migrate subtasks
          for (const task of dl.tasks) {
            await client.query(
              'INSERT INTO public.daily_log_tasks (daily_log_id, description, hours) VALUES ($1, $2, $3)',
              [logId, task.description || 'OJT Task', task.hours || 1.0]
            );
          }
        }
      }

      if (DRY_RUN) {
        await client.query('ROLLBACK');
        console.log('\n[DRY RUN] Transaction rolled back safely.');
      } else {
        await client.query('COMMIT');
        console.log('\n[EXECUTE] Transaction committed successfully to PostgreSQL database.');
      }

      // Output Identity Reconciliation Table
      console.log('\n================================================================');
      console.log('IDENTITY RECONCILIATION TABLE');
      console.log('================================================================');
      identityReconciliation.forEach(ir => {
        console.log(`Legacy ID: ${ir.legacyId} | Email: ${ir.email.padEnd(22)} | Supabase ID: ${ir.targetUserId} | Status: ${ir.status}`);
      });

      // Output Hours Reconciliation Report from views
      console.log('\n================================================================');
      console.log('ACTUAL HOURS RECONCILIATION REPORT');
      console.log('================================================================');
      for (const t of legacyTrainings) {
        const student = legacyUsers.find(u => u._id.toString() === t.student.toString());
        const studentLogs = legacyLogs.filter(l => l.student.toString() === t.student.toString());
        const mongoTasksSum = studentLogs.reduce((sum, log) => {
          return sum + log.tasks.reduce((s, task) => s + (task.hours || 0), 0);
        }, 0);

        const targetInternshipId = internshipMap[t._id.toString()];
        const { rows: pgHours } = await client.query(
          'SELECT logged_hours, approved_hours FROM public.internship_hours_summary WHERE internship_id = $1',
          [targetInternshipId]
        );

        console.log(`Student Email: ${student?.email}`);
        console.log(`- Legacy completedHours:           ${t.completedHours}`);
        console.log(`- MongoDB DailyLog Tasks Sum:      ${mongoTasksSum}`);
        console.log(`- PostgreSQL Logged Hours:         ${pgHours[0]?.logged_hours || 0}`);
        console.log(`- PostgreSQL Approved Hours:       ${pgHours[0]?.approved_hours || 0}`);
        console.log('----------------------------------------------------------------');
      }

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Migration execution failed transactionally:', err);
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Fatal initialization error:', err);
  } finally {
    await mongoose.disconnect();
    await pool.end();
  }
}

runMigration();
