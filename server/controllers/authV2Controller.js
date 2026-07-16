const crypto = require('crypto');
const { createUserContextClient, getAdminClient } = require('../config/supabase');

// Secure hash function for invitation tokens
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// GET /api/v2/auth/me - Resolve session, profiles, memberships, and roles
const getMe = async (req, res) => {
  try {
    const token = req.supabaseToken;
    const client = createUserContextClient(token);
    const userId = req.supabaseUser.id;

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
        membership_roles (role)
      `)
      .eq('user_id', userId);

    if (membershipErr) {
      console.error('getMe Membership Fetch Error:', membershipErr);
      return res.status(500).json({ message: 'Failed to retrieve memberships' });
    }

    // Fetch explicit internship assignments for Company Mentors
    const { data: assignments, error: assignmentErr } = await client
      .from('internship_mentor_assignments')
      .select(`
        id,
        internship_id,
        mentor_type,
        is_primary,
        internships (
          id,
          job_role,
          company_id,
          companies (name),
          student_id,
          users (first_name, last_name, email)
        )
      `)
      .eq('mentor_user_id', userId);

    const formattedMemberships = memberships.map(m => ({
      id: m.id,
      tenantId: m.tenant_id,
      tenant: m.tenants,
      roles: m.membership_roles.map(r => r.role)
    }));

    const formattedRoles = Array.from(new Set(formattedMemberships.flatMap(m => m.roles)));

    res.json({
      user: userProfile,
      memberships: formattedMemberships,
      roles: formattedRoles,
      assignments: assignmentErr ? [] : assignments
    });
  } catch (err) {
    console.error('getMe Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/student/onboard - Transactional onboarding via RPC
const studentOnboard = async (req, res) => {
  try {
    const { invitationCode, studentIdNumber } = req.body;
    if (!invitationCode || !studentIdNumber) {
      return res.status(400).json({ message: 'Invitation code and student ID number are required' });
    }

    const token = req.supabaseToken;
    const client = createUserContextClient(token);

    // Securely hash the input code
    const codeHash = hashToken(invitationCode);

    // Execute transactional SQL function consume_invitation via RPC
    const { data: membershipId, error } = await client.rpc('consume_invitation', {
      p_code_hash: codeHash,
      p_student_id_number: studentIdNumber
    });

    if (error) {
      console.error('Student Onboarding RPC Error:', error);
      return res.status(400).json({ message: error.message || 'Onboarding registration failed' });
    }

    res.status(200).json({
      message: 'Student onboarding completed successfully',
      membershipId
    });
  } catch (err) {
    console.error('Student Onboarding Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// POST /api/v2/admin/invite - Privileged invite generation
const adminInviteUser = async (req, res) => {
  try {
    const { email, first_name, last_name, invitation_type, tenant_id, batch_id } = req.body;
    const adminUserToken = req.supabaseToken;
    const adminUserId = req.supabaseUser.id;

    if (!email || !invitation_type || !tenant_id) {
      return res.status(400).json({ message: 'Email, invitation type, and tenant ID are required' });
    }

    if (invitation_type !== 'FACULTY_INVITE' && invitation_type !== 'ADMIN_INVITE' && invitation_type !== 'STUDENT_ONBOARDING') {
      return res.status(400).json({ message: 'Invalid invitation type' });
    }

    // Initialize user-context client to verify requester authorization
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

    // Generate secure random raw token
    const rawToken = crypto.randomBytes(24).toString('hex');
    const codeHash = hashToken(rawToken);

    // Insert invitation using admin key context
    const adminClient = getAdminClient();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Code expires in 7 days

    const { error: insertErr } = await adminClient
      .from('invitation_codes')
      .insert({
        code_hash: codeHash,
        tenant_id,
        batch_id: invitation_type === 'STUDENT_ONBOARDING' ? batch_id : null,
        invitation_type,
        intended_email: email,
        max_uses: 1,
        uses_count: 0,
        expires_at: expiresAt.toISOString(),
        created_by: adminUserId
      });

    if (insertErr) {
      console.error('Invitation Insertion Error:', insertErr);
      return res.status(500).json({ message: 'Failed to save invitation code to database' });
    }

    // Trigger Supabase Auth signup email invitation (invitation flow)
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name, last_name }
    });

    if (inviteErr) {
      console.warn('Supabase Auth invite trigger warning:', inviteErr.message);
    }

    res.status(201).json({
      message: 'Invitation generated successfully',
      rawInvitationCode: rawToken,
      expiresAt
    });
  } catch (err) {
    console.error('Admin Invite Controller Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getMe,
  studentOnboard,
  adminInviteUser
};
