// Validator: Phase 1E.1 Internships Validator
// Enforces UUID syntax checks, strict query parameter allowlists, and blocks privilege-escalation parameters.

const validateUuid = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const validateInternshipParams = (req, res, next) => {
  const { id } = req.params;

  if (id && !validateUuid(id)) {
    return res.status(400).json({ message: 'Invalid request: Malformed internship UUID' });
  }

  next();
};

const validateInternshipListParams = (req, res, next) => {
  const { page, limit, status, user_id, student_id, tenant_id, role } = req.query;

  // Strict Validation: Reject request if client attempts to pass security-sensitive query overrides
  if (user_id || student_id || tenant_id || role) {
    return res.status(400).json({
      message: 'Invalid request: Direct query override fields (user_id, student_id, tenant_id, role) are strictly forbidden'
    });
  }

  // Page and Limit parameter validation
  if (page) {
    const pageVal = parseInt(page, 10);
    if (isNaN(pageVal) || pageVal < 1) {
      return res.status(400).json({ message: 'Invalid request: page must be a positive integer' });
    }
  }

  if (limit) {
    const limitVal = parseInt(limit, 10);
    if (isNaN(limitVal) || limitVal < 1 || limitVal > 100) {
      return res.status(400).json({ message: 'Invalid request: limit must be an integer between 1 and 100' });
    }
  }

  // Filter validation
  if (status && status !== 'ACTIVE' && status !== 'COMPLETED') {
    return res.status(400).json({ message: 'Invalid request: status filter must be either ACTIVE or COMPLETED' });
  }

  next();
};

module.exports = {
  validateInternshipParams,
  validateInternshipListParams
};
