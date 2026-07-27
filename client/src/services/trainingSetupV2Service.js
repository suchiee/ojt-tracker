// Service: Phase 2B.5 trainingSetupV2Service.js
// Connects frontend React components with V2 /api/v2/student/training endpoints.

import apiV2 from './apiV2';

export const getTrainingDetails = async () => {
  const response = await apiV2.get('/student/training');
  return response.data;
};

export const updateTrainingDetails = async (details) => {
  const response = await apiV2.post('/student/training', details);
  return response.data;
};
