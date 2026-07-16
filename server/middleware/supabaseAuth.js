const { getAdminClient } = require('../config/supabase');

const verifySupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or malformed access token' });
    }

    const token = authHeader.split(' ')[1];
    const supabase = getAdminClient();
    
    // Verify token validity with Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'Unauthorized: Invalid or expired access token', details: error?.message });
    }

    // Attach validated user context and raw token to request object
    req.supabaseUser = user;
    req.supabaseToken = token;
    next();
  } catch (err) {
    console.error('Supabase Auth Middleware Error:', err);
    res.status(500).json({ message: 'Internal Server Error during authentication' });
  }
};

module.exports = {
  verifySupabaseAuth
};
