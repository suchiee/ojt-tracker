// Configuration: env.js — Server Environment Variable Validator
// Validates required environment variables at server startup.
// Fails fast in production when critical configuration is missing.

const path = require('path');
const dotenv = require('dotenv');

// Ensure environment variables are loaded
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const validateEnv = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  const requiredInProduction = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'ALLOWED_ORIGINS'
  ];

  const missing = [];

  if (isProduction) {
    // 1. Verify required production variables
    for (const key of requiredInProduction) {
      if (!process.env[key] || process.env[key].trim() === '') {
        missing.push(key);
      }
    }

    // 2. Reject dev-only flags in production
    if (process.env.LOCAL_JWT_DEV_MODE === 'true') {
      console.error('FATAL SECURITY ERROR: LOCAL_JWT_DEV_MODE=true is forbidden in production.');
      process.exit(1);
    }

    // 3. Warn on wildcard CORS in production
    if (process.env.ALLOWED_ORIGINS === '*') {
      console.warn('[SECURITY WARNING] ALLOWED_ORIGINS is set to wildcard "*" in production.');
    }
  }

  if (missing.length > 0) {
    console.error('════════════════════════════════════════════════════════════════');
    console.error('FATAL ENVIRONMENT CONFIGURATION ERROR');
    console.error(`The following required environment variables are missing for NODE_ENV=${process.env.NODE_ENV}:`);
    missing.forEach(varName => console.error(`  - ${varName}`));
    console.error('The server cannot start securely until these variables are configured.');
    console.error('════════════════════════════════════════════════════════════════');
    process.exit(1);
  }

  if (!isTest) {
    console.log(`[ENV VALIDATOR] Environment validation passed for NODE_ENV=${process.env.NODE_ENV || 'development'}`);
  }
};

// Execute validation immediately on module load
validateEnv();

module.exports = {
  validateEnv
};
