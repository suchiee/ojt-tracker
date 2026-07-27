// Script: server/scripts/test_auth_signin.js
// Tests signInWithPassword for suchitra.y.1206@gmail.com against Production Supabase Auth

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://rzzftlekrrizjvvwsnat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';

async function testSignIn() {
  console.log('Testing Supabase Auth signInWithPassword...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'suchitra.y.1206@gmail.com',
    password: 'WadiaAdmin@2026'
  });

  if (error) {
    console.error('Sign in failed:', error.message, error);
  } else {
    console.log('Sign in SUCCESS!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
    console.log('Email Confirmed At:', data.user.email_confirmed_at);
  }
}

testSignIn();
