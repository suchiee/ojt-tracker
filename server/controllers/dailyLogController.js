const DailyLog = require('../models/DailyLog');
const TrainingDetails = require('../models/TrainingDetails');

// Create a new daily log
const createDailyLog = async (req, res) => {
  try {
    const { date, tasks, notes, totalHours } = req.body;
    const studentId = req.user._id;

    // Validate input
    if (!date || !tasks || !Array.isArray(tasks) || !totalHours) {
      return res.status(400).json({
        message: 'Invalid input',
        details: 'Date, tasks array, and total hours are required'
      });
    }

    // Validate tasks
    for (const task of tasks) {
      if (!task.description || !task.hours) {
        return res.status(400).json({
          message: 'Invalid task data',
          details: 'Each task must have a description and hours'
        });
      }
    }

    // Create the daily log
    const dailyLog = new DailyLog({
      student: studentId,
      date: new Date(date),
      tasks,
      notes: notes || '',
      totalHours
    });

    await dailyLog.save();

    // Update training details with completed hours
    const trainingDetails = await TrainingDetails.findOne({ student: studentId });
    if (trainingDetails) {
      trainingDetails.completedHours += totalHours;
      await trainingDetails.save();
    }

    res.status(201).json(dailyLog);
  } catch (error) {
    console.error('Error creating daily log:', error);
    res.status(500).json({
      message: 'Error creating daily log',
      error: error.message
    });
  }
};

// Get daily logs for a student
const getDailyLogs = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { startDate, endDate } = req.query;

    const query = { student: studentId };
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await DailyLog.find(query)
      .sort({ date: -1 })
      .limit(10);

    res.json(logs);
  } catch (error) {
    console.error('Error fetching daily logs:', error);
    res.status(500).json({
      message: 'Error fetching daily logs',
      error: error.message
    });
  }
};

// Get a single daily log
const getDailyLog = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const log = await DailyLog.findOne({
      _id: id,
      student: studentId
    });

    if (!log) {
      return res.status(404).json({
        message: 'Daily log not found'
      });
    }

    res.json(log);
  } catch (error) {
    console.error('Error fetching daily log:', error);
    res.status(500).json({
      message: 'Error fetching daily log',
      error: error.message
    });
  }
};

// Update a daily log
const updateDailyLog = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalHours, tasks } = req.body;
    const studentId = req.user._id;

    const log = await DailyLog.findOne({
      _id: id,
      student: studentId
    });

    if (!log) {
      return res.status(404).json({
        message: 'Daily log not found'
      });
    }

    // Update training details with the difference in hours
    const trainingDetails = await TrainingDetails.findOne({ student: studentId });
    if (trainingDetails) {
      const hoursDiff = totalHours - log.totalHours;
      trainingDetails.completedHours += hoursDiff;
      await trainingDetails.save();
    }

    // Update the log
    log.totalHours = totalHours;
    log.tasks = tasks;
    await log.save();

    res.json(log);
  } catch (error) {
    console.error('Error updating daily log:', error);
    res.status(500).json({
      message: 'Error updating daily log',
      error: error.message
    });
  }
};

// Delete a daily log
const deleteDailyLog = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user._id;

    const log = await DailyLog.findOne({
      _id: id,
      student: studentId
    });

    if (!log) {
      return res.status(404).json({
        message: 'Daily log not found'
      });
    }

    // Update training details by subtracting the hours
    const trainingDetails = await TrainingDetails.findOne({ student: studentId });
    if (trainingDetails) {
      trainingDetails.completedHours = Math.max(0, trainingDetails.completedHours - log.totalHours);
      await trainingDetails.save();
    }

    await log.deleteOne();
    res.json({ message: 'Daily log deleted successfully' });
  } catch (error) {
    console.error('Error deleting daily log:', error);
    res.status(500).json({
      message: 'Error deleting daily log',
      error: error.message
    });
  }
};

module.exports = {
  createDailyLog,
  getDailyLogs,
  getDailyLog,
  updateDailyLog,
  deleteDailyLog
}; 