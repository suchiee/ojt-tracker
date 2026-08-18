// Router: Phase 1E.4 Faculty Router
// Defines endpoint routes for /api/v2/faculty reviews.

const express = require('express');
const router = express.Router();

const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { validateFacultyQueueParams } = require('../../validators/v2/logValidator');
const weeklyReportController = require('../../controllers/v2/weeklyReportController');
const facultyController = require('../../controllers/v2/facultyController');

// All endpoints require a valid Supabase JWT and query validations
router.get('/review-queue', verifySupabaseAuth, validateFacultyQueueParams, weeklyReportController.getFacultyReviewQueue);
router.get('/students', verifySupabaseAuth, facultyController.getAssignedStudents);

module.exports = router;
