// Service: Phase 2B studentProfileService.js
// Handles retrieval and update of student profiles in Supabase/PostgreSQL.
// Implements the dual-path cloud/local database query pattern.

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

// Use the Supabase client ONLY when cloud credentials are available AND we are NOT in local dev mode.
// In LOCAL_JWT_DEV_MODE the token is a dev-only HS256 JWT that Supabase cannot verify.
const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL) && process.env.LOCAL_JWT_DEV_MODE !== 'true';

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// ── GET STUDENT PROFILE ──────────────────────────────────────────────────────
const getStudentProfileData = async (token, userId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    console.log('[getStudentProfileData] USE_SUPABASE_CLIENT:', USE_SUPABASE_CLIENT, 'userId:', userId);
    const { data: user, error: userError } = await client
      .from('users')
      .select(`
        id, first_name, last_name, email,
        tenant_memberships!inner (
          id,
          tenant_id,
          tenants (name),
          membership_roles!inner (role),
          student_profiles (
            student_id_number,
            batches (
              name,
              programs (
                name,
                departments (name)
              )
            )
          )
        )
      `)
      .eq('id', userId)
      .eq('tenant_memberships.membership_roles.role', 'STUDENT')
      .maybeSingle();

    if (userError) {
      console.error('[CLOUD AUTH PATH] userError:', userError);
      throw userError;
    }
    if (!user) return null;

    // 2. Fetch active internship details if exists
    const { data: internships, error: internshipError } = await client
      .from('internships')
      .select(`
        id, job_role, start_date, end_date, total_hours, status,
        companies (name)
      `)
      .eq('student_id', userId)
      .eq('status', 'ACTIVE');

    if (internshipError) {
      console.error('[CLOUD AUTH PATH] internshipError:', internshipError);
      throw internshipError;
    }
    const internship = internships && internships.length > 0 ? internships[0] : null;

    let hoursSummary = null;
    if (internship) {
      const { data: hours, error: hoursError } = await client
        .from('internship_hours_summary')
        .select('logged_hours, approved_hours')
        .eq('internship_id', internship.id)
        .maybeSingle();

      if (!hoursError) {
        hoursSummary = hours;
      }
    }

    return formatProfilePayload(user, internship, hoursSummary);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const userSql = `
      SELECT 
        u.id, u.first_name, u.last_name, u.email,
        tm.id AS membership_id, tm.tenant_id,
        t.name AS tenant_name,
        sp.student_id_number,
        b.name AS batch_name,
        p.name AS program_name,
        d.name AS department_name
      FROM users u
      JOIN tenant_memberships tm ON u.id = tm.user_id
      JOIN tenants t ON tm.tenant_id = t.id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      LEFT JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
      LEFT JOIN batches b ON sp.batch_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE u.id = $1 AND mr.role = 'STUDENT'
      LIMIT 1;
    `;

    const { rows: userRows } = await client.query(userSql, [userId]);
    if (userRows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const dbUser = userRows[0];

    const internshipSql = `
      SELECT 
        i.id, i.job_role, i.start_date, i.end_date, i.total_hours, i.status,
        c.name AS company_name
      FROM internships i
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.student_id = $1 AND i.status = 'ACTIVE'
      LIMIT 1;
    `;
    const { rows: internshipRows } = await client.query(internshipSql, [userId]);
    const dbInternship = internshipRows[0] || null;

    let dbHours = null;
    if (dbInternship) {
      const { rows: hoursRows } = await client.query(
        `SELECT logged_hours, approved_hours FROM internship_hours_summary WHERE internship_id = $1 LIMIT 1`,
        [dbInternship.id]
      );
      dbHours = hoursRows[0] || null;
    }

    await client.query('COMMIT');
    return formatLocalProfilePayload(dbUser, dbInternship, dbHours);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── UPDATE STUDENT PROFILE ───────────────────────────────────────────────────
const updateStudentProfileData = async (token, userId, fullName) => {
  const nameParts = (fullName || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    const { error: updateError } = await client
      .from('users')
      .update({ first_name: firstName, last_name: lastName })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    return getStudentProfileData(token, userId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3`,
      [firstName, lastName, userId]
    );

    await client.query('COMMIT');
    return getStudentProfileData(token, userId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
const formatProfilePayload = (user, internship, hours) => {
  const membership = user.tenant_memberships[0] || {};
  const profile = membership.student_profiles || {};
  const batch = profile.batches || {};
  const program = batch.programs || {};
  const department = program.departments || {};

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

  let training = null;
  if (internship) {
    training = {
      id: internship.id,
      agencyName: internship.companies?.name || 'Not specified',
      mentor: 'Assigned by Coordinator',
      jobRole: internship.job_role,
      startDate: internship.start_date,
      endDate: internship.end_date,
      totalHours: internship.total_hours,
      completedHours: hours ? parseFloat(hours.approved_hours || 0) : 0,
      loggedHours: hours ? parseFloat(hours.logged_hours || 0) : 0,
      status: internship.status
    };
  }

  return {
    user: {
      name: fullName,
      email: user.email,
      role: 'student'
    },
    profile: {
      personalInfo: {
        fullName: fullName,
        email: user.email,
        contactNumber: '',
        dateOfBirth: '',
        gender: ''
      },
      academicInfo: {
        institution: membership.tenants?.name || '',
        degreeProgram: program.name || '',
        yearOfStudy: batch.name || '',
        specialization: ''
      }
    },
    trainingDetails: training
  };
};

const formatLocalProfilePayload = (dbUser, dbInternship, dbHours) => {
  const fullName = `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim();

  let training = null;
  if (dbInternship) {
    training = {
      id: dbInternship.id,
      agencyName: dbInternship.company_name || 'Not specified',
      mentor: 'Assigned by Coordinator',
      jobRole: dbInternship.job_role,
      startDate: dbInternship.start_date,
      endDate: dbInternship.end_date,
      totalHours: dbInternship.total_hours,
      completedHours: dbHours ? parseFloat(dbHours.approved_hours || 0) : 0,
      loggedHours: dbHours ? parseFloat(dbHours.logged_hours || 0) : 0,
      status: dbInternship.status
    };
  }

  return {
    user: {
      name: fullName,
      email: dbUser.email,
      role: 'student'
    },
    profile: {
      personalInfo: {
        fullName: fullName,
        email: dbUser.email,
        contactNumber: '',
        dateOfBirth: '',
        gender: ''
      },
      academicInfo: {
        institution: dbUser.tenant_name || '',
        degreeProgram: dbUser.program_name || '',
        yearOfStudy: dbUser.batch_name || '',
        specialization: ''
      }
    },
    trainingDetails: training
  };
};

module.exports = {
  getStudentProfileData,
  updateStudentProfileData
};
