// Controller: Phase 1G.5 Tenant Admin V2 Controller
// Thin HTTP adapter: extracts JWT claims and body values, delegates logic to adminService,
// and maps authorization / anti-enumeration responses to standardized HTTP statuses.

const adminService = require('../../services/v2/adminService');

const handleControllerError = (err, res, actionName) => {
  console.error(`[v2] ${actionName} error:`, err.message, err.code || '');

  const msg = err.message || '';
  const code = err.code || '';

  // 0. Explicit error status override
  if (err.status) {
    return res.status(err.status).json({ message: msg });
  }

  // 1. Authorization / Permission Denied
  if (code === '42501' || msg.includes('Forbidden') || msg.includes('permission denied') || msg.includes('not an authorized Tenant Admin')) {
    return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
  }

  // 2. Resource not found
  if (code === 'P0002' || msg.includes('not found') || msg.includes('No rows returned')) {
    return res.status(404).json({ message: 'Requested resource not found or access denied' });
  }

  // 3. Bad Request / Validation error
  if (code === '23503' || code === '23505' || msg.includes('does not belong') || msg.includes('Invalid') || msg.includes('required')) {
    return res.status(400).json({ message: `Bad Request: ${msg}` });
  }

  // Default server error
  return res.status(500).json({ message: `Internal server error: ${msg}` });
};

// GET /api/v2/admin/overview
const getOverview = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const overview = await adminService.getAdminOverview(token, userId);

    if (!overview) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({ data: overview });
  } catch (err) {
    handleControllerError(err, res, 'getOverview');
  }
};

// GET /api/v2/admin/students
const getStudents = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.getAdminStudents(token, userId, req.query);

    if (!result) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    handleControllerError(err, res, 'getStudents');
  }
};

// GET /api/v2/admin/students/:studentId
const getStudentDetail = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { studentId } = req.params;

    const detail = await adminService.getAdminStudentDetail(token, userId, studentId);

    if (!detail) {
      return res.status(404).json({ message: 'Student not found or access denied' });
    }

    res.status(200).json({ data: detail });
  } catch (err) {
    handleControllerError(err, res, 'getStudentDetail');
  }
};

// GET /api/v2/admin/internships
const getInternships = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.getAdminInternships(token, userId, req.query);

    if (!result) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    handleControllerError(err, res, 'getInternships');
  }
};

// GET /api/v2/admin/faculty
const getFaculty = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const faculty = await adminService.getAdminFaculty(token, userId);

    if (!faculty) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({ data: faculty });
  } catch (err) {
    handleControllerError(err, res, 'getFaculty');
  }
};

// GET /api/v2/admin/mentors
const getMentors = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const mentors = await adminService.getAdminMentors(token, userId);

    if (!mentors) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({ data: mentors });
  } catch (err) {
    handleControllerError(err, res, 'getMentors');
  }
};

// GET /api/v2/admin/academic-structure
const getAcademicStructure = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const structure = await adminService.getAdminAcademicStructure(token, userId);

    if (!structure) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({ data: structure });
  } catch (err) {
    handleControllerError(err, res, 'getAcademicStructure');
  }
};

// ── ACADEMIC STRUCTURE MUTATIONS ─────────────────────────────────────────────
const createDepartment = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { name } = req.body;

    const dept = await adminService.createDepartment(token, userId, name);
    res.status(201).json({ data: dept });
  } catch (err) {
    handleControllerError(err, res, 'createDepartment');
  }
};

const updateDepartment = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { departmentId } = req.params;
    const { name } = req.body;

    const dept = await adminService.updateDepartment(token, userId, departmentId, name);
    res.status(200).json({ data: dept });
  } catch (err) {
    handleControllerError(err, res, 'updateDepartment');
  }
};

const createProgram = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { department_id, name } = req.body;

    const prog = await adminService.createProgram(token, userId, department_id, name);
    res.status(201).json({ data: prog });
  } catch (err) {
    handleControllerError(err, res, 'createProgram');
  }
};

const updateProgram = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { programId } = req.params;
    const { name } = req.body;

    const prog = await adminService.updateProgram(token, userId, programId, name);
    res.status(200).json({ data: prog });
  } catch (err) {
    handleControllerError(err, res, 'updateProgram');
  }
};

