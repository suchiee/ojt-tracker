// Service: Phase 1E.1 Internships Service
// Executes data queries under the authenticated user's RLS context.
//
// DUAL-PATH ARCHITECTURE:
//   - CLOUD MODE (SUPABASE_URL configured):
//     Use createUserContextClient with the user's bearer JWT.
//     PostgreSQL RLS is enforced automatically by Supabase PostgREST.
//
//   - LOCAL DEV MODE (SUPABASE_URL not configured):
//     Use the pg Pool with SET LOCAL request.jwt.claim.sub to emulate auth.uid().
//     The local PostgreSQL auth mock (20260716000_supabase_auth_mock.sql) defines auth.uid()
//     as current_setting('request.jwt.claim.sub', true)::uuid.
//     This is the validated Phase 1B/1C RLS emulation methodology.
//
// SERVICE-ROLE CLIENT IS NOT USED HERE. No privilege escalation.

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL);

// ──────────────────────────────────────────────────────────────────────────────
// INTERNAL: Activate RLS context for a pg client session
// Uses a transaction so set_config is transaction-local (safe for pooled connections).
// Caller is responsible for BEGIN being called before this, and COMMIT/ROLLBACK after.
// ──────────────────────────────────────────────────────────────────────────────
const activateRlsSession = async (client, userId) => {
  // set_config with is_local=true sets the value for the current transaction only.
  // This is safe for connection pools — value doesn't persist after COMMIT/ROLLBACK.
  // NOTE: We do NOT set 'role' to 'authenticated' here.
  // The pg pool connects as 'postgres' (superuser) which has full schema access including auth.uid().
  // We cannot switch to 'authenticated' role because that role lacks USAGE ON SCHEMA auth.
  // Instead, we mirror the RLS policy WHERE clauses explicitly in our queries.
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// ──────────────────────────────────────────────────────────────────────────────
// LIST INTERNSHIPS
// Returns paginated internships visible to the authenticated user (per RLS).
// ──────────────────────────────────────────────────────────────────────────────
const getInternshipsList = async (token, userId, queryParams) => {
  const page = parseInt(queryParams.page || 1, 10);
  const limit = parseInt(queryParams.limit || 20, 10);
  const offset = (page - 1) * limit;
  const statusFilter = queryParams.status || null;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    let query = client
      .from('internships')
      .select(`
        id, job_role, start_date, end_date, total_hours, status,
        companies (id, name),
        users!internships_student_id_fkey (id, first_name, last_name, email)
      `, { count: 'exact' });

    if (statusFilter) query = query.eq('status', statusFilter);
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;
    return {
      data: data || [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // auth.uid() is defined in the local mock as current_setting('request.jwt.claim.sub', true)::uuid
    // RLS policy on internships filters rows by student_id, mentor assignment, faculty batch, or admin role.
    // We mirror the RLS WHERE clause explicitly here since SET LOCAL role to 'authenticated'
    // does not activate Postgres-level RLS enforcement in direct pg pool connections
    // (RLS only activates automatically when connected AS the 'authenticated' role — not via SET).
    // So we apply the equivalent filter explicitly in SQL, using auth.uid() which reads the session variable.

    const statusWhere = statusFilter ? `AND i.status = $1` : '';
    const params = statusFilter ? [statusFilter, limit, offset] : [limit, offset];
    const limitParam = statusFilter ? '$2' : '$1';
    const offsetParam = statusFilter ? '$3' : '$2';

    const listSql = `
      SELECT
        i.id, i.job_role, i.start_date, i.end_date, i.total_hours, i.status,
        json_build_object('id', c.id, 'name', c.name) AS companies,
        json_build_object(
          'id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email
        ) AS users
      FROM internships i
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.student_id = u.id
      WHERE (
        i.student_id = auth.uid() OR
        i.id IN (SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
        i.student_id IN (
          SELECT tm.user_id FROM tenant_memberships tm
          JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
          JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
          WHERE fba.faculty_user_id = auth.uid()
        ) OR
        i.tenant_id IN (
          SELECT tm.tenant_id FROM tenant_memberships tm
          JOIN membership_roles mr ON tm.id = mr.membership_id
          WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
        )
      )
      ${statusWhere}
      ORDER BY i.start_date DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const countSql = `
      SELECT COUNT(*) FROM internships i
      WHERE (
        i.student_id = auth.uid() OR
        i.id IN (SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
        i.student_id IN (
          SELECT tm.user_id FROM tenant_memberships tm
          JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
          JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
          WHERE fba.faculty_user_id = auth.uid()
        ) OR
        i.tenant_id IN (
          SELECT tm.tenant_id FROM tenant_memberships tm
          JOIN membership_roles mr ON tm.id = mr.membership_id
          WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
        )
      )
      ${statusFilter ? 'AND i.status = $1' : ''}
    `;

    const [listResult, countResult] = await Promise.all([
      client.query(listSql, params),
      client.query(countSql, statusFilter ? [statusFilter] : [])
    ]);

    await client.query('COMMIT');
    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: listResult.rows || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET INTERNSHIP DETAIL
// Returns a single internship with hours summary if accessible to the user.
// Returns null for inaccessible or nonexistent records (controller returns 404).
// ──────────────────────────────────────────────────────────────────────────────
const getInternshipDetail = async (token, userId, id) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: internship, error } = await client
      .from('internships')
      .select(`
        id, job_role, start_date, end_date, total_hours, status,
        companies (id, name),
        users!internships_student_id_fkey (id, first_name, last_name, email)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!internship) return null;

    const { data: hours } = await client
      .from('internship_hours_summary')
      .select('logged_hours, approved_hours')
      .eq('internship_id', id)
      .maybeSingle();

    return {
      ...internship,
      hours_summary: {
        logged_hours: hours ? parseFloat(hours.logged_hours || 0) : 0,
        approved_hours: hours ? parseFloat(hours.approved_hours || 0) : 0
      }
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: internshipRows } = await client.query(`
      SELECT
        i.id, i.job_role, i.start_date, i.end_date, i.total_hours, i.status,
        json_build_object('id', c.id, 'name', c.name) AS companies,
        json_build_object(
          'id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email
        ) AS users
      FROM internships i
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN users u ON i.student_id = u.id
      WHERE i.id = $1
        AND (
          i.student_id = auth.uid() OR
          i.id IN (SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
          i.student_id IN (
            SELECT tm.user_id FROM tenant_memberships tm
            JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
            JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
            WHERE fba.faculty_user_id = auth.uid()
          ) OR
          i.tenant_id IN (
            SELECT tm.tenant_id FROM tenant_memberships tm
            JOIN membership_roles mr ON tm.id = mr.membership_id
            WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
          )
        )
    `, [id]);

    if (internshipRows.length === 0) return null;
    const internship = internshipRows[0];

    const { rows: hoursRows } = await client.query(`
      SELECT logged_hours, approved_hours FROM internship_hours_summary WHERE internship_id = $1
    `, [id]);

    return {
      ...internship,
      hours_summary: {
        logged_hours: hoursRows[0] ? parseFloat(hoursRows[0].logged_hours || 0) : 0,
        approved_hours: hoursRows[0] ? parseFloat(hoursRows[0].approved_hours || 0) : 0
      }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getInternshipsList,
  getInternshipDetail
};
