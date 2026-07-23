import apiV2 from './apiV2';

export const getDailyLogs = (internshipId, params) => {
  return apiV2.get(`/internships/${internshipId}/logs`, { params }).then(res => res.data);
};

export const getDailyLog = (internshipId, logId) => {
  return apiV2.get(`/internships/${internshipId}/logs/${logId}`).then(res => res.data);
};

export const createDailyLog = (internshipId, payload) => {
  return apiV2.post(`/internships/${internshipId}/logs`, payload).then(res => res.data);
};

export const updateDailyLog = (internshipId, logId, payload) => {
  return apiV2.patch(`/internships/${internshipId}/logs/${logId}`, payload).then(res => res.data);
};

export const deleteDailyLog = (internshipId, logId) => {
  return apiV2.delete(`/internships/${internshipId}/logs/${logId}`).then(res => res.data);
};

export const submitDailyLog = (internshipId, logId) => {
  return apiV2.post(`/internships/${internshipId}/logs/${logId}/submit`).then(res => res.data);
};

export const getDailyLogReviews = (internshipId, logId) => {
  return apiV2.get(`/internships/${internshipId}/logs/${logId}/reviews`).then(res => res.data);
};

export const getLogReviewsHistory = (internshipId, logId) => {
  return apiV2.get(`/internships/${internshipId}/logs/${logId}/reviews`).then(res => res.data);
};

export const getMentorReviewQueue = (params) => {
  return apiV2.get('/mentor/review-queue', { params }).then(res => res.data);
};

export const submitMentorReview = (internshipId, logId, payload) => {
  return apiV2.post(`/internships/${internshipId}/logs/${logId}/reviews`, payload).then(res => res.data);
};

