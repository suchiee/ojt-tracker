// Router: Phase 1G.5 Tenant Admin V2 Routes
// Mount point: /api/v2/admin
// All routes are strictly protected by verifySupabaseAuth JWT verification.

const express = require('express');
const router = express.Router();
const { verifySupabaseAuth } = require('../../middleware/supabaseAuth');
const adminController = require('../../controllers/v2/adminController');
const {
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
} = require('../../validators/v2/adminValidator');

// Apply verifySupabaseAuth middleware to all /api/v2/admin routes
router.use(verifySupabaseAuth);

// GET /api/v2/admin/overview
router.get('/overview', adminController.getOverview);

// GET /api/v2/admin/audit-logs
router.get('/audit-logs', validateAuditLogsQuery, adminController.getAuditLogs);

// GET /api/v2/admin/students
router.get('/students', validateAdminQueryParams, adminController.getStudents);


// GET /api/v2/admin/students/:studentId
router.get('/students/:studentId', validateStudentIdParam, adminController.getStudentDetail);

// GET /api/v2/admin/internships
router.get('/internships', validateAdminQueryParams, adminController.getInternships);

// GET /api/v2/admin/faculty
router.get('/faculty', adminController.getFaculty);

// GET /api/v2/admin/mentors
router.get('/mentors', adminController.getMentors);

// GET /api/v2/admin/academic-structure
router.get('/academic-structure', adminController.getAcademicStructure);

// ── ACADEMIC STRUCTURE MUTATIONS ─────────────────────────────────────────────
router.post('/departments', validateDepartmentMutation, adminController.createDepartment);
router.patch('/departments/:departmentId', validateDepartmentMutation, adminController.updateDepartment);

router.post('/programs', validateProgramMutation, adminController.createProgram);
router.patch('/programs/:programId', validateProgramMutation, adminController.updateProgram);

router.post('/batches', validateBatchMutation, adminController.createBatch);
router.patch('/batches/:batchId', validateBatchMutation, adminController.updateBatch);

// ── COMPANY MUTATIONS ────────────────────────────────────────────────────────
router.get('/companies', adminController.getCompanies);
router.post('/companies', validateCreateCompany, adminController.createCompany);
router.patch('/companies/:companyId', validateUpdateCompany, adminController.updateCompany);

// ── USER PROVISIONING ────────────────────────────────────────────────────────
router.post('/provision/student', validateProvisionStudent, adminController.provisionStudent);
router.post('/provision/faculty', validateProvisionFaculty, adminController.provisionFaculty);
router.post('/provision/mentor', validateProvisionMentor, adminController.provisionMentor);

// ── FACULTY BATCH ASSIGNMENTS ────────────────────────────────────────────────
router.post('/batches/:batchId/faculty', validateFacultyAssignment, adminController.assignFacultyToBatch);
router.delete('/batches/:batchId/faculty/:facultyUserId', adminController.removeFacultyFromBatch);

// ── INTERNSHIP & MENTOR ASSIGNMENTS ──────────────────────────────────────────
router.post('/internships', validateCreateInternship, adminController.createInternship);
router.patch('/internships/:internshipId', validateUpdateInternship, adminController.updateInternship);

router.post('/internships/:internshipId/mentors', validateMentorAssignment, adminController.assignMentorToInternship);
router.delete('/internships/:internshipId/mentors/:mentorUserId', adminController.removeMentorFromInternship);

module.exports = router;

