import axios from 'axios';

const API_URL = '/api';

// Get auth token from localStorage
const getAuthToken = () => localStorage.getItem('token');

// Create axios instance with default headers
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Get student profile
export const getStudentProfile = async () => {
  try {
    const response = await api.get('/student-profile');
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Error fetching student profile';
  }
};

// Update student profile
export const updateStudentProfile = async (profileData) => {
  try {
    const response = await api.post('/student-profile', profileData);
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Error updating student profile';
  }
}; 