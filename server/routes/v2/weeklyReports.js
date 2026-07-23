// Router: Phase 1E.4 Weekly Reports Router
// Defines endpoint routes nested under /api/v2/internships/:internshipId/weekly-reports.

const express = require('express');
const router = express.Router({ mergeParams: true }); // Inherits :internshipId

const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const {
  validateWeeklyReportParams,
  validateWeeklyReportBody,
  validateWeeklyReportUpdateBody,
  validateFacultyReviewBody
} = require('../../validators/v2/logValidator');
const weeklyReportController = require('../../controllers/v2/weeklyReportController');

// All endpoints require a valid Supabase JWT token and UUID parameter validation
router.get('/', verifySupabaseAuth, validateWeeklyReportParams, weeklyReportController.listWeeklyReports);
router.post('/', verifySupabaseAuth, validateWeeklyReportParams, validateWeeklyReportBody, weeklyReportController.createWeeklyReport);

router.get('/:reportId', verifySupabaseAuth, validateWeeklyReportParams, weeklyReportController.getWeeklyReport);
router.patch('/:reportId', verifySupabaseAuth, validateWeeklyReportParams, validateWeeklyReportUpdateBody, weeklyReportController.updateWeeklyReport);
router.delete('/:reportId', verifySupabaseAuth, validateWeeklyReportParams, weeklyReportController.deleteWeeklyReport);

router.post('/:reportId/submit', verifySupabaseAuth, validateWeeklyReportParams, weeklyReportController.submitWeeklyReport);

// Faculty reviews sub-resources nested inside reportId
router.get('/:reportId/reviews', verifySupabaseAuth, validateWeeklyReportParams, weeklyReportController.getWeeklyReportReviews);
router.post('/:reportId/reviews', verifySupabaseAuth, validateWeeklyReportParams, validateFacultyReviewBody, weeklyReportController.submitFacultyReview);

module.exports = router;
