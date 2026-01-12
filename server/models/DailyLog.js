const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  tasks: [{
    description: {
      type: String,
      required: true
    },
    hours: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  notes: {
    type: String,
    default: ''
  },
  totalHours: {
    type: Number,
    required: true,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient querying
dailyLogSchema.index({ student: 1, date: -1 });

module.exports = mongoose.model('DailyLog', dailyLogSchema); 