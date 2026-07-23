// Validator: Phase 1G.5 Admin V2 Validator
// Validates query parameters, pagination bounds, UUID formats, and search inputs for Admin endpoints.

const { body, query, param, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Bad Request: Invalid input parameters',
      errors: errors.array().map(e => ({ param: e.path, msg: e.msg }))
    });
  }
  next();
};

const validateAdminQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search parameter must be 100 characters or less'),
  query('program_id')
    .optional()
    .isUUID()
    .withMessage('program_id must be a valid UUID'),
  query('batch_id')
    .optional()
    .isUUID()
    .withMessage('batch_id must be a valid UUID'),
  query('status')
    .optional()
    .isString()
    .withMessage('status must be a valid string'),
  query(['tenant_id', 'user_id', 'role']).custom((val) => {
    if (val !== undefined) {
      throw new Error('Overriding tenant_id, user_id, or role is strictly forbidden');
    }
    return true;
  }),
  handleValidationErrors
];


const validateStudentIdParam = [
  param('studentId')
    .isUUID()
    .withMessage('studentId must be a valid UUID'),
  handleValidationErrors
];

const validateDepartmentMutation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Department name is required and must be 255 characters or less'),
  handleValidationErrors
];

const validateProgramMutation = [
  body('department_id')
    .isUUID()
    .withMessage('department_id must be a valid UUID'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Program name is required and must be 255 characters or less'),
  handleValidationErrors
];

const validateBatchMutation = [
  body('program_id')
    .isUUID()
    .withMessage('program_id must be a valid UUID'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Batch name is required and must be 255 characters or less'),
  handleValidationErrors
];

const validateCreateCompany = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Company name is required and must be 255 characters or less'),
  body('website')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Website must be 255 characters or less'),
  handleValidationErrors
];

const validateUpdateCompany = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Company name must be 255 characters or less'),
  body('website')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Website must be 255 characters or less'),
  handleValidationErrors
];

const validateProvisionStudent = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('first_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('first_name is required'),
  body('last_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('last_name is required'),
  body('student_id_number')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('student_id_number is required'),
  body('batch_id')
    .isUUID()
    .withMessage('batch_id must be a valid UUID'),
  handleValidationErrors
];

const validateProvisionFaculty = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('first_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('first_name is required'),
  body('last_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('last_name is required'),
  body('batch_ids')
    .optional()
    .isArray()
    .withMessage('batch_ids must be an array of UUIDs'),
  handleValidationErrors
];

const validateProvisionMentor = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('A valid email address is required'),
  body('first_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('first_name is required'),
  body('last_name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('last_name is required'),
  handleValidationErrors
];

const validateFacultyAssignment = [
  param('batchId')
    .isUUID()
    .withMessage('batchId must be a valid UUID'),
  body('faculty_user_id')
    .isUUID()
    .withMessage('faculty_user_id must be a valid UUID'),
  handleValidationErrors
];

const validateCreateInternship = [
  body('student_id')
    .isUUID()
    .withMessage('student_id must be a valid UUID'),
  body('company_id')
    .isUUID()
    .withMessage('company_id must be a valid UUID'),
  body('job_role')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('job_role is required'),
  body('start_date')
    .isISO8601()
    .withMessage('start_date must be a valid ISO8601 date'),
  body('end_date')
    .isISO8601()
    .withMessage('end_date must be a valid ISO8601 date'),
  body('total_hours')
    .isInt({ min: 1 })
    .withMessage('total_hours must be a positive integer'),
  body('status')
    .optional()
    .isIn(['DRAFT', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'ELIGIBLE_FOR_COMPLETION', 'COMPLETED', 'REJECTED'])
    .withMessage('Invalid internship status'),
  handleValidationErrors
];

const validateUpdateInternship = [
  param('internshipId')
    .isUUID()
    .withMessage('internshipId must be a valid UUID'),
  body('job_role')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 }),
  body('start_date')
    .optional()
    .isISO8601(),
  body('end_date')
    .optional()
    .isISO8601(),
  body('total_hours')
    .optional()
    .isInt({ min: 1 }),
  body('status')
    .optional()
    .isIn(['DRAFT', 'PENDING_VERIFICATION', 'APPROVED', 'ACTIVE', 'ELIGIBLE_FOR_COMPLETION', 'COMPLETED', 'REJECTED']),
  handleValidationErrors
];

const validateMentorAssignment = [
  param('internshipId')
    .isUUID()
    .withMessage('internshipId must be a valid UUID'),
  body('mentor_user_id')
    .isUUID()
    .withMessage('mentor_user_id must be a valid UUID'),
  handleValidationErrors
];

const validateAuditLogsQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100'),
  query('action')
    .optional()
    .isString()
    .trim(),
  query('target_table')
    .optional()
    .isString()
    .trim(),
  query('target_id')
    .optional()
    .isUUID()
    .withMessage('target_id must be a valid UUID'),
  query('actor_id')
    .optional()
    .isUUID()
    .withMessage('actor_id must be a valid UUID'),
  query('start_date')
    .optional()
    .isISO8601()
    .withMessage('start_date must be a valid ISO date'),
  query('end_date')
    .optional()
    .isISO8601()
    .withMessage('end_date must be a valid ISO date'),
  query(['tenant_id', 'user_id', 'role']).custom((val) => {
    if (val !== undefined) {
      throw new Error('Overriding tenant_id, user_id, or role is strictly forbidden');
    }
    return true;
  }),
  handleValidationErrors
];

module.exports = {
  validateAdminQueryParams,
  validateStudentIdParam,
  validateDepartmentMutation,
  validateProgramMutation,
  validateBatchMutation,
  validateCreateCompany,
  validateUpdateCompany,
  validateProvisionStudent,
  validateProvisionFaculty,
  validateProvisionMentor,
  validateFacultyAssignment,
  validateCreateInternship,
  validateUpdateInternship,
  validateMentorAssignment,
  validateAuditLogsQuery
};


