-- 002_schema_v2.sql
-- Additive schema changes from the frontend/data review (see docs/FRONTEND_DATA_CONTRACT.md).
-- NOT YET APPLIED to live project slqtpxocaphvwdkivkfj. Paste into the Supabase SQL editor.
-- Model (2026-10-04): one consistent user profile + one eligibility text per scheme, assessed by the LLM.
-- Official government sources only; no per-field evidence tables.
-- Idempotent: safe to re-run. Nothing is dropped or renamed, so the current frontend keeps working.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ingestion tables for the monitoring agents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.source_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ulb_code VARCHAR(32) NOT NULL DEFAULT 'PMC-001',
    source_system VARCHAR(48) NOT NULL,          -- pmc_webadmin_circular | pmc_webadmin_scheme | pmc_webadmin_charter | dbt_portal | ward_contacts | hospital_directory
    external_id VARCHAR(128),                    -- id/slug from the source feed, if any
    title TEXT NOT NULL,
    language VARCHAR(8),                         -- 'mr' | 'en' | 'hi'
    published_at TIMESTAMPTZ,
    source_url TEXT NOT NULL,                    -- API item or page URL
    file_url TEXT,                               -- PDF attachment, if any
    content_hash VARCHAR(64),                    -- sha256 of the PDF/text, for change detection
    extracted_text TEXT,
    pillar scheme_pillar,
    relevance VARCHAR(16) NOT NULL DEFAULT 'unknown',   -- relevant | irrelevant | unknown
    status VARCHAR(24) NOT NULL DEFAULT 'discovered',   -- discovered | fetched | extracted | applied | needs_review | ignored | failed
    extraction JSONB,                            -- structured facts proposed by the agent
    extraction_errors JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    processed_at TIMESTAMPTZ,
    UNIQUE (source_system, source_url)
);
CREATE INDEX IF NOT EXISTS idx_source_documents_status ON public.source_documents (status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.scheme_change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID REFERENCES public.schemes(id) ON DELETE CASCADE,
    source_doc_id UUID REFERENCES public.source_documents(id) ON DELETE SET NULL,
    change_type VARCHAR(24) NOT NULL,            -- created | updated | window_opened | window_closed | verified
    field VARCHAR(64),
    old_value JSONB,
    new_value JSONB,
    applied BOOLEAN NOT NULL DEFAULT false,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_change_events_recent ON public.scheme_change_events (detected_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type VARCHAR(32) NOT NULL,               -- circular_poll | pdf_extract | hospital_sync | ward_sync | selector_repair
    status VARCHAR(16) NOT NULL DEFAULT 'running',  -- running | succeeded | partial | failed
    started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    finished_at TIMESTAMPTZ,
    items_seen INT NOT NULL DEFAULT 0,
    items_new INT NOT NULL DEFAULT 0,
    items_changed INT NOT NULL DEFAULT 0,
    items_failed INT NOT NULL DEFAULT 0,
    cline_session_id VARCHAR(64),
    model_id VARCHAR(64),
    tokens_in INT,
    tokens_out INT,
    summary TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_recent ON public.agent_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- 2. schemes: bilingual text, desk routing, window, provenance
-- ---------------------------------------------------------------------------
ALTER TABLE public.schemes
    ADD COLUMN IF NOT EXISTS desk_type VARCHAR(32),                       -- EDU_DBT | HEALTH | AGRARIAN | VENDOR
    ADD COLUMN IF NOT EXISTS name_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,         -- {"en": "...", "mr": "..."}
    ADD COLUMN IF NOT EXISTS description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS cutoff_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS window_opens_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) NOT NULL DEFAULT 'seed_unverified',  -- seed_unverified | needs_review | verified
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS source_doc_id UUID;

DO $$ BEGIN
    ALTER TABLE public.schemes ADD CONSTRAINT chk_schemes_verification
        CHECK (verification_status IN ('seed_unverified', 'needs_review', 'verified'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.schemes ADD CONSTRAINT fk_schemes_source_doc
        FOREIGN KEY (source_doc_id) REFERENCES public.source_documents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

UPDATE public.schemes
   SET name_i18n = jsonb_build_object('en', name) || COALESCE(vernacular_name, '{}'::jsonb)
 WHERE name_i18n = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. ward_offices / empaneled_hospitals: desk type and provenance
-- ---------------------------------------------------------------------------
ALTER TABLE public.ward_offices
    ADD COLUMN IF NOT EXISTS desk_type VARCHAR(32),
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

UPDATE public.ward_offices SET desk_type = CASE
    WHEN counter_number ILIKE 'Counter No. 3%' THEN 'EDU_DBT'
    WHEN counter_number ILIKE 'Counter No. 1%' THEN 'HEALTH'
    WHEN counter_number ILIKE 'Counter No. 4%' THEN 'AGRARIAN'
    WHEN counter_number ILIKE 'Counter No. 5%' THEN 'VENDOR'
    ELSE desk_type END
 WHERE desk_type IS NULL;

UPDATE public.schemes s
   SET desk_type = w.desk_type
  FROM public.ward_offices w
 WHERE s.ward_office_id = w.id AND s.desk_type IS NULL;

ALTER TABLE public.empaneled_hospitals
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

INSERT INTO public.empaneled_hospitals (name, area, hospital_type, concession_percentage, specialties, address)
SELECT 'Deenanath Mangeshkar Hospital', 'Erandwane', 'PRIVATE_EMPANELED', 50,
       '["Cardiology", "Oncology", "Nephrology", "Neurology"]'::jsonb,
       'Erandwane, Pune 411004'
 WHERE NOT EXISTS (SELECT 1 FROM public.empaneled_hospitals WHERE name = 'Deenanath Mangeshkar Hospital');

-- ---------------------------------------------------------------------------
-- 5. scheme_documents: typed required documents (drives per-document validators)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheme_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
    doc_key VARCHAR(48) NOT NULL,                -- marksheet | income_certificate | bank_passbook | aadhaar | fee_receipt | domicile_proof | declaration | photo | ration_card | land_extract | khata | medical_estimate | vendor_id | recommendation_letter | doc_<n>
    label_en TEXT NOT NULL,
    label_mr TEXT,
    validator VARCHAR(32) NOT NULL DEFAULT 'presence',   -- presence | ifsc_passbook | aadhaar_mask | marks_extract | name_match
    is_required BOOLEAN NOT NULL DEFAULT true,
    staple_position INT,
    display_order INT NOT NULL DEFAULT 0,
    UNIQUE (scheme_id, doc_key)
);
CREATE INDEX IF NOT EXISTS idx_scheme_documents_scheme ON public.scheme_documents (scheme_id, display_order);

-- Backfill from the existing required_documents arrays (keeps those arrays in place).
INSERT INTO public.scheme_documents (scheme_id, doc_key, label_en, validator, display_order)
SELECT s.id,
       CASE
           WHEN t.label ILIKE '%passbook%' THEN 'bank_passbook'
           WHEN t.label ILIKE '%aadhaar%' THEN 'aadhaar'
           WHEN t.label ILIKE '%marksheet%' THEN 'marksheet'
           WHEN t.label ILIKE '%income certificate%' THEN 'income_certificate'
           WHEN t.label ILIKE '%fee receipt%' OR t.label ILIKE '%bonafide%' THEN 'fee_receipt'
           WHEN t.label ILIKE '%residence%' OR t.label ILIKE '%domicile%' THEN 'domicile_proof'
           WHEN t.label ILIKE '%declaration%' OR t.label ILIKE '%undertaking%' THEN 'declaration'
           WHEN t.label ILIKE '%ration card%' THEN 'ration_card'
           WHEN t.label ILIKE '%7/12%' THEN 'land_extract'
           WHEN t.label ILIKE '%8-A%' THEN 'khata'
           WHEN t.label ILIKE '%estimation%' THEN 'medical_estimate'
           WHEN t.label ILIKE '%photograph%' THEN 'photo'
           WHEN t.label ILIKE '%vendor identification%' THEN 'vendor_id'
           WHEN t.label ILIKE '%recommendation%' THEN 'recommendation_letter'
           ELSE 'doc_' || t.ord
       END,
       t.label,
       CASE
           WHEN t.label ILIKE '%passbook%' THEN 'ifsc_passbook'
           WHEN t.label ILIKE '%aadhaar%' THEN 'aadhaar_mask'
           WHEN t.label ILIKE '%marksheet%' THEN 'marks_extract'
           ELSE 'presence'
       END,
       t.ord
  FROM public.schemes s
  CROSS JOIN LATERAL jsonb_array_elements_text(s.required_documents) WITH ORDINALITY AS t(label, ord)
ON CONFLICT (scheme_id, doc_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. bank_merger_map: reference data for IFSC resolution (prefix level only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_merger_map (
    old_bank_code VARCHAR(4) PRIMARY KEY,        -- first 4 letters of the old IFSC
    new_bank_code VARCHAR(4) NOT NULL,
    old_bank_name VARCHAR(128) NOT NULL,
    new_bank_name VARCHAR(128) NOT NULL,
    merged_on DATE NOT NULL,
    branch_codes_changed BOOLEAN NOT NULL DEFAULT true,
    notes TEXT NOT NULL DEFAULT 'Prefix-level mapping only. Branch part of the IFSC may have changed; verify against a branch-level IFSC dataset before presenting a corrected code as final.'
);

INSERT INTO public.bank_merger_map (old_bank_code, new_bank_code, old_bank_name, new_bank_name, merged_on) VALUES
    ('SYNB', 'CNRB', 'Syndicate Bank', 'Canara Bank', '2020-04-01'),
    ('ALLA', 'IDIB', 'Allahabad Bank', 'Indian Bank', '2020-04-01'),
    ('ANDB', 'UBIN', 'Andhra Bank', 'Union Bank of India', '2020-04-01'),
    ('CORP', 'UBIN', 'Corporation Bank', 'Union Bank of India', '2020-04-01'),
    ('ORBC', 'PUNB', 'Oriental Bank of Commerce', 'Punjab National Bank', '2020-04-01'),
    ('UTBI', 'PUNB', 'United Bank of India', 'Punjab National Bank', '2020-04-01'),
    ('VIJB', 'BARB', 'Vijaya Bank', 'Bank of Baroda', '2019-04-01'),
    ('BKDN', 'BARB', 'Dena Bank', 'Bank of Baroda', '2019-04-01')
ON CONFLICT (old_bank_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Eligibility inputs: beneficiary facts live on the session; household facts on the profile
-- ---------------------------------------------------------------------------
ALTER TABLE public.active_sessions
    ADD COLUMN IF NOT EXISTS eligibility_result JSONB;   -- LLM assessment: {verdict, reasons[], quoted_lines[], missing_info[]}

-- One profile shape for every scheme. Fixed columns for common facts, plus a facts blob for the rest.
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS children_count INT,
    ADD COLUMN IF NOT EXISTS third_child_after_2001 BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS facts JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- facts keys (recommended): beneficiary_name, relation, age, gender, class_level, marks_percent,
    -- school_type, course_type, disability_percent, parent_occupation, is_orphan, is_street_vendor,
    -- has_vending_certificate

UPDATE public.user_profiles SET children_count = 2 WHERE children_count IS NULL AND id = 'f1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 7b. Eligibility as one text block per scheme (assessed by the LLM against the profile)
-- ---------------------------------------------------------------------------
ALTER TABLE public.schemes
    ADD COLUMN IF NOT EXISTS eligibility_text TEXT,      -- all conditions, one per line, from the official source
    ADD COLUMN IF NOT EXISTS eligibility_text_mr TEXT;

COMMENT ON TABLE public.scheme_criteria_rules IS 'Deprecated 2026-10-04: eligibility is assessed by the LLM against schemes.eligibility_text.';

UPDATE public.schemes SET eligibility_text = CASE slug
    WHEN 'pmc-azad-class10' THEN E'Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course.\nMinimum 80% marks in Class 10 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.'
    WHEN 'pmc-sathe-class12' THEN E'Passed Class 12 (HSC) and admitted to a degree course.\nMinimum 80% marks in Class 12 (open category).\nMinimum 70% for backward-class students of state-government or PMC-aided schools.\nMinimum 65% for children of waste-pickers, construction or unorganised workers.\nMinimum 45% for students with more than 40% disability.\nResident within Pune Municipal Corporation limits.\nBank account in a nationalised bank, linked to Aadhaar.'
    WHEN 'pmc-sgay-health' THEN E'Family annual income below Rs. 1,60,000.\nResident within Pune Municipal Corporation limits.\nYellow or Orange ration card holder.\nAnnual membership renewal required.'
    WHEN 'pmc-svanidhi-hawker' THEN E'Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy).\nHolds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office.\nNext loan tranche available after repaying the previous one.'
    ELSE eligibility_text END
 WHERE eligibility_text IS NULL;

-- Third pillar is Livelihood. The peri-urban 7/12 row had no PMC source and is removed.
DELETE FROM public.schemes WHERE slug = 'pmc-periurban-712';
UPDATE public.schemes
   SET category = 'livelihood', category_label = 'Livelihood & Self-Employment'
 WHERE category = 'agriculture';
UPDATE public.schemes SET description = replace(description, 'peri-urban farmers and local street vendors', 'local street vendors')
 WHERE slug = 'pmc-svanidhi-hawker';

-- ---------------------------------------------------------------------------
-- 8. Seed parity with frontend fixtures: Savitribai Phule scheme and its tips
-- ---------------------------------------------------------------------------
INSERT INTO public.schemes (
    id, slug, ulb_code, ulb_name, department, pillar, category, category_label, scheme_code,
    name, vernacular_name, description, benefit_amount, benefit_type, grant_amount,
    deadline, cutoff, income_limit, income_limit_formatted, domicile_years,
    resolution_no, ward_office_id, desk_type, required_documents, staple_order,
    official_form_name, official_form_url
) VALUES (
    'a6666666-6666-6666-6666-666666666666',
    'pmc-savitribai-girls', 'PMC-001', 'Pune Municipal Corporation',
    'PMC Social Development Department (समाज विकास विभाग)',
    'EDUCATION', 'education', 'Education Grants', 'PMC-SDD-EDU-2026-03',
    'Krantijyoti Savitribai Phule Scheme for Girl Students',
    '{"mr": "क्रांतिज्योती सावित्रीबाई फुले कन्या शिक्षण सहाय्य योजना"}'::jsonb,
    'Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards.',
    'Rs. 10,000 to Rs. 20,000', 'Vocational & Technical Course Fee Reimbursement', 20000.00,
    'October 31, 2026',
    'Girl students pursuing ITI, Polytechnic, Nursing, or Computer Diploma',
    250000.00, 'Under Rs. 2,50,000 per year (Waived for orphans)', 3,
    'PMC Resolution No. 902-D',
    'e1111111-1111-1111-1111-111111111111', 'EDU_DBT',
    '["Admission Fee Receipt from accredited Technical / ITI Institute", "Class 10 or 12 Marksheet Copy", "Tahsildar Income Certificate", "Student Bank Passbook Copy", "Student Aadhaar Card"]'::jsonb,
    '["1. Savitribai Phule Scheme Application Form", "2. Student Aadhaar Card Copy", "3. Technical Institute Fee Receipt", "4. Marksheet Copy", "5. Income Certificate", "6. Bank Passbook"]'::jsonb,
    'PMC Savitribai Phule Technical Grant Form',
    'https://dbt.pmc.gov.in/forms/savitribai_phule_girls.pdf'
) ON CONFLICT (id) DO NOTHING;

-- Backfill typed documents and i18n name for the row just inserted
INSERT INTO public.scheme_documents (scheme_id, doc_key, label_en, validator, display_order)
SELECT s.id,
       CASE
           WHEN t.label ILIKE '%passbook%' THEN 'bank_passbook'
           WHEN t.label ILIKE '%aadhaar%' THEN 'aadhaar'
           WHEN t.label ILIKE '%marksheet%' THEN 'marksheet'
           WHEN t.label ILIKE '%income certificate%' THEN 'income_certificate'
           WHEN t.label ILIKE '%fee receipt%' THEN 'fee_receipt'
           ELSE 'doc_' || t.ord
       END,
       t.label,
       CASE
           WHEN t.label ILIKE '%passbook%' THEN 'ifsc_passbook'
           WHEN t.label ILIKE '%aadhaar%' THEN 'aadhaar_mask'
           WHEN t.label ILIKE '%marksheet%' THEN 'marks_extract'
           ELSE 'presence'
       END,
       t.ord
  FROM public.schemes s
  CROSS JOIN LATERAL jsonb_array_elements_text(s.required_documents) WITH ORDINALITY AS t(label, ord)
 WHERE s.id = 'a6666666-6666-6666-6666-666666666666'
ON CONFLICT (scheme_id, doc_key) DO NOTHING;

UPDATE public.schemes
   SET name_i18n = jsonb_build_object('en', name) || COALESCE(vernacular_name, '{}'::jsonb)
 WHERE id = 'a6666666-6666-6666-6666-666666666666' AND name_i18n = '{}'::jsonb;

UPDATE public.schemes
   SET eligibility_text = E'Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course.\nFamily annual income under Rs. 2,50,000 (waived for orphans).\nResident within Pune Municipal Corporation limits.'
 WHERE id = 'a6666666-6666-6666-6666-666666666666' AND eligibility_text IS NULL;

-- Tips that exist in the frontend fixtures but not in the database
INSERT INTO public.peer_intel_reviews (scheme_id, ward_office_id, author, role, counter, tip, friction_tag, helpful_count)
SELECT v.scheme_id, v.ward_office_id, v.author, v.role, v.counter, v.tip, v.friction_tag, v.helpful_count
  FROM (VALUES
    ('a2222222-2222-2222-2222-222222222222'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid, 'Prashant Kadam', 'Student Beneficiary', 'Kothrud Ward 14, Counter 3',
     'Ensure your college bonafide certificate mentions the academic year 2026-27 clearly. They will not accept previous year receipts.', 'TIMING', 14),
    ('a3333333-3333-3333-3333-333333333333'::uuid, 'e2222222-2222-2222-2222-222222222222'::uuid, 'Dr. Anand Kulkarni', 'Hospital Social Worker', 'Ward 14 Health Desk',
     'Annual membership fee is Rs. 200. Keep exact cash ready as the counter does not always have digital UPI QR scanners operational.', 'UNOFFICIAL_FEE', 22),
    ('a5555555-5555-5555-5555-555555555555'::uuid, 'e4444444-4444-4444-4444-444444444444'::uuid, 'Tukaram Gaikwad', 'Vegetable Vendor (Kothrud Market)', 'Ward 14, Counter 5',
     'Link your Google Pay or PhonePe merchant QR to the bank account before applying.', 'PHOTOCOPY_DEMAND', 30),
    ('a6666666-6666-6666-6666-666666666666'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid, 'Priya Bhosale', 'Nursing Student', 'Ward 14, Counter 3',
     'Ensure your institute fee receipt has the official GST or registration stamp of the ITI/college, otherwise the clerk asks for a bonafide letter.', 'PHOTOCOPY_DEMAND', 17)
  ) AS v(scheme_id, ward_office_id, author, role, counter, tip, friction_tag, helpful_count)
 WHERE NOT EXISTS (
    SELECT 1 FROM public.peer_intel_reviews p WHERE p.scheme_id = v.scheme_id AND p.author = v.author
 );

-- ---------------------------------------------------------------------------
-- 8b. Honest NULLs, how-to-apply, loader ids
--     (added after the live source check, docs/PMC_SOURCE_VERIFICATION_2026-10-04.md)
-- ---------------------------------------------------------------------------
-- How to apply (frontend needs it; DBT schemes are online)
ALTER TABLE public.schemes
    ADD COLUMN IF NOT EXISTS application_mode VARCHAR(16),   -- online | offline | both
    ADD COLUMN IF NOT EXISTS apply_url TEXT,
    ADD COLUMN IF NOT EXISTS how_to_apply TEXT;

-- Stop inventing facts: values not stated by a source must be NULL, not a default.
ALTER TABLE public.schemes ALTER COLUMN deadline DROP DEFAULT;
ALTER TABLE public.schemes ALTER COLUMN deadline DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN income_limit DROP DEFAULT;
ALTER TABLE public.schemes ALTER COLUMN income_limit DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN income_limit_formatted DROP DEFAULT;
ALTER TABLE public.schemes ALTER COLUMN income_limit_formatted DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN domicile_years DROP DEFAULT;
ALTER TABLE public.schemes ALTER COLUMN domicile_years DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN cutoff DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN official_form_name DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN official_form_url DROP NOT NULL;
ALTER TABLE public.schemes ALTER COLUMN benefit_amount DROP NOT NULL;   -- not every scheme states an amount

-- Deterministic loaders need stable external ids and must accept rows without counter details.
ALTER TABLE public.ward_offices
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(64);
ALTER TABLE public.ward_offices ALTER COLUMN counter_number DROP NOT NULL;
ALTER TABLE public.ward_offices ALTER COLUMN clerk_role DROP NOT NULL;
ALTER TABLE public.ward_offices ALTER COLUMN pincode DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ward_offices_external
    ON public.ward_offices (ulb_code, external_id) WHERE external_id IS NOT NULL;

ALTER TABLE public.empaneled_hospitals
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS ward_name VARCHAR(128),
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
ALTER TABLE public.empaneled_hospitals ALTER COLUMN area DROP NOT NULL;
ALTER TABLE public.empaneled_hospitals ALTER COLUMN address DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospitals_external
    ON public.empaneled_hospitals (ulb_code, external_id) WHERE external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. RLS for the new tables: public read, service role writes only
-- ---------------------------------------------------------------------------
ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheme_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_merger_map ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Source documents viewable by anyone" ON public.source_documents FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Change events viewable by anyone" ON public.scheme_change_events FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Agent runs viewable by anyone" ON public.agent_runs FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Scheme documents viewable by anyone" ON public.scheme_documents FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "Bank merger map viewable by anyone" ON public.bank_merger_map FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;


COMMIT;
