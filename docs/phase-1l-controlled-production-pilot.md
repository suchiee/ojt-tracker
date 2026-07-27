# Phase 1L — Controlled Production Pilot Validation Report

**Environment**: Production (AWS Mumbai / Supabase Cloud / Render / Vercel)  
**Tenant**: Nowrosjee Wadia College (`19013867-1aca-41d8-a0db-da33c8b6ba26`)  
**Execution Date**: July 24, 2026  
**Status**: **PASSED (22/22 Verification Steps Passed)**

---

## 1. Controlled Pilot Dataset

| Entity | Production Value | ID / Details |
| :--- | :--- | :--- |
| **Tenant** | Nowrosjee Wadia College | `19013867-1aca-41d8-a0db-da33c8b6ba26` |
| **Tenant Admin** | `suchitra.y.1206@gmail.com` | `9d8858a5-2458-425f-b02d-0634392f3b26` |
| **Department** | Department of Computer Science | `24d8f016-966c-4e5c-ae42-69c30680fa29` |
| **Program** | M.Sc. Computer Science | `4555c8e0-f047-423b-8e39-5b4a61b0da8a` |
| **Batch** | M.Sc. Computer Science 2024–2026 | `ba66fafd-0bcf-4131-b48d-ad1c660ebfc4` |
| **Student** | Aarav Sharma | `aarav.sharma.demo@internsync.app` |
| **Faculty Advisor** | Dr. Meera Kulkarni | `meera.kulkarni.demo@internsync.app` |
| **Host Company** | Persistent Systems Ltd. | `8fa910b7-fc99-4349-8ad7-8f21ce5a25f1` |
| **Company Mentor** | Rahul Deshpande | `rahul.deshpande.demo@internsync.app` |
| **Internship Role** | Software Developer Intern | Total Hours Target: 300 |

---

## 2. Verification Results Summary

```
==================================================
PILOT EXECUTION SUMMARY: 22 PASSED, 0 FAILED
==================================================
```

| Step # | Verification Gate | Outcome | Detail / Status |
| :---: | :--- | :---: | :--- |
| **1** | Admin Authentication | **PASSED** | Authenticated production Tenant Admin via Supabase Auth |
| **2** | Academic Department Creation | **PASSED** | Created "Department of Computer Science" |
| **3** | Academic Program Creation | **PASSED** | Created "M.Sc. Computer Science" |
| **4** | Academic Batch Creation | **PASSED** | Created "M.Sc. Computer Science 2024–2026" |
| **5** | Student Provisioning | **PASSED** | Provisioned "Aarav Sharma" with role `STUDENT` |
| **6** | Faculty Advisor Provisioning | **PASSED** | Provisioned "Dr. Meera Kulkarni" with role `FACULTY_MENTOR` |
| **7** | Company Mentor Provisioning | **PASSED** | Provisioned "Rahul Deshpande" with role `COMPANY_MENTOR` |
| **8** | Host Company Creation | **PASSED** | Created "Persistent Systems Ltd." (`https://www.persistent.com`) |
| **9** | Active Internship Creation | **PASSED** | Linked Student to Company (`Software Developer Intern`) |
| **10** | Company Mentor Assignment | **PASSED** | Assigned Rahul Deshpande to Internship |
| **11** | Faculty Batch Assignment | **PASSED** | Assigned Dr. Meera Kulkarni to Batch |
| **12** | Daily Log Creation | **PASSED** | Created DRAFT log for 2026-07-15 (6.0 hours) |
| **13** | Daily Log Submission | **PASSED** | Student submitted Daily Log (`DRAFT` $\rightarrow$ `SUBMITTED`) |
| **14** | Mentor Review & Correction | **PASSED** | Mentor requested correction with feedback (`CORRECTION_REQUESTED`) |
| **15** | Student Log Update & Resubmit | **PASSED** | Student updated log description and resubmitted (`SUBMITTED`) |
| **16** | Mentor Approval | **PASSED** | Mentor approved Daily Log (`APPROVED`) |
| **17** | Weekly Report Creation | **PASSED** | Created Weekly Report for 2026-07-13 to 2026-07-19 |
| **18** | Weekly Report Submission | **PASSED** | Student submitted Weekly Report (`SUBMITTED`) |
| **19** | Faculty Report Approval | **PASSED** | Faculty approved Weekly Report (`APPROVED`) |
| **20** | Derived Hours View | **PASSED** | PostgreSQL view resolved 6.0 Logged Hours & 6.0 Approved Hours |
| **21** | Admin Metrics Verification | **PASSED** | Live `/admin/overview` metric aggregation verified |
| **22** | Audit Trail Verification | **PASSED** | Verified 107 transactional records in `public.audit_logs` |

---

## 3. Data Retention Decision

The pilot production dataset for **Nowrosjee Wadia College** is active in production.
- **Pilot Data Status**: `ACTIVE / RETAINED`
- All created records are cleanly isolated under `tenant_id: 19013867-1aca-41d8-a0db-da33c8b6ba26`.
- Production platform is fully operational and ready for live institutional onboarding.
