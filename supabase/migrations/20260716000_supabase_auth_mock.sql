-- Migration: 000 Supabase Auth Mock
-- Purpose: Setup a lightweight mock of the internal Supabase auth schema, roles, and uid() helper.

-- 1. Create Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END
$$;

-- 2. Create Schema
CREATE SCHEMA IF NOT EXISTS auth;

-- 3. Create auth.users table mock
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    raw_user_meta_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create auth.uid() function mock
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    RETURN nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;
