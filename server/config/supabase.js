const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isProduction = process.env.NODE_ENV === 'production';
const supabaseAnonKey = isProduction ? process.env.SUPABASE_ANON_KEY : (process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY);

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL environment variable is required.');
}
if (!supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY environment variable is required.');
}

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
