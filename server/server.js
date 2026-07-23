const dotenv = require('dotenv');
const path = require('path');
// Load environment variables first — before any module that reads process.env at initialization time
dotenv.config({ path: path.join(__dirname, '.env') });
require('./config/env');

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const trainingRoutes = require('./routes/training');
const dailyLogRoutes = require('./routes/dailyLog');
const adminRoutes = require('./routes/admin');
const authV2Routes = require('./routes/authV2');
const internshipV2Routes = require('./routes/v2/internships');
const logsV2Routes = require('./routes/v2/logs');
const mentorV2Routes = require('./routes/v2/mentor');
const weeklyReportsV2Routes = require('./routes/v2/weeklyReports');
const facultyV2Routes = require('./routes/v2/faculty');
const adminV2Routes = require('./routes/v2/admin');

// Initialize Express app
const app = express();

// Security Headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Prevent breaking inline assets or Supabase Cloud connections in dev/testing
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration (Environment-driven allowed origins)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (such as mobile apps, curl, server-to-server, test scripts)
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Structured HTTP request logging (Morgan) - exclude tokens/passwords automatically
app.use(morgan('combined', {
  skip: (req) => req.path === '/api/v2/healthz'
}));

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true' ? 10000 : 30,
  message: { message: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true' ? 10000 : 100,
  message: { message: 'Too many administrative mutation requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware - Request body size limits
// V2 endpoints are hardened to 1mb body limits
app.use('/api/v2', express.json({ limit: '1mb' }));
app.use('/api/v2', express.urlencoded({ extended: true, limit: '1mb' }));

// Legacy V1 endpoints retain existing limit for backwards compatibility
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ccis-ojt-tracker')
  .then(() => {
    console.log('Connected to MongoDB');
    const db = mongoose.connection;
    console.log('Database Name:', db.name);
    console.log('Host:', db.host);
    console.log('Port:', db.port);
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Health check endpoint (Public, unauthenticated, exempt from rate limits)
app.get('/api/v2/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Apply Rate Limiters to sensitive routes
app.use('/api/v2/auth/student-onboard', authLimiter);
app.use('/api/v2/auth/admin/invite', authLimiter);
app.use('/api/v2/admin/provision', adminMutationLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/daily-log', dailyLogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v2/auth', authV2Routes);
app.use('/api/v2/internships', internshipV2Routes);
app.use('/api/v2/internships/:internshipId/logs', logsV2Routes);
app.use('/api/v2/mentor', mentorV2Routes);
app.use('/api/v2/internships/:internshipId/weekly-reports', weeklyReportsV2Routes);
app.use('/api/v2/faculty', facultyV2Routes);
app.use('/api/v2/admin', adminV2Routes);

// Root route
app.get('/', (req, res) => {
  console.log('Root route hit');
  res.json({ message: 'Welcome to CCIS OJT Tracker API' });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'CORS forbidden: Origin not allowed' });
  }
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Security hardening, rate limiting, and CORS configured');
});

