-- Migration: 011 Views and Derived Hours
-- Purpose: Setup internship_hours_summary view to compute logged and approved hours on the fly from daily log tasks.

CREATE OR REPLACE VIEW internship_hours_summary AS
SELECT 
    i.id AS internship_id,
    COALESCE(SUM(CASE WHEN dl.status IN ('SUBMITTED', 'APPROVED') THEN t.hours ELSE 0 END), 0) AS logged_hours,
    COALESCE(SUM(CASE WHEN dl.status = 'APPROVED' THEN t.hours ELSE 0 END), 0) AS approved_hours
FROM 
    internships i
LEFT JOIN 
    daily_logs dl ON i.id = dl.internship_id
LEFT JOIN 
    daily_log_tasks t ON dl.id = t.daily_log_id
GROUP BY 
    i.id;
