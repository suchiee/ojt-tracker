// Router: Phase 1E.1 Internships Router
// Defines endpoint routes for /api/v2/internships mappings.

const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { validateInternshipParams, validateInternshipListParams } = require('../../validators/v2/internshipValidator');
const { listInternships, getInternship } = require('../../controllers/v2/internshipController');

// All endpoints require a valid Supabase JWT Bearer token
router.get('/', verifySupabaseAuth, validateInternshipListParams, listInternships);
router.get('/:id', verifySupabaseAuth, validateInternshipParams, getInternship);

module.exports = router;
