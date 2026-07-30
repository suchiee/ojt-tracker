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
