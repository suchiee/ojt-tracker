const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    required: true,
  },
}, { _id: false });

const trainingDetailsSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  agencyName: {
    type: String,
    trim: true,
    required: false, // Make optional
  },
  mentor: {
    type: String,
    trim: true,
    required: false, // Make optional
  },
  jobRole: {
    type: String,
    trim: true,
    required: false, // Make optional
  },
  startDate: {
    type: Date,
    required: false, // Make optional
  },
  endDate: {
    type: Date,
    required: false, // Make optional
  },
  totalHours: {
    type: Number,
    required: false, // Make optional
    min: 0,
  },
  completedHours: {
    type: Number,
    default: 0,
    min: 0,
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
  },
  agencyFeedback: {
    type: [feedbackSchema],
    default: [],
  },
}, {
  timestamps: true,
});

// Index for efficient querying
trainingDetailsSchema.index({ student: 1, agencyName: 1 });
trainingDetailsSchema.index({ agencyName: 1, status: 1 });

module.exports = mongoose.model('TrainingDetails', trainingDetailsSchema);
