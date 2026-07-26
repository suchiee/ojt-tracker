// Service: Phase 2B studentProfileV2Service.js
// Connects frontend React components with V2 /api/v2/student/profile endpoints.

import apiV2 from './apiV2';

export const getStudentProfile = async () => {
  const response = await apiV2.get('/student/profile');
  return response.data;
};

export const updateStudentProfile = async (profileData) => {
  const response = await apiV2.post('/student/profile', {
    fullName: profileData.personalInfo?.fullName
  });
  return response.data;
};
