const mongoose = require('mongoose');
const TrainingDetails = require('../models/TrainingDetails');
const User = require('../models/User');
require('dotenv').config();

async function checkTrainingData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const trainings = await TrainingDetails.find({})
      .populate('agency', 'companyName')
      .populate('student', 'firstName lastName');

    console.log('\nTraining Details:');
    trainings.forEach(training => {
      console.log('\n-------------------');
      console.log('ID:', training._id);
      console.log('Student:', training.student ? 
        `${training.student.firstName} ${training.student.lastName}` : 
        'Not found');
      console.log('Agency:', typeof training.agency === 'string' ? 
        `String: ${training.agency}` : 
        training.agency ? 
          `Object: ${training.agency.companyName}` : 
          'Not found');
      console.log('Mentor:', typeof training.mentor === 'string' ? 
        `String: ${training.mentor}` : 
        training.mentor ? 
          `Object: ${JSON.stringify(training.mentor)}` : 
          'Not found');
      console.log('Status:', training.status);
      console.log('Hours:', `${training.completedHours}/${training.totalHours}`);
    });

  } catch (error) {
    console.error('Error checking training data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkTrainingData(); 