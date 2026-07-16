const express = require('express');
const router = express.Router();
const trainingController = require('../controllers/trainingController');
const { verifyToken, isStudent, isAgency, isVerifiedAgency, canAccessStudent } = require('../middleware/auth');

// Student routes
router.post('/setup', 
  verifyToken, 
  isStudent, 
  trainingController.updateTrainingDetails
);

router.get('/details/:studentId?', 
  verifyToken, 
  canAccessStudent, 
  trainingController.getTrainingDetails
);

router.get('/progress',
  verifyToken,
  isStudent,
  trainingController.getProgressSummary
);

module.exports = router; 