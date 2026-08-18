const crypto = require('crypto');
const { createUserContextClient, getAdminClient } = require('../config/supabase');
const pool = require('../config/pgPool');

const USE_SUPABASE_CLIENT = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.LOCAL_JWT_DEV_MODE !== 'true';

// Secure hash function for invitation tokens
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// GET /api/v2/auth/me - Resolve session, profiles, memberships, and roles
const getMe = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;

    if (USE_SUPABASE_CLIENT) {
      const client = createUserContextClient(token);

      // Fetch public profile
      const { data: userProfile, error: profileErr } = await client
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileErr) {
        console.error('getMe Profile Fetch Error:', profileErr);
        return res.status(404).json({ message: 'User profile not found in public database' });
      }

      // Fetch tenant memberships with joined roles and college names
      const { data: memberships, error: membershipErr } = await client
        .from('tenant_memberships')
        .select(`
          id,
          tenant_id,
          tenants (id, name, domain),
          membership_roles (role),
          student_profiles (id, student_id_number, batch_id)
        `)
        .eq('user_id', userId);

      if (membershipErr) {
        console.error('getMe Memberships Fetch Error:', membershipErr);
        return res.status(500).json({ message: 'Failed to retrieve user memberships' });
      }

      return res.status(200).json({
        user: {
          id: userProfile.id,
          email: userProfile.email,
          firstName: userProfile.first_name,
          lastName: userProfile.last_name,
          avatarUrl: userProfile.avatar_url,
          memberships: (memberships || []).map(m => ({
            membershipId: m.id,
            tenantId: m.tenant_id,
            tenantName: m.tenants?.name,
            domainSlug: m.tenants?.domain,
            roles: (m.membership_roles || []).map(r => r.role),
            studentProfile: m.student_profiles ? {
              id: m.student_profiles.id,
              studentIdNumber: m.student_profiles.student_id_number,
              batchId: m.student_profiles.batch_id
            } : null
          }))
        }
      });
    }

    // Local pg pool fallback
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);

      const { rows: userRows } = await client.query('SELECT * FROM public.users WHERE id = $1', [userId]);
      if (userRows.length === 0) {
        await client.query('COMMIT');
        return res.status(404).json({ message: 'User profile not found in public database' });
      }
      const userProfile = userRows[0];

      const memSql = `
        SELECT 
          tm.id, tm.tenant_id, t.name as tenant_name, t.domain as domain_slug,
          COALESCE(json_agg(DISTINCT mr.role) FILTER (WHERE mr.role IS NOT NULL), '[]'::json) as roles,
          sp.id as student_profile_id, sp.student_id_number, sp.batch_id
        FROM tenant_memberships tm
        JOIN tenants t ON tm.tenant_id = t.id
        LEFT JOIN membership_roles mr ON tm.id = mr.membership_id
        LEFT JOIN student_profiles sp ON tm.id = sp.tenant_membership_id
        WHERE tm.user_id = $1
        GROUP BY tm.id, tm.tenant_id, t.name, t.domain, sp.id, sp.student_id_number, sp.batch_id
      `;
      const { rows: memRows } = await client.query(memSql, [userId]);
      await client.query('COMMIT');

      return res.status(200).json({
        user: {
          id: userProfile.id,
          email: userProfile.email,
          firstName: userProfile.first_name,
          lastName: userProfile.last_name,
          avatarUrl: userProfile.avatar_url,
          memberships: memRows.map(m => ({
            membershipId: m.id,
            tenantId: m.tenant_id,
            tenantName: m.tenant_name,
            domainSlug: m.domain_slug,
            roles: Array.isArray(m.roles) ? m.roles : JSON.parse(m.roles || '[]'),
            studentProfile: m.student_profile_id ? {
              id: m.student_profile_id,
              studentIdNumber: m.student_id_number,
              batchId: m.batch_id
            } : null
          }))
        }
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('getMe Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/student/onboard - Transactional student onboarding via RPC
const studentOnboard = async (req, res) => {
  try {
    const { invitationCode, studentIdNumber } = req.body;
    if (!invitationCode || !studentIdNumber) {
      return res.status(400).json({ message: 'Invitation code and student ID number are required' });
    }

    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const codeHash = hashToken(invitationCode);

    if (USE_SUPABASE_CLIENT) {
      const client = createUserContextClient(token);
      const { data: membershipId, error } = await client.rpc('consume_invitation', {
        p_code_hash: codeHash,
        p_student_id_number: studentIdNumber
      });

      if (error) {
        console.error('Student Onboarding RPC Error:', error);
        return res.status(400).json({ message: error.message || 'Onboarding registration failed' });
      }

      return res.status(200).json({
        message: 'Student onboarding completed successfully',
        membershipId
      });
    }

    // Local pg Pool fallback
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      const { rows } = await client.query(
        `SELECT public.consume_invitation($1, $2) as membership_id`,
        [codeHash, studentIdNumber]
      );
      await client.query('COMMIT');
      return res.status(200).json({
        message: 'Student onboarding completed successfully',
        membershipId: rows[0].membership_id
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ message: err.message || 'Onboarding registration failed' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Student Onboarding Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/invite/consume - Generic invitation consumption (Student, Faculty, Company Mentor, Admin)
const consumeInvite = async (req, res) => {
  try {
    const { invitationCode, studentIdNumber } = req.body;
    if (!invitationCode) {
      return res.status(400).json({ message: 'Invitation code is required' });
    }

    const token = req.supabaseToken;
    const userId = req.supabaseUser.id;
    const codeHash = hashToken(invitationCode);

    if (USE_SUPABASE_CLIENT) {
      const client = createUserContextClient(token);
      const { data: membershipId, error } = await client.rpc('consume_invitation', {
        p_code_hash: codeHash,
        p_student_id_number: studentIdNumber || null
      });

      if (error) {
        return res.status(400).json({ message: error.message || 'Failed to consume invitation' });
      }

      return res.status(200).json({
        message: 'Invitation consumed successfully',
        membershipId
      });
    }

    // Local pg Pool fallback
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      const { rows } = await client.query(
        `SELECT public.consume_invitation($1, $2) as membership_id`,
        [codeHash, studentIdNumber || null]
      );
      await client.query('COMMIT');
      return res.status(200).json({
        message: 'Invitation consumed successfully',
        membershipId: rows[0].membership_id
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(400).json({ message: err.message || 'Failed to consume invitation' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Consume Invite Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/admin/invite - Privileged invite generation
const adminInviteUser = async (req, res) => {
  try {
    const { email, first_name, last_name, invitation_type, tenant_id, batch_id, internship_id } = req.body;
    const adminUserToken = req.supabaseToken;
    const adminUserId = req.supabaseUser.id;

    if (!email || !invitation_type || !tenant_id) {
      return res.status(400).json({ message: 'Email, invitation type, and tenant ID are required' });
    }

    const validTypes = ['FACULTY_INVITE', 'ADMIN_INVITE', 'STUDENT_ONBOARDING', 'COMPANY_MENTOR_INVITE'];
    if (!validTypes.includes(invitation_type)) {
      return res.status(400).json({ message: 'Invalid invitation type' });
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const codeHash = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    if (USE_SUPABASE_CLIENT) {
      const userClient = createUserContextClient(adminUserToken);

      // Verify requesting user holds the ADMIN role in the target tenant
      const { data: adminCheck, error: authCheckErr } = await userClient
        .from('tenant_memberships')
        .select('id, membership_roles(role)')
        .eq('user_id', adminUserId)
        .eq('tenant_id', tenant_id)
        .single();

      const isAuthorized = adminCheck && adminCheck.membership_roles.some(r => r.role === 'ADMIN');
      if (authCheckErr || !isAuthorized) {
        return res.status(403).json({ message: 'Forbidden: Requester is not an administrator of the target college' });
      }

      const adminClient = getAdminClient();
      const { error: insertErr } = await adminClient
        .from('invitation_codes')
        .insert({
          code_hash: codeHash,
          tenant_id,
          internship_id: internship_id || null,
          batch_id: (invitation_type === 'STUDENT_ONBOARDING' || invitation_type === 'FACULTY_INVITE') ? (batch_id || null) : null,
          invitation_type,
          intended_email: email.toLowerCase().trim(),
          max_uses: 1,
          uses_count: 0,
          expires_at: expiresAt.toISOString(),
          created_by: adminUserId
        });

      if (insertErr) {
        console.error('Invitation Insertion Error:', insertErr);
        return res.status(500).json({ message: 'Failed to save invitation code to database' });
      }

      const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { first_name, last_name }
      });

      if (inviteErr) {
        console.warn('Supabase Auth invite trigger warning:', inviteErr.message);
      }

      return res.status(201).json({
        message: 'Invitation generated successfully',
        rawInvitationCode: rawToken,
        expiresAt
      });
    }

    // Local pg Pool fallback
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [adminUserId]);

      const authSql = `
        SELECT tm.id FROM tenant_memberships tm
        JOIN membership_roles mr ON tm.id = mr.membership_id
        WHERE tm.user_id = $1 AND tm.tenant_id = $2 AND mr.role = 'ADMIN'
        LIMIT 1;
      `;
      const { rows: authRows } = await client.query(authSql, [adminUserId, tenant_id]);
      if (authRows.length === 0) {
        await client.query('COMMIT');
        return res.status(403).json({ message: 'Forbidden: Requester is not an administrator of the target college' });
      }

      await client.query(
        `INSERT INTO public.invitation_codes (
           code_hash, tenant_id, internship_id, batch_id, invitation_type, intended_email,
           max_uses, uses_count, expires_at, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, 1, 0, $7, $8)`,
        [
          codeHash,
          tenant_id,
          internship_id || null,
          (invitation_type === 'STUDENT_ONBOARDING' || invitation_type === 'FACULTY_INVITE') ? (batch_id || null) : null,
          invitation_type,
          email.toLowerCase().trim(),
          expiresAt.toISOString(),
          adminUserId
        ]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        message: 'Invitation generated successfully',
        rawInvitationCode: rawToken,
        expiresAt
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Admin Invite Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

const devLogin = async (req, res) => {
  // Extra safety: double check env variables
  if (process.env.LOCAL_JWT_DEV_MODE !== 'true' || process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not Found' });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    
    // Check credentials against server/.env
    const devAdminEmail = (process.env.DEV_ADMIN_EMAIL || '').trim().toLowerCase();
    const devAdminPassword = process.env.DEV_ADMIN_PASSWORD;
    const devUserPassword = process.env.DEV_USER_PASSWORD;

    if (!devAdminEmail || !devAdminPassword || !devUserPassword) {
      return res.status(500).json({ message: 'Development credentials are not configured on the server' });
    }

    // Verify password based on user email
    if (cleanEmail === devAdminEmail) {
      if (password !== devAdminPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    } else {
      if (password !== devUserPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    }

    // Check if the user exists in local PostgreSQL database (public.users)
    const { rows } = await pool.query('SELECT * FROM public.users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found in local database' });
    }

    const user = rows[0];

    // Generate local JWT signed with V2_LOCAL_JWT_SECRET using HS256
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.V2_LOCAL_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (err) {
    console.error('Dev Login Error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getMe,
  studentOnboard,
  consumeInvite,
  adminInviteUser,
  devLogin
};

