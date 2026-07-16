-- Migration: 007 Documents
-- Purpose: Setup offer letters and certificates with status verification paths.

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('OFFER_LETTER', 'COMPLETION_CERTIFICATE')),
    storage_path VARCHAR(512) NOT NULL,
    status VARCHAR(50) DEFAULT 'UPLOADED' NOT NULL CHECK (status IN ('UPLOADED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'REPLACED')),
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_documents_internship ON documents(internship_id);
