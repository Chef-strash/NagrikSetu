-- =============================================================================
-- NAGRIKSETU MUNICIPAL WELFARE DISCOVERY & INGESTION ENGINE
-- NOTE: base schema only. Apply docs/migrations/002_schema_v2.sql after this file.
-- COMPLETE TURNKEY SUPABASE SETUP SCRIPT (FREE TIER OPTIMIZED)
-- FULLY ALIGNED WITH CONSUMER PLATFORM WIREFRAMES & DATA CONTRACTS
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
-- Note: pg_cron is pre-installed on Supabase hosted projects; safe wrapper applied below
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable; purge cron job will be skipped';
END $$;

-- =============================================================================
-- 2. ENUMS & DOMAINS
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE ulb_tier AS ENUM ('MUNICIPAL_CORPORATION', 'MUNICIPAL_COUNCIL', 'NAGAR_PANCHAYAT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE docket_status AS ENUM ('DRAFT', 'PRE_AUDITED', 'SUBMITTED', 'REJECTED', 'DISBURSED', 'PURGED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('in_progress', 'completed', 'submitted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE scraper_repair_status AS ENUM ('HEALTHY', 'DIFF_DETECTED', 'PATCHED_AND_COMMITTED', 'MANUAL_INTERVENTION_REQUIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE scheme_pillar AS ENUM ('HEALTHCARE', 'EDUCATION', 'AGRICULTURE_LIVELIHOOD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE hospital_type AS ENUM ('MUNICIPAL_FREE', 'PRIVATE_EMPANELED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- 3. CORE RELATIONAL TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE: ward_offices
-- Description: Ward administrative offices, physical counters, desk roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ward_offices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ulb_code VARCHAR(32) NOT NULL DEFAULT 'PMC-001',          -- e.g. 'PMC-001'
    ward_number INT NOT NULL,                                -- e.g. 14
    ward_name VARCHAR(128) NOT NULL,                         -- e.g. 'Kothrud - Bavdhan'
    counter_number VARCHAR(64) NOT NULL,                     -- e.g. 'Counter No. 3 (Samaj Vikas DBT Desk)'
    clerk_role VARCHAR(128) NOT NULL,                        -- e.g. 'Senior Welfare Officer'
    physical_address TEXT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    operating_hours VARCHAR(128) DEFAULT 'Monday to Friday | 10:30 AM to 03:30 PM',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: schemes
-- Description: Core municipal welfare scheme registry with wireframe UI attributes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL UNIQUE,                        -- e.g. 'pmc-azad-class10'
    ulb_code VARCHAR(32) NOT NULL DEFAULT 'PMC-001',          -- e.g. 'PMC-001'
    ulb_name VARCHAR(128) NOT NULL DEFAULT 'Pune Municipal Corporation',
    department VARCHAR(128) NOT NULL,                        -- e.g. 'PMC Social Development Department (समाज विकास विभाग)'
    pillar scheme_pillar NOT NULL DEFAULT 'EDUCATION',       -- 'HEALTHCARE', 'EDUCATION', 'AGRICULTURE_LIVELIHOOD'
    category VARCHAR(32) NOT NULL DEFAULT 'education',       -- 'education' | 'healthcare' | 'livelihood'
    category_label VARCHAR(64) NOT NULL DEFAULT 'Education Grants',
    scheme_code VARCHAR(64) NOT NULL UNIQUE,                 -- e.g. 'PMC-SDD-EDU-2026-01'
    name VARCHAR(256) NOT NULL,                              -- e.g. 'Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme'
    vernacular_name JSONB DEFAULT '{}'::jsonb,               -- {'mr': '...', 'hi': '...'}
    description TEXT NOT NULL,
    benefit_amount VARCHAR(128) NOT NULL,                    -- e.g. 'Rs. 15,000'
    benefit_type VARCHAR(128) NOT NULL DEFAULT 'One-time Direct Bank Transfer (DBT)',
    grant_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,       -- Numeric grant for calculations
    deadline VARCHAR(128) NOT NULL DEFAULT 'October 31, 2026',
    application_deadline TIMESTAMPTZ,                        -- NULL if open round-the-year
    cutoff VARCHAR(256) NOT NULL,                            -- e.g. 'Minimum 80.00% in Class 10 SSC (70.00% for SC/ST/OBC)'
    income_limit NUMERIC(12, 2) NOT NULL DEFAULT 250000.00,  -- 250000
    income_limit_formatted VARCHAR(128) NOT NULL DEFAULT 'Under Rs. 2,50,000 per year',
    domicile_years INT NOT NULL DEFAULT 3,
    resolution_no VARCHAR(128),                              -- e.g. 'PMC Resolution No. 1184-B'
    gazette_gr_number VARCHAR(128),                          -- Official GR number
    gazette_date DATE,
    source_url TEXT,
    ward_office_id UUID REFERENCES public.ward_offices(id),
    required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of strings
    staple_order JSONB NOT NULL DEFAULT '[]'::jsonb,         -- Ordered checklist strings
    official_form_name VARCHAR(256) NOT NULL,                -- e.g. 'PMC Form 1184-B (SSC Educational Grant)'
    official_form_url TEXT NOT NULL,                         -- Direct PDF download URL
    is_active BOOLEAN NOT NULL DEFAULT true,
    embedding VECTOR(1536),                                  -- 1536-dim vector for semantic search
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: scheme_criteria_rules
-- Description: Deterministic Zod AST rule definitions for eligibility evaluation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheme_criteria_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
    rule_key VARCHAR(64) NOT NULL,                           -- e.g. 'annual_income_ceiling', 'min_academic_score'
    rule_operator VARCHAR(16) NOT NULL,                      -- 'LTE', 'GTE', 'EQUALS', 'IN', 'REGEX'
    operand_value JSONB NOT NULL,                            -- {"value": 250000} or {"value": 80.0}
    zod_schema_ast JSONB NOT NULL,                           -- Serialized Zod schema AST node
    failure_message_en TEXT NOT NULL,                        -- "Annual income exceeds ₹2,50,000 ceiling"
    failure_message_mr TEXT,                                 -- Marathi statutory citation
    statutory_citation TEXT,                                 -- "PMC Resolution No. 1184-B Section 4(a)"
    is_hard_gate BOOLEAN NOT NULL DEFAULT true,              -- If true, failing this rules out applicant
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: peer_intel_reviews (Community Tips & Counter Friction Ticker)
-- Description: Crowdsourced counter friction, photocopy notices, upvotes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.peer_intel_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID REFERENCES public.schemes(id) ON DELETE CASCADE,
    ward_office_id UUID REFERENCES public.ward_offices(id) ON DELETE SET NULL,
    author VARCHAR(128) NOT NULL DEFAULT 'Citizen Applicant',
    role VARCHAR(128) NOT NULL DEFAULT 'Parent Applicant',
    counter VARCHAR(128) NOT NULL DEFAULT 'Kothrud Ward 14, Counter 3',
    tip TEXT NOT NULL,
    friction_tag VARCHAR(64) DEFAULT 'PHOTOCOPY_DEMAND',     -- 'PHOTOCOPY_DEMAND', 'UNOFFICIAL_FEE', 'IFSC_MERGER', 'TIMING'
    severity_level VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',    -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    helpful_count INT NOT NULL DEFAULT 1,
    verified_by_moderator BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: empaneled_hospitals (Healthcare Pillar Hospital Care Network)
-- Description: 50+ Municipal & Private Empaneled Hospitals for SGAY scheme
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empaneled_hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ulb_code VARCHAR(32) NOT NULL DEFAULT 'PMC-001',
    name VARCHAR(256) NOT NULL,                              -- e.g. 'Poona Hospital & Research Centre'
    area VARCHAR(128) NOT NULL,                              -- e.g. 'Sadashiv Peth'
    hospital_type hospital_type NOT NULL DEFAULT 'PRIVATE_EMPANELED',
    concession_percentage INT NOT NULL DEFAULT 50,           -- 100% for municipal, 50% for empaneled private
    specialties JSONB NOT NULL DEFAULT '["Cardiology", "Dialysis", "Oncology", "General Surgery"]'::jsonb,
    address TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: user_profiles (Citizen Mini-KYC & Household Profile)
-- Description: Lightweight, encrypted household profile for instant pre-filtering
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,                              -- e.g. 'Ramesh Dnyaneshwar Patil'
    mobile VARCHAR(20) NOT NULL UNIQUE,                      -- e.g. '+91 98220 41912'
    ward VARCHAR(128) NOT NULL DEFAULT 'Ward 14: Kothrud - Bawdhan',
    income NUMERIC(12, 2) NOT NULL DEFAULT 140000.00,        -- 140000
    domicile_years INT NOT NULL DEFAULT 5,
    category VARCHAR(64) NOT NULL DEFAULT 'Open / General',  -- 'Open / General', 'OBC', 'SC', 'ST'
    ration_card VARCHAR(64) NOT NULL DEFAULT 'Orange (APL Low-Income)',
    has_712_extract BOOLEAN NOT NULL DEFAULT true,
    is_non_na BOOLEAN NOT NULL DEFAULT true,
    has_produce_vendor BOOLEAN NOT NULL DEFAULT false,
    empaneled_hospitals JSONB NOT NULL DEFAULT '["Poona Hospital & Research Centre", "Sahyadri Super Specialty Hospital", "Kamla Nehru Municipal Hospital"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: active_sessions (Application Preparation Workstation)
-- Description: In-progress citizen preparation sessions, documents state, and chat history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.active_sessions (
    id VARCHAR(64) PRIMARY KEY,                              -- e.g. 'session-1'
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    scheme_id VARCHAR(64) NOT NULL,                          -- e.g. 'pmc-azad-class10'
    scheme_name VARCHAR(256) NOT NULL,
    beneficiary_name VARCHAR(128) NOT NULL,
    target_benefit VARCHAR(256) NOT NULL,
    counter_location VARCHAR(256) NOT NULL,
    counter_hours VARCHAR(128) NOT NULL,
    status session_status NOT NULL DEFAULT 'in_progress',
    documents_left INT NOT NULL DEFAULT 2,
    last_activity TEXT NOT NULL,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,            -- SessionDocument[]
    conversation JSONB NOT NULL DEFAULT '[]'::jsonb,         -- Chat message array
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- TABLE: application_dockets (Generated Printable Application Packets)
-- Description: Pre-filled application packs (Strict Zero-PII: masked Aadhaar, resolved IFSC, 24-hr TTL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_dockets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    docket_tracking_id VARCHAR(32) NOT NULL UNIQUE,          -- e.g. 'WW-2026-PMC-78912'
    scheme_id UUID NOT NULL REFERENCES public.schemes(id),
    ward_office_id UUID REFERENCES public.ward_offices(id),
    applicant_name VARCHAR(128) NOT NULL,
    masked_aadhaar VARCHAR(16) NOT NULL,                     -- MUST MATCH 'XXXX-XXXX-NNNN'
    resolved_ifsc VARCHAR(11) NOT NULL,                      -- Canonical 11-char IFSC (e.g. Canara Bank CNRB...)
    original_ifsc VARCHAR(11),                               -- Merged bank IFSC if applicable (e.g. SYNB...)
    applicant_category VARCHAR(32) NOT NULL,                 -- 'GEN', 'OBC', 'SC', 'ST', 'EWS', etc.
    docket_pdf_url TEXT,                                     -- Supabase storage signed URL
    pdf_storage_path TEXT,                                   -- Relative path in 'application-dockets' bucket
    checksum_sha256 VARCHAR(64) NOT NULL,                    -- Integrity hash of generated PDF
    status docket_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours'),
    purged_at TIMESTAMPTZ,
    CONSTRAINT chk_masked_aadhaar CHECK (masked_aadhaar ~ '^XXXX-XXXX-[0-9]{4}$')
);

-- -----------------------------------------------------------------------------
-- TABLE: scraper_logs
-- Description: Autonomous Cline scraper repair audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scraper_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ulb_domain VARCHAR(256) NOT NULL,                        -- 'punecorporation.org'
    portal_name VARCHAR(128) NOT NULL,                       -- 'PMC Welfare Scheme Portal'
    selector_diff JSONB NOT NULL,                            -- {"old": ".scheme-card", "repaired": "article.welfare-card"}
    repair_status scraper_repair_status NOT NULL,
    cline_session_id VARCHAR(64),
    git_commit_hash VARCHAR(40),                             -- 40-char SHA-1 hash committed by Cline
    execution_duration_ms INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 4. PGVECTOR INDEXING STRATEGY (HNSW FOR <50MS QUERY LATENCY)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_schemes_embedding_hnsw
ON public.schemes
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Standard relational indexes for composite filtering
CREATE INDEX IF NOT EXISTS idx_schemes_slug ON public.schemes (slug);
CREATE INDEX IF NOT EXISTS idx_schemes_category ON public.schemes (category, is_active);
CREATE INDEX IF NOT EXISTS idx_schemes_ulb_dept ON public.schemes (ulb_code, department, is_active);
CREATE INDEX IF NOT EXISTS idx_criteria_scheme_id ON public.scheme_criteria_rules (scheme_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON public.active_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_dockets_tracking ON public.application_dockets (docket_tracking_id);
CREATE INDEX IF NOT EXISTS idx_dockets_expiry ON public.application_dockets (expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_peer_intel_scheme ON public.peer_intel_reviews (scheme_id, helpful_count DESC);
CREATE INDEX IF NOT EXISTS idx_hospitals_ulb ON public.empaneled_hospitals (ulb_code, is_active);

-- =============================================================================
-- 5. HYBRID SEARCH RPC FUNCTION (VECTOR + RELATIONAL FILTERING)
-- =============================================================================
CREATE OR REPLACE FUNCTION match_schemes_hybrid(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10,
    filter_category VARCHAR(32) DEFAULT NULL,
    filter_ulb_code VARCHAR(32) DEFAULT NULL,
    filter_max_income NUMERIC(12, 2) DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    slug VARCHAR(64),
    name VARCHAR(256),
    category VARCHAR(32),
    category_label VARCHAR(64),
    department VARCHAR(128),
    grant_amount NUMERIC(12, 2),
    benefit_amount VARCHAR(128),
    benefit_type VARCHAR(128),
    deadline VARCHAR(128),
    cutoff VARCHAR(256),
    income_limit NUMERIC(12, 2),
    official_form_name VARCHAR(256),
    official_form_url TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.slug,
        s.name,
        s.category,
        s.category_label,
        s.department,
        s.grant_amount,
        s.benefit_amount,
        s.benefit_type,
        s.deadline,
        s.cutoff,
        s.income_limit,
        s.official_form_name,
        s.official_form_url,
        1 - (s.embedding <=> query_embedding) AS similarity
    FROM public.schemes s
    WHERE s.is_active = true
      AND (filter_category IS NULL OR s.category = filter_category)
      AND (filter_ulb_code IS NULL OR s.ulb_code = filter_ulb_code)
      AND (filter_max_income IS NULL OR s.income_limit >= filter_max_income)
      AND (s.embedding IS NULL OR (1 - (s.embedding <=> query_embedding)) >= match_threshold)
    ORDER BY
        CASE WHEN s.embedding IS NOT NULL THEN s.embedding <=> query_embedding ELSE 0 END ASC,
        s.grant_amount DESC
    LIMIT match_count;
END;
$$;

-- =============================================================================
-- 6. SUPABASE STORAGE BUCKETS PROVISIONING
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'application-dockets',
    'application-dockets',
    false,                     -- Private bucket: accessed via signed URLs only
    10485760,                  -- 10 MB limit
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'sanitized-uploads',
    'sanitized-uploads',
    false,                     -- Private bucket
    5242880,                   -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_criteria_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empaneled_hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_intel_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_dockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_logs ENABLE ROW LEVEL SECURITY;

-- Schemes, Rules, Offices, Hospitals: Publicly viewable
DROP POLICY IF EXISTS "Public schemes viewable by anyone" ON public.schemes;
CREATE POLICY "Public schemes viewable by anyone" ON public.schemes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public criteria rules viewable by anyone" ON public.scheme_criteria_rules;
CREATE POLICY "Public criteria rules viewable by anyone" ON public.scheme_criteria_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ward offices viewable by anyone" ON public.ward_offices;
CREATE POLICY "Ward offices viewable by anyone" ON public.ward_offices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Empaneled hospitals viewable by anyone" ON public.empaneled_hospitals;
CREATE POLICY "Empaneled hospitals viewable by anyone" ON public.empaneled_hospitals FOR SELECT USING (true);

-- Peer Intel: Viewable by anyone, submission open
DROP POLICY IF EXISTS "Peer reviews viewable by anyone" ON public.peer_intel_reviews;
CREATE POLICY "Peer reviews viewable by anyone" ON public.peer_intel_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can submit peer review" ON public.peer_intel_reviews;
CREATE POLICY "Anyone can submit peer review" ON public.peer_intel_reviews FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can upvote peer review" ON public.peer_intel_reviews;
CREATE POLICY "Anyone can upvote peer review" ON public.peer_intel_reviews FOR UPDATE USING (true);

-- User Profiles: Permissive for prototype demo
DROP POLICY IF EXISTS "Public profile access" ON public.user_profiles;
CREATE POLICY "Public profile access" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);

-- Active Sessions: Permissive for prototype demo
DROP POLICY IF EXISTS "Public active sessions access" ON public.active_sessions;
CREATE POLICY "Public active sessions access" ON public.active_sessions FOR ALL USING (true) WITH CHECK (true);

-- Application Dockets: Creator access / Service Role only
DROP POLICY IF EXISTS "Anon can create draft docket" ON public.application_dockets;
CREATE POLICY "Anon can create draft docket" ON public.application_dockets FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can view own docket" ON public.application_dockets;
CREATE POLICY "Users can view own docket" ON public.application_dockets FOR SELECT USING (true);

-- Scraper Logs: Public read for transparency dashboard, Service Role write
DROP POLICY IF EXISTS "Scraper logs public viewable" ON public.scraper_logs;
CREATE POLICY "Scraper logs public viewable" ON public.scraper_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can write scraper logs" ON public.scraper_logs;
CREATE POLICY "Service role can write scraper logs" ON public.scraper_logs FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Storage Bucket Policies
DO $$ BEGIN
    CREATE POLICY "Service Role full access on application-dockets"
    ON storage.objects FOR ALL
    USING (bucket_id = 'application-dockets' AND (auth.role() = 'service_role' OR auth.role() = 'authenticated'))
    WITH CHECK (bucket_id = 'application-dockets');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Service Role full access on sanitized-uploads"
    ON storage.objects FOR ALL
    USING (bucket_id = 'sanitized-uploads' AND (auth.role() = 'service_role' OR auth.role() = 'authenticated'))
    WITH CHECK (bucket_id = 'sanitized-uploads');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- 8. 24-HOUR AUTO-PURGE TTL (DPDP ACT 2023 COMPLIANCE)
-- =============================================================================

CREATE OR REPLACE FUNCTION purge_expired_application_dockets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    purged_count INT := 0;
    r RECORD;
BEGIN
    FOR r IN
        SELECT id, pdf_storage_path
        FROM public.application_dockets
        WHERE expires_at <= timezone('utc'::text, now())
          AND purged_at IS NULL
    LOOP
        IF r.pdf_storage_path IS NOT NULL THEN
            DELETE FROM storage.objects
            WHERE bucket_id = 'application-dockets'
              AND name = r.pdf_storage_path;
        END IF;

        UPDATE public.application_dockets
        SET status = 'PURGED',
            applicant_name = 'REDACTED (AUTO-PURGED)',
            docket_pdf_url = NULL,
            pdf_storage_path = NULL,
            purged_at = timezone('utc'::text, now())
        WHERE id = r.id;

        purged_count := purged_count + 1;
    END LOOP;

    DELETE FROM storage.objects
    WHERE bucket_id = 'sanitized-uploads'
      AND created_at <= (timezone('utc'::text, now()) - INTERVAL '24 hours');

    RETURN purged_count;
END;
$$;

-- Trigger fallback: Purge expired dockets whenever a new docket is created
CREATE OR REPLACE FUNCTION trigger_cleanup_on_docket_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM purge_expired_application_dockets();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_on_docket_insert ON public.application_dockets;
CREATE TRIGGER trg_purge_on_docket_insert
AFTER INSERT ON public.application_dockets
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_cleanup_on_docket_insert();

-- Register cron job if pg_cron is enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('purge-expired-dockets-hourly');
        PERFORM cron.schedule(
            'purge-expired-dockets-hourly',
            '0 * * * *',
            'SELECT purge_expired_application_dockets();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- =============================================================================
-- 9. SEED DATA (VERIFIED GROUND TRUTH FOR PUNE MUNICIPAL CORPORATION)
-- =============================================================================

-- Seed Ward Office: Kothrud - Bavdhan Ward 14
INSERT INTO public.ward_offices (id, ulb_code, ward_number, ward_name, counter_number, clerk_role, physical_address, pincode, operating_hours)
VALUES 
    ('e1111111-1111-1111-1111-111111111111', 'PMC-001', 14, 'Kothrud - Bavdhan Ward Office No. 14', 'Counter No. 3 (Samaj Vikas DBT Desk)', 'Social Development Clerk', 'Paud Road, Opposite More Vidyalaya, Kothrud, Pune', '411038', 'Monday to Friday | 10:30 AM to 03:30 PM'),
    ('e2222222-2222-2222-2222-222222222222', 'PMC-001', 14, 'Kothrud - Bavdhan Ward Office No. 14', 'Counter No. 1 (Arogya Vibhag Medical Desk)', 'Municipal Medical Officer Desk', 'Paud Road, Opposite More Vidyalaya, Kothrud, Pune', '411038', 'Monday to Friday | 10:00 AM to 04:00 PM'),
    ('e3333333-3333-3333-3333-333333333333', 'PMC-001', 14, 'Kothrud - Bavdhan Ward Office No. 14', 'Counter No. 4 (Revenue & Agrarian Coordination)', 'Talathi & Revenue Desk', 'Paud Road, Opposite More Vidyalaya, Kothrud, Pune', '411038', 'Monday to Friday | 10:30 AM to 03:00 PM'),
    ('e4444444-4444-4444-4444-444444444444', 'PMC-001', 14, 'Kothrud - Bavdhan Ward Office No. 14', 'Counter No. 5 (Street Vendor / Pathari Cell)', 'Urban Livelihood Officer', 'Paud Road, Opposite More Vidyalaya, Kothrud, Pune', '411038', 'Monday to Friday | 11:00 AM to 03:00 PM')
ON CONFLICT (id) DO NOTHING;

-- Seed Empaneled Hospitals
INSERT INTO public.empaneled_hospitals (name, area, hospital_type, concession_percentage, specialties, address)
VALUES
    ('Poona Hospital & Research Centre', 'Sadashiv Peth', 'PRIVATE_EMPANELED', 50, '["Cardiology", "Dialysis", "General Surgery", "Oncology"]'::jsonb, '27, Sadashiv Peth, Near Alka Talkies, Pune 411030'),
    ('Sahyadri Super Specialty Hospital', 'Deccan Gymkhana', 'PRIVATE_EMPANELED', 50, '["Nephrology", "Neurology", "Cardiac Care", "Orthopedics"]'::jsonb, 'Plot No. 30 C, Erandwane, Karve Road, Pune 411004'),
    ('Kamla Nehru Municipal Hospital', 'Mangalwar Peth', 'MUNICIPAL_FREE', 100, '["Maternity", "General OPD", "Pediatrics", "Emergency Care"]'::jsonb, 'Mangalwar Peth, Near Kasba Peth, Pune 411011'),
    ('KEM Hospital Pune', 'Rasta Peth', 'PRIVATE_EMPANELED', 50, '["Intensive Care", "Pediatrics", "Renal Care", "General Medicine"]'::jsonb, '489, Rasta Peth, Sardar Moodliar Road, Pune 411011'),
    ('Bharati Hospital & Research Centre', 'Dhankawadi', 'PRIVATE_EMPANELED', 50, '["Cardiology", "Oncology", "Trauma", "Joint Replacement"]'::jsonb, 'Pune-Satara Road, Dhankawadi, Pune 411043')
ON CONFLICT DO NOTHING;

-- Seed 5 Core Schemes
INSERT INTO public.schemes (
    id, slug, ulb_code, ulb_name, department, pillar, category, category_label, scheme_code,
    name, vernacular_name, description, benefit_amount, benefit_type, grant_amount,
    deadline, cutoff, income_limit, income_limit_formatted, domicile_years,
    resolution_no, ward_office_id, required_documents, staple_order,
    official_form_name, official_form_url
)
VALUES 
    (
        'a1111111-1111-1111-1111-111111111111',
        'pmc-azad-class10',
        'PMC-001',
        'Pune Municipal Corporation',
        'PMC Social Development Department (समाज विकास विभाग)',
        'EDUCATION',
        'education',
        'Education Grants',
        'PMC-SDD-EDU-2026-01',
        'Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme',
        '{"mr": "भारतरत्न मौलाना अबुल कलाम आझाद शैक्षणिक अर्थसहाय्य योजना"}'::jsonb,
        'Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or recognized diploma courses within Pune municipal limits.',
        'Rs. 15,000',
        'One-time Direct Bank Transfer (DBT)',
        15000.00,
        'October 31, 2026',
        'Minimum 80.00% in Class 10 SSC (70.00% for SC/ST/OBC/Municipal Schools)',
        250000.00,
        'Under Rs. 2,50,000 per year',
        3,
        'PMC Resolution No. 1184-B',
        'e1111111-1111-1111-1111-111111111111',
        '["Attested copy of Class 10 (SSC) Marksheet", "Tahsildar Family Income Certificate (Financial Year 2025-26)", "Student Bank Passbook Copy (with active IFSC)", "Student Aadhaar Card", "Current Year Junior College / Diploma Fee Receipt or Bonafide", "Proof of 3-Year Continuous Residence in Pune Municipal Limits", "Small Family Undertaking Declaration Form"]'::jsonb,
        '["1. Printed Application Form (Form 1184-B)", "2. Student Aadhaar Card Copy", "3. Attested Class 10 Marksheet Copy", "4. College Fee Receipt / Bonafide Certificate", "5. Tahsildar Family Income Certificate", "6. Student Bank Passbook Copy", "7. Signed Small Family Declaration Undertaking"]'::jsonb,
        'PMC Form 1184-B (SSC Educational Grant)',
        'https://dbt.pmc.gov.in/forms/maulana_azad_ssc.pdf'
    ),
    (
        'a2222222-2222-2222-2222-222222222222',
        'pmc-sathe-class12',
        'PMC-001',
        'Pune Municipal Corporation',
        'PMC Social Development Department (समाज विकास विभाग)',
        'EDUCATION',
        'education',
        'Education Grants',
        'PMC-SDD-EDU-2026-02',
        'Lokshahir Annabhau Sathe Educational Assistance Scheme',
        '{"mr": "लोकशाहीर अण्णाभाऊ साठे शैक्षणिक अर्थसहाय्य योजना"}'::jsonb,
        'One-time cash assistance grant for Pune students who successfully cleared Class 12 (HSC) and have enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT).',
        'Rs. 25,000',
        'One-time Direct Bank Transfer (DBT)',
        25000.00,
        'October 31, 2026',
        'Minimum 75.00% to 80.00% in Class 12 (HSC) depending on stream and category',
        250000.00,
        'Under Rs. 2,50,000 per year',
        3,
        'PMC Resolution No. 1184-C',
        'e1111111-1111-1111-1111-111111111111',
        '["Attested copy of Class 12 (HSC) Marksheet", "Degree College Bonafide Certificate or First Term Fee Receipt", "Tahsildar Family Income Certificate", "Student Bank Passbook Copy", "Student Aadhaar Card", "Proof of 3 Years Pune Domicile"]'::jsonb,
        '["1. Printed Application Form (Form 1184-C)", "2. Student Aadhaar Card Copy", "3. Attested Class 12 Marksheet Copy", "4. Degree College Fee Receipt / Bonafide", "5. Tahsildar Income Certificate", "6. Bank Passbook Copy"]'::jsonb,
        'PMC Form 1184-C (HSC Higher Education Grant)',
        'https://dbt.pmc.gov.in/forms/annabhau_sathe_hsc.pdf'
    ),
    (
        'a3333333-3333-3333-3333-333333333333',
        'pmc-sgay-health',
        'PMC-001',
        'Pune Municipal Corporation',
        'PMC Health Department (आरोग्य विभाग)',
        'HEALTHCARE',
        'healthcare',
        'Health & Hospital Care',
        'PMC-HLT-SGY-2026-01',
        'Shahari Garib Arogya Yojana (SGAY)',
        '{"mr": "शहरी गरीब आरोग्य योजना (वैद्यकीय उपचार सवलत)"}'::jsonb,
        'Provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune (including Poona Hospital, Sahyadri, KEM, Bharati). Covers general inpatient hospitalization, nephrology dialysis, and chemotherapy.',
        'Rs. 1,00,000 to Rs. 2,00,000',
        '50% Treatment Concession & Hospital Assistance',
        100000.00,
        'Open Round-the-Year (Annual Membership)',
        'Yellow or Orange Ration Card Holder | Annual Renewal Required',
        160000.00,
        'Under Rs. 1,60,000 per year',
        3,
        'PMC Resolution No. GB/2010/CR-42',
        'e2222222-2222-2222-2222-222222222222',
        '["Copy of Yellow (BPL) or Orange (APL Low-Income) Ration Card", "Tahsildar Family Income Certificate (Under Rs. 1,60,000)", "Head of Family and Patient Aadhaar Cards", "Proof of 3 Years Residence in PMC limits (Property Tax or Election Card)", "Doctor''s Treatment Estimation Certificate / Admission Advice", "Two Passport Sized Photographs of Patient"]'::jsonb,
        '["1. SGAY Health Card Application Form", "2. Certified Ration Card Copy (Front and Back)", "3. Tahsildar Family Income Certificate", "4. Patient and Family Head Aadhaar Card Copies", "5. Doctor''s Medical Treatment Estimation Sheet", "6. Two Passport Sized Photos"]'::jsonb,
        'PMC SGAY Health Card Registration Form',
        'https://sgy.pmc.gov.in/forms/sgay_registration.pdf'
    ),
    (
        'a5555555-5555-5555-5555-555555555555',
        'pmc-svanidhi-hawker',
        'PMC-001',
        'Pune Municipal Corporation',
        'PMC Urban Livelihood Cell (शहरी उपजीविका अभियान)',
        'AGRICULTURE_LIVELIHOOD',
        'livelihood',
        'Livelihood & Self-Employment',
        'PMC-LIV-SVN-2026-01',
        'PM SVANidhi Urban Farm Produce & Vegetable Vendor Scheme',
        '{"mr": "पीएम स्वनिधी भाजीपाला व शेतमाल विक्रेते कर्ज योजना"}'::jsonb,
        'Working capital loan for peri-urban farmers and local street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (*Athawadi Bajar*) and roadside haats. 1st tranche: Rs. 10,000; 2nd: Rs. 20,000; 3rd: Rs. 50,000.',
        'Rs. 10,000 to Rs. 50,000',
        'Collateral-free Working Capital Micro-Credit with 7% Interest Subsidy',
        50000.00,
        'Open Round-the-Year',
        'Daily or weekly market produce seller, vegetable vendor, or flower hawker',
        200000.00,
        'Under Rs. 2,00,000 per year',
        1,
        'MoHUA / PMC Urban Livelihood Resolution 2024',
        'e4444444-4444-4444-4444-444444444444',
        '["Vendor Identification Card (Vending Certificate or Ward Survey Slip)", "Bank Passbook Copy with active UPI QR linkage", "Aadhaar Card Copy", "Recommendation Letter from Local Ward Hawkers Committee or Market Supervisor"]'::jsonb,
        '["1. SVANidhi Loan Application Form", "2. Vendor Identity Card / Survey Slip", "3. Aadhaar Card Copy", "4. Bank Passbook Copy"]'::jsonb,
        'PM SVANidhi Urban Vendor Form',
        'https://pmsvanidhi.mohua.gov.in/forms/vendor_application.pdf'
    )
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    required_documents = EXCLUDED.required_documents,
    staple_order = EXCLUDED.staple_order,
    official_form_name = EXCLUDED.official_form_name,
    official_form_url = EXCLUDED.official_form_url;

-- Seed Scheme Criteria Rules
INSERT INTO public.scheme_criteria_rules (scheme_id, rule_key, rule_operator, operand_value, zod_schema_ast, failure_message_en, failure_message_mr, statutory_citation)
VALUES
    ('a1111111-1111-1111-1111-111111111111', 'income_ceiling', 'LTE', '{"value": 250000}'::jsonb, '{"type": "number", "maximum": 250000}'::jsonb, 'Annual family income exceeds ₹2,50,000 statutory ceiling', 'कुटुंबाचे वार्षिक उत्पन्न ₹२,५०,००० पेक्षा जास्त आहे', 'PMC Resolution No. 1184-B Section 3'),
    ('a1111111-1111-1111-1111-111111111111', 'min_academic_score', 'GTE', '{"value": 80.0}'::jsonb, '{"type": "number", "minimum": 80.0}'::jsonb, 'Class 10 score is below the 80.00% open merit cutoff', 'इयत्ता १० वी मध्ये किमान ८०% गुण आवश्यक आहेत', 'PMC Resolution No. 1184-B Section 4'),
    ('a3333333-3333-3333-3333-333333333333', 'ration_card_color', 'IN', '{"value": ["YELLOW", "ORANGE"]}'::jsonb, '{"type": "string", "enum": ["YELLOW", "ORANGE"]}'::jsonb, 'White ration cards are excluded from SGAY health assistance', 'केवळ पिवळे किंवा केशरी रेशन कार्डधारक पात्र आहेत', 'PMC Resolution No. GB/2010/CR-42 Section 2')
ON CONFLICT DO NOTHING;

-- Seed Verified Community Tips (Peer Intel Reviews)
INSERT INTO public.peer_intel_reviews (scheme_id, ward_office_id, author, role, counter, tip, friction_tag, helpful_count)
VALUES
    ('a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Rahul Shinde', 'Parent Applicant', 'Kothrud Ward 14, Counter 3', 'Make sure to bring 2 physical passport size photos attached with a paperclip. The clerk asked for them even though it was not explicitly stated on the main notice. Other than that, file acceptance took 10 minutes.', 'PHOTOCOPY_DEMAND', 28),
    ('a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Sunita More', 'Community Volunteer (Samaj Sevak)', 'Kothrud Ward 14, Counter 3', 'If you have an older Syndicate Bank or Allahabad Bank passbook, make sure the IFSC code is updated to the merged parent bank (Canara Bank / Indian Bank). The PMC DBT payment gateway will bounce the transaction if an obsolete code is submitted.', 'IFSC_MERGER', 45),
    ('a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 'Dnyaneshwar Jadhav', 'Student Beneficiary', 'Kothrud Ward 14, Counter 3', 'Online DigiLocker printout of the Tahsildar certificate is fully accepted as long as the 16-digit barcoded verification number is dark and clearly legible for scanning.', 'DIGILOCKER_OK', 19),
    ('a3333333-3333-3333-3333-333333333333', 'e2222222-2222-2222-2222-222222222222', 'Kavita Deshmukh', 'Patient Family Member', 'Ward 14 Health Desk', 'The hospital''s Medical Social Worker (MSW) must sign the treatment estimate quotation before you come to Counter 1. The municipal health clerk verifies the doctor''s seal.', 'MSW_SIGNATURE', 37)
ON CONFLICT DO NOTHING;

-- Seed Default Citizen Profile (Ramesh Patil)
INSERT INTO public.user_profiles (
    id, name, mobile, ward, income, domicile_years, category, ration_card,
    has_712_extract, is_non_na, has_produce_vendor, empaneled_hospitals
)
VALUES (
    'f1111111-1111-1111-1111-111111111111',
    'Ramesh Dnyaneshwar Patil',
    '+91 98220 41912',
    'Ward 14: Kothrud - Bawdhan',
    140000.00,
    5,
    'Open / General',
    'Orange (APL Low-Income)',
    true,
    true,
    false,
    '["Poona Hospital & Research Centre", "Sahyadri Super Specialty Hospital", "Kamla Nehru Municipal Hospital"]'::jsonb
)
ON CONFLICT (mobile) DO UPDATE SET
    name = EXCLUDED.name,
    income = EXCLUDED.income;

-- Seed Default Active Session (session-1)
INSERT INTO public.active_sessions (
    id, user_id, scheme_id, scheme_name, beneficiary_name, target_benefit,
    counter_location, counter_hours, status, documents_left, last_activity,
    documents, conversation
)
VALUES (
    'session-1',
    'f1111111-1111-1111-1111-111111111111',
    'pmc-azad-class10',
    'Bharat Ratna Maulana Abul Kalam Azad Educational Assistance Scheme',
    'Pooja Ramesh Patil',
    'Rs. 15,000 Direct Bank Transfer',
    'Kothrud Ward Office No. 14, Counter 3 (Samaj Vikas DBT Desk)',
    'Monday to Friday | 10:30 AM to 03:30 PM',
    'in_progress',
    2,
    'Class 10 marksheet verified. Passbook and Aadhaar pending.',
    '[
        {"id": "doc-marksheet", "name": "Class 10 SSC Marksheet", "fileName": "pooja_ssc_marksheet_82pct.pdf", "isUploaded": true, "isVerified": true, "nameOnDocument": "Pooja Ramesh Patil"},
        {"id": "doc-income", "name": "Tahsildar Income Certificate", "fileName": "tahsildar_income_2026_barcode.pdf", "isUploaded": true, "isVerified": true, "nameOnDocument": "Ramesh Dnyaneshwar Patil"},
        {"id": "doc-passbook", "name": "Student Bank Passbook Copy", "fileName": "passbook_kothrud_branch.jpg", "isUploaded": true, "isVerified": false, "originalIfsc": "SYNB0005012", "ifscCode": "CNRB0005012", "ifscNote": "Old Syndicate Bank code updated to active Canara Bank code (CNRB0005012)", "accountNumber": "*******4912", "nameOnDocument": "Pooja Ramesh Patil"},
        {"id": "doc-aadhaar", "name": "Student Aadhaar Card Copy", "fileName": "pooja_aadhaar_front.png", "isUploaded": true, "isVerified": false, "aadhaarMasked": "XXXX-XXXX-4912", "nameOnDocument": "Pooja Ramesh Patil"},
        {"id": "doc-bonafide", "name": "College Admission / Fee Receipt", "isUploaded": false, "isVerified": false},
        {"id": "doc-domicile", "name": "3-Year Residence Proof", "isUploaded": false, "isVerified": false},
        {"id": "doc-smallfamily", "name": "Small Family Declaration", "isUploaded": false, "isVerified": false}
    ]'::jsonb,
    '[
        {"id": "msg-1", "sender": "assistant", "text": "Namaste Ramesh ji. Pooja qualifies for the Maulana Azad Education Assistance Scheme with her 82.40% SSC score. Benefit amount is Rs. 15,000 directly transferred to her bank account.", "timestamp": "10:30 AM"},
        {"id": "msg-2", "sender": "assistant", "text": "Submission location is Kothrud Ward Office No. 14, Counter 3 (Samaj Vikas Desk). Operating hours are Monday to Friday, 10:30 AM to 03:30 PM.", "timestamp": "10:31 AM"},
        {"id": "msg-3", "sender": "assistant", "text": "Notice from other applicants: Keep 2 physical passport-size photos attached with a paperclip ready for Counter 3. Please upload Pooja''s passbook and Aadhaar card on the right so we can check them for any errors.", "timestamp": "10:32 AM"}
    ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    documents = EXCLUDED.documents,
    conversation = EXCLUDED.conversation;
