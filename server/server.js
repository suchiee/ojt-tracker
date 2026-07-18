const dotenv = require('dotenv');
// Load environment variables first — before any module that reads process.env at initialization time
dotenv.config();

const express = require('express');
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

// Initialize Express app
const app = express();

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/daily-log', dailyLogRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/v2/auth', authV2Routes);
app.use('/api/v2/internships', internshipV2Routes);
app.use('/api/v2/internships/:internshipId/logs', logsV2Routes);
app.use('/api/v2/mentor', mentorV2Routes);

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
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('CORS enabled for all origins');
});
