// Router: Phase 1E.2 Daily Logs Router
// Defines endpoint routes nested under /api/v2/internships/:internshipId/logs.

const express = require('express');
const router = express.Router({ mergeParams: true }); // Crucial for nesting (inherits :internshipId)

const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { validateLogParams, validateLogBody, validateReviewBody } = require('../../validators/v2/logValidator');
const logController = require('../../controllers/v2/logController');

// All endpoints require a valid Supabase JWT Bearer token and UUID format parameter validation
router.get('/', verifySupabaseAuth, validateLogParams, logController.listLogs);
router.post('/', verifySupabaseAuth, validateLogParams, validateLogBody, logController.createLog);
router.get('/:logId', verifySupabaseAuth, validateLogParams, logController.getLog);
router.patch('/:logId', verifySupabaseAuth, validateLogParams, validateLogBody, logController.updateLog);
router.delete('/:logId', verifySupabaseAuth, validateLogParams, logController.deleteLog);
router.post('/:logId/submit', verifySupabaseAuth, validateLogParams, logController.submitLog);

// Log review sub-resources
router.get('/:logId/reviews', verifySupabaseAuth, validateLogParams, logController.getReviewsHistory);
router.post('/:logId/reviews', verifySupabaseAuth, validateLogParams, validateReviewBody, logController.submitReview);

module.exports = router;
