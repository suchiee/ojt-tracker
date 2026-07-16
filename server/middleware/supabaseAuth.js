// Middleware: verifySupabaseAuth
// Validates the bearer JWT on every /api/v2 request.
//
// DUAL-MODE VERIFICATION:
//   - CLOUD MODE (SUPABASE_URL configured):
//     Validates the token against the real Supabase Auth server via supabase.auth.getUser().
//     This is the production path. It requires SUPABASE_SERVICE_ROLE_KEY.
//
//   - LOCAL DEV MODE (SUPABASE_URL not configured):
//     Validates the JWT locally using the JWT_SECRET environment variable.
//     This enables local API tests and local RLS session emulation without a real Supabase project.
//     This path MUST NOT be used in production.
//     Marked clearly in logs as: [LOCAL AUTH MODE]
//
// AUTHENTICATION BOUNDARY:
//   - This middleware covers /api/v2/* only.
//   - Legacy /api/* routes use the separate legacyAuth middleware and are NOT affected.
//   - A legacy JWT will not pass Supabase token verification in either mode.

const jwt = require('jsonwebtoken');
const { getAdminClient } = require('../config/supabase');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const verifySupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or malformed access token' });
    }

    const token = authHeader.split(' ')[1];

    if (USE_SUPABASE_CLIENT) {
      // ── CLOUD MODE: verify via Supabase Auth server ───────────────────────
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

    // ── LOCAL DEV MODE: verify via JWT_SECRET ────────────────────────────────
    // [LOCAL AUTH MODE] — Not a real Supabase Auth verification.
    // Used only for local PostgreSQL RLS emulation testing.
    const localSecret = process.env.JWT_SECRET;
    if (!localSecret) {
      console.error('[LOCAL AUTH MODE] JWT_SECRET is not set. Cannot verify token locally.');
      return res.status(500).json({ message: 'Server authentication configuration error' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, localSecret);
    } catch (jwtErr) {
      return res.status(401).json({ message: 'Unauthorized: Invalid or expired access token' });
    }

    // The "sub" claim is the user's UUID (consistent with Supabase JWT structure)
    if (!decoded.sub) {
      return res.status(401).json({ message: 'Unauthorized: Token missing user identity claim' });
    }

    console.warn(`[LOCAL AUTH MODE] Request authenticated locally for user: ${decoded.sub}. Not a real Supabase Auth session.`);

    // Attach a user-like object matching the shape supabase.auth.getUser() would return
    req.supabaseUser = { id: decoded.sub, email: decoded.email || null, role: decoded.role || null };
    req.supabaseToken = token;
    req.authMode = 'LOCAL_JWT_DEV_MODE';
    return next();

  } catch (err) {
    console.error('Supabase Auth Middleware Error:', err);
    res.status(500).json({ message: 'Internal Server Error during authentication' });
  }
};

module.exports = {
  verifySupabaseAuth
};
