-- Migration: 001 Core Identity and Tenants
-- Purpose: Setup tenants, users linked to auth.users, and tenant-level memberships/roles.

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(tenant_id, user_id)
);

CREATE TABLE membership_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID REFERENCES tenant_memberships(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(50) CHECK (role IN ('STUDENT', 'FACULTY_MENTOR', 'ADMIN')) NOT NULL,
    UNIQUE(membership_id, role)
);

-- Core indexes for identity lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);
