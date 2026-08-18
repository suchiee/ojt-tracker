// Service: Phase 2B.5 Training Setup V2 Service
// Handles retrieval and update of student training setup details in Supabase/PostgreSQL.

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL) && process.env.LOCAL_JWT_DEV_MODE !== 'true';

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// Helper to format payload to match V1 compatibility
const formatTrainingPayload = (internship, mentorName) => {
  if (!internship) return null;

  return {
    id: internship.id,
    agencyName: internship.company_name || (internship.companies && internship.companies.name) || 'Not specified',
    mentor: mentorName || internship.mentor_name || 'Assigned by Coordinator',
    mentorName: internship.mentor_name || mentorName || null,
    mentorEmail: internship.mentor_email || null,
    jobRole: internship.job_role,
    startDate: internship.start_date,
    endDate: internship.end_date,
    totalHours: internship.total_hours,
    completedHours: internship.completed_hours || 0,
    loggedHours: internship.logged_hours || 0,
    status: internship.status,
    rejectionReason: internship.rejection_reason || null
  };
};

// ── GET TRAINING DETAILS ──────────────────────────────────────────────────────
const getTrainingSetupData = async (token, userId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // 1. Fetch internships for the user
    const { data: internships, error: internshipError } = await client
      .from('internships')
      .select(`
        id, job_role, start_date, end_date, total_hours, status, rejection_reason, mentor_name, mentor_email,
        companies(id, name),
        internship_mentor_assignments(
          mentor_type,
          users:mentor_user_id(first_name, last_name, email)
        )
      `)
      .eq('student_id', userId);

    if (internshipError) throw internshipError;
    if (!internships || internships.length === 0) return null;

    // Prioritize ACTIVE internship, or fallback to the latest one
    let active = internships.find(i => i.status === 'ACTIVE');
    if (!active) {
      active = internships[internships.length - 1];
    }

    // Resolve mentor name
    let mentorName = active.mentor_name || 'Assigned by Coordinator';
    if (active.internship_mentor_assignments && active.internship_mentor_assignments.length > 0) {
      const companyMentor = active.internship_mentor_assignments.find(a => a.mentor_type === 'COMPANY');
      if (companyMentor && companyMentor.users) {
        mentorName = `${companyMentor.users.first_name || ''} ${companyMentor.users.last_name || ''}`.trim();
      }
    }

    // Get hours summary
    let completedHours = 0;
    let loggedHours = 0;
    const { data: hours, error: hoursError } = await client
      .from('internship_hours_summary')
      .select('logged_hours, approved_hours')
      .eq('internship_id', active.id)
      .maybeSingle();

    if (!hoursError && hours) {
      completedHours = parseFloat(hours.approved_hours || 0);
      loggedHours = parseFloat(hours.logged_hours || 0);
    }

    return formatTrainingPayload(
      {
        ...active,
        completed_hours: completedHours,
        logged_hours: loggedHours
      },
      mentorName
    );
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Prioritize ACTIVE status, ordered by created_at DESC
    const sql = `
      SELECT 
        i.id, i.job_role, i.start_date, i.end_date, i.total_hours, i.status, i.rejection_reason,
        i.mentor_name, i.mentor_email,
        c.name AS company_name,
        mu.first_name AS mentor_first, mu.last_name AS mentor_last, mu.email AS assigned_mentor_email,
        COALESCE(hs.approved_hours, 0)::float AS completed_hours,
        COALESCE(hs.logged_hours, 0)::float AS logged_hours
      FROM internships i
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_type = 'COMPANY'
      LEFT JOIN users mu ON ima.mentor_user_id = mu.id
      LEFT JOIN internship_hours_summary hs ON i.id = hs.internship_id
      WHERE i.student_id = $1
      ORDER BY (CASE WHEN i.status = 'ACTIVE' THEN 1 ELSE 2 END) ASC, i.created_at DESC
      LIMIT 1;
    `;

    const { rows } = await client.query(sql, [userId]);
    await client.query('COMMIT');

    if (rows.length === 0) return null;
    const dbRow = rows[0];

    let mentorName = dbRow.mentor_name || 'Assigned by Coordinator';
    if (dbRow.mentor_first || dbRow.mentor_last) {
      mentorName = `${dbRow.mentor_first || ''} ${dbRow.mentor_last || ''}`.trim();
    }

    return formatTrainingPayload(dbRow, mentorName);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── UPDATE/CREATE TRAINING DETAILS ───────────────────────────────────────────
const updateTrainingSetupData = async (token, userId, body) => {
  const { agencyName, mentor, mentorEmail, jobRole, startDate, endDate, totalHours } = body;
  const normalizedMentorName = (mentor || body.mentorName || '').trim() || null;
  const normalizedMentorEmail = (mentorEmail || '').trim().toLowerCase() || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // 1. Get student's tenant_id
    const tenantSql = `
      SELECT tm.tenant_id 
      FROM tenant_memberships tm
      JOIN membership_roles mr ON tm.id = mr.membership_id
      WHERE tm.user_id = $1 AND mr.role = 'STUDENT'
      LIMIT 1;
    `;
    const { rows: tenantRows } = await client.query(tenantSql, [userId]);
    if (tenantRows.length === 0) {
      const err = new Error('User is not onboarded as a student');
      err.code = 'U0001';
      throw err;
    }
    const tenantId = tenantRows[0].tenant_id;

    // 2. Resolve company_id for agencyName
    const normalizedAgency = agencyName.trim().replace(/\s+/g, ' ');
    const coSql = `
      SELECT id FROM companies 
      WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) 
      LIMIT 1;
    `;
    const { rows: coRows } = await client.query(coSql, [tenantId, normalizedAgency]);
    
    let companyId;
    if (coRows.length > 0) {
      companyId = coRows[0].id;
    } else {
      // Create new company
      const insertCoSql = `
        INSERT INTO companies (tenant_id, name) 
        VALUES ($1, $2) 
        RETURNING id;
      `;
      const { rows: newCoRows } = await client.query(insertCoSql, [tenantId, normalizedAgency]);
      companyId = newCoRows[0].id;
    }

    // 3. Resolve any non-completed internships for this student
    const activeIntSql = `
      SELECT id FROM internships 
      WHERE student_id = $1 AND status <> 'COMPLETED';
    `;
    const { rows: activeIntRows } = await client.query(activeIntSql, [userId]);

    let internshipId;
    let auditAction;
    let beforeState = null;

    if (activeIntRows.length > 1) {
      const err = new Error('Multiple active training setups found');
      err.code = 'I0002';
      throw err;
    } else if (activeIntRows.length === 1) {
      // Fetch details before update to log state transition
      const { rows: [prevDetails] } = await client.query(
        `SELECT id, company_id, job_role, start_date, end_date, total_hours, status, rejection_reason, mentor_name, mentor_email FROM internships WHERE id = $1`,
        [activeIntRows[0].id]
      );
      beforeState = prevDetails;

      // Update existing internship, reset status to PENDING_VERIFICATION and clear rejection_reason
      internshipId = activeIntRows[0].id;
      const updateSql = `
        UPDATE internships 
        SET company_id = $1, job_role = $2, start_date = $3, end_date = $4, total_hours = $5, 
            status = 'PENDING_VERIFICATION', rejection_reason = NULL,
            mentor_name = $6, mentor_email = $7 
        WHERE id = $8;
      `;
      await client.query(updateSql, [
        companyId, jobRole, startDate, endDate, totalHours,
        normalizedMentorName, normalizedMentorEmail,
        internshipId
      ]);

      // If mentor email changed, revoke previous pending unused invitations for this internship
      if (prevDetails.mentor_email && prevDetails.mentor_email !== normalizedMentorEmail) {
        await client.query(`
          UPDATE invitation_codes 
          SET revoked_at = now() 
          WHERE internship_id = $1 AND uses_count = 0 AND revoked_at IS NULL;
        `, [internshipId]);
      }

      auditAction = 'STUDENT_RESUBMIT_SETUP';
    } else {
      // Create new internship in PENDING_VERIFICATION status
      const insertIntSql = `
        INSERT INTO internships (
          tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, 
          status, rejection_reason, mentor_name, mentor_email
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_VERIFICATION', NULL, $8, $9)
        RETURNING id;
      `;
      const { rows: newIntRows } = await client.query(insertIntSql, [
        tenantId,
        userId,
        companyId,
        jobRole,
        startDate,
        endDate,
        totalHours,
        normalizedMentorName,
        normalizedMentorEmail
      ]);
      internshipId = newIntRows[0].id;
      auditAction = 'STUDENT_SUBMIT_SETUP';
    }

    // Log public audit entry
    await client.query(`
      INSERT INTO public.audit_logs (tenant_id, actor_id, action, target_table, target_id, before_state, after_state)
      VALUES ($1, $2, $3, 'internships', $4, $5, $6)
    `, [
      tenantId,
      userId,
      auditAction,
      internshipId,
      beforeState ? JSON.stringify(beforeState) : null,
      JSON.stringify({ 
        company_id: companyId, 
        job_role: jobRole, 
        start_date: startDate, 
        end_date: endDate, 
        total_hours: totalHours, 
        status: 'PENDING_VERIFICATION',
        mentor_name: normalizedMentorName,
        mentor_email: normalizedMentorEmail
      })
    ]);

    await client.query('COMMIT');
    client.release();

    // Retrieve and return formatted details
    return getTrainingSetupData(token, userId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
};

module.exports = {
  getTrainingSetupData,
  updateTrainingSetupData
};
