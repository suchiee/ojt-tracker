const fs = require('fs');
const path = require('path');

function run() {
  const envExamplePath = path.join(__dirname, '..', '..', '.env.example');
  const serverEnvPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envExamplePath)) {
    console.error('Error: .env.example not found');
    process.exit(1);
  }

  const content = fs.readFileSync(envExamplePath, 'utf8');

  // Extract variables
  const matchUrl = content.match(/^REACT_APP_SUPABASE_URL\s*=\s*(.+)$/m);
  const matchAnon = content.match(/^REACT_APP_SUPABASE_ANON_KEY\s*=\s*(.+)$/m);
  const matchService = content.match(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$/m);
  const matchDb = content.match(/^DATABASE_URL\s*=\s*(.+)$/m);

  if (!matchUrl || !matchAnon || !matchService || !matchDb) {
    console.error('Error: Could not extract all required keys from .env.example');
    process.exit(1);
  }

  const supabaseUrl = matchUrl[1].trim();
  const supabaseAnonKey = matchAnon[1].trim();
  const supabaseServiceKey = matchService[1].trim();
  const rawDbUrl = matchDb[1].trim();

  // Translate direct DB URL to pooler DB URL
  let dbUrl = rawDbUrl;
  if (dbUrl.includes('db.pkalrnzkocdbfiywdptk.supabase.co')) {
    dbUrl = dbUrl.replace('db.pkalrnzkocdbfiywdptk.supabase.co:5432', 'aws-1-ap-south-1.pooler.supabase.com:6543');
    dbUrl = dbUrl.replace('//postgres:', '//postgres.pkalrnzkocdbfiywdptk:');
  }

  // Create server/.env content
  const serverEnvContent = `PORT=5003
MONGODB_URI=mongodb://localhost:27017/ccis-ojt-tracker
JWT_SECRET=ccis_ojt_tracker_secret_key_2024
ADMIN_REGISTRATION_KEY=admin123
DATABASE_URL=${dbUrl}
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}
REACT_APP_SUPABASE_ANON_KEY=${supabaseAnonKey}
LOCAL_JWT_DEV_MODE=false
V2_LOCAL_JWT_SECRET=internsync_v2_local_dev_secret_not_for_production_2026
RLS_TEST_DB_URL=${dbUrl}
`;

  // Write server/.env
  fs.writeFileSync(serverEnvPath, serverEnvContent, 'utf8');
  console.log('Successfully created server/.env with translated pooler credentials.');

  // Restore .env.example with placeholders to keep Git-tracked files clean
  const cleanExampleContent = `# InternSync Local Development Configuration

# Supabase Public API endpoints
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend Supabase keys (Never expose to client/React)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# PostgreSQL Database connection details (Private)
DATABASE_URL=postgresql://postgres:your-db-password@db.your-project-id.supabase.co:5432/postgres
JWT_SECRET=your-supabase-jwt-secret-string-here

# MongoDB Baseline Server port configuration
PORT=5003
MONGODB_URI=mongodb://localhost:27017/ccis-ojt-tracker

# V2 Local Development Authentication
# LOCAL_JWT_DEV_MODE=true enables local JWT verification for local testing ONLY.
# MUST NOT be set in production. Application will refuse to start if NODE_ENV=production and this is true.
# Uses a DEDICATED V2 secret — NOT the legacy JWT_SECRET.
# LOCAL_JWT_DEV_MODE=true
# V2_LOCAL_JWT_SECRET=your-local-dev-only-v2-secret-never-for-production

# Non-superuser RLS test role connection (BYPASSRLS=false, for actual PostgreSQL RLS tests)
# RLS_TEST_DB_URL=postgresql://internship_rls_test_user:your-rls-test-password@localhost:5432/postgres
`;

  fs.writeFileSync(envExamplePath, cleanExampleContent, 'utf8');
  console.log('Successfully reverted .env.example to template placeholder state.');
}

run();
