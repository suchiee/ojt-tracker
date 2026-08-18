import axios from 'axios';
import { supabase } from './supabaseClient';

const apiUrl = process.env.REACT_APP_API_URL;
if (!apiUrl) {
  throw new Error('REACT_APP_API_URL environment variable is required.');
}

const apiV2 = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to automatically attach local JWT token or Supabase JWT Bearer token
apiV2.interceptors.request.use(async (config) => {
  let token = null;
  if (process.env.NODE_ENV !== 'production') {
    token = localStorage.getItem('local_jwt_token');
  }
  
  if (!token) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        token = session.access_token;
      }
    } catch (e) {
      console.warn('Failed to retrieve Supabase session:', e);
    }
  }
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default apiV2;
