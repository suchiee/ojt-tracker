const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../middleware/supabaseAuth');
const { getMe, studentOnboard, adminInviteUser } = require('../controllers/authV2Controller');

// Secure router mapping for v2 authentication and profile queries
router.get('/me', verifySupabaseAuth, getMe);
router.post('/student/onboard', verifySupabaseAuth, studentOnboard);
router.post('/admin/invite', verifySupabaseAuth, adminInviteUser);

module.exports = router;
