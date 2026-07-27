// Script: server/scripts/inspect_auth_user.js
// Inspects the exact Supabase Auth user record and tests signInWithPassword with full debugging

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://rzzftlekrrizjvvwsnat.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDgwMTYwMSwiZXhwIjoyMTAwMzc3NjAxfQ.Cedo2ELruXwRZcUvrBwM-6htJSSrrnlwk5vJ2K7DF4E';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6emZ0bGVrcnJpemp2dndzbmF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDE2MDEsImV4cCI6MjEwMDM3NzYwMX0.3cYI_ziET6NYaQuudebEd7JH-Gg3D_gmM24V7fv-nSw';

async function inspectUser() {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: { users }, error } = await adminClient.auth.admin.listUsers();
  if (error) {
    console.error('listUsers error:', error);
    return;
  }

  console.log('--- ALL AUTH USERS IN PRODUCTION SUPABASE ---');
  users.forEach(u => {
    console.log(`ID: ${u.id} | Email: "${u.email}" | Confirmed: ${u.email_confirmed_at} | Phone: ${u.phone}`);
  });

  console.log('\n--- TESTING SIGNIN WITH EXACT STRING ---');
  const targetEmail = 'suchitra.y.1206@gmail.com';
  const targetPass = 'WadiaAdmin2026!';

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: targetEmail,
    password: targetPass
  });

  if (signInErr) {
    console.error('SignIn Error:', signInErr.message, signInErr.status, signInErr);
  } else {
    console.log('SignIn SUCCESS! Access token obtained.');
  }
}

inspectUser();
