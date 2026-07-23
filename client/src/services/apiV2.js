import axios from 'axios';
import { supabase } from './supabaseClient';

const apiV2 = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://internsync-api-vjil.onrender.com/api/v2',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to automatically attach Supabase JWT Bearer token
apiV2.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default apiV2;
