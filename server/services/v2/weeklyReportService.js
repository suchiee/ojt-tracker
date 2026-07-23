// Service: Phase 1E.4 Weekly Reports & Faculty Review Service
// Connects to Supabase client in Cloud mode or Pool client in Local mode.
// Handles complex transaction operations through PostgreSQL RPC boundaries.

const { createUserContextClient } = require('../../config/supabase');
const pool = require('../../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL);

// Helper to set config properties in transaction
const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
};

// Helper to check RLS-equivalent parent internship accessibility locally
const verifyInternshipAccess = async (client, internshipId) => {
  const verifySql = `
    SELECT id FROM public.internships i
    WHERE i.id = $1 AND (
      i.student_id = auth.uid() OR
      i.id IN (SELECT internship_id FROM public.internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
      i.student_id IN (
        SELECT tm.user_id FROM public.tenant_memberships tm
        JOIN public.student_profiles sp ON tm.id = sp.tenant_membership_id
        JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE fba.faculty_user_id = auth.uid()
      ) OR
      i.tenant_id IN (
        SELECT tm.tenant_id FROM public.tenant_memberships tm
        JOIN public.membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
      )
    )
  `;
  const res = await client.query(verifySql, [internshipId]);
  return res.rows.length > 0;
};

// Helper to parse hours float safely
const getHoursSums = async (client, reportId) => {
  const sql = `
    SELECT 
      COALESCE(SUM(t.hours)::float, 0) as linked_hours,
      COALESCE(SUM(CASE WHEN dl.status = 'APPROVED' THEN t.hours ELSE 0 END)::float, 0) as approved_hours
    FROM public.weekly_report_log_links l
    JOIN public.daily_logs dl ON l.daily_log_id = dl.id
    JOIN public.daily_log_tasks t ON l.daily_log_id = t.daily_log_id
    WHERE l.weekly_report_id = $1
  `;
  const { rows } = await client.query(sql, [reportId]);
  return rows[0] || { linked_hours: 0, approved_hours: 0 };
};

