// Controller: Phase 2B.5 Training Setup Controller V2
// Handles HTTP requests for V2 training setup.

const trainingServiceV2 = require('../../services/v2/trainingServiceV2');

// GET /api/v2/student/training
const getTrainingSetup = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    const trainingData = await trainingServiceV2.getTrainingSetupData(token, userId);

    if (!trainingData) {
      return res.status(404).json({ message: 'Training setup details not found' });
    }

    res.status(200).json(trainingData);
  } catch (err) {
    console.error('[v2] getTrainingSetup error:', err.message || err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/student/training
const updateTrainingSetup = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    if (!token || !userId) {
      return res.status(401).json({ message: 'Unauthorized: Missing session tokens' });
    }

    const updatedData = await trainingServiceV2.updateTrainingSetupData(token, userId, req.body);

    res.status(200).json(updatedData);
  } catch (err) {
    console.error('[v2] updateTrainingSetup error:', err.message || err);

    if (err.code === 'U0001') {
      return res.status(403).json({ message: err.message });
    }
    if (err.code === 'I0002') {
      return res.status(422).json({ message: err.message });
    }

    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getTrainingSetup,
  updateTrainingSetup
};
