const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  SUPABASE_URL,
  REACT_APP_SUPABASE_ANON_KEY
} = process.env;

async function verifyAuthMe() {
  const supabase = createClient(SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    console.log('[VERIFY] Logging in front-mentor...');
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: 'front-mentor@integration.com',
      password: 'StagingPassword123!'
    });

    if (error || !authData.session) {
      throw new Error(`Login failed: ${error?.message}`);
    }

    const token = authData.session.access_token;
    console.log('[VERIFY] Successfully obtained JWT token.');

    console.log('[VERIFY] Querying GET /api/v2/auth/me...');
    const response = await axios.get('http://localhost:5003/api/v2/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('\n--- GET /api/v2/auth/me Response ---');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('------------------------------------\n');

  } catch (err) {
    console.error('[VERIFY] Error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
}

verifyAuthMe();
