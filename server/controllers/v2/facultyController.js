const facultyService = require('../../services/v2/facultyService');

const getAssignedStudents = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await facultyService.getAssignedStudents(token, userId, req.query);

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('[v2] getAssignedStudents error:', err.message || err);
    if (err.status === 403 || err.message?.includes('Forbidden')) {
      return res.status(403).json({ message: err.message });
    }
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getAssignedStudents
};
