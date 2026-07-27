# CCIS OJT Tracker V2 (SaaS - InternSync)

A secure, multi-tenant On-the-Job Training (OJT) tracker for universities and colleges, powered by a React frontend, Node/Express backend, and PostgreSQL/Supabase database.

---

## Architecture Overview

CCIS OJT Tracker has transitioned from a single-college MongoDB instance (V1) into a multi-tenant relational database (V2).

```
[Frontend React Client]
          │ (JWT Access Token)
          ▼
 [Node.js Express Server]
          │ (pg Connection / Service Role)
          ▼
   [Supabase Cloud]
 ┌────────────────────────────────┐
 │  PostgreSQL Schema             │
 │  ├─ tenants (Multi-Tenancy)    │
 │  ├─ users / student_profiles   │
 │  ├─ internships & daily_logs   │
 │  └─ RLS Policies (17 Tables)   │
 └────────────────────────────────┘
```

---

## Core Technologies

* **Frontend:** React, Tailwind/Vanilla CSS, React Router, React Icons, Axios.
* **Backend:** Node.js, Express, Helmet, Rate-Limit, Morgan, pg (PostgreSQL Client).
* **Database & Auth:** Supabase PostgreSQL 15, Supabase Auth, Row Level Security (RLS) policies.

---

## Local Development Quickstart

### Prerequisites
* Node.js v18+
* PostgreSQL local instance (or Supabase local CLI)

### 1. Environment Configuration
Create a `.env` file inside `server/` matching the parameters in `.env.example`:
```ini
PORT=5001
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key

# Opt-in local JWT verification for offline dev testing
LOCAL_JWT_DEV_MODE=true
V2_LOCAL_JWT_SECRET=your-v2-local-secret-here
```

### 2. Install Dependencies
```bash
# Install Server packages
cd server && npm install

# Install Client packages
cd ../client && npm install
```

### 3. Run PG Database Migrations
Deploy database schema updates to your target PostgreSQL database:
```bash
cd server
npm run migrate:production
```

### 4. Start Development Servers
```bash
# Start Backend Express on port 5001
cd server && npm run dev

# Start Frontend React on port 3001
cd ../client && npm start
```

---

## Verification & Testing
The backend is fully verified using 51 automated regression and integration assertions:
```bash
cd server
node scripts/test_student_profile_v2.js
node scripts/test_daily_logs_v2.js
node scripts/test_training_setup_v2.js
```

---

## Production Deployment Runbook

### 1. Database Migrations
Before deploying code updates, apply incremental migrations to the production PostgreSQL pool:
```bash
npm run migrate:production
```

### 2. Backend Deploy (Render)
* Map environment variables for production database and Supabase keys.
* Ensure `LOCAL_JWT_DEV_MODE` is disabled to enforce live Supabase Auth.
* Configure root entry point to launch `server/server.js`.

### 3. Frontend Deploy
* Build production optimized assets:
  ```bash
  cd client && npm run build
  ```
* Host static build artifacts on Render, Vercel, or Netlify.

---

## Project Structure
* `client/`: React UI components, dashboards, and services.
* `server/`: Express server, controllers, routes, middlewares, and services.
* `server/scripts/`: Automated validation test runners and db seeding scripts.
* `server/scripts/migration/`: Production Mongo-to-PG data migration scripts.
* `docs/`: Deployment runbooks, checklists, and rollback guidelines.
