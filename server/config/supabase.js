const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://rzzftlekrrizjvvwsnat.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';

// User-context client factory (ensures PostgreSQL RLS is active using user JWT token)
const createUserContextClient = (jwtToken) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwtToken}`
      }
    }
  });
};

// Administrative client using service_role key (bypasses RLS for secure provisioning)
const getAdminClient = () => {
  if (!supabaseServiceKey) {
    throw new Error('Supabase Service Role Key is missing in server environment variables.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

module.exports = {
  createUserContextClient,
  getAdminClient
};
