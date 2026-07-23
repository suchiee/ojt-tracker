// Controller: Phase 1E.4 Weekly Reports & Faculty Review Controller
// Thin HTTP adapter: extracts JWT claims and body values, delegates logic to service,
// and maps database constraints & custom SQLSTATE codes to standardized HTTP responses.

const weeklyReportService = require('../../services/v2/weeklyReportService');

// Handles mapping database error codes to HTTP statuses
const handleControllerError = (err, res, actionName) => {
  console.error(`[v2] ${actionName} error:`, err.message, err.code || '');

  const msg = err.message || '';
  const code = err.code || '';

  // 1. UNIQUE constraint violations (e.g. log already linked or report already exists for Monday)
  if (code === '23505' || msg.includes('unique constraint') || msg.includes('already exists') || msg.includes('already linked')) {
    return res.status(409).json({ message: `Conflict: ${msg}` });
  }

  // 2. Resource not found or RLS/ACL access denied (maps to 404 to avoid resource enumeration)
  if (code === 'P0002' || code === '42501' || msg.includes('not found') || msg.includes('access denied') || msg.includes('No rows returned')) {
    return res.status(404).json({ message: 'Weekly report or internship not found or access denied' });
  }

  // 3. Bad request / parameter input violations
  if (
    code === 'D0010' || // date bounds validation / decision validation
    code === 'D0011' || // daily log validation
    msg.includes('must be a Monday') ||
    msg.includes('must be the corresponding Sunday') ||
    msg.includes('cannot start in the future') ||
    msg.includes('outside weekly report range') ||
    msg.includes('must be SUBMITTED or APPROVED')
  ) {
    return res.status(400).json({ message: `Bad Request: ${msg}` });
  }

  // 4. Workflow state lock & transition violations
  if (
    code === 'D0012' || // locked for editing / submit validations
    code === 'D0013' || // approved linked logs check
    msg.includes('locked for editing') ||
    msg.includes('reporting period has not ended yet') ||
    msg.includes('zero linked daily logs') ||
    msg.includes('not approved by mentor')
  ) {
    return res.status(422).json({ message: `Unprocessable Entity: ${msg}` });
  }

  // Default server error
  return res.status(500).json({ message: `Internal server error: ${msg}` });
};

// GET /api/v2/internships/:internshipId/weekly-reports
const listWeeklyReports = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;

    const reports = await weeklyReportService.getWeeklyReportsList(token, userId, internshipId, req.query);

    if (!reports) {
      return res.status(404).json({ message: 'Weekly report or internship not found or access denied' });
    }

    res.status(200).json({ data: reports });
  } catch (err) {
    handleControllerError(err, res, 'listWeeklyReports');
  }
};

// POST /api/v2/internships/:internshipId/weekly-reports
const createWeeklyReport = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;

    const report = await weeklyReportService.createWeeklyReport(token, userId, internshipId, req.body);

    res.status(201).json({ data: report });
  } catch (err) {
    handleControllerError(err, res, 'createWeeklyReport');
  }
};

// GET /api/v2/internships/:internshipId/weekly-reports/:reportId
const getWeeklyReport = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    const report = await weeklyReportService.getWeeklyReportDetail(token, userId, internshipId, reportId);

    if (!report) {
      return res.status(404).json({ message: 'Weekly report or internship not found or access denied' });
    }

    res.status(200).json({ data: report });
  } catch (err) {
    handleControllerError(err, res, 'getWeeklyReport');
  }
};

// PATCH /api/v2/internships/:internshipId/weekly-reports/:reportId
const updateWeeklyReport = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    const report = await weeklyReportService.updateWeeklyReport(token, userId, internshipId, reportId, req.body);

    res.status(200).json({ data: report });
  } catch (err) {
    handleControllerError(err, res, 'updateWeeklyReport');
  }
};

// DELETE /api/v2/internships/:internshipId/weekly-reports/:reportId
const deleteWeeklyReport = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    await weeklyReportService.deleteWeeklyReport(token, userId, internshipId, reportId);

    res.status(204).send();
  } catch (err) {
    handleControllerError(err, res, 'deleteWeeklyReport');
  }
};

// POST /api/v2/internships/:internshipId/weekly-reports/:reportId/submit
const submitWeeklyReport = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    const report = await weeklyReportService.submitWeeklyReport(token, userId, internshipId, reportId);

    res.status(200).json({ data: report });
  } catch (err) {
    handleControllerError(err, res, 'submitWeeklyReport');
  }
};

// GET /api/v2/faculty/review-queue
const getFacultyReviewQueue = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await weeklyReportService.getFacultyReviewQueue(token, userId, req.query);

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    handleControllerError(err, res, 'getFacultyReviewQueue');
  }
};

// GET /api/v2/internships/:internshipId/weekly-reports/:reportId/reviews
const getWeeklyReportReviews = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    const history = await weeklyReportService.getWeeklyReportReviews(token, userId, internshipId, reportId);

    if (!history) {
      return res.status(404).json({ message: 'Weekly report or internship not found or access denied' });
    }

    res.status(200).json({ data: history });
  } catch (err) {
    handleControllerError(err, res, 'getWeeklyReportReviews');
  }
};

// POST /api/v2/internships/:internshipId/weekly-reports/:reportId/reviews
const submitFacultyReview = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, reportId } = req.params;

    const review = await weeklyReportService.submitFacultyReview(token, userId, internshipId, reportId, req.body);

    if (!review) {
      return res.status(404).json({ message: 'Weekly report or internship not found or access denied' });
    }

    res.status(201).json({ data: review });
  } catch (err) {
    handleControllerError(err, res, 'submitFacultyReview');
  }
};

module.exports = {
  listWeeklyReports,
  createWeeklyReport,
  getWeeklyReport,
  updateWeeklyReport,
  deleteWeeklyReport,
  submitWeeklyReport,
  getFacultyReviewQueue,
  getWeeklyReportReviews,
  submitFacultyReview
};
