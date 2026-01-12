const mongoose = require('mongoose');
const User = require('../models/User');
const TrainingDetails = require('../models/TrainingDetails');
require('dotenv').config();

async function debugStudentData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find a student
    const student = await User.findOne({ role: 'student' });
    if (!student) {
      console.log('No students found');
      return;
    }
    console.log('Found student:', student.firstName, student.lastName);

    // Find training details for this student
    const trainingDetails = await TrainingDetails.findOne({ student: student._id });
    console.log('Training Details found directly:', trainingDetails);

    // Test population like the controller does
    const populatedStudent = await User.findOne({ _id: student._id }).populate('trainingDetails');
    console.log('Populated Student Training Details:', populatedStudent.trainingDetails);
    
    // Check if the User model actually has the trainingDetails field reference
    console.log('Student object keys:', Object.keys(student.toObject()));
    
    // If trainingDetails is null in populated student, maybe the ref is missing in User document?
    if (!populatedStudent.trainingDetails) {
        console.log('WARNING: trainingDetails is null in populated student.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

debugStudentData();
