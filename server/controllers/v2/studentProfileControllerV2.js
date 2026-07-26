// Controller: Phase 2B studentProfileControllerV2.js
// Handles HTTP request shaping and validation for V2 student profile.

const studentProfileService = require('../../services/v2/studentProfileService');

// GET /api/v2/student/profile
const getStudentProfile = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    const profile = await studentProfileService.getStudentProfileData(token, userId);

    if (!profile) {
      return res.status(404).json({ message: 'Student profile not found or role is not student' });
    }

    res.status(200).json(profile);
  } catch (err) {
    console.error('[v2] getStudentProfile error:', err.message || err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/student/profile
const updateStudentProfile = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { fullName } = req.body;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    if (!fullName || fullName.trim() === '') {
      return res.status(400).json({ message: 'Full name is required for updates' });
    }

    const updatedProfile = await studentProfileService.updateStudentProfileData(token, userId, fullName);

    if (!updatedProfile) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    res.status(200).json(updatedProfile);
  } catch (err) {
    console.error('[v2] updateStudentProfile error:', err.message || err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getStudentProfile,
  updateStudentProfile
};
