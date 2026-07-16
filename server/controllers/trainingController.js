const TrainingDetails = require('../models/TrainingDetails');
const DailyLog = require('../models/DailyLog');
const User = require('../models/User');

// Create or update training details
exports.updateTrainingDetails = async (req, res) => {
  try {
    const { agencyName, mentor, jobRole, startDate, endDate, totalHours } = req.body;
    const studentId = req.user._id;

    // Check if training details already exist
    let training = await TrainingDetails.findOne({ student: studentId });

    if (training) {
      // Update existing training details
      training.agencyName = agencyName;
      training.mentor = mentor;
      training.jobRole = jobRole;
      training.startDate = startDate;
      training.endDate = endDate;
      training.totalHours = totalHours;
    } else {
      // Create new training details
      training = new TrainingDetails({
        student: studentId,
        agencyName,
        mentor,
        jobRole,
        startDate,
        endDate,
        totalHours,
        completedHours: 0
      });
    }

    await training.save();

    // Link reference to User
    await User.findByIdAndUpdate(studentId, { trainingDetails: training._id });

    res.json(training);
  } catch (error) {
    console.error('Error updating training details:', error);
    res.status(500).json({ message: 'Error updating training details' });
  }
};

// Get training details for a student
exports.getTrainingDetails = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;

    // Check access permission
    const hasAccess = await req.user.canAccessStudent(studentId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: 'You do not have permission to access this student\'s training details' 
      });
    }

    const training = await TrainingDetails.findOne({ student: studentId })
      .populate('student', 'firstName lastName email studentId');

    if (!training) {
      return res.status(404).json({ message: 'Training details not found' });
    }

    res.json(training);
  } catch (error) {
    console.error('Error getting training details:', error);
    res.status(500).json({ message: 'Error retrieving training details' });
  }
};

// Submit agency feedback
exports.submitFeedback = async (req, res) => {
  try {
    const { studentId, rating, comment } = req.body;
    const agencyName = req.user.agencyName;

    const training = await TrainingDetails.findOne({ 
      student: studentId,
      agencyName: agencyName
    });

    if (!training) {
      return res.status(404).json({ 
        message: 'Training details not found or you do not have permission' 
      });
    }

    training.agencyFeedback.push({ rating, comment });
    await training.save();

    res.json(training);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Error submitting feedback' });
  }
};

// Update training status
exports.updateStatus = async (req, res) => {
  try {
    const { studentId, status } = req.body;
    const agencyName = req.user.agencyName;

    const training = await TrainingDetails.findOne({ 
      student: studentId,
      agencyName: agencyName
    });

    if (!training) {
      return res.status(404).json({ 
        message: 'Training details not found or you do not have permission' 
      });
    }

    training.status = status;
    await training.save();

    res.json(training);
  } catch (error) {
    console.error('Error updating training status:', error);
    res.status(500).json({ message: 'Error updating training status' });
  }
};

// Get progress summary
exports.getProgressSummary = async (req, res) => {
  try {
    const studentId = req.user._id;
    
    // Get user with populated training details
    let user = await User.findById(studentId).populate('trainingDetails');
    
    // Legacy-record fallback self-healing logic
    if (!user.trainingDetails) {
      const legacyTraining = await TrainingDetails.findOne({ student: studentId });
      if (legacyTraining) {
        user.trainingDetails = legacyTraining._id;
        await user.save();
        user = await User.findById(studentId).populate('trainingDetails');
      } else {
        return res.status(404).json({ message: 'Training details not found' });
      }
    }

    // Dynamic completed hours recalculation from authoritative DailyLog records
    const allLogs = await DailyLog.find({ student: studentId });
    const computedHours = allLogs.reduce((sum, log) => sum + log.totalHours, 0);
    
    if (user.trainingDetails.completedHours !== computedHours) {
      user.trainingDetails.completedHours = Math.max(0, computedHours);
      await TrainingDetails.findByIdAndUpdate(user.trainingDetails._id, { completedHours: user.trainingDetails.completedHours });
    }

    // Get recent daily logs
    const recentLogs = await DailyLog.find({ student: studentId })
      .sort({ date: -1 })
      .limit(5);

    // Calculate weekly progress
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const weeklyLogs = await DailyLog.find({
      student: studentId,
      date: { $gte: oneWeekAgo }
    });

    const weeklyHours = weeklyLogs.reduce((sum, log) => sum + log.totalHours, 0);

    // Calculate milestones
    const totalHours = user.trainingDetails.totalHours;
    const completedHours = user.trainingDetails.completedHours;
    
    const milestones = [
      { name: '25% Complete', target: totalHours * 0.25, completed: completedHours >= totalHours * 0.25 },
      { name: '50% Complete', target: totalHours * 0.5, completed: completedHours >= totalHours * 0.5 },
      { name: '75% Complete', target: totalHours * 0.75, completed: completedHours >= totalHours * 0.75 },
      { name: '100% Complete', target: totalHours, completed: completedHours >= totalHours }
    ];

    // Return the training details with all fields
    const response = {
      trainingDetails: user.trainingDetails.toObject(),
      recentLogs,
      weeklyProgress: {
        hours: weeklyHours,
        days: weeklyLogs.length
      },
      milestones
    };

    console.log('Progress summary response:', response);
    res.json(response);
  } catch (error) {
    console.log('Error in getProgressSummary:', error);
    res.status(500).json({ message: 'Error fetching progress summary', error: error.message });
  }
};