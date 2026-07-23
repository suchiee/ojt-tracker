// Service: Phase 1G.5 Admin V2 Client Service
// Integrates client React application with /api/v2/admin endpoints via shared apiV2 Axios instance.

import apiV2 from './apiV2';

export const getAdminOverview = async () => {
  const response = await apiV2.get('/admin/overview');
  return response.data;
};

export const getAdminStudents = async (params = {}) => {
  const response = await apiV2.get('/admin/students', { params });
  return response.data;
};

export const getAdminStudentDetail = async (studentId) => {
  const response = await apiV2.get(`/admin/students/${studentId}`);
  return response.data;
};

export const getAdminInternships = async (params = {}) => {
  const response = await apiV2.get('/admin/internships', { params });
  return response.data;
};

export const getAdminFaculty = async () => {
  const response = await apiV2.get('/admin/faculty');
  return response.data;
};

export const getAdminMentors = async () => {
  const response = await apiV2.get('/admin/mentors');
  return response.data;
};

export const getAdminAcademicStructure = async () => {
  const response = await apiV2.get('/admin/academic-structure');
  return response.data;
};

// ── ACADEMIC STRUCTURE MUTATIONS ─────────────────────────────────────────────
export const createDepartment = async (data) => {
  const response = await apiV2.post('/admin/departments', data);
  return response.data;
};

export const updateDepartment = async (departmentId, data) => {
  const response = await apiV2.patch(`/admin/departments/${departmentId}`, data);
  return response.data;
};

export const createProgram = async (data) => {
  const response = await apiV2.post('/admin/programs', data);
  return response.data;
};

export const updateProgram = async (programId, data) => {
  const response = await apiV2.patch(`/admin/programs/${programId}`, data);
  return response.data;
};

export const createBatch = async (data) => {
  const response = await apiV2.post('/admin/batches', data);
  return response.data;
};

export const updateBatch = async (batchId, data) => {
  const response = await apiV2.patch(`/admin/batches/${batchId}`, data);
  return response.data;
};

// ── COMPANY MUTATIONS ────────────────────────────────────────────────────────
export const getAdminCompanies = async () => {
  const response = await apiV2.get('/admin/companies');
  return response.data;
};

export const createCompany = async (data) => {
  const response = await apiV2.post('/admin/companies', data);
  return response.data;
};

export const updateCompany = async (companyId, data) => {
  const response = await apiV2.patch(`/admin/companies/${companyId}`, data);
  return response.data;
};

// ── USER PROVISIONING ────────────────────────────────────────────────────────
export const provisionStudent = async (data) => {
  const response = await apiV2.post('/admin/provision/student', data);
  return response.data;
};

export const provisionFaculty = async (data) => {
  const response = await apiV2.post('/admin/provision/faculty', data);
  return response.data;
};

export const provisionMentor = async (data) => {
  const response = await apiV2.post('/admin/provision/mentor', data);
  return response.data;
};

// ── FACULTY BATCH ASSIGNMENTS ────────────────────────────────────────────────
export const assignFacultyToBatch = async (batchId, facultyUserId) => {
  const response = await apiV2.post(`/admin/batches/${batchId}/faculty`, { faculty_user_id: facultyUserId });
  return response.data;
};

export const removeFacultyFromBatch = async (batchId, facultyUserId) => {
  const response = await apiV2.delete(`/admin/batches/${batchId}/faculty/${facultyUserId}`);
  return response.data;
};

// ── INTERNSHIP & MENTOR ASSIGNMENTS ──────────────────────────────────────────
export const createInternship = async (data) => {
  const response = await apiV2.post('/admin/internships', data);
  return response.data;
};

export const updateInternship = async (internshipId, data) => {
  const response = await apiV2.patch(`/admin/internships/${internshipId}`, data);
  return response.data;
};

export const assignMentorToInternship = async (internshipId, mentorUserId, isPrimary = false) => {
  const response = await apiV2.post(`/admin/internships/${internshipId}/mentors`, { mentor_user_id: mentorUserId, is_primary: isPrimary });
  return response.data;
};

export const removeMentorFromInternship = async (internshipId, mentorUserId) => {
  const response = await apiV2.delete(`/admin/internships/${internshipId}/mentors/${mentorUserId}`);
  return response.data;
};

export const getAuditLogs = async (params = {}) => {
  const response = await apiV2.get('/admin/audit-logs', { params });
  return response.data;
};

const adminV2Service = {
  getAdminOverview,
  getAdminStudents,
  getAdminStudentDetail,
  getAdminInternships,
  getAdminFaculty,
  getAdminMentors,
  getAdminAcademicStructure,
  createDepartment,
  updateDepartment,
  createProgram,
  updateProgram,
  createBatch,
  updateBatch,
  getAdminCompanies,
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

export default adminV2Service;


