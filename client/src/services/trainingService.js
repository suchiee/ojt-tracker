import axios from 'axios';
import { supabase } from './supabaseClient';

// Create axios instance with default config
const api = axios.create({
  baseURL: '/api',
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

// Training details
export const updateTrainingDetails = async (details) => {
  try {
    console.log('Training service - update details:', details);
    
    // Ensure mentor field is included
    if (!details.mentor) {
      details.mentor = '';
    }
    
    const response = await api.post('/training/setup', details);
    console.log('Training service - update response:', response.data);
    
    // Ensure mentor field is in the response
    if (!response.data.mentor && details.mentor) {
      response.data.mentor = details.mentor;
    }
    
    return response.data;
  } catch (error) {
    console.error('Training service - update error:', error);
    throw error.response?.data || error.message;
  }
};

export const getTrainingDetails = async () => {
  try {
    const response = await api.get('/training/details/');
    console.log('Training service - get response:', response.data);
    
    // Ensure mentor field exists
    if (response.data && !response.data.mentor) {
      response.data.mentor = '';
    }
    
    return response.data;
  } catch (error) {
    console.error('Training service - get error:', error);
    throw error.response?.data || error.message;
  }
};

export const getProgressSummary = async () => {
  try {
    const response = await api.get('/training/progress');
    return response.data;
  } catch (error) {
    console.error('Training service - progress error:', error);
    throw error.response?.data || error.message;
  }
};

// Daily logs
export const createDailyLog = async (log) => {
  try {
    console.log('Training service - creating daily log:', log);
    const response = await api.post('/daily-log', log);
    console.log('Training service - daily log response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Training service - daily log error:', error);
    throw error.response?.data || error.message;
  }
};

export const getDailyLogs = async (startDate, endDate) => {
  try {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await api.get('/daily-log', { params });
    return response.data;
  } catch (error) {
    console.error('Training service - get logs error:', error);
    throw error.response?.data || error.message;
  }
};

export const getDailyLog = async (id) => {
  try {
    const response = await api.get(`/daily-log/${id}`);
    return response.data;
  } catch (error) {
    console.error('Training service - get log error:', error);
    throw error.response?.data || error.message;
  }
};

export const updateDailyLog = async (id, log) => {
  try {
    const response = await api.put(`/daily-log/${id}`, log);
    return response.data;
  } catch (error) {
    console.error('Training service - update log error:', error);
    throw error.response?.data || error.message;
  }
};

export const deleteDailyLog = async (id) => {
  try {
    const response = await api.delete(`/daily-log/${id}`);
    return response.data;
  } catch (error) {
    console.error('Training service - delete log error:', error);
    throw error.response?.data || error.message;
  }
};
