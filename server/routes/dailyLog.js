const express = require('express');
const router = express.Router();
const { verifyToken: auth } = require('../middleware/auth');
const {
  createDailyLog,
  getDailyLogs,
  getDailyLog,
  updateDailyLog,
  deleteDailyLog
} = require('../controllers/dailyLogController');

// All routes require authentication
router.use(auth);

// Create a new daily log
router.post('/', createDailyLog);

// Get all daily logs for the authenticated student
router.get('/', getDailyLogs);

// Get a single daily log
router.get('/:id', getDailyLog);

// Update a daily log
router.put('/:id', updateDailyLog);

// Delete a daily log
router.delete('/:id', deleteDailyLog);

module.exports = router; 