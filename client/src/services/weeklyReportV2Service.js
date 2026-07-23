import apiV2 from './apiV2';

// GET /api/v2/internships/:internshipId/weekly-reports
export const getWeeklyReports = (internshipId, params) =>
  apiV2.get(`/internships/${internshipId}/weekly-reports`, { params }).then(res => res.data);

// GET /api/v2/internships/:internshipId/weekly-reports/:reportId
export const getWeeklyReport = (internshipId, reportId) =>
  apiV2.get(`/internships/${internshipId}/weekly-reports/${reportId}`).then(res => res.data);

// POST /api/v2/internships/:internshipId/weekly-reports
export const createWeeklyReport = (internshipId, payload) =>
  apiV2.post(`/internships/${internshipId}/weekly-reports`, payload).then(res => res.data);

// PATCH /api/v2/internships/:internshipId/weekly-reports/:reportId
export const updateWeeklyReport = (internshipId, reportId, payload) =>
  apiV2.patch(`/internships/${internshipId}/weekly-reports/${reportId}`, payload).then(res => res.data);

// DELETE /api/v2/internships/:internshipId/weekly-reports/:reportId
export const deleteWeeklyReport = (internshipId, reportId) =>
  apiV2.delete(`/internships/${internshipId}/weekly-reports/${reportId}`).then(res => res.data);

// POST /api/v2/internships/:internshipId/weekly-reports/:reportId/submit
export const submitWeeklyReport = (internshipId, reportId) =>
  apiV2.post(`/internships/${internshipId}/weekly-reports/${reportId}/submit`).then(res => res.data);

// GET /api/v2/internships/:internshipId/weekly-reports/:reportId/reviews
export const getWeeklyReportReviews = (internshipId, reportId) =>
  apiV2.get(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`).then(res => res.data);

// POST /api/v2/internships/:internshipId/weekly-reports/:reportId/reviews
export const submitFacultyReview = (internshipId, reportId, payload) =>
  apiV2.post(`/internships/${internshipId}/weekly-reports/${reportId}/reviews`, payload).then(res => res.data);

// GET /api/v2/faculty/review-queue
export const getFacultyReviewQueue = (params) =>
  apiV2.get('/faculty/review-queue', { params }).then(res => res.data);
