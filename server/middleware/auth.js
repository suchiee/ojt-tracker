const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Try legacy JWT first
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (err) {
      // Fall through to Supabase fallback
    }

    // Fallback: Verify using Supabase Auth (if configured)
    const { getAdminClient } = require('../config/supabase');
    const supabase = getAdminClient();
    if (supabase) {
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
      if (!error && supabaseUser && supabaseUser.email) {
        const user = await User.findOne({ email: supabaseUser.email });
        if (user) {
          req.user = user;
          return next();
        }
      }
    }

    return res.status(401).json({ message: 'User not found or unauthorized token' });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Check if user has any of the specified roles
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

// Check if user is a student
const isStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Access denied. Student role required.' });
  }
  next();
};

// Check if user is an admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin role required.' });
  }
  next();
};

// Check if user can access student details
const canAccessStudent = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.body.studentId;
    
    // If no studentId provided, assume user is accessing their own details
    if (!studentId) {
      if (req.user.role === 'student') {
        return next();
      }
      return res.status(400).json({ message: 'Student ID is required' });
    }

    const hasAccess = await req.user.canAccessStudent(studentId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to access this student\'s details.' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Error checking access permissions' });
  }
};

module.exports = {
  verifyToken,
  checkRole,
  isStudent,
  isAdmin,
  canAccessStudent
}; 