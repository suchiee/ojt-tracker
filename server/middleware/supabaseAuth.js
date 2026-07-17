// Middleware: verifySupabaseAuth
// Validates the bearer JWT on every /api/v2/* request.
//
// ════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION MODE SELECTION
// ════════════════════════════════════════════════════════════════════════════
//
// CLOUD MODE (default / production):
//   Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   Validates: token via supabase.auth.getUser() against real Supabase Auth server
//   RLS enforcement: real PostgreSQL RLS via user-context Supabase client
//
// LOCAL DEV MODE (explicit opt-in only):
//   Requires: LOCAL_JWT_DEV_MODE=true AND NODE_ENV != 'production'
//   Requires: V2_LOCAL_JWT_SECRET (dedicated secret — NOT the legacy JWT_SECRET)
//   Validates: JWT locally using HS256 algorithm against V2_LOCAL_JWT_SECRET
//   WARNING: Does not verify against Supabase Auth. For local testing only.
//   Marked in all logs as [LOCAL AUTH MODE]
//
// FAIL-CLOSED RULES:
//   NODE_ENV=production + LOCAL_JWT_DEV_MODE=true  → refuse to start (startup check)
//   NODE_ENV=production + no SUPABASE_URL           → 500 on each request (not configured)
//   Neither CLOUD nor LOCAL conditions met          → 500 (misconfiguration)
//
// AUTHENTICATION BOUNDARY:
//   This middleware covers /api/v2/* ONLY.
//   Legacy /api/* uses the separate legacy JWT middleware and is NOT affected.
//   A legacy JWT CANNOT authorize /api/v2 — different secret, different issuer.
//
// JWT ALGORITHM:
//   Only HS256 is accepted. 'none' algorithm and RS256 are explicitly rejected.

const jwt = require('jsonwebtoken');
const { getAdminClient } = require('../config/supabase');

// ── Startup safety check ───────────────────────────────────────────────────
// Called once at module load time.
const USE_CLOUD_AUTH = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const USE_LOCAL_JWT_MODE = process.env.LOCAL_JWT_DEV_MODE === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (IS_PRODUCTION && USE_LOCAL_JWT_MODE) {
  console.error('FATAL SECURITY CONFIGURATION ERROR: LOCAL_JWT_DEV_MODE=true is not permitted in production.');
  console.error('The application will not serve /api/v2 routes securely in this state.');
  console.error('Either configure real Supabase Auth credentials or set NODE_ENV correctly.');
  process.exit(1); // Fail closed — refuse to start
}

if (!USE_CLOUD_AUTH && !USE_LOCAL_JWT_MODE) {
  console.warn('[STARTUP WARNING] Neither Supabase cloud auth nor LOCAL_JWT_DEV_MODE is configured.');
  console.warn('[STARTUP WARNING] All /api/v2 requests will return 500 until authentication is configured.');
}

// ── JWT Verification Logic ─────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const verifySupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or malformed access token' });
    }

    const token = authHeader.split(' ')[1];

    // ── CLOUD MODE ───────────────────────────────────────────────────────────
    if (USE_CLOUD_AUTH) {
      const supabase = getAdminClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired access token' });
      }
      req.supabaseUser = user;
      req.supabaseToken = token;
      req.authMode = 'CLOUD_SUPABASE_AUTH';
      return next();
    }

    // ── LOCAL DEV MODE ───────────────────────────────────────────────────────
    if (USE_LOCAL_JWT_MODE) {
      const v2Secret = process.env.V2_LOCAL_JWT_SECRET;
      if (!v2Secret) {
        console.error('[LOCAL AUTH MODE] V2_LOCAL_JWT_SECRET is not set. Cannot verify V2 tokens locally.');
        return res.status(500).json({ message: 'Server V2 authentication configuration error' });
      }

      let decoded;
      try {
        // Strict: only accept HS256. Rejects 'none', RS256, and all other algorithms.
        decoded = jwt.verify(token, v2Secret, { algorithms: ['HS256'] });
      } catch (jwtErr) {
        // Covers: invalid signature, expired token, wrong algorithm
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired access token' });
      }

      // Validate sub claim presence and UUID format
      if (!decoded.sub) {
        return res.status(401).json({ message: 'Unauthorized: Token missing user identity claim (sub)' });
      }
      if (!UUID_REGEX.test(decoded.sub)) {
        return res.status(401).json({ message: 'Unauthorized: Token subject is not a valid user UUID' });
      }

      // Guard: legacy JWT_SECRET must differ from V2_LOCAL_JWT_SECRET.
      // If they're the same, a legacy token would be valid here — which is not allowed.
      if (process.env.V2_LOCAL_JWT_SECRET === process.env.JWT_SECRET) {
        console.error('[LOCAL AUTH MODE] SECURITY WARNING: V2_LOCAL_JWT_SECRET equals JWT_SECRET.');
        console.error('[LOCAL AUTH MODE] Legacy JWTs would be valid for V2. Use a separate V2 secret.');
        return res.status(500).json({ message: 'Server V2 authentication misconfiguration' });
      }

      console.warn(`[LOCAL AUTH MODE] /api/v2 request authenticated locally for user: ${decoded.sub}`);

      req.supabaseUser = { id: decoded.sub, email: decoded.email || null };
      req.supabaseToken = token;
      req.authMode = 'LOCAL_JWT_DEV_MODE';
      return next();
    }

    // ── NEITHER MODE CONFIGURED ───────────────────────────────────────────────
    console.error('[verifySupabaseAuth] No authentication mode is configured for /api/v2.');
    return res.status(500).json({ message: 'Server authentication not configured' });

  } catch (err) {
    console.error('Supabase Auth Middleware Error:', err);
    res.status(500).json({ message: 'Internal Server Error during authentication' });
  }
};

module.exports = {
  verifySupabaseAuth
};
