-- Migration: 005 Add Internship Rejection Reason
-- Purpose: Add a rejection_reason column to public.internships to allow storing review feedback.

ALTER TABLE public.internships ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
