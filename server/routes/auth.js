const express = require('express');
const router = express.Router();
const { register, login, getCurrentUser } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// Register new user
router.post('/register', register);

// Login user
router.post('/login', login);

// Get current user
router.get('/me', verifyToken, getCurrentUser);

module.exports = router; 