const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: function() { return this.role === 'student'; },
    trim: true
  },
  lastName: {
    type: String,
    required: function() { return this.role === 'student'; },
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'admin', 'coordinator'],
    required: true
  },
  // Student specific fields
  studentId: {
    type: String,
    trim: true,
    sparse: true,
    unique: true,
    validate: {
      validator: function(v) {
        return this.role !== 'student' || (v && v.length > 0);
      },
      message: 'Student ID is required for student accounts'
    }
  },
  course: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return this.role !== 'student' || (v && v.length > 0);
      },
      message: 'Course is required for student accounts'
    }
  },
  year: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return this.role !== 'student' || (v && v.length > 0);
      },
      message: 'Year is required for student accounts'
    }
  },
  // Common fields
  studentProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentProfile'
  },
  trainingDetails: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingDetails'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, studentId: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user can access a student's details
userSchema.methods.canAccessStudent = async function(studentId) {
  if (this.role === 'admin') return true;
  return this._id.equals(studentId);
};

module.exports = mongoose.model('User', userSchema);