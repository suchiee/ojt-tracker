import apiV2 from './apiV2';

export const getInternships = () => {
  return apiV2.get('/internships').then(res => res.data);
};

export const getInternshipById = (internshipId) => {
  return apiV2.get(`/internships/${internshipId}`).then(res => res.data);
};
