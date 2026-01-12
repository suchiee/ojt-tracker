const User = require('../models/User');
const TrainingDetails = require('../models/TrainingDetails');
const DailyLog = require('../models/DailyLog');

// Get all students with their training details, daily logs, and evaluations
exports.getAllStudentsWithDetails = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).lean();

    for (const student of students) {
      // Fetch training details manually since the reference might not be set in User
      const trainingDetails = await TrainingDetails.findOne({ student: student._id }).lean();
      student.trainingDetails = trainingDetails;

      // Fetch daily logs
      student.dailyLogs = await DailyLog.find({ student: student._id }).lean();

      // Fetch evaluations (assuming evaluations are part of trainingDetails)
      student.evaluations = student.trainingDetails ? student.trainingDetails.evaluations : [];
    }

    res.json(students);
  } catch (error) {
    console.error('Error fetching students with details:', error);
    res.status(500).json({ message: 'Error fetching students with details' });
  }
}; 