import apiV2 from './apiV2';

export const getEvaluation = (internshipId) => {
  return apiV2.get(`/internships/${internshipId}/evaluation`).then(res => res.data);
};

export const submitEvaluation = (internshipId, formData) => {
  return apiV2.post(`/internships/${internshipId}/evaluation`, formData).then(res => res.data);
};
