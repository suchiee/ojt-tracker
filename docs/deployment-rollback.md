# Deployment Rollback Strategy — InternSync V2

## 1. Trigger Conditions for Rollback

A deployment rollback must be initiated immediately if any of the following conditions occur post-release:
- Failure of automated deployment smoke tests (`GET /api/v2/healthz` returns non-200 or fails to bind).
- Critical authentication or RLS failure (e.g. cross-tenant data leakage or inability of authorized users to log in).
- Unhandled API exception spikes (> 5% error rate on standard endpoints).
- Database migration corruption or unexpected transaction deadlocks.

---

## 2. Frontend Rollback Strategy (Vercel / Static Host)

1. **Instant Revision Promotion**:
   - Access the Vercel (or static hosting provider) deployment dashboard.
   - Select the previous known-good deployment release from the deployment history.
   - Click **Promote to Production** (instant DNS pointer update, ~0 seconds downtime).
2. **Local Repository Verification**:
   - Checkout the previous release tag: `git checkout tags/v2.1.0-verified`.
   - Verify local client build: `cd client && npm run build`.

---

## 3. Backend Rollback Strategy (Render / Railway / Node Cloud)

1. **Deployment Rollback via Provider Dashboard**:
   - Access Render / Railway dashboard.
   - Trigger a manual rollback to the previous successful commit hash or image digest.
2. **Environment Variable Safeguard**:
   - If rollback is due to secret corruption, verify that environment variables match the previous verified revision before initiating container restart.
3. **Health Verification**:
   - Run deployment smoke test against the rolled-back instance:
     ```bash
     DEPLOYMENT_API_URL=https://api.internsync.edu.ph/api/v2 npm run test:smoke
     ```

---

## 4. Database Incident & Migration Rollback Strategy

1. **Forward-Fix Migration (Preferred)**:
   - PostgreSQL schema changes are additive. For non-destructive issues, prefer authoring a forward-fix migration (e.g. `20260724000_fix_issue.sql`) over rolling back database transactions.
2. **Backup Restoration (Critical Incidents Only)**:
   - Never execute destructive down migrations (`DROP TABLE`, `DROP COLUMN`) automatically during an active incident.
   - If data corruption occurred, restore the point-in-time database snapshot from Supabase Cloud:
     - Access Supabase Dashboard -> Database -> Backups.
     - Restore to the exact timestamp prior to the failed deployment.
3. **Migration Tracker Sync**:
   - If a migration was partially applied, clean up `public._migrations` entry before re-attempting migration execution.

---

## 5. Post-Rollback Verification Checklist

- [ ] `GET /api/v2/healthz` returns HTTP 200 `ok`.
- [ ] Student, Mentor, Faculty, and Admin authentication operational.
- [ ] Tenant isolation verified across endpoints.
- [ ] Incident post-mortem documented.
