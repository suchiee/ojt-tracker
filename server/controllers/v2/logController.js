// Controller: Phase 1E.2 Daily Logs Controller
// Thin HTTP adapter: handles request extraction, executes business logic in service,
// and maps database constraints & custom SQLSTATE codes to standardized HTTP statuses.

const logService = require('../../services/v2/logService');

// Maps SQLSTATE or custom errors to standardized HTTP status codes
const handleControllerError = (err, res, actionName) => {
  console.error(`[v2] ${actionName} error:`, err.message, err.code || '');

  const msg = err.message || '';
  const code = err.code || '';

  // 1. UNIQUE constraint violation
  if (code === '23505' || msg.includes('unique constraint') || msg.includes('already exists')) {
    return res.status(409).json({ message: 'Conflict: A daily log already exists for this date' });
  }

  // 2. Resource not found or parent mismatch checks
  if (code === 'P0002' || msg.includes('not found') || msg.includes('No rows returned')) {
    return res.status(404).json({ message: 'Daily log or internship not found or access denied' });
  }

  // 3. Workflow lock / state transition errors
  if (
    code === 'D0001' || // locked for editing / draft delete rule
    code === 'D0002' || // submit state check
    code === 'D0003' || // internship ACTIVE state check
    code === 'D0004' || // task size limit
    code === 'D0005' || // max task count
    code === 'D0006' || // description empty
    code === 'D0007' || // description too long
    code === 'D0008' || // task hours > 24
    code === 'D0009' || // total hours > 24
    msg.includes('locked') ||
    msg.includes('state') ||
    msg.includes('status') ||
    msg.includes('hours') ||
    msg.includes('limit') ||
    msg.includes('description') ||
    msg.includes('at least one task')
  ) {
    return res.status(422).json({ message: `Unprocessable Entity: ${msg}` });
  }

  // 4. Default Internal Server Error
  return res.status(500).json({ message: 'Internal Server Error' });
};

// GET /api/v2/internships/:internshipId/logs
const listLogs = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;

    const result = await logService.getLogsList(token, userId, internshipId, req.query);

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    handleControllerError(err, res, 'listLogs');
  }
};

// POST /api/v2/internships/:internshipId/logs
const createLog = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;

    const log = await logService.createLog(token, userId, internshipId, req.body);

    res.status(201).json({ data: log });
  } catch (err) {
    handleControllerError(err, res, 'createLog');
  }
};

// GET /api/v2/internships/:internshipId/logs/:logId
const getLog = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, logId } = req.params;

    const log = await logService.getLogDetail(token, userId, internshipId, logId);

    if (!log) {
      return res.status(404).json({ message: 'Daily log or internship not found or access denied' });
    }

    res.status(200).json({ data: log });
  } catch (err) {
    handleControllerError(err, res, 'getLog');
  }
};

// PATCH /api/v2/internships/:internshipId/logs/:logId
const updateLog = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, logId } = req.params;

    const log = await logService.updateLog(token, userId, internshipId, logId, req.body);

    res.status(200).json({ data: log });
  } catch (err) {
    handleControllerError(err, res, 'updateLog');
  }
};

// DELETE /api/v2/internships/:internshipId/logs/:logId
const deleteLog = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, logId } = req.params;

    const deleted = await logService.deleteLog(token, userId, internshipId, logId);

    if (!deleted) {
      return res.status(404).json({ message: 'Daily log or internship not found or access denied' });
    }

    res.status(204).send();
  } catch (err) {
    handleControllerError(err, res, 'deleteLog');
  }
};

// POST /api/v2/internships/:internshipId/logs/:logId/submit
const submitLog = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, logId } = req.params;

    const log = await logService.submitLog(token, userId, internshipId, logId);

    res.status(200).json({ data: log });
  } catch (err) {
    handleControllerError(err, res, 'submitLog');
  }
};

module.exports = {
  listLogs,
  createLog,
  getLog,
  updateLog,
  deleteLog,
  submitLog
};
