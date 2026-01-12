const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register new user
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, studentId, course, year } = req.body;
    
    console.log('Registration request received:', { 
      firstName,
      lastName,
      email, 
      role, 
      studentId, 
      course, 
      year
    });

    // Validate required fields
    if (!email || !password || !role) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        details: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined,
          role: !role ? 'Role is required' : undefined
        }
      });
    }

    // Validate role
    if (!['student', 'admin'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role',
        details: 'Role must be one of: student, admin'
      });
    }

    // Validate role-specific fields
    if (role === 'student') {
      if (!studentId || !course || !year || !firstName || !lastName) {
        return res.status(400).json({
          message: 'Missing required student fields',
          details: {
            studentId: !studentId ? 'Student ID is required' : undefined,
            course: !course ? 'Course is required' : undefined,
            year: !year ? 'Year is required' : undefined,
            firstName: !firstName ? 'First name is required' : undefined,
            lastName: !lastName ? 'Last name is required' : undefined
          }
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Check if student ID already exists
    if (role === 'student' && studentId) {
      const existingStudent = await User.findOne({ studentId });
      if (existingStudent) {
        return res.status(400).json({ message: 'User already exists with this Student ID' });
      }
    }

    // Check admin registration key
    if (role === 'admin') {
      const adminKey = req.body.adminKey;
      if (!adminKey || adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
        return res.status(403).json({ message: 'Invalid or missing admin registration key' });
      }
    }

    // Check if an admin already exists
    // if (role === 'admin') {
    //   const existingAdmin = await User.findOne({ role: 'admin' });
    //   if (existingAdmin) {
    //     return res.status(400).json({ message: 'An admin user already exists. Only one admin is allowed.' });
    //   }
    // }

    // Create new user based on role
    const userData = {
      email,
      password,
      role,
      firstName,
      lastName
    };

    // Add role-specific fields
    if (role === 'student') {
      userData.studentId = studentId;
      userData.course = course;
      userData.year = year;
    }

    console.log('Creating user with data:', { ...userData, password: '[REDACTED]' });

    // Create new user
    const user = new User(userData);
    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Return user data without password
    const userResponse = {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      ...(role === 'student' && { 
        studentId: user.studentId, 
        course: user.course, 
        year: user.year
      })
    };

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error registering user', 
      error: error.message 
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Return user data without password
    const userResponse = {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.role === 'student' && { 
        studentId: user.studentId, 
        course: user.course, 
        year: user.year
      }),
      ...(user.role === 'agency' && { 
        name: user.name,
        agencyName: user.agencyName,
        isVerified: user.isVerified
      })
    };

    res.json({
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Error logging in', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user data without password
    const userResponse = {
      id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.role === 'student' && { 
        studentId: user.studentId, 
        course: user.course, 
        year: user.year
      }),
      ...(user.role === 'agency' && { 
        name: user.name,
        agencyName: user.agencyName,
        isVerified: user.isVerified
      })
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ 
      message: 'Error fetching user', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser
};
