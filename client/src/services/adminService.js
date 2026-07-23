import axios from 'axios';
import { supabase } from './supabaseClient';

const API_URL = '/api';

// Create axios instance with default config
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