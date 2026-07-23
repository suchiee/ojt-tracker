# Production Go-Live Checklist — InternSync V2

## PRE-DEPLOYMENT VERIFICATION

- [ ] **Supabase Production Project**: Dedicated production Supabase project created (`https://<prod-id>.supabase.co`).
- [ ] **Environment Separation**: Production environment variables configured separately from Staging.
- [ ] **Secret Scan Verification**: Verified zero production secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) in Git history or client bundle.
- [ ] **Production Migration Review**: Reviewed all SQL migrations in `supabase/migrations/`. Excluded local mock/test migrations (`20260716000`, `20260717000`, `20260717005`).
- [ ] **Row Level Security (RLS)**: Verified RLS enabled and tested across all tables (`tenant_memberships`, `daily_logs`, `weekly_reports`, `internships`).
- [ ] **Frontend Environment Configuration**: Verified `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, and `REACT_APP_API_URL` set to production endpoints.
- [ ] **Backend Environment Validation**: Verified `server/config/env.js` validates `NODE_ENV=production`, `ALLOWED_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`.
- [ ] **CORS Allowlist**: Configured production domain explicitly in `ALLOWED_ORIGINS` (no wildcard `*`).
- [ ] **Client Build Verification**: Ran `npm run build` in `client/` with 0 compilation errors.
- [ ] **CI Pipeline Verification**: GitHub Actions CI workflow (`.github/workflows/ci.yml`) passing on `main` branch.
- [ ] **Security Test Suite**: `npm run test:security` passing (20/20 PASSED).

---

## DEPLOYMENT EXECUTION

- [ ] **Database Migration Execution**: Execute `npm run migrate:production` against production database instance.
- [ ] **Backend Deployment**: Deploy Express backend to hosting provider (Render/Railway).
- [ ] **Backend Healthcheck**: Verify `GET /api/v2/healthz` returns HTTP 200 `ok`.
- [ ] **Frontend Deployment**: Deploy React frontend to hosting provider (Vercel).
- [ ] **Domain & SSL**: Verify custom domain HTTPS SSL certificate active.

---

## POST-DEPLOYMENT SMOKE & INTEGRATION VERIFICATION

- [ ] **Deployment Smoke Test**: Execute non-destructive smoke test:
  ```bash
  DEPLOYMENT_API_URL=https://api.internsync.edu.ph/api/v2 npm run test:smoke
  ```
- [ ] **Student Authentication & Workflow**: Student login, dashboard render, and daily log draft/submission sanity check.
- [ ] **Company Mentor Workflow**: Mentor login, assigned intern daily log review queue render, and approval check.
- [ ] **Faculty Advisor Workflow**: Faculty login, weekly report review queue render, and approval check.
- [ ] **Tenant Admin Workflow**: Admin login, overview metrics render, audit logs tab render, and tenant structure check.
- [ ] **Tenant Isolation Sanity Check**: Verify Admin A cannot view or mutate Tenant B records.
- [ ] **Audit Logging Sanity Check**: Verify Admin mutation generates atomic `public.audit_logs` record.
- [ ] **Security Headers Verification**: Confirm `X-Content-Type-Options: nosniff` header present on API responses.
