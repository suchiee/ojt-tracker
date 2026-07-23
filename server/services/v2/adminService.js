// Service: Phase 1G.5 Tenant Admin V2 Service
// Provides tenant-scoped read services for Tenant Admins using PostgreSQL RLS & session authorization.

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// Internal Helper: Audit log writer inside active transaction
const logAdminAudit = async (client, tenantId, actorId, action, targetTable, targetId, beforeState, afterState) => {
  const sql = `
    INSERT INTO public.audit_logs (
      tenant_id,
      actor_id,
      action,
      target_table,
      target_id,
      before_state,
      after_state
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  await client.query(sql, [
    tenantId,
    actorId,
    action,
    targetTable,
    targetId,
    beforeState ? JSON.stringify(beforeState) : null,
    afterState ? JSON.stringify(afterState) : null
  ]);
};


// ── 0. RESOLVE TENANT ADMIN CONTEXT ───────────────────────────────────────────
// Resolves the authenticated user's ADMIN membership for authorization and tenant isolation.
// If the user holds an ADMIN role, returns tenant_id and tenant_name; otherwise returns null.
const getAdminTenantContext = async (token, userId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data, error } = await client
      .from('tenant_memberships')
      .select('id, tenant_id, tenants(id, name), membership_roles!inner(role)')
      .eq('user_id', userId)
      .eq('membership_roles.role', 'ADMIN')
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      membership_id: data.id,
      tenant_id: data.tenant_id,
      tenant_name: data.tenants?.name || 'Tenant'
    };
  }

  // Local pg Pool Path
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);
    const sql = `
      SELECT tm.id as membership_id, tm.tenant_id, t.name as tenant_name
      FROM tenant_memberships tm
      JOIN membership_roles mr ON tm.id = mr.membership_id
      JOIN tenants t ON tm.tenant_id = t.id
      WHERE tm.user_id = $1 AND mr.role = 'ADMIN'
      LIMIT 1
    `;
    const { rows } = await client.query(sql, [userId]);
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 1. GET ADMIN OVERVIEW ─────────────────────────────────────────────────────
const getAdminOverview = async (token, userId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // 1. Total Students in tenant
    const { rows: [rStudents] } = await client.query(
      `SELECT COUNT(DISTINCT tm.user_id)::int as count
       FROM tenant_memberships tm
       JOIN membership_roles mr ON tm.id = mr.membership_id
       WHERE tm.tenant_id = $1 AND mr.role = 'STUDENT'`,
      [tenantId]
    );

    // 2. Active Internships in tenant
    const { rows: [rActiveInt] } = await client.query(
      `SELECT COUNT(*)::int as count FROM internships WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId]
    );

    // 3. Company Mentors assigned to tenant internships
    const { rows: [rMentors] } = await client.query(
      `SELECT COUNT(DISTINCT ima.mentor_user_id)::int as count
       FROM internship_mentor_assignments ima
       JOIN internships i ON ima.internship_id = i.id
       WHERE i.tenant_id = $1 AND ima.mentor_type = 'COMPANY'`,
      [tenantId]
    );

    // 4. Faculty Mentors assigned to tenant batches
    const { rows: [rFaculty] } = await client.query(
      `SELECT COUNT(DISTINCT fba.faculty_user_id)::int as count
       FROM faculty_batch_assignments fba
       JOIN batches b ON fba.batch_id = b.id
       JOIN programs p ON b.program_id = p.id
       JOIN departments d ON p.department_id = d.id
       WHERE d.tenant_id = $1`,
      [tenantId]
    );

    // 5. Pending Daily Logs (SUBMITTED status in tenant)
    const { rows: [rPendingLogs] } = await client.query(
      `SELECT COUNT(*)::int as count
       FROM daily_logs dl
       JOIN internships i ON dl.internship_id = i.id
       WHERE i.tenant_id = $1 AND dl.status = 'SUBMITTED'`,
      [tenantId]
    );

    // 6. Pending Weekly Reports (SUBMITTED status in tenant)
    const { rows: [rPendingReports] } = await client.query(
      `SELECT COUNT(*)::int as count
       FROM weekly_reports wr
       JOIN internships i ON wr.internship_id = i.id
       WHERE i.tenant_id = $1 AND wr.status = 'SUBMITTED'`,
      [tenantId]
    );

    await client.query('COMMIT');

    return {
      tenant_id: tenantId,
      tenant_name: adminCtx.tenant_name,
      total_students: rStudents?.count || 0,
      active_internships: rActiveInt?.count || 0,
      company_mentors: rMentors?.count || 0,
      faculty_mentors: rFaculty?.count || 0,
      pending_daily_logs: rPendingLogs?.count || 0,
      pending_weekly_reports: rPendingReports?.count || 0
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 2. GET ADMIN STUDENTS ─────────────────────────────────────────────────────
const getAdminStudents = async (token, userId, queryParams) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const page = parseInt(queryParams.page, 10) || 1;
  const limit = parseInt(queryParams.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const search = queryParams.search?.trim() || '';
  const programId = queryParams.program_id || null;
  const batchId = queryParams.batch_id || null;
  const status = queryParams.status || 'all';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    let whereClause = `WHERE tm.tenant_id = $1 AND mr.role = 'STUDENT'`;
    const params = [tenantId];
    let paramIdx = 2;

    if (search) {
      whereClause += ` AND (
        u.first_name ILIKE $${paramIdx} OR
        u.last_name ILIKE $${paramIdx} OR
        u.email ILIKE $${paramIdx} OR
        sp.student_id_number ILIKE $${paramIdx}
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (programId) {
      whereClause += ` AND p.id = $${paramIdx}`;
      params.push(programId);
      paramIdx++;
    }

    if (batchId) {
      whereClause += ` AND b.id = $${paramIdx}`;
      params.push(batchId);
      paramIdx++;
    }

    if (status && status !== 'all') {
      whereClause += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    const listSql = `
      SELECT 
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        sp.student_id_number,
        d.name as department_name,
        p.name as program_name,
        b.name as batch_name,
        i.id as active_internship_id,
        c.name as company_name,
        i.job_role,
        i.status as internship_status,
        i.total_hours as required_hours,
        COALESCE(hours.approved_hours, 0) as approved_hours,
        COALESCE(hours.logged_hours, 0) as logged_hours
      FROM tenant_memberships tm
      JOIN users u ON tm.user_id = u.id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      LEFT JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
      LEFT JOIN batches b ON sp.batch_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN internships i ON u.id = i.student_id AND i.tenant_id = tm.tenant_id AND i.status = 'ACTIVE'
      LEFT JOIN companies c ON i.company_id = c.id
      LEFT JOIN internship_hours_summary hours ON i.id = hours.internship_id
      ${whereClause}
      ORDER BY u.last_name ASC, u.first_name ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const countSql = `
      SELECT COUNT(DISTINCT tm.user_id)::int as total
      FROM tenant_memberships tm
      JOIN users u ON tm.user_id = u.id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      LEFT JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
      LEFT JOIN batches b ON sp.batch_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN internships i ON u.id = i.student_id AND i.tenant_id = tm.tenant_id AND i.status = 'ACTIVE'
      ${whereClause}
    `;

    const [listRes, countRes] = await Promise.all([
      client.query(listSql, [...params, limit, offset]),
      client.query(countSql, params)
    ]);

    await client.query('COMMIT');

    const total = countRes.rows[0]?.total || 0;
    const formatted = listRes.rows.map(r => ({
      id: r.user_id,
      user_id: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      student_id_number: r.student_id_number || 'N/A',
      department_name: r.department_name || 'N/A',
      program_name: r.program_name || 'N/A',
      batch_name: r.batch_name || 'N/A',
      active_internship: r.active_internship_id ? {
        id: r.active_internship_id,
        company_name: r.company_name || 'N/A',
        job_role: r.job_role || 'N/A',
        status: r.internship_status,
        approved_hours: parseFloat(r.approved_hours || 0),
        logged_hours: parseFloat(r.logged_hours || 0),
        required_hours: r.required_hours || 0
      } : null
    }));

    return {
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 3. GET ADMIN STUDENT DETAIL ───────────────────────────────────────────────
const getAdminStudentDetail = async (token, userId, studentId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const studentSql = `
      SELECT 
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        sp.id as profile_id,
        sp.student_id_number,
        b.id as batch_id,
        b.name as batch_name,
        p.id as program_id,
        p.name as program_name,
        d.id as department_id,
        d.name as department_name
      FROM tenant_memberships tm
      JOIN users u ON tm.user_id = u.id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      LEFT JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
      LEFT JOIN batches b ON sp.batch_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      LEFT JOIN departments d ON p.department_id = d.id
      WHERE u.id = $1 AND tm.tenant_id = $2 AND mr.role = 'STUDENT'
    `;
    const { rows: studentRows } = await client.query(studentSql, [studentId, tenantId]);
    if (studentRows.length === 0) {
      await client.query('COMMIT');
      return null; // Not found in this tenant
    }
    const student = studentRows[0];

    // Fetch internship history for student in this tenant
    const intSql = `
      SELECT 
        i.id,
        i.job_role,
        i.status,
        i.start_date,
        i.end_date,
        i.total_hours as required_hours,
        c.name as company_name,
        COALESCE(hours.approved_hours, 0) as approved_hours,
        COALESCE(hours.logged_hours, 0) as logged_hours
      FROM internships i
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN internship_hours_summary hours ON i.id = hours.internship_id
      WHERE i.student_id = $1 AND i.tenant_id = $2
      ORDER BY i.created_at DESC
    `;
    const { rows: intRows } = await client.query(intSql, [studentId, tenantId]);

    await client.query('COMMIT');

    return {
      student_id: student.user_id,
      user_id: student.user_id,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      student_id_number: student.student_id_number || 'N/A',
      academic_hierarchy: {
        department_name: student.department_name || 'N/A',
        program_name: student.program_name || 'N/A',
        batch_name: student.batch_name || 'N/A'
      },
      internships: intRows.map(r => ({
        id: r.id,
        company_name: r.company_name,
        job_role: r.job_role,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        required_hours: r.required_hours,
        approved_hours: parseFloat(r.approved_hours || 0),
        logged_hours: parseFloat(r.logged_hours || 0)
      }))
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 4. GET ADMIN INTERNSHIPS ──────────────────────────────────────────────────
const getAdminInternships = async (token, userId, queryParams) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const page = parseInt(queryParams.page, 10) || 1;
  const limit = parseInt(queryParams.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const search = queryParams.search?.trim() || '';
  const status = queryParams.status || 'all';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    let whereClause = `WHERE i.tenant_id = $1`;
    const params = [tenantId];
    let paramIdx = 2;

    if (search) {
      whereClause += ` AND (
        u.first_name ILIKE $${paramIdx} OR
        u.last_name ILIKE $${paramIdx} OR
        u.email ILIKE $${paramIdx} OR
        c.name ILIKE $${paramIdx} OR
        i.job_role ILIKE $${paramIdx}
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status && status !== 'all') {
      whereClause += ` AND i.status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    const listSql = `
      SELECT 
        i.id,
        i.student_id,
        u.first_name as student_first_name,
        u.last_name as student_last_name,
        u.email as student_email,
        c.name as company_name,
        i.job_role,
        i.start_date,
        i.end_date,
        i.status,
        i.total_hours as required_hours,
        COALESCE(hours.approved_hours, 0) as approved_hours,
        COALESCE(hours.logged_hours, 0) as logged_hours
      FROM internships i
      JOIN users u ON i.student_id = u.id
      JOIN companies c ON i.company_id = c.id
      LEFT JOIN internship_hours_summary hours ON i.id = hours.internship_id
      ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM internships i
      JOIN users u ON i.student_id = u.id
      JOIN companies c ON i.company_id = c.id
      ${whereClause}
    `;

    const [listRes, countRes] = await Promise.all([
      client.query(listSql, [...params, limit, offset]),
      client.query(countSql, params)
    ]);

    await client.query('COMMIT');

    const total = countRes.rows[0]?.total || 0;
    const formatted = listRes.rows.map(r => ({
      id: r.id,
      student: {
        id: r.student_id,
        first_name: r.student_first_name,
        last_name: r.student_last_name,
        email: r.student_email
      },
      company_name: r.company_name,
      job_role: r.job_role,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
      required_hours: r.required_hours,
      approved_hours: parseFloat(r.approved_hours || 0),
      logged_hours: parseFloat(r.logged_hours || 0)
    }));

    return {
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 5. GET ADMIN FACULTY ──────────────────────────────────────────────────────
const getAdminFaculty = async (token, userId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const facultySql = `
      SELECT 
        u.id as faculty_id,
        u.first_name,
        u.last_name,
        u.email,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', fba.id,
              'batch_id', b.id,
              'batch_name', b.name,
              'program_name', p.name
            )
          ) FILTER (WHERE fba.id IS NOT NULL),
          '[]'::json
        ) AS assigned_batches
      FROM tenant_memberships tm
      JOIN users u ON tm.user_id = u.id
      JOIN membership_roles mr ON tm.id = mr.membership_id
      LEFT JOIN faculty_batch_assignments fba ON u.id = fba.faculty_user_id
      LEFT JOIN batches b ON fba.batch_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      LEFT JOIN departments d ON p.department_id = d.id AND d.tenant_id = tm.tenant_id
      WHERE tm.tenant_id = $1 AND mr.role = 'FACULTY_MENTOR'
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY u.last_name ASC, u.first_name ASC
    `;

    const { rows } = await client.query(facultySql, [tenantId]);
    await client.query('COMMIT');

    return rows.map(r => ({
      id: r.faculty_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      assigned_batches: r.assigned_batches || []
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 6. GET ADMIN MENTORS ──────────────────────────────────────────────────────
const getAdminMentors = async (token, userId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const mentorSql = `
      SELECT 
        u.id as mentor_id,
        u.first_name,
        u.last_name,
        u.email,
        COALESCE(
          json_agg(
            json_build_object(
              'assignment_id', ima.id,
              'internship_id', i.id,
              'job_role', i.job_role,
              'company_name', c.name,
              'student', json_build_object('id', stu.id, 'first_name', stu.first_name, 'last_name', stu.last_name, 'email', stu.email)
            )
          ) FILTER (WHERE ima.id IS NOT NULL),
          '[]'::json
        ) AS assigned_internships
      FROM internship_mentor_assignments ima
      JOIN users u ON ima.mentor_user_id = u.id
      JOIN internships i ON ima.internship_id = i.id
      JOIN users stu ON i.student_id = stu.id
      JOIN companies c ON i.company_id = c.id
      WHERE i.tenant_id = $1 AND ima.mentor_type = 'COMPANY'
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY u.last_name ASC, u.first_name ASC
    `;

    const { rows } = await client.query(mentorSql, [tenantId]);
    await client.query('COMMIT');

    return rows.map(r => ({
      id: r.mentor_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      assigned_internships: r.assigned_internships || []
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 7. GET ADMIN ACADEMIC STRUCTURE ───────────────────────────────────────────
const getAdminAcademicStructure = async (token, userId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) return null;

  const tenantId = adminCtx.tenant_id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const structSql = `
      SELECT 
        d.id as department_id,
        d.name as department_name,
        COALESCE(
          json_agg(
            json_build_object(
              'program_id', p.id,
              'program_name', p.name,
              'batches', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'batch_id', b.id,
                      'batch_name', b.name
                    )
                  ),
                  '[]'::json
                )
                FROM batches b WHERE b.program_id = p.id
              )
            )
          ) FILTER (WHERE p.id IS NOT NULL),
          '[]'::json
        ) AS programs
      FROM departments d
      LEFT JOIN programs p ON d.id = p.department_id
      WHERE d.tenant_id = $1
      GROUP BY d.id, d.name
      ORDER BY d.name ASC
    `;

    const { rows } = await client.query(structSql, [tenantId]);
    await client.query('COMMIT');

    return rows.map(r => ({
      id: r.department_id,
      name: r.department_name,
      programs: r.programs || []
    }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 8. ACADEMIC STRUCTURE MUTATIONS ───────────────────────────────────────────
const createDepartment = async (token, userId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [dept] } = await client.query(
      `INSERT INTO departments (tenant_id, name) VALUES ($1, $2) RETURNING id, tenant_id, name`,
      [adminCtx.tenant_id, name]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_CREATE_DEPARTMENT', 'departments', dept.id, null, dept);

    await client.query('COMMIT');
    return dept;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const updateDepartment = async (token, userId, departmentId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [existing] } = await client.query(
      `SELECT id, tenant_id, name FROM departments WHERE id = $1 AND tenant_id = $2`,
      [departmentId, adminCtx.tenant_id]
    );
    if (!existing) {
      const err = new Error('Department not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [updated] } = await client.query(
      `UPDATE departments SET name = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, tenant_id, name`,
      [name, departmentId, adminCtx.tenant_id]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_UPDATE_DEPARTMENT', 'departments', updated.id, existing, updated);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const createProgram = async (token, userId, departmentId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [dept] } = await client.query(
      `SELECT id FROM departments WHERE id = $1 AND tenant_id = $2`,
      [departmentId, adminCtx.tenant_id]
    );
    if (!dept) {
      const err = new Error('Department does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [prog] } = await client.query(
      `INSERT INTO programs (department_id, name) VALUES ($1, $2) RETURNING id, department_id, name`,
      [departmentId, name]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_CREATE_PROGRAM', 'programs', prog.id, null, prog);

    await client.query('COMMIT');
    return prog;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const updateProgram = async (token, userId, programId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [existing] } = await client.query(
      `SELECT p.id, p.department_id, p.name FROM programs p JOIN departments d ON p.department_id = d.id WHERE p.id = $1 AND d.tenant_id = $2`,
      [programId, adminCtx.tenant_id]
    );
    if (!existing) {
      const err = new Error('Program not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [updated] } = await client.query(
      `UPDATE programs SET name = $1 WHERE id = $2 RETURNING id, department_id, name`,
      [name, programId]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_UPDATE_PROGRAM', 'programs', updated.id, existing, updated);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const createBatch = async (token, userId, programId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [prog] } = await client.query(
      `SELECT p.id FROM programs p JOIN departments d ON p.department_id = d.id WHERE p.id = $1 AND d.tenant_id = $2`,
      [programId, adminCtx.tenant_id]
    );
    if (!prog) {
      const err = new Error('Program does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [batch] } = await client.query(
      `INSERT INTO batches (program_id, name) VALUES ($1, $2) RETURNING id, program_id, name`,
      [programId, name]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_CREATE_BATCH', 'batches', batch.id, null, batch);

    await client.query('COMMIT');
    return batch;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const updateBatch = async (token, userId, batchId, name) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [existing] } = await client.query(
      `SELECT b.id, b.program_id, b.name FROM batches b JOIN programs p ON b.program_id = p.id JOIN departments d ON p.department_id = d.id WHERE b.id = $1 AND d.tenant_id = $2`,
      [batchId, adminCtx.tenant_id]
    );
    if (!existing) {
      const err = new Error('Batch not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [updated] } = await client.query(
      `UPDATE batches SET name = $1 WHERE id = $2 RETURNING id, program_id, name`,
      [name, batchId]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_UPDATE_BATCH', 'batches', updated.id, existing, updated);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 9. COMPANY MUTATIONS ──────────────────────────────────────────────────────
const getAdminCompanies = async (token, userId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows } = await client.query(
      `SELECT id, tenant_id, name, website, created_at FROM companies WHERE tenant_id = $1 ORDER BY name ASC`,
      [adminCtx.tenant_id]
    );

    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const createCompany = async (token, userId, name, website) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [company] } = await client.query(
      `INSERT INTO companies (tenant_id, name, website) VALUES ($1, $2, $3) RETURNING id, tenant_id, name, website, created_at`,
      [adminCtx.tenant_id, name, website || null]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_CREATE_COMPANY', 'companies', company.id, null, company);

    await client.query('COMMIT');
    return company;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const updateCompany = async (token, userId, companyId, name, website) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [existing] } = await client.query(
      `SELECT id, tenant_id, name, website FROM companies WHERE id = $1 AND tenant_id = $2`,
      [companyId, adminCtx.tenant_id]
    );
    if (!existing) {
      const err = new Error('Company not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [updated] } = await client.query(
      `UPDATE companies SET name = COALESCE($1, name), website = COALESCE($2, website) WHERE id = $3 AND tenant_id = $4 RETURNING id, tenant_id, name, website, created_at`,
      [name || null, website !== undefined ? website : null, companyId, adminCtx.tenant_id]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_UPDATE_COMPANY', 'companies', updated.id, existing, updated);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 10. USER PROVISIONING ─────────────────────────────────────────────────────
const provisionAuthUserHelper = async (email, firstName, lastName) => {
  const { getAdminClient } = require('../../config/supabase');
  const supabaseAdmin = getAdminClient();

  // Try creating via Supabase Admin API
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: 'StagingPassword123!',
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName }
  });

  if (data?.user?.id) return data.user.id;

  // If user already exists in auth.users, resolve user ID from database
  const client = await pool.connect();
  try {
    const { rows: [existing] } = await client.query('SELECT id FROM auth.users WHERE email = $1', [email]);
    if (existing) return existing.id;
    const { rows: [pubUser] } = await client.query('SELECT id FROM public.users WHERE email = $1', [email]);
    if (pubUser) return pubUser.id;
  } finally {
    client.release();
  }

  throw error || new Error(`Failed to provision auth user for ${email}`);
};

const provisionStudent = async (token, userId, payload) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const { email, first_name, last_name, student_id_number, batch_id } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Verify batch belongs to tenant
    const { rows: [batch] } = await client.query(
      `SELECT b.id FROM batches b JOIN programs p ON b.program_id = p.id JOIN departments d ON p.department_id = d.id WHERE b.id = $1 AND d.tenant_id = $2`,
      [batch_id, adminCtx.tenant_id]
    );
    if (!batch) {
      const err = new Error('Batch does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    // Provision auth user
    const targetUserId = await provisionAuthUserHelper(email, first_name, last_name);

    // Sync public.users profile
    await client.query(
      `INSERT INTO users (id, first_name, last_name, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
      [targetUserId, first_name, last_name, email]
    );

    // Sync tenant_memberships
    const { rows: [mem] } = await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id) VALUES ($1, $2) ON CONFLICT (tenant_id, user_id) DO UPDATE SET created_at = now() RETURNING id`,
      [adminCtx.tenant_id, targetUserId]
    );

    // Sync membership_roles
    await client.query(
      `INSERT INTO membership_roles (membership_id, role) VALUES ($1, 'STUDENT') ON CONFLICT (membership_id, role) DO NOTHING`,
      [mem.id]
    );

    // Sync student_profiles
    const { rows: [profile] } = await client.query(
      `INSERT INTO student_profiles (tenant_membership_id, student_id_number, batch_id) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_membership_id) DO UPDATE SET student_id_number = EXCLUDED.student_id_number, batch_id = EXCLUDED.batch_id
       RETURNING id, tenant_membership_id, student_id_number, batch_id`,
      [mem.id, student_id_number, batch_id]
    );

    const result = {
      user_id: targetUserId,
      membership_id: mem.id,
      student_profile_id: profile.id,
      email,
      first_name,
      last_name,
      student_id_number,
      batch_id
    };

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_PROVISION_STUDENT', 'tenant_memberships', mem.id, null, result);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const provisionFaculty = async (token, userId, payload) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const { email, first_name, last_name, batch_ids } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    if (Array.isArray(batch_ids) && batch_ids.length > 0) {
      const { rows: validBatches } = await client.query(
        `SELECT b.id FROM batches b JOIN programs p ON b.program_id = p.id JOIN departments d ON p.department_id = d.id WHERE b.id = ANY($1::uuid[]) AND d.tenant_id = $2`,
        [batch_ids, adminCtx.tenant_id]
      );
      if (validBatches.length !== batch_ids.length) {
        const err = new Error('One or more batch_ids do not belong to this tenant');
        err.status = 400;
        throw err;
      }
    }

    const targetUserId = await provisionAuthUserHelper(email, first_name, last_name);

    await client.query(
      `INSERT INTO users (id, first_name, last_name, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
      [targetUserId, first_name, last_name, email]
    );

    const { rows: [mem] } = await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id) VALUES ($1, $2) ON CONFLICT (tenant_id, user_id) DO UPDATE SET created_at = now() RETURNING id`,
      [adminCtx.tenant_id, targetUserId]
    );

    await client.query(
      `INSERT INTO membership_roles (membership_id, role) VALUES ($1, 'FACULTY_MENTOR') ON CONFLICT (membership_id, role) DO NOTHING`,
      [mem.id]
    );

    if (Array.isArray(batch_ids) && batch_ids.length > 0) {
      for (const bId of batch_ids) {
        await client.query(
          `INSERT INTO faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2) ON CONFLICT (faculty_user_id, batch_id) DO NOTHING`,
          [targetUserId, bId]
        );
      }
    }

    const result = {
      user_id: targetUserId,
      membership_id: mem.id,
      email,
      first_name,
      last_name,
      role: 'FACULTY_MENTOR',
      batch_ids: batch_ids || []
    };

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_PROVISION_FACULTY', 'tenant_memberships', mem.id, null, result);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const provisionMentor = async (token, userId, payload) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const { email, first_name, last_name } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const targetUserId = await provisionAuthUserHelper(email, first_name, last_name);

    await client.query(
      `INSERT INTO users (id, first_name, last_name, email) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
      [targetUserId, first_name, last_name, email]
    );

    const { rows: [mem] } = await client.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id) VALUES ($1, $2) ON CONFLICT (tenant_id, user_id) DO UPDATE SET created_at = now() RETURNING id`,
      [adminCtx.tenant_id, targetUserId]
    );

    await client.query(
      `INSERT INTO membership_roles (membership_id, role) VALUES ($1, 'STUDENT') ON CONFLICT (membership_id, role) DO NOTHING`,
      [mem.id]
    );

    const result = {
      user_id: targetUserId,
      membership_id: mem.id,
      email,
      first_name,
      last_name,
      role: 'COMPANY_MENTOR'
    };

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_PROVISION_MENTOR', 'tenant_memberships', mem.id, null, result);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 11. FACULTY BATCH ASSIGNMENT MUTATIONS ─────────────────────────────────────
const assignFacultyToBatch = async (token, userId, batchId, facultyUserId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [batch] } = await client.query(
      `SELECT b.id FROM batches b JOIN programs p ON b.program_id = p.id JOIN departments d ON p.department_id = d.id WHERE b.id = $1 AND d.tenant_id = $2`,
      [batchId, adminCtx.tenant_id]
    );
    if (!batch) {
      const err = new Error('Batch does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [fac] } = await client.query(
      `SELECT tm.user_id FROM tenant_memberships tm JOIN membership_roles mr ON tm.id = mr.membership_id WHERE tm.user_id = $1 AND tm.tenant_id = $2 AND mr.role = 'FACULTY_MENTOR'`,
      [facultyUserId, adminCtx.tenant_id]
    );
    if (!fac) {
      const err = new Error('Faculty user does not belong to this tenant or lacks FACULTY_MENTOR role');
      err.status = 400;
      throw err;
    }

    const { rows: [assign] } = await client.query(
      `INSERT INTO faculty_batch_assignments (faculty_user_id, batch_id) VALUES ($1, $2) ON CONFLICT (faculty_user_id, batch_id) DO UPDATE SET batch_id = EXCLUDED.batch_id RETURNING id, faculty_user_id, batch_id`,
      [facultyUserId, batchId]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_ASSIGN_FACULTY_BATCH', 'faculty_batch_assignments', assign.id, null, assign);

    await client.query('COMMIT');
    return assign;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const removeFacultyFromBatch = async (token, userId, batchId, facultyUserId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [batch] } = await client.query(
      `SELECT b.id FROM batches b JOIN programs p ON b.program_id = p.id JOIN departments d ON p.department_id = d.id WHERE b.id = $1 AND d.tenant_id = $2`,
      [batchId, adminCtx.tenant_id]
    );
    if (!batch) {
      const err = new Error('Batch does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [existingAssign] } = await client.query(
      `SELECT id, faculty_user_id, batch_id FROM faculty_batch_assignments WHERE faculty_user_id = $1 AND batch_id = $2`,
      [facultyUserId, batchId]
    );

    await client.query(
      `DELETE FROM faculty_batch_assignments WHERE faculty_user_id = $1 AND batch_id = $2`,
      [facultyUserId, batchId]
    );

    if (existingAssign) {
      await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_REMOVE_FACULTY_BATCH', 'faculty_batch_assignments', existingAssign.id, existingAssign, null);
    }

    await client.query('COMMIT');
    return { success: true, message: 'Faculty removed from batch successfully' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 12. INTERNSHIP & MENTOR ASSIGNMENT MUTATIONS ─────────────────────────────
const createInternship = async (token, userId, payload) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const { student_id, company_id, job_role, start_date, end_date, total_hours, status } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [student] } = await client.query(
      `SELECT tm.user_id FROM tenant_memberships tm JOIN membership_roles mr ON tm.id = mr.membership_id WHERE tm.user_id = $1 AND tm.tenant_id = $2 AND mr.role = 'STUDENT'`,
      [student_id, adminCtx.tenant_id]
    );
    if (!student) {
      const err = new Error('Student does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [company] } = await client.query(
      `SELECT id FROM companies WHERE id = $1 AND tenant_id = $2`,
      [company_id, adminCtx.tenant_id]
    );
    if (!company) {
      const err = new Error('Company does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [internship] } = await client.query(
      `INSERT INTO internships (tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status, created_at`,
      [adminCtx.tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status || 'ACTIVE']
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_CREATE_INTERNSHIP', 'internships', internship.id, null, internship);

    await client.query('COMMIT');
    return internship;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const updateInternship = async (token, userId, internshipId, payload) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const { job_role, start_date, end_date, total_hours, status } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [existing] } = await client.query(
      `SELECT id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status FROM internships WHERE id = $1 AND tenant_id = $2`,
      [internshipId, adminCtx.tenant_id]
    );
    if (!existing) {
      const err = new Error('Internship not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [updated] } = await client.query(
      `UPDATE internships SET
        job_role = COALESCE($1, job_role),
        start_date = COALESCE($2, start_date),
        end_date = COALESCE($3, end_date),
        total_hours = COALESCE($4, total_hours),
        status = COALESCE($5, status)
       WHERE id = $6 AND tenant_id = $7
       RETURNING id, tenant_id, student_id, company_id, job_role, start_date, end_date, total_hours, status, created_at`,
      [job_role || null, start_date || null, end_date || null, total_hours || null, status || null, internshipId, adminCtx.tenant_id]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_UPDATE_INTERNSHIP', 'internships', updated.id, existing, updated);

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const assignMentorToInternship = async (token, userId, internshipId, mentorUserId, isPrimary = false) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [internship] } = await client.query(
      `SELECT id FROM internships WHERE id = $1 AND tenant_id = $2`,
      [internshipId, adminCtx.tenant_id]
    );
    if (!internship) {
      const err = new Error('Internship not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [mentor] } = await client.query(
      `SELECT tm.user_id FROM tenant_memberships tm WHERE tm.user_id = $1 AND tm.tenant_id = $2`,
      [mentorUserId, adminCtx.tenant_id]
    );
    if (!mentor) {
      const err = new Error('Mentor user does not belong to this tenant');
      err.status = 400;
      throw err;
    }

    const { rows: [assignment] } = await client.query(
      `INSERT INTO internship_mentor_assignments (internship_id, mentor_user_id, mentor_type, is_primary)
       VALUES ($1, $2, 'COMPANY', $3)
       ON CONFLICT (internship_id, mentor_user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
       RETURNING id, internship_id, mentor_user_id, mentor_type, is_primary, assigned_at`,
      [internshipId, mentorUserId, !!isPrimary]
    );

    await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_ASSIGN_MENTOR', 'internship_mentor_assignments', assignment.id, null, assignment);

    await client.query('COMMIT');
    return assignment;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const removeMentorFromInternship = async (token, userId, internshipId, mentorUserId) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows: [internship] } = await client.query(
      `SELECT id FROM internships WHERE id = $1 AND tenant_id = $2`,
      [internshipId, adminCtx.tenant_id]
    );
    if (!internship) {
      const err = new Error('Internship not found in this tenant');
      err.status = 404;
      throw err;
    }

    const { rows: [existingAssign] } = await client.query(
      `SELECT id, internship_id, mentor_user_id, mentor_type, is_primary FROM internship_mentor_assignments WHERE internship_id = $1 AND mentor_user_id = $2`,
      [internshipId, mentorUserId]
    );

    await client.query(
      `DELETE FROM internship_mentor_assignments WHERE internship_id = $1 AND mentor_user_id = $2`,
      [internshipId, mentorUserId]
    );

    if (existingAssign) {
      await logAdminAudit(client, adminCtx.tenant_id, userId, 'ADMIN_REMOVE_MENTOR', 'internship_mentor_assignments', existingAssign.id, existingAssign, null);
    }

    await client.query('COMMIT');
    return { success: true, message: 'Mentor assignment removed successfully' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// ── 13. AUDIT LOG READ ENDPOINT ───────────────────────────────────────────────
const getAdminAuditLogs = async (token, userId, queryParams = {}) => {
  const adminCtx = await getAdminTenantContext(token, userId);
  if (!adminCtx) {
    const err = new Error('Forbidden: Access is restricted to Tenant Administrators');
    err.status = 403;
    throw err;
  }

  const tenantId = adminCtx.tenant_id;
  const page = parseInt(queryParams.page, 10) || 1;
  const limit = Math.min(parseInt(queryParams.limit, 10) || 50, 100);
  const offset = (page - 1) * limit;

  const { action, target_table, target_id, actor_id, start_date, end_date } = queryParams;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    let whereConditions = [`al.tenant_id = $1`];
    const params = [tenantId];

    if (action) {
      params.push(action);
      whereConditions.push(`al.action = $${params.length}`);
    }

    if (target_table) {
      params.push(target_table);
      whereConditions.push(`al.target_table = $${params.length}`);
    }

    if (target_id) {
      params.push(target_id);
      whereConditions.push(`al.target_id = $${params.length}`);
    }

    if (actor_id) {
      params.push(actor_id);
      whereConditions.push(`al.actor_id = $${params.length}`);
    }

    if (start_date) {
      params.push(start_date);
      whereConditions.push(`al.created_at >= $${params.length}`);
    }

    if (end_date) {
      params.push(end_date);
      whereConditions.push(`al.created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const listSql = `
      SELECT 
        al.id,
        al.action,
        al.target_table,
        al.target_id,
        al.before_state,
        al.after_state,
        al.created_at,
        json_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'email', u.email
        ) AS actor
      FROM audit_logs al
      LEFT JOIN users u ON al.actor_id = u.id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM audit_logs al
      ${whereClause}
    `;

    const [listRes, countRes] = await Promise.all([
      client.query(listSql, [...params, limit, offset]),
      client.query(countSql, params)
    ]);

    await client.query('COMMIT');

    const total = countRes.rows[0]?.total || 0;
    return {
      data: listRes.rows || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
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
  getAdminTenantContext,
  getAdminOverview,
  getAdminStudents,
  getAdminStudentDetail,
  getAdminInternships,
  getAdminFaculty,
  getAdminMentors,
  getAdminAcademicStructure,
  createDepartment,
  updateDepartment,
  createProgram,
  updateProgram,
  createBatch,
  updateBatch,
  getAdminCompanies,
  createCompany,
  updateCompany,
  provisionStudent,
  provisionFaculty,
  provisionMentor,
  assignFacultyToBatch,
  removeFacultyFromBatch,
  createInternship,
  updateInternship,
  assignMentorToInternship,
  removeMentorFromInternship,
  getAdminAuditLogs
};


