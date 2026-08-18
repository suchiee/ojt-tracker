const pool = require('../../config/pgPool');

const activateRlsSession = async (client, userId) => {
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query(`SELECT set_config('role', 'authenticated', true)`);
};

const getAssignedStudents = async (token, userId, queryParams = {}) => {
  const page = parseInt(queryParams.page || 1, 10);
  const limit = parseInt(queryParams.limit || 50, 10);
  const offset = (page - 1) * limit;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await activateRlsSession(client, userId);

    // Verify Faculty membership
    const { rows: facMemberships } = await client.query(`
      SELECT tm.tenant_id 
      FROM public.tenant_memberships tm
      JOIN public.membership_roles mr ON tm.id = mr.membership_id
      WHERE tm.user_id = $1 AND mr.role = 'FACULTY_MENTOR'
      LIMIT 1
    `, [userId]);

    if (facMemberships.length === 0) {
      await client.query('COMMIT');
      const err = new Error('Forbidden: Access is restricted to Faculty Mentors');
      err.status = 403;
      throw err;
    }

    const tenantId = facMemberships[0].tenant_id;

    // Fetch students assigned via batch OR direct internship assignment
    const studentsSql = `
      SELECT DISTINCT ON (u.id)
        u.id AS student_id,
        u.first_name,
        u.last_name,
        u.email,
        sp.student_id_number,
        b.name AS batch_name,
        i.id AS internship_id,
        i.status AS internship_status,
        i.start_date,
        i.end_date,
        i.total_hours,
        c.name AS company_name,
        COALESCE((
          SELECT SUM(t.hours)::float 
          FROM public.daily_logs dl
          JOIN public.daily_log_tasks t ON dl.id = t.daily_log_id
          WHERE dl.internship_id = i.id AND dl.status = 'APPROVED'
        ), 0) AS completed_hours,
        (
          SELECT wr.status 
          FROM public.weekly_reports wr 
          WHERE wr.internship_id = i.id 
          ORDER BY wr.start_date DESC 
          LIMIT 1
        ) AS latest_weekly_report_status
      FROM public.users u
      JOIN public.tenant_memberships tm_stu ON u.id = tm_stu.user_id AND tm_stu.tenant_id = $1
      JOIN public.membership_roles mr_stu ON tm_stu.id = mr_stu.membership_id AND mr_stu.role = 'STUDENT'
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.batches b ON sp.batch_id = b.id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = $2
      LEFT JOIN public.internships i ON u.id = i.student_id AND i.tenant_id = $1
      LEFT JOIN public.companies c ON i.company_id = c.id
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = $2 AND ima.mentor_type = 'FACULTY'
      WHERE (fba.id IS NOT NULL OR ima.id IS NOT NULL)
      ORDER BY u.id, i.created_at DESC
      LIMIT $3 OFFSET $4;
    `;

    const { rows: students } = await client.query(studentsSql, [tenantId, userId, limit, offset]);

    const countSql = `
      SELECT COUNT(DISTINCT u.id)::int AS total
      FROM public.users u
      JOIN public.tenant_memberships tm_stu ON u.id = tm_stu.user_id AND tm_stu.tenant_id = $1
      JOIN public.membership_roles mr_stu ON tm_stu.id = mr_stu.membership_id AND mr_stu.role = 'STUDENT'
      LEFT JOIN public.student_profiles sp ON tm_stu.id = sp.tenant_membership_id
      LEFT JOIN public.faculty_batch_assignments fba ON sp.batch_id = fba.batch_id AND fba.faculty_user_id = $2
      LEFT JOIN public.internships i ON u.id = i.student_id AND i.tenant_id = $1
      LEFT JOIN public.internship_mentor_assignments ima ON i.id = ima.internship_id AND ima.mentor_user_id = $2 AND ima.mentor_type = 'FACULTY'
      WHERE (fba.id IS NOT NULL OR ima.id IS NOT NULL);
    `;

    const { rows: [countRow] } = await client.query(countSql, [tenantId, userId]);
    const total = countRow?.total || 0;

    await client.query('COMMIT');

    return {
      data: students.map(s => ({
        id: s.student_id,
        firstName: s.first_name,
        lastName: s.last_name,
        email: s.email,
        studentIdNumber: s.student_id_number,
        batchName: s.batch_name || 'Unassigned',
        internshipId: s.internship_id,
        internshipStatus: s.internship_status || 'NOT_STARTED',
        companyName: s.company_name || 'Not Assigned',
        startDate: s.start_date,
        endDate: s.end_date,
        totalHours: s.total_hours || 0,
        completedHours: s.completed_hours || 0,
        latestWeeklyReportStatus: s.latest_weekly_report_status || null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
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
  getAssignedStudents
};
