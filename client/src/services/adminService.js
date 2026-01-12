import axios from 'axios';

const API_URL = '/api';

// Get auth token from localStorage
const getAuthToken = () => localStorage.getItem('token');

// Create axios instance with default config
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

// Get all students with their details
export const getAllStudents = async () => {
  try {
    const response = await api.get('/admin/students');
    return response.data;
  } catch (error) {
    console.error('Admin service - get students error:', error);
    throw error.response?.data?.message || 'Error fetching students';
  }
};

const adminService = {
  getAllStudents
};

export default adminService;