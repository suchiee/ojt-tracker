// Router: Phase 2B V2 Student Router
// Maps /api/v2/student/* endpoint routes.

const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { getStudentProfile, updateStudentProfile } = require('../../controllers/v2/studentProfileControllerV2');

router.get('/profile', verifySupabaseAuth, getStudentProfile);
router.post('/profile', verifySupabaseAuth, updateStudentProfile);

module.exports = router;
