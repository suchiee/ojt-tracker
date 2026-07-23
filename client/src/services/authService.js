import axios from 'axios';
import { supabase } from './supabaseClient';

// API URL
const API_URL = '/api';

// Create axios instance with default headers
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Register user
export const register = async (userData) => {
  try {
    console.log('Attempting to register with data:', userData);
    const response = await api.post('/auth/register', userData);
    console.log('Registration response:', response.data);
    
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  } catch (error) {
    console.error('Registration error:', error);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Data:", error.response.data);
      console.error("Status:", error.response.status);
      console.error("Headers:", error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("Request:", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error', error.message);
    }
    throw error.response?.data?.message || 'Registration failed';
  }
};

// Login user
export const login = async (email, password) => {
  try {
    console.log('Attempting to login with email:', email);
    const response = await api.post('/auth/login', { email, password });
    console.log('Login response:', response.data);
    
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userRole', response.data.user.role); // Store role separately for easy access
    }
    
    console.log('User email:', response.data.user.email);
    console.log('User role:', response.data.user.role);
    
    return response.data;
  } catch (error) {
    console.error('Login error:', error.response?.data || error);
    throw error.response?.data || { message: 'Login failed. Please check your credentials and try again.' };
  }
};

// Logout user
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// Get auth token from localStorage
const getAuthToken = () => localStorage.getItem('token');

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

// Get current user information
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Error fetching user information';
  }
};

// Get auth token
export const getToken = () => {
  return localStorage.getItem('token');
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!getToken();
};

// Set auth header for fetch requests
export const getAuthHeader = () => {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Initialize auth header - not needed with fetch
export const initAuthHeader = () => {
  // No-op for fetch
};

// Create an auth service object
const authService = {
  register,
  login,
  logout,
  getCurrentUser,
  getToken,
  isAuthenticated,
  getAuthHeader,
  initAuthHeader
};

export default authService;
