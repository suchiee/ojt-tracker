// Script: server/scripts/test_raw_supabase_rest.js
// Tests raw HTTPS POST to Supabase Auth token endpoint

const axios = require('axios');

const SUPABASE_URL = 'https://rzzftlekrrizjvvwsnat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';

async function testRawRest() {
  console.log('=== TESTING RAW SUPABASE AUTH REST API ===');

  try {
    const res = await axios.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      email: 'suchitra.y.1206@gmail.com',
      password: 'WadiaAdmin2026!'
    }, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log('RAW REST Auth SUCCESS!');
    console.log('Access Token:', res.data.access_token.substring(0, 30) + '...');
    console.log('User Email  :', res.data.user.email);
  } catch (err) {
    console.error('RAW REST Auth ERROR:', err.response?.status, err.response?.data || err.message);
  }
}

testRawRest();