const createBatch = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { program_id, name } = req.body;

    const batch = await adminService.createBatch(token, userId, program_id, name);
    res.status(201).json({ data: batch });
  } catch (err) {
    handleControllerError(err, res, 'createBatch');
  }
};

const updateBatch = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { batchId } = req.params;
    const { name } = req.body;

    const batch = await adminService.updateBatch(token, userId, batchId, name);
    res.status(200).json({ data: batch });
  } catch (err) {
    handleControllerError(err, res, 'updateBatch');
  }
};

// ── COMPANY MUTATIONS ────────────────────────────────────────────────────────
const getCompanies = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const companies = await adminService.getAdminCompanies(token, userId);
    res.status(200).json({ data: companies });
  } catch (err) {
    handleControllerError(err, res, 'getCompanies');
  }
};

const createCompany = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { name, website } = req.body;

    const company = await adminService.createCompany(token, userId, name, website);
    res.status(201).json({ data: company });
  } catch (err) {
    handleControllerError(err, res, 'createCompany');
  }
};

const updateCompany = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { companyId } = req.params;
    const { name, website } = req.body;

    const company = await adminService.updateCompany(token, userId, companyId, name, website);
    res.status(200).json({ data: company });
  } catch (err) {
    handleControllerError(err, res, 'updateCompany');
  }
};

// ── USER PROVISIONING ────────────────────────────────────────────────────────
const provisionStudent = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.provisionStudent(token, userId, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'provisionStudent');
  }
};

const provisionFaculty = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.provisionFaculty(token, userId, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'provisionFaculty');
  }
};

const provisionMentor = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.provisionMentor(token, userId, req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'provisionMentor');
  }
};

// ── FACULTY BATCH ASSIGNMENTS ────────────────────────────────────────────────
const assignFacultyToBatch = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { batchId } = req.params;
    const { faculty_user_id } = req.body;

    const result = await adminService.assignFacultyToBatch(token, userId, batchId, faculty_user_id);
    res.status(201).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'assignFacultyToBatch');
  }
};

const removeFacultyFromBatch = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { batchId, facultyUserId } = req.params;

    const result = await adminService.removeFacultyFromBatch(token, userId, batchId, facultyUserId);
    res.status(200).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'removeFacultyFromBatch');
  }
};

// ── INTERNSHIP & MENTOR ASSIGNMENTS ──────────────────────────────────────────
const createInternship = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const internship = await adminService.createInternship(token, userId, req.body);
    res.status(201).json({ data: internship });
  } catch (err) {
    handleControllerError(err, res, 'createInternship');
  }
};

const updateInternship = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;

    const internship = await adminService.updateInternship(token, userId, internshipId, req.body);
    res.status(200).json({ data: internship });
  } catch (err) {
    handleControllerError(err, res, 'updateInternship');
  }
};

const assignMentorToInternship = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId } = req.params;
    const { mentor_user_id, is_primary } = req.body;

    const assignment = await adminService.assignMentorToInternship(token, userId, internshipId, mentor_user_id, is_primary);
    res.status(201).json({ data: assignment });
  } catch (err) {
    handleControllerError(err, res, 'assignMentorToInternship');
  }
};

const removeMentorFromInternship = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const { internshipId, mentorUserId } = req.params;

    const result = await adminService.removeMentorFromInternship(token, userId, internshipId, mentorUserId);
    res.status(200).json({ data: result });
  } catch (err) {
    handleControllerError(err, res, 'removeMentorFromInternship');
  }
};

// GET /api/v2/admin/audit-logs
const getAuditLogs = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    const result = await adminService.getAdminAuditLogs(token, userId, req.query);

    if (!result) {
      return res.status(403).json({ message: 'Forbidden: User is not an authorized Tenant Admin for this tenant' });
    }

    res.status(200).json({
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    handleControllerError(err, res, 'getAuditLogs');
  }
};

module.exports = {
  getOverview,
  getStudents,
  getStudentDetail,
  getInternships,
  getFaculty,
  getMentors,
  getAcademicStructure,
  createDepartment,
  updateDepartment,
  createProgram,
  updateProgram,
  createBatch,
  updateBatch,
  getCompanies,
  createCompany,
  updateCompany,
  provisionStudent,
  provisionFaculty,
  provisionMentor,
  assignFacultyToBatch,
  removeFacultyFromBatch,
  createInternship,
  updateInternship,
  assignMentorToInternship,
  removeMentorFromInternship,
  getAuditLogs
};


