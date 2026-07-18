// Router: Phase 1E.3 Mentor Reviews Router
// Defines endpoint routes for /api/v2/mentor reviews.

const express = require('express');
const router = express.Router();

const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { validateReviewQueueParams } = require('../../validators/v2/logValidator');
const logController = require('../../controllers/v2/logController');

// All endpoints require a valid Supabase JWT Bearer token and query parameter validation
router.get('/review-queue', verifySupabaseAuth, validateReviewQueueParams, logController.getReviewQueue);

module.exports = router;
