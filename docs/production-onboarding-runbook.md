# InternSync V2 — Production Onboarding Admin Runbook

## Overview

This runbook provides step-by-step instructions for the **Tenant Admin** of **Nowrosjee Wadia College** to onboard academic structures, host companies, faculty advisors, company mentors, and students into InternSync V2 using the live Production Admin Dashboard (**https://client-lemon-one-64.vercel.app**).

---

## 1. Academic Structure Onboarding Sequence

To maintain institutional data integrity, onboarding **MUST** follow this hierarchical order:

```
Step 1: Department ──► Step 2: Program ──► Step 3: Batch
```

### Step 1: Create Department
1. Log in to [https://client-lemon-one-64.vercel.app](https://client-lemon-one-64.vercel.app) as Tenant Admin.
2. Click the **Academic Structure** tab on the Admin Dashboard.
3. Click **+ Add Department**.
4. Enter Department Name (e.g. `Department of Computer Science`) and Code (e.g. `CS`).
5. Click **Create Department**.

### Step 2: Create Program
1. Under the newly created Department, click **+ Add Program**.
2. Select target Department.
3. Enter Program Name (e.g. `Bachelor of Science in Computer Science`) and Code (e.g. `BSCS`).
4. Click **Create Program**.

### Step 3: Create Batch
1. Under the target Program, click **+ Add Batch**.
2. Enter Batch Name (e.g. `2024-2026 Batch`) and Academic Year.
3. Click **Create Batch**.

---

## 2. Host Company Onboarding

1. Click the **Company** tab on the Admin Dashboard.
2. Click **+ Add Company**.
3. Enter Company Name, Address, Contact Person Name, Email, and Phone.
4. Click **Save Company**.

---

## 3. Faculty Advisor Onboarding & Batch Assignment

1. Click the **Faculty Advisors** tab on the Admin Dashboard.
2. Click **+ Invite Faculty Advisor**.
3. Enter Faculty Email, First Name, and Last Name.
4. Select the target **Batch** assigned to this Faculty Advisor.
5. Click **Send Faculty Invitation**.
   - *Supabase Auth sends a password setup invitation directly to the Faculty's email address.*

---

## 4. Student Onboarding Workflow

1. Click the **Students** tab on the Admin Dashboard.
2. Click **+ Generate Student Invitation**.
3. Select target **Batch** (e.g. `2024-2026 Batch`).
4. Enter Student Email or Student ID Number.
5. Click **Generate Onboarding Code**.
6. Provide the secure code to the student.
7. Student completes registration at `https://client-lemon-one-64.vercel.app/onboard`.

---

## 5. Company Mentor Onboarding & Internship Assignment

1. Click the **Internships** tab on the Admin Dashboard.
2. Click **+ Create Internship Assignment**.
3. Select Student and Company.
4. Enter Job Role / Position and Start Date.
5. Enter Company Mentor Email and Name.
6. Click **Assign Mentor & Create Internship**.
   - *Creates internship assignment linking student, company, and mentor.*
   - *Supabase Auth sends a password setup email to the Company Mentor.*

---

## 6. Daily Log & Weekly Report Verification Workflow

Once users are onboarded:
- **Student**: Logs daily tasks, hours, and submits Weekly Reports.
- **Company Mentor**: Reviews and approves Student Daily Logs on `/mentor/dashboard`.
- **Faculty Advisor**: Reviews and approves Student Weekly Reports on `/faculty/dashboard`.
- **Tenant Admin**: Monitors overall hours summary and institutional metrics on `/admin/dashboard`.
