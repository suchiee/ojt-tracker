const fs = require('fs');
const path = require('path');

const serverEnvPath = path.join(__dirname, '..', '.env');
const clientEnvPath = path.join(__dirname, '..', '..', 'client', '.env');

if (!fs.existsSync(serverEnvPath)) {
  console.error('Error: server/.env not found');
  process.exit(1);
}

const content = fs.readFileSync(serverEnvPath, 'utf8');

const matchUrl = content.match(/^SUPABASE_URL\s*=\s*(.+)$/m);
const matchAnon = content.match(/^REACT_APP_SUPABASE_ANON_KEY\s*=\s*(.+)$/m);

if (!matchUrl || !matchAnon) {
  console.error('Error: Could not extract public Supabase keys from server/.env');
  process.exit(1);
}

const clientEnvContent = `REACT_APP_SUPABASE_URL=${matchUrl[1].trim()}
REACT_APP_SUPABASE_ANON_KEY=${matchAnon[1].trim()}
`;

fs.writeFileSync(clientEnvPath, clientEnvContent, 'utf8');
console.log('Successfully created client/.env with public credentials from server/.env.');
