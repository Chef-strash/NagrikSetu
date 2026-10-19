-- 006_app_columns.sql
-- Safety net: every column the web app / backend reads or writes, as
-- ADD COLUMN IF NOT EXISTS, plus the `documents` storage bucket used by
-- /api/v1/documents/upload. All no-ops on a schema built by 001-005.
-- Real column names (verified against docs/seed.sql):
--   ward_offices.ward_name, empaneled_hospitals.name/area/hospital_type.

ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS vernacular_name JSONB,
  ADD COLUMN IF NOT EXISTS eligibility_text TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_text_mr TEXT,
  ADD COLUMN IF NOT EXISTS official_form_url TEXT,
  ADD COLUMN IF NOT EXISTS apply_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS ward_office_id UUID,
  ADD COLUMN IF NOT EXISTS required_documents JSONB,
  ADD COLUMN IF NOT EXISTS staple_order JSONB,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE public.ward_offices
  ADD COLUMN IF NOT EXISTS ward_name TEXT,
  ADD COLUMN IF NOT EXISTS ward_number TEXT,
  ADD COLUMN IF NOT EXISTS physical_address TEXT;

ALTER TABLE public.empaneled_hospitals
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS hospital_type TEXT,
  ADD COLUMN IF NOT EXISTS concession_percentage NUMERIC;

ALTER TABLE public.peer_intel_reviews
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS counter TEXT,
  ADD COLUMN IF NOT EXISTS friction_tag TEXT,
  ADD COLUMN IF NOT EXISTS severity_level TEXT;

ALTER TABLE public.active_sessions
  ADD COLUMN IF NOT EXISTS scheme_name TEXT,
  ADD COLUMN IF NOT EXISTS beneficiary_name TEXT,
  ADD COLUMN IF NOT EXISTS target_benefit TEXT,
  ADD COLUMN IF NOT EXISTS counter_location TEXT,
  ADD COLUMN IF NOT EXISTS counter_hours TEXT,
  ADD COLUMN IF NOT EXISTS documents_left INT,
  ADD COLUMN IF NOT EXISTS last_activity TEXT,
  ADD COLUMN IF NOT EXISTS documents JSONB,
  ADD COLUMN IF NOT EXISTS conversation JSONB,
  ADD COLUMN IF NOT EXISTS chat_session_id TEXT;

-- Private bucket for opt-in document uploads (DOCUMENT_STORAGE_ENABLED=true).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
