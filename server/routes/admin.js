const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Admin route to get all students with their details
router.get('/students', verifyToken, isAdmin, adminController.getAllStudentsWithDetails);

module.exports = router; 