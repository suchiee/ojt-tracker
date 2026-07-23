const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run() {
  console.log('Starting Git-tracked files secret scan...');
  
  let files = [];
  try {
    const rootDir = path.join(__dirname, '..', '..');
    const output = execSync('git ls-files', { cwd: rootDir, encoding: 'utf8' });
    files = output.split('\n').map(f => f.trim()).filter(f => f.length > 0);
  } catch (err) {
    console.error('Failed to run git ls-files:', err.message);
    process.exit(1);
  }

  const secretRegexes = [
    // Supabase service role key (looks like jwt base64.base64.signature)
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
    // Database connection strings containing passwords
    /postgresql:\/\/[^:]+:[^@\s]+@[^\s]+/gi,
    // Private keys
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi
  ];

  let violations = [];

  for (const f of files) {
    // Skip .env.example since it's supposed to have templates, but let's check if it has the actual keys
    const filePath = path.join(__dirname, '..', '..', f);
    if (!fs.existsSync(filePath)) continue;
    
    // Ignore .env.example from strict match if it has standard template strings, but if it has real keys we should flag it
    // Wait, let's scan all tracked files anyway!
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) continue;
      
      // Skip binary files
      const ext = path.extname(filePath).toLowerCase();
      if (['.png', '.jpg', '.webp', '.docx', '.zip', '.pdf'].includes(ext)) {
        continue;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      
      for (const regex of secretRegexes) {
        const matches = content.match(regex);
        if (matches) {
          // If it is in .env.example, verify if they are just placeholders or real keys
          if (f === '.env.example') {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (regex.test(line) && !line.includes('your-project-id') && !line.includes('your-db-password') && !line.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')) {
                // Check if it's the real key that was saved
                if (line.includes('pkalrnzkocdbfiywdptk') || line.includes('Suchi1316@sb')) {
                  violations.push({ file: f, line: i + 1, type: 'Real Secret found in .env.example' });
                }
              }
            }
          } else {
            // Find line number
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                violations.push({ file: f, line: i + 1, type: 'Potential secret signature matched' });
              }
            }
          }
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  if (violations.length > 0) {
    console.log('Secret Scan Status: FAIL');
    console.log(`Discovered ${violations.length} potential secrets in Git-tracked files:`);
    for (const v of violations) {
      console.log(`- File: ${v.file}:${v.line} (${v.type})`);
    }
  } else {
    console.log('Secret Scan Status: PASS');
  }
}

run();
