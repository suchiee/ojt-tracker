const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const TrainingDetails = require('../models/TrainingDetails');

async function syncUsers() {
  console.log('[MONGODB SYNC] Starting sync for frontend test users...');
  
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ccis-ojt-tracker');

  try {
    const createUser = async (email, firstName, lastName, role, studentId, course, year) => {
      let user = await User.findOne({ email });
      if (!user) {
        user = new User({
          email,
          firstName,
          lastName,
          role,
          password: 'StagingPassword123!',
          studentId: role === 'student' ? studentId : undefined,
          course: role === 'student' ? course : undefined,
          year: role === 'student' ? year : undefined
        });
        await user.save();
        console.log(`[MONGODB SYNC] Created user: ${email}`);
      } else {
        console.log(`[MONGODB SYNC] User already exists in MongoDB: ${email}`);
      }
      return user;
    };

    const student = await createUser(
      'front-student@integration.com',
      'FrontStudent',
      'FrontendTest',
      'student',
      'STU-FRONT-01',
      'MCA',
      '2'
    );

    await createUser(
      'front-mentor@integration.com',
      'FrontMentor',
      'FrontendTest',
      'student',
      'MENTOR-FRONT-01',
      'MCA',
      '2'
    );

    await createUser(
      'front-faculty@integration.com',
      'FrontFaculty',
      'FrontendTest',
      'coordinator'
    );

    await createUser(
      'front-admin@integration.com',
      'FrontAdmin',
      'FrontendTest',
      'admin'
    );

    // Create default TrainingDetails for student
    let details = await TrainingDetails.findOne({ student: student._id });
    if (!details) {
      details = new TrainingDetails({
        student: student._id,
        agencyName: 'Frontend Test Co',
        mentor: 'Front Mentor',
        jobRole: 'Software Engineer',
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // + 90 days
        totalHours: 150,
        completedHours: 0,
        status: 'active'
      });
      await details.save();

      student.trainingDetails = details._id;
      await student.save();
      console.log('[MONGODB SYNC] Created baseline TrainingDetails in MongoDB for student');
    } else {
      console.log('[MONGODB SYNC] TrainingDetails already exists for student');
    }

    console.log('[MONGODB SYNC] Sync completed successfully.');
  } catch (err) {
    console.error('[MONGODB SYNC] Error:', err.message);
  } finally {
    await mongoose.connection.close();
  }
}

syncUsers();
