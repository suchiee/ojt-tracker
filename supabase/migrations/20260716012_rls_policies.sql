-- Migration: 012 RLS Policies
-- Purpose: Enable Row Level Security and define access policies for Student, Company Mentor, Faculty, and Admin scopes.

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_batch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE internships ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_mentor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_log_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_report_log_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE faculty_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 1. Tenants Policies (Least Privilege: only users with membership or assigned mentor link can read)
--------------------------------------------------------------------------------
CREATE POLICY tenants_select_policy ON tenants FOR SELECT
USING (
    id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()) OR
    id IN (
        SELECT i.tenant_id 
        FROM internships i 
        JOIN internship_mentor_assignments ima ON i.id = ima.internship_id 
        WHERE ima.mentor_user_id = auth.uid()
    )
);

--------------------------------------------------------------------------------
-- 2. Users Policies (Readable if members of same tenant, or assigned company mentor)
--------------------------------------------------------------------------------
CREATE POLICY users_select_policy ON users FOR SELECT
USING (
    id = auth.uid() OR
    id IN (
        -- Users in same tenant
        SELECT tm2.user_id 
        FROM tenant_memberships tm1 
        JOIN tenant_memberships tm2 ON tm1.tenant_id = tm2.tenant_id 
        WHERE tm1.user_id = auth.uid()
    ) OR
    id IN (
        -- Assigned company mentor / student relationship
        SELECT mentor_user_id FROM internship_mentor_assignments WHERE internship_id IN (
            SELECT id FROM internships WHERE student_id = auth.uid()
        )
    ) OR
    id IN (
        -- Students assigned to company mentor
        SELECT student_id FROM internships WHERE id IN (
            SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()
        )
    )
);

CREATE POLICY users_update_policy ON users FOR UPDATE
USING (id = auth.uid());

--------------------------------------------------------------------------------
-- 3. Tenant Memberships / Roles Policies (Managed by Tenant Admins, viewable by members)
--------------------------------------------------------------------------------
CREATE POLICY memberships_select_policy ON tenant_memberships FOR SELECT
USING (
    tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
);

CREATE POLICY roles_select_policy ON membership_roles FOR SELECT
USING (
    membership_id IN (
        SELECT id FROM tenant_memberships WHERE tenant_id IN (
            SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
        )
    )
);

--------------------------------------------------------------------------------
-- 4. Academic Structure Policies
--------------------------------------------------------------------------------
CREATE POLICY depts_select_policy ON departments FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

CREATE POLICY progs_select_policy ON programs FOR SELECT
USING (department_id IN (SELECT id FROM departments WHERE tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())));

CREATE POLICY batches_select_policy ON batches FOR SELECT
USING (program_id IN (SELECT id FROM programs WHERE department_id IN (SELECT id FROM departments WHERE tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()))));

