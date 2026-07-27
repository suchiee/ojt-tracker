// Router: Phase 2B V2 Student Router
// Maps /api/v2/student/* endpoint routes.

const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const { getStudentProfile, updateStudentProfile } = require('../../controllers/v2/studentProfileControllerV2');
const { getTrainingSetup, updateTrainingSetup } = require('../../controllers/v2/trainingControllerV2');
const { validateTrainingSetupBody } = require('../../validators/v2/trainingSetupValidator');

router.get('/profile', verifySupabaseAuth, getStudentProfile);
router.post('/profile', verifySupabaseAuth, updateStudentProfile);

// Training Setup
router.get('/training', verifySupabaseAuth, getTrainingSetup);
router.post('/training', verifySupabaseAuth, validateTrainingSetupBody, updateTrainingSetup);
router.patch('/training', verifySupabaseAuth, validateTrainingSetupBody, updateTrainingSetup);

module.exports = router;
