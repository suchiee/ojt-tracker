const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../middleware/supabaseAuth');
const { getMe, studentOnboard, consumeInvite, adminInviteUser, devLogin } = require('../controllers/authV2Controller');

// Secure router mapping for v2 authentication and profile queries
router.get('/me', verifySupabaseAuth, getMe);
router.post('/student/onboard', verifySupabaseAuth, studentOnboard);
router.post('/invite/consume', verifySupabaseAuth, consumeInvite);
router.post('/admin/invite', verifySupabaseAuth, adminInviteUser);

// Conditional dev-login route: only available when LOCAL_JWT_DEV_MODE=true and NOT in production
if (process.env.LOCAL_JWT_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', devLogin);
}

module.exports = router;