--------------------------------------------------------------------------------
-- 5. Student Profiles Policies
--------------------------------------------------------------------------------
CREATE POLICY student_profiles_select_policy ON student_profiles FOR SELECT
USING (
    tenant_membership_id IN (SELECT id FROM tenant_memberships WHERE user_id = auth.uid()) OR
    batch_id IN (SELECT batch_id FROM faculty_batch_assignments WHERE faculty_user_id = auth.uid()) OR
    tenant_membership_id IN (
        SELECT tm.id 
        FROM tenant_memberships tm
        JOIN tenant_memberships tm_admin ON tm.tenant_id = tm_admin.tenant_id
        JOIN membership_roles mr ON tm_admin.id = mr.membership_id
        WHERE tm_admin.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

--------------------------------------------------------------------------------
-- 6. Companies Policies
--------------------------------------------------------------------------------
CREATE POLICY companies_select_policy ON companies FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

--------------------------------------------------------------------------------
-- 7. Internships Policies
--------------------------------------------------------------------------------
CREATE POLICY internships_select_policy ON internships FOR SELECT
USING (
    student_id = auth.uid() OR
    id IN (SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
    student_id IN (
        -- Faculty assigned via batch
        SELECT tm.user_id 
        FROM tenant_memberships tm
        JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
        JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE fba.faculty_user_id = auth.uid()
    ) OR
    tenant_id IN (
        -- Tenant admins
        SELECT tm.tenant_id 
        FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

CREATE POLICY internships_insert_policy ON internships FOR INSERT
WITH CHECK (
    student_id = auth.uid() OR
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

CREATE POLICY internships_update_policy ON internships FOR UPDATE
USING (
    student_id = auth.uid() OR
    id IN (SELECT internship_id FROM internship_mentor_assignments WHERE mentor_user_id = auth.uid()) OR
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);

--------------------------------------------------------------------------------
-- 8. Daily Logs, Sub-tasks, and Reviews Policies
--------------------------------------------------------------------------------
CREATE POLICY daily_logs_select_policy ON daily_logs FOR SELECT
USING (
    internship_id IN (SELECT id FROM internships)
);

CREATE POLICY daily_logs_insert_policy ON daily_logs FOR INSERT
WITH CHECK (
    internship_id IN (SELECT id FROM internships WHERE student_id = auth.uid())
);

CREATE POLICY daily_logs_update_policy ON daily_logs FOR UPDATE
USING (
    internship_id IN (SELECT id FROM internships WHERE student_id = auth.uid() AND status <> 'COMPLETED')
);

CREATE POLICY daily_log_tasks_select_policy ON daily_log_tasks FOR SELECT
USING (
    daily_log_id IN (SELECT id FROM daily_logs)
);

CREATE POLICY daily_log_tasks_all_policy ON daily_log_tasks
FOR ALL
USING (
    daily_log_id IN (
        SELECT dl.id 
        FROM daily_logs dl
        JOIN internships i ON dl.internship_id = i.id
        WHERE i.student_id = auth.uid() AND i.status <> 'COMPLETED'
    )
);

CREATE POLICY log_reviews_select_policy ON log_reviews FOR SELECT
USING (
    daily_log_id IN (SELECT id FROM daily_logs)
);

CREATE POLICY log_reviews_insert_policy ON log_reviews FOR INSERT
WITH CHECK (
    reviewed_by = auth.uid() AND
    daily_log_id IN (
        SELECT dl.id 
        FROM daily_logs dl
        JOIN internship_mentor_assignments ima ON dl.internship_id = ima.internship_id
        WHERE ima.mentor_user_id = auth.uid() AND ima.mentor_type = 'COMPANY'
    )
);

--------------------------------------------------------------------------------
-- 9. Weekly Reports, Log Links, and Faculty Reviews Policies
--------------------------------------------------------------------------------
CREATE POLICY weekly_reports_select_policy ON weekly_reports FOR SELECT
USING (
    internship_id IN (SELECT id FROM internships)
);

CREATE POLICY weekly_reports_student_write_policy ON weekly_reports
FOR ALL
USING (
    internship_id IN (SELECT id FROM internships WHERE student_id = auth.uid() AND status <> 'COMPLETED')
);

CREATE POLICY weekly_report_log_links_policy ON weekly_report_log_links
FOR ALL
USING (
    weekly_report_id IN (
        SELECT wr.id 
        FROM weekly_reports wr
        JOIN internships i ON wr.internship_id = i.id
        WHERE i.student_id = auth.uid() AND i.status <> 'COMPLETED'
    )
);

CREATE POLICY faculty_reviews_select_policy ON faculty_reviews FOR SELECT
USING (
    weekly_report_id IN (SELECT id FROM weekly_reports)
);

CREATE POLICY faculty_reviews_insert_policy ON faculty_reviews FOR INSERT
WITH CHECK (
    reviewed_by = auth.uid() AND
    weekly_report_id IN (
        SELECT wr.id 
        FROM weekly_reports wr
        JOIN internships i ON wr.internship_id = i.id
        JOIN student_profiles sp ON i.student_id = sp.user_id
        JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE fba.faculty_user_id = auth.uid()
    )
);

CREATE POLICY checkpoints_select_policy ON review_checkpoints FOR SELECT
USING (
    internship_id IN (SELECT id FROM internships)
);

CREATE POLICY checkpoints_insert_policy ON review_checkpoints FOR INSERT
WITH CHECK (
    recorded_by = auth.uid() AND
    internship_id IN (
        SELECT i.id 
        FROM internships i
        JOIN student_profiles sp ON i.student_id = sp.user_id
        JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
        WHERE fba.faculty_user_id = auth.uid()
    )
);

--------------------------------------------------------------------------------
-- 10. Documents Policies (Least Privilege: Company Mentors NOT granted access)
--------------------------------------------------------------------------------
CREATE POLICY docs_select_policy ON documents FOR SELECT
USING (
    internship_id IN (
        SELECT id FROM internships 
        WHERE student_id = auth.uid() OR
              student_id IN (
                  SELECT tm.user_id 
                  FROM tenant_memberships tm
                  JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
                  JOIN faculty_batch_assignments fba ON sp.batch_id = fba.batch_id
                  WHERE fba.faculty_user_id = auth.uid()
              ) OR
              tenant_id IN (
                  SELECT tm.tenant_id 
                  FROM tenant_memberships tm
                  JOIN membership_roles mr ON tm.id = mr.membership_id
                  WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
              )
    )
);

CREATE POLICY docs_insert_policy ON documents FOR INSERT
WITH CHECK (
    internship_id IN (SELECT id FROM internships WHERE student_id = auth.uid())
);

--------------------------------------------------------------------------------
-- 11. Evaluations Policies
--------------------------------------------------------------------------------
CREATE POLICY eval_templates_select_policy ON evaluation_templates FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

CREATE POLICY eval_questions_select_policy ON evaluation_questions FOR SELECT
USING (template_id IN (SELECT id FROM evaluation_templates));

CREATE POLICY evals_select_policy ON evaluations FOR SELECT
USING (internship_id IN (SELECT id FROM internships));

CREATE POLICY evals_insert_policy ON evaluations FOR INSERT
WITH CHECK (evaluator_user_id = auth.uid());

CREATE POLICY eval_resp_select_policy ON evaluation_responses FOR SELECT
USING (evaluation_id IN (SELECT id FROM evaluations));

CREATE POLICY eval_resp_insert_policy ON evaluation_responses FOR INSERT
WITH CHECK (evaluation_id IN (SELECT id FROM evaluations WHERE evaluator_user_id = auth.uid()));

--------------------------------------------------------------------------------
-- 12. Announcements Board and Notifications Policies
--------------------------------------------------------------------------------
CREATE POLICY announcements_select_policy ON announcements FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()));

CREATE POLICY notifications_select_policy ON notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY notifications_update_policy ON notifications FOR UPDATE
USING (user_id = auth.uid());

--------------------------------------------------------------------------------
-- 13. Audit Logs Policies (Append-only for Express service role, Read-only for admins)
--------------------------------------------------------------------------------
CREATE POLICY audit_logs_select_policy ON audit_logs FOR SELECT
USING (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = auth.uid() AND mr.role = 'ADMIN'
    )
);
-- Users cannot INSERT, UPDATE or DELETE via API; service-role key is required to append audit logs
