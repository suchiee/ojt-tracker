// Service: Phase 1E.2 Daily Logs Service
// Implements dual-path architecture routing all writes through PostgreSQL functions (RPCs).

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL);

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// 1. LIST LOGS
const getLogsList = async (token, userId, internshipId, queryParams) => {
  const page = parseInt(queryParams.page || 1, 10);
  const limit = parseInt(queryParams.limit || 20, 10);
  const offset = (page - 1) * limit;
  const statusFilter = queryParams.status || null;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    let query = client
      .from('daily_logs')
      .select('id, date, notes, status, created_at, daily_log_tasks(id, hours)', { count: 'exact' })
      .eq('internship_id', internshipId);

    if (statusFilter) query = query.eq('status', statusFilter);
    query = query.order('date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const formattedData = (data || []).map(row => {
      const tasks = row.daily_log_tasks || [];
      const totalHours = tasks.reduce((sum, t) => sum + parseFloat(t.hours || 0), 0);
      return {
        id: row.id,
        internship_id: internshipId,
        date: row.date,
        notes: row.notes,
        status: row.status,
        created_at: row.created_at,
        task_count: tasks.length,
        total_task_hours: parseFloat(totalHours.toFixed(2))
      };
    });

    return {
      data: formattedData,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const statusWhere = statusFilter ? 'AND dl.status = $4' : '';
    const queryArgs = statusFilter 
      ? [internshipId, limit, offset, statusFilter] 
      : [internshipId, limit, offset];

    const listSql = `
      SELECT 
        dl.id, dl.internship_id, dl.date, dl.notes, dl.status, dl.created_at,
        COUNT(t.id)::int AS task_count,
        COALESCE(SUM(t.hours), 0)::float AS total_task_hours
      FROM daily_logs dl
      LEFT JOIN daily_log_tasks t ON dl.id = t.daily_log_id
      WHERE dl.internship_id = $1
        AND (
          dl.internship_id IN (
            SELECT i.id FROM internships i
            WHERE i.student_id = auth.uid() OR
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
        )
        ${statusWhere}
      GROUP BY dl.id
      ORDER BY dl.date DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(DISTINCT dl.id) FROM daily_logs dl
      WHERE dl.internship_id = $1
        AND (
          dl.internship_id IN (
            SELECT i.id FROM internships i
            WHERE i.student_id = auth.uid() OR
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
        )
        ${statusFilter ? 'AND dl.status = $2' : ''}
    `;

    const [listResult, countResult] = await Promise.all([
      client.query(listSql, queryArgs),
      client.query(countSql, statusFilter ? [internshipId, statusFilter] : [internshipId])
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

// 2. CREATE LOG
const createLog = async (token, userId, internshipId, body) => {
  const { date, notes, tasks } = body;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: logId, error } = await client.rpc('create_daily_log_with_tasks', {
      p_internship_id: internshipId,
      p_date: date,
      p_notes: notes || null,
      p_tasks: tasks
    });
    if (error) throw error;
    return getLogDetail(token, userId, internshipId, logId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows } = await client.query(
      `SELECT public.create_daily_log_with_tasks($1, $2, $3, $4) as id`,
      [internshipId, date, notes || null, JSON.stringify(tasks)]
    );
    const logId = rows[0].id;

    await client.query('COMMIT');
    return getLogDetail(token, userId, internshipId, logId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 3. GET DETAIL
const getLogDetail = async (token, userId, internshipId, logId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: row, error } = await client
      .from('daily_logs')
      .select('id, internship_id, date, notes, status, created_at, daily_log_tasks(id, description, hours)')
      .eq('id', logId)
      .eq('internship_id', internshipId)
      .maybeSingle();

    if (error) throw error;
    if (!row) return null;

    const tasks = (row.daily_log_tasks || []).map(t => ({
      id: t.id,
      description: t.description,
      hours: parseFloat(t.hours)
    }));
    const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);

    return {
      id: row.id,
      internship_id: row.internship_id,
      date: row.date,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      tasks,
      total_task_hours: parseFloat(totalHours.toFixed(2))
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const detailSql = `
      SELECT 
        dl.id, dl.internship_id, dl.date, dl.notes, dl.status, dl.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', t.id, 'description', t.description, 'hours', t.hours::float)
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) AS tasks,
        COALESCE(SUM(t.hours), 0)::float AS total_task_hours
      FROM daily_logs dl
      LEFT JOIN daily_log_tasks t ON dl.id = t.daily_log_id
      WHERE dl.id = $1 AND dl.internship_id = $2
        AND (
          dl.internship_id IN (
            SELECT i.id FROM internships i
            WHERE i.student_id = auth.uid() OR
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
        )
      GROUP BY dl.id
    `;

    const { rows } = await client.query(detailSql, [logId, internshipId]);
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 4. UPDATE LOG
const updateLog = async (token, userId, internshipId, logId, body) => {
  const { notes, tasks } = body;
  const notesSupplied = notes !== undefined;
  const tasksSupplied = tasks !== undefined;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // Pre-check: fetch current log status to enforce workflow lock server-side.
    // Supabase JS client can silently swallow RAISE EXCEPTION errors from RETURNS VOID RPCs.
    const { data: logRow, error: fetchErr } = await client
      .from('daily_logs')
      .select('status, internship_id')
      .eq('id', logId)
      .eq('internship_id', internshipId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!logRow) {
      const e = new Error('Daily log not found or access denied');
      e.code = 'P0002';
      throw e;
    }
    if (!['DRAFT', 'CORRECTION_REQUESTED'].includes(logRow.status)) {
      const e = new Error('Daily log is locked for editing');
      e.code = 'D0001';
      throw e;
    }

    const { error } = await client.rpc('update_daily_log_with_tasks', {
      p_internship_id: internshipId,
      p_log_id: logId,
      p_notes: notesSupplied ? notes : null,
      p_notes_supplied: notesSupplied,
      p_tasks: tasksSupplied ? tasks : null,
      p_tasks_supplied: tasksSupplied
    });
    if (error) throw error;
    return getLogDetail(token, userId, internshipId, logId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `SELECT public.update_daily_log_with_tasks($1, $2, $3, $4, $5, $6)`,
      [
        internshipId,
        logId,
        notesSupplied ? notes : null,
        notesSupplied,
        tasksSupplied ? JSON.stringify(tasks) : null,
        tasksSupplied
      ]
    );

    await client.query('COMMIT');
    return getLogDetail(token, userId, internshipId, logId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 5. DELETE LOG
const deleteLog = async (token, userId, internshipId, logId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    // Fetch log status to verify workflow rules
    const { data: log, error: fetchError } = await client
      .from('daily_logs')
      .select('status')
      .eq('id', logId)
      .eq('internship_id', internshipId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!log) return false;

    if (log.status !== 'DRAFT') {
      const err = new Error('Daily log can only be deleted in DRAFT status');
      err.code = 'D0001';
      throw err;
    }

    const { error: deleteError } = await client
      .from('daily_logs')
      .delete()
      .eq('id', logId)
      .eq('internship_id', internshipId);

    if (deleteError) throw deleteError;
    return true;
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Verify parent match and status using SELECT FOR UPDATE
    const { rows } = await client.query(
      `SELECT status FROM public.daily_logs WHERE id = $1 AND internship_id = $2 FOR UPDATE`,
      [logId, internshipId]
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return false; // maps to 404
    }

    if (rows[0].status !== 'DRAFT') {
      const err = new Error('Daily log can only be deleted in DRAFT status');
      err.code = 'D0001';
      throw err;
    }

    await client.query(
      `DELETE FROM public.daily_logs WHERE id = $1 AND internship_id = $2`,
      [logId, internshipId]
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 6. SUBMIT LOG
const submitLog = async (token, userId, internshipId, logId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // Pre-check: fetch current log status to enforce submit workflow rules server-side.
    const { data: logRow, error: fetchErr } = await client
      .from('daily_logs')
      .select('status, internship_id')
      .eq('id', logId)
      .eq('internship_id', internshipId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!logRow) {
      const e = new Error('Daily log not found or access denied');
      e.code = 'P0002';
      throw e;
    }
    if (!['DRAFT', 'CORRECTION_REQUESTED'].includes(logRow.status)) {
      const e = new Error('Daily log cannot be submitted in its current state');
      e.code = 'D0002';
      throw e;
    }

    const { error } = await client.rpc('submit_daily_log', {
      p_internship_id: internshipId,
      p_log_id: logId
    });
    if (error) throw error;
    return getLogDetail(token, userId, internshipId, logId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `SELECT public.submit_daily_log($1, $2)`,
      [internshipId, logId]
    );

    await client.query('COMMIT');
    return getLogDetail(token, userId, internshipId, logId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 7. GET MENTOR REVIEW QUEUE
const getReviewQueue = async (token, userId, queryParams) => {
  const page = parseInt(queryParams.page || 1, 10);
  const limit = parseInt(queryParams.limit || 20, 10);
  const offset = (page - 1) * limit;

  const { student_id, date, internship_id } = queryParams;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    let query = client
      .from('daily_logs')
      .select(`
        id, date, notes, status, created_at, internship_id,
        internships!inner (
          id, job_role,
          users!internships_student_id_fkey (id, first_name, last_name, email),
          internship_mentor_assignments!inner (mentor_user_id, mentor_type)
        )
      `, { count: 'exact' })
      .eq('status', 'SUBMITTED')
      .eq('internships.internship_mentor_assignments.mentor_user_id', userId)
      .eq('internships.internship_mentor_assignments.mentor_type', 'COMPANY');

    if (student_id) query = query.eq('internships.student_id', student_id);
    if (internship_id) query = query.eq('internship_id', internship_id);
    if (date) query = query.eq('date', date);

    query = query.order('date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const formattedData = (data || []).map(row => ({
      id: row.id,
      date: row.date,
      notes: row.notes,
      status: row.status,
      created_at: row.created_at,
      internship_id: row.internship_id,
      internship: {
        id: row.internships?.id,
        job_role: row.internships?.job_role,
        student: row.internships?.users
      }
    }));

    return {
      data: formattedData,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) }
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    let whereClause = `
      WHERE dl.status = 'SUBMITTED'
        AND ima.mentor_user_id = auth.uid()
        AND ima.mentor_type = 'COMPANY'
    `;
    const params = [limit, offset];
    let paramIndex = 3;

    if (student_id) {
      whereClause += ` AND i.student_id = $${paramIndex}`;
      params.push(student_id);
      paramIndex++;
    }
    if (internship_id) {
      whereClause += ` AND dl.internship_id = $${paramIndex}`;
      params.push(internship_id);
      paramIndex++;
    }
    if (date) {
      whereClause += ` AND dl.date = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    const listSql = `
      SELECT 
        dl.id, dl.date, dl.notes, dl.status, dl.created_at, dl.internship_id,
        json_build_object(
          'id', i.id, 'job_role', i.job_role,
          'student', json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email)
        ) AS internship
      FROM daily_logs dl
      JOIN internships i ON dl.internship_id = i.id
      JOIN users u ON i.student_id = u.id
      JOIN internship_mentor_assignments ima ON i.id = ima.internship_id
      ${whereClause}
      ORDER BY dl.date DESC
      LIMIT $1 OFFSET $2
    `;

    // Counts list
    const countParams = params.slice(2);
    let countParamIndex = 1;
    let countWhere = `
      WHERE dl.status = 'SUBMITTED'
        AND ima.mentor_user_id = auth.uid()
        AND ima.mentor_type = 'COMPANY'
    `;
    if (student_id) {
      countWhere += ` AND i.student_id = $${countParamIndex}`;
      countParamIndex++;
    }
    if (internship_id) {
      countWhere += ` AND dl.internship_id = $${countParamIndex}`;
      countParamIndex++;
    }
    if (date) {
      countWhere += ` AND dl.date = $${countParamIndex}`;
      countParamIndex++;
    }

    const countSql = `
      SELECT COUNT(DISTINCT dl.id) 
      FROM daily_logs dl
      JOIN internships i ON dl.internship_id = i.id
      JOIN internship_mentor_assignments ima ON i.id = ima.internship_id
      ${countWhere}
    `;

    const [listResult, countResult] = await Promise.all([
      client.query(listSql, params),
      client.query(countSql, countParams)
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

// 8. GET REVIEWS HISTORY
const getReviewsHistory = async (token, userId, internshipId, logId) => {
  // First verify parent access by retrieving log detail (will return null if not authorized or mismatched)
  const parentLog = await getLogDetail(token, userId, internshipId, logId);
  if (!parentLog) return null;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data, error } = await client
      .from('log_reviews')
      .select('id, daily_log_id, reviewed_by, status, feedback, reviewed_at, users(id, first_name, last_name)')
      .eq('daily_log_id', logId)
      .order('reviewed_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      daily_log_id: row.daily_log_id,
      reviewed_by: row.reviewed_by,
      status: row.status,
      feedback: row.feedback,
      reviewed_at: row.reviewed_at,
      reviewer: row.users
    }));
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const historySql = `
      SELECT 
        lr.id, lr.daily_log_id, lr.reviewed_by, lr.status, lr.feedback, lr.reviewed_at,
        json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name) AS reviewer
      FROM log_reviews lr
      JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.daily_log_id = $1
      ORDER BY lr.reviewed_at ASC
    `;
    const { rows } = await client.query(historySql, [logId]);
    await client.query('COMMIT');
    return rows || [];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 9. SUBMIT MENTOR REVIEW
const submitReview = async (token, userId, internshipId, logId, body) => {
  const { decision, feedback } = body;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: reviewId, error } = await client.rpc('review_daily_log', {
      p_internship_id: internshipId,
      p_log_id: logId,
      p_decision: decision,
      p_feedback: feedback || ''
    });
    if (error) throw error;

    // Fetch newly created review record
    const { data: reviewRow, error: fetchError } = await client
      .from('log_reviews')
      .select('id, daily_log_id, reviewed_by, status, feedback, reviewed_at, users(id, first_name, last_name)')
      .eq('id', reviewId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    return reviewRow ? {
      id: reviewRow.id,
      daily_log_id: reviewRow.daily_log_id,
      reviewed_by: reviewRow.reviewed_by,
      status: reviewRow.status,
      feedback: reviewRow.feedback,
      reviewed_at: reviewRow.reviewed_at,
      reviewer: reviewRow.users
    } : null;
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows } = await client.query(
      `SELECT public.review_daily_log($1, $2, $3, $4) as id`,
      [internshipId, logId, decision, feedback || '']
    );
    const reviewId = rows[0].id;

    // Read back details
    const fetchSql = `
      SELECT 
        lr.id, lr.daily_log_id, lr.reviewed_by, lr.status, lr.feedback, lr.reviewed_at,
        json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name) AS reviewer
      FROM log_reviews lr
      JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.id = $1
    `;
    const fetchRes = await client.query(fetchSql, [reviewId]);

    await client.query('COMMIT');
    return fetchRes.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getLogsList,
  createLog,
  getLogDetail,
  updateLog,
  deleteLog,
  submitLog,
  getReviewQueue,
  getReviewsHistory,
  submitReview
};
