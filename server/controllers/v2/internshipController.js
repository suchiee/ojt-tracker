// Controller: Phase 1E.1 Internships Controller
// Thin HTTP adapter: extracts validated parameters, calls the service layer, and shapes the response.
// Business logic and database access live entirely in internshipService.js.

const internshipService = require('../../services/v2/internshipService');

// GET /api/v2/internships
const listInternships = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await internshipService.getInternshipsList(token, userId, req.query);

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('[v2] listInternships error:', err.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// GET /api/v2/internships/:id
const getInternship = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { id } = req.params;

    const internship = await internshipService.getInternshipDetail(token, userId, id);

    if (!internship) {
      // 404 for both "not found" and "access denied" — prevents resource enumeration
      return res.status(404).json({ message: 'Internship not found or access denied' });
    }

    res.status(200).json({ data: internship });
  } catch (err) {
    console.error('[v2] getInternship error:', err.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  listInternships,
  getInternship
};
