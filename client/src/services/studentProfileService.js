import axios from 'axios';
import { supabase } from './supabaseClient';

const API_URL = '/api';

// Create axios instance with default headers
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    const legacyToken = localStorage.getItem('token');
    if (legacyToken) {
      config.headers.Authorization = `Bearer ${legacyToken}`;
    }
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