// 1. GET WEEKLY REPORTS LIST
const getWeeklyReportsList = async (token, userId, internshipId, queryParams) => {
  const { status, start_date } = queryParams;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    // Verify internship access first
    const { data: internship, error: intErr } = await client
      .from('internships')
      .select('id')
      .eq('id', internshipId)
      .maybeSingle();

    if (intErr || !internship) return null;

    let query = client
      .from('weekly_reports')
      .select(`
        id, start_date, end_date, student_notes, status, created_at, internship_id,
        weekly_report_log_links (
          daily_logs (
            status,
            daily_log_tasks (hours)
          )
        )
      `)
      .eq('internship_id', internshipId);

    if (status) query = query.eq('status', status);
    if (start_date) query = query.eq('start_date', start_date);

    query = query.order('start_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(row => {
      let linked = 0;
      let approved = 0;
      const links = row.weekly_report_log_links || [];
      links.forEach(l => {
        const log = l.daily_logs;
        if (log) {
          const tasks = log.daily_log_tasks || [];
          tasks.forEach(t => {
            linked += parseFloat(t.hours || 0);
            if (log.status === 'APPROVED') {
              approved += parseFloat(t.hours || 0);
            }
          });
        }
      });
      return {
        id: row.id,
        start_date: row.start_date,
        end_date: row.end_date,
        student_notes: row.student_notes,
        status: row.status,
        created_at: row.created_at,
        internship_id: row.internship_id,
        linked_hours: linked,
        approved_hours: approved
      };
    });
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Verify parent internship access under RLS
    const hasAccess = await verifyInternshipAccess(client, internshipId);
    if (!hasAccess) {
      await client.query('COMMIT');
      return null;
    }


    let sql = `
      SELECT 
        wr.id, wr.start_date, wr.end_date, wr.student_notes, wr.status, wr.created_at, wr.internship_id,
        COALESCE((
          SELECT SUM(t.hours)::float 
          FROM public.weekly_report_log_links l
          JOIN public.daily_log_tasks t ON l.daily_log_id = t.daily_log_id
          WHERE l.weekly_report_id = wr.id
        ), 0) as linked_hours,
        COALESCE((
          SELECT SUM(t.hours)::float 
          FROM public.weekly_report_log_links l
          JOIN public.daily_logs dl ON l.daily_log_id = dl.id
          JOIN public.daily_log_tasks t ON l.daily_log_id = t.daily_log_id
          WHERE l.weekly_report_id = wr.id AND dl.status = 'APPROVED'
        ), 0) as approved_hours
      FROM public.weekly_reports wr
      WHERE wr.internship_id = $1
    `;

    const params = [internshipId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND wr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (start_date) {
      sql += ` AND wr.start_date = $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    sql += ` ORDER BY wr.start_date DESC`;

    const { rows } = await client.query(sql, params);
    await client.query('COMMIT');
    return rows || [];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 2. CREATE WEEKLY REPORT
const createWeeklyReport = async (token, userId, internshipId, body) => {
  const { start_date, end_date, student_notes, daily_log_ids } = body;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: reportId, error } = await client.rpc('create_weekly_report_with_logs', {
      p_internship_id: internshipId,
      p_start_date: start_date,
      p_end_date: end_date,
      p_student_notes: student_notes || '',
      p_daily_log_ids: daily_log_ids || []
    });
    if (error) throw error;
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    const { rows } = await client.query(
      `SELECT public.create_weekly_report_with_logs($1, $2, $3, $4, $5) as id`,
      [internshipId, start_date, end_date, student_notes || '', daily_log_ids || []]
    );
    const reportId = rows[0].id;

    await client.query('COMMIT');
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 3. GET WEEKLY REPORT DETAIL
const getWeeklyReportDetail = async (token, userId, internshipId, reportId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: wr, error } = await client
      .from('weekly_reports')
      .select(`
        id, start_date, end_date, student_notes, status, created_at, internship_id,
        weekly_report_log_links (
          daily_logs (
            id, date, status, notes,
            daily_log_tasks (id, description, hours)
          )
        )
      `)
      .eq('id', reportId)
      .eq('internship_id', internshipId)
      .maybeSingle();

    if (error) throw error;
    if (!wr) return null;

    let linked = 0;
    let approved = 0;
    const linkedLogs = (wr.weekly_report_log_links || []).map(l => {
      const log = l.daily_logs;
      if (log) {
        const tasks = log.daily_log_tasks || [];
        tasks.forEach(t => {
          linked += parseFloat(t.hours || 0);
          if (log.status === 'APPROVED') {
            approved += parseFloat(t.hours || 0);
          }
        });
        return {
          id: log.id,
          date: log.date,
          status: log.status,
          notes: log.notes,
          tasks
        };
      }
      return null;
    }).filter(Boolean);

    return {
      id: wr.id,
      start_date: wr.start_date,
      end_date: wr.end_date,
      student_notes: wr.student_notes,
      status: wr.status,
      created_at: wr.created_at,
      internship_id: wr.internship_id,
      linked_hours: linked,
      approved_hours: approved,
      linked_logs: linkedLogs
    };
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Verify parent internship access under RLS
    const hasAccess = await verifyInternshipAccess(client, internshipId);
    if (!hasAccess) {
      await client.query('COMMIT');
      return null;
    }

    const reportSql = `
      SELECT id, start_date, end_date, student_notes, status, created_at, internship_id
      FROM public.weekly_reports
      WHERE id = $1 AND internship_id = $2
    `;
    const { rows: [wr] } = await client.query(reportSql, [reportId, internshipId]);
    if (!wr) {
      await client.query('COMMIT');
      return null;
    }

    const { linked_hours, approved_hours } = await getHoursSums(client, reportId);

    const logsSql = `
      SELECT 
        dl.id, dl.date, dl.status, dl.notes,
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'description', t.description, 'hours', t.hours))
           FROM public.daily_log_tasks t
           WHERE t.daily_log_id = dl.id), '[]'::json
        ) as tasks
      FROM public.weekly_report_log_links l
      JOIN public.daily_logs dl ON l.daily_log_id = dl.id
      WHERE l.weekly_report_id = $1
      ORDER BY dl.date ASC
    `;
    const { rows: logs } = await client.query(logsSql, [reportId]);

    await client.query('COMMIT');
    return {
      ...wr,
      linked_hours,
      approved_hours,
      linked_logs: logs || []
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 4. UPDATE WEEKLY REPORT
const updateWeeklyReport = async (token, userId, internshipId, reportId, body) => {
  const { student_notes, daily_log_ids } = body;

  let logsToUpdate = daily_log_ids;
  if (logsToUpdate === undefined) {
    const existing = await getWeeklyReportDetail(token, userId, internshipId, reportId);
    logsToUpdate = (existing?.linked_logs || []).map(l => l.id);
  }

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // Pre-check: enforce workflow lock server-side before calling RETURNS VOID RPC.
    const { data: wr, error: fetchErr } = await client
      .from('weekly_reports')
      .select('status, internship_id')
      .eq('id', reportId)
      .eq('internship_id', internshipId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!wr) {
      const e = new Error('Weekly report not found or access denied');
      e.code = 'P0002';
      throw e;
    }
    if (!['DRAFT', 'CORRECTION_REQUESTED'].includes(wr.status)) {
      const e = new Error('Weekly report is locked for editing');
      e.code = 'D0012';
      throw e;
    }

    const { error } = await client.rpc('update_weekly_report_with_logs', {
      p_report_id: reportId,
      p_student_notes: student_notes || '',
      p_daily_log_ids: logsToUpdate
    });
    if (error) throw error;
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `SELECT public.update_weekly_report_with_logs($1, $2, $3)`,
      [reportId, student_notes || '', logsToUpdate]
    );

    await client.query('COMMIT');
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 5. DELETE WEEKLY REPORT
const deleteWeeklyReport = async (token, userId, internshipId, reportId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // Pre-check: only DRAFT reports can be deleted.
    const { data: wr, error: fetchErr } = await client
      .from('weekly_reports')
      .select('status, internship_id')
      .eq('id', reportId)
      .eq('internship_id', internshipId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!wr) {
      const e = new Error('Weekly report not found or access denied');
      e.code = 'P0002';
      throw e;
    }
    if (wr.status !== 'DRAFT') {
      const e = new Error('Weekly report can only be deleted in DRAFT status');
      e.code = 'D0012';
      throw e;
    }

    const { error } = await client.rpc('delete_weekly_report', {
      p_report_id: reportId
    });
    if (error) throw error;
    return true;
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `SELECT public.delete_weekly_report($1)`,
      [reportId]
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

// 6. SUBMIT WEEKLY REPORT
const submitWeeklyReport = async (token, userId, internshipId, reportId) => {
  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);

    // Pre-check: enforce submission workflow rules server-side before calling RETURNS VOID RPC.
    const { data: wr, error: fetchErr } = await client
      .from('weekly_reports')
      .select('status, end_date, internship_id')
      .eq('id', reportId)
      .eq('internship_id', internshipId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!wr) {
      const e = new Error('Weekly report not found or access denied');
      e.code = 'P0002';
      throw e;
    }
    if (!['DRAFT', 'CORRECTION_REQUESTED'].includes(wr.status)) {
      const e = new Error('Weekly report cannot be submitted in its current state');
      e.code = 'D0012';
      throw e;
    }
    // Enforce that the reporting week has ended
    const today = new Date().toISOString().slice(0, 10);
    if (today < wr.end_date) {
      const e = new Error('Cannot submit report: reporting period has not ended yet');
      e.code = 'D0012';
      throw e;
    }

    const { error } = await client.rpc('submit_weekly_report', {
      p_report_id: reportId
    });
    if (error) throw error;
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  }

  // ── Local pg Pool Path ────────────────────────────────────────────────────
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    await client.query(
      `SELECT public.submit_weekly_report($1)`,
      [reportId]
    );

    await client.query('COMMIT');
    return getWeeklyReportDetail(token, userId, internshipId, reportId);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 7. GET FACULTY REVIEW QUEUE (SUBMITTED weekly reports for assigned batches)
const getFacultyReviewQueue = async (token, userId, queryParams) => {
  const page = parseInt(queryParams.page || 1, 10);
  const limit = parseInt(queryParams.limit || 20, 10);
  const offset = (page - 1) * limit;

  const { student_id, batch_id, start_date } = queryParams;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    let query = client
      .from('weekly_reports')
      .select(`
        id, start_date, end_date, student_notes, status, created_at, internship_id,
        internships!inner (
          id, job_role,
          users!internships_student_id_fkey (
            id, first_name, last_name, email,
            tenant_memberships!inner (
              id,
              student_profiles!inner (
                id, batch_id,
                batches!inner (
                  id, name,
                  faculty_batch_assignments!inner (faculty_user_id)
                )
              )
            )
          )
        ),
        weekly_report_log_links (
          daily_logs (
            status,
            daily_log_tasks (hours)
          )
        )
      `, { count: 'exact' })
      .eq('status', 'SUBMITTED')
      .eq('internships.users.tenant_memberships.student_profiles.batches.faculty_batch_assignments.faculty_user_id', userId);

    if (student_id) query = query.eq('internships.student_id', student_id);
    if (batch_id) query = query.eq('internships.users.tenant_memberships.student_profiles.batch_id', batch_id);
    if (start_date) query = query.eq('start_date', start_date);

    query = query.order('start_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    const formattedData = (data || []).map(row => {
      let linked = 0;
      let approved = 0;
      const links = row.weekly_report_log_links || [];
      links.forEach(l => {
        const log = l.daily_logs;
        if (log) {
          const tasks = log.daily_log_tasks || [];
          tasks.forEach(t => {
            linked += parseFloat(t.hours || 0);
            if (log.status === 'APPROVED') {
              approved += parseFloat(t.hours || 0);
            }
          });
        }
      });
      return {
        id: row.id,
        start_date: row.start_date,
        end_date: row.end_date,
        student_notes: row.student_notes,
        status: row.status,
        created_at: row.created_at,
        internship_id: row.internship_id,
        linked_hours: linked,
        approved_hours: approved,
        student: row.internships?.users
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

    let whereClause = `
      WHERE wr.status = 'SUBMITTED'
        AND fba.faculty_user_id = auth.uid()
    `;
    const params = [limit, offset];
    let paramIndex = 3;

    if (student_id) {
      whereClause += ` AND i.student_id = $${paramIndex}`;
      params.push(student_id);
      paramIndex++;
    }
    if (batch_id) {
      whereClause += ` AND sp.batch_id = $${paramIndex}`;
      params.push(batch_id);
      paramIndex++;
    }
    if (start_date) {
      whereClause += ` AND wr.start_date = $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    const queueSql = `
      SELECT 
        wr.id, wr.start_date, wr.end_date, wr.student_notes, wr.status, wr.created_at, wr.internship_id,
        json_build_object(
          'id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'email', u.email
        ) AS student,
        COALESCE((
          SELECT SUM(t.hours)::float 
          FROM public.weekly_report_log_links l
          JOIN public.daily_log_tasks t ON l.daily_log_id = t.daily_log_id
          WHERE l.weekly_report_id = wr.id
        ), 0) as linked_hours,
        COALESCE((
          SELECT SUM(t.hours)::float 
          FROM public.weekly_report_log_links l
          JOIN public.daily_logs dl ON l.daily_log_id = dl.id
          JOIN public.daily_log_tasks t ON l.daily_log_id = t.daily_log_id
          WHERE l.weekly_report_id = wr.id AND dl.status = 'APPROVED'
        ), 0) as approved_hours
      FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.users u ON i.student_id = u.id
      JOIN public.tenant_memberships tm ON u.id = tm.user_id
      JOIN public.student_profiles sp ON tm.id = sp.tenant_membership_id
      JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
      ${whereClause}
      ORDER BY wr.start_date DESC
      LIMIT $1 OFFSET $2
    `;

    const countParams = params.slice(2);
    let countParamIndex = 1;
    let countWhere = `
      WHERE wr.status = 'SUBMITTED'
        AND fba.faculty_user_id = auth.uid()
    `;
    if (student_id) {
      countWhere += ` AND i.student_id = $${countParamIndex}`;
      countParamIndex++;
    }
    if (batch_id) {
      countWhere += ` AND sp.batch_id = $${countParamIndex}`;
      countParamIndex++;
    }
    if (start_date) {
      countWhere += ` AND wr.start_date = $${countParamIndex}`;
      countParamIndex++;
    }

    const countSql = `
      SELECT COUNT(DISTINCT wr.id) 
      FROM public.weekly_reports wr
      JOIN public.internships i ON wr.internship_id = i.id
      JOIN public.users u ON i.student_id = u.id
      JOIN public.tenant_memberships tm ON u.id = tm.user_id
      JOIN public.student_profiles sp ON tm.id = sp.tenant_membership_id
      JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
      ${countWhere}
    `;

    const [listResult, countResult] = await Promise.all([
      client.query(queueSql, params),
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

// 8. GET WEEKLY REPORT REVIEWS HISTORY
const getWeeklyReportReviews = async (token, userId, internshipId, reportId) => {
  // Verify access by attempting to read parent report first (returns null if unauthorized)
  const report = await getWeeklyReportDetail(token, userId, internshipId, reportId);
  if (!report) return null;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data, error } = await client
      .from('faculty_reviews')
      .select('id, weekly_report_id, reviewed_by, status, remarks, reviewed_at, users(id, first_name, last_name)')
      .eq('weekly_report_id', reportId)
      .order('reviewed_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      weekly_report_id: row.weekly_report_id,
      reviewed_by: row.reviewed_by,
      status: row.status,
      remarks: row.remarks,
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
        fr.id, fr.weekly_report_id, fr.reviewed_by, fr.status, fr.remarks, fr.reviewed_at,
        json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name) AS reviewer
      FROM public.faculty_reviews fr
      JOIN public.users u ON fr.reviewed_by = u.id
      WHERE fr.weekly_report_id = $1
      ORDER BY fr.reviewed_at ASC
    `;
    const { rows } = await client.query(historySql, [reportId]);
    await client.query('COMMIT');
    return rows || [];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// 9. SUBMIT FACULTY REVIEW DECISION
const submitFacultyReview = async (token, userId, internshipId, reportId, body) => {
  const { decision, remarks } = body;

  if (USE_SUPABASE_CLIENT) {
    const client = createUserContextClient(token);
    const { data: reviewId, error } = await client.rpc('review_weekly_report', {
      p_report_id: reportId,
      p_decision: decision,
      p_remarks: remarks || ''
    });
    if (error) throw error;

    // Fetch the new review record detail
    const { data: reviewRow, error: fetchError } = await client
      .from('faculty_reviews')
      .select('id, weekly_report_id, reviewed_by, status, remarks, reviewed_at, users(id, first_name, last_name)')
      .eq('id', reviewId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    return reviewRow ? {
      id: reviewRow.id,
      weekly_report_id: reviewRow.weekly_report_id,
      reviewed_by: reviewRow.reviewed_by,
      status: reviewRow.status,
      remarks: reviewRow.remarks,
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
      `SELECT public.review_weekly_report($1, $2, $3) as id`,
      [reportId, decision, remarks || '']
    );
    const reviewId = rows[0].id;

    const fetchSql = `
      SELECT 
        fr.id, fr.weekly_report_id, fr.reviewed_by, fr.status, fr.remarks, fr.reviewed_at,
        json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name) AS reviewer
      FROM public.faculty_reviews fr
      JOIN public.users u ON fr.reviewed_by = u.id
      WHERE fr.id = $1
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
  getWeeklyReportsList,
  createWeeklyReport,
  getWeeklyReportDetail,
  updateWeeklyReport,
  deleteWeeklyReport,
  submitWeeklyReport,
  getFacultyReviewQueue,
  getWeeklyReportReviews,
  submitFacultyReview
};
