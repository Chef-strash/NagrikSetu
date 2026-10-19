-- 003_feedback_system.sql
-- Read-only citizen feedback: maintained scheme FAQs + approved scheme reviews.
-- Model (from my_plans/feedback_system.md, 2026-10-04):
--   * FAQ answers come from maintained `scheme_faqs` rows (retrieval + small RAG).
--   * Reviews are EXISTING rows in `peer_intel_reviews`; the public portal never writes.
--   * Both experiences are scheme-level; reviews are NOT filtered by ward/counter.
-- Official sources only; no fabricated statutory facts. Idempotent: safe to re-run.
-- Apply in the Supabase SQL editor against project slqtpxocaphvwdkivkfj, AFTER 001/002.

BEGIN;

-- ===========================================================================
-- 1. scheme_faqs  (maintained question/answer records, one scheme each)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.scheme_faqs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id       UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
    question        TEXT NOT NULL CHECK (length(trim(question)) > 0),
    answer          TEXT NOT NULL CHECK (length(trim(answer)) > 0),
    language_code   VARCHAR(8) NOT NULL DEFAULT 'en',
    display_order   INT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at    TIMESTAMPTZ
);

-- Idempotent seeding key: one question per scheme per language.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scheme_faqs_scheme_lang_question
    ON public.scheme_faqs (scheme_id, language_code, question);

-- Ordered read path for a scheme page.
CREATE INDEX IF NOT EXISTS idx_scheme_faqs_scheme_language_order
    ON public.scheme_faqs (scheme_id, language_code, display_order)
    WHERE status = 'PUBLISHED';

-- Full-text search path for the FAQ answer endpoint.
CREATE INDEX IF NOT EXISTS idx_scheme_faqs_search
    ON public.scheme_faqs USING GIN (
        to_tsvector('simple', question || ' ' || answer)
    ) WHERE status = 'PUBLISHED';

-- ---------------------------------------------------------------------------
-- RLS: public may read PUBLISHED FAQs only. No public writes at all.
-- FAQ creation/updates happen through the service role (trusted maintenance).
-- ---------------------------------------------------------------------------
ALTER TABLE public.scheme_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published scheme FAQs are readable" ON public.scheme_faqs;
CREATE POLICY "Published scheme FAQs are readable"
    ON public.scheme_faqs FOR SELECT
    USING (status = 'PUBLISHED');

REVOKE INSERT, UPDATE, DELETE ON public.scheme_faqs FROM anon, authenticated;
GRANT SELECT ON public.scheme_faqs TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ranked FAQ retrieval (used by POST /api/v1/schemes/:slug/faq-answer).
-- SECURITY INVOKER: subject to the published-only RLS policy above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_scheme_faqs(
    p_scheme_id UUID,
    p_query TEXT,
    p_languages TEXT[] DEFAULT ARRAY['en']::TEXT[]
)
RETURNS TABLE (
    id UUID,
    question TEXT,
    answer TEXT,
    language_code VARCHAR(8),
    display_order INT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT f.id, f.question, f.answer, f.language_code, f.display_order
    FROM public.scheme_faqs f
    WHERE f.scheme_id = p_scheme_id
      AND f.status = 'PUBLISHED'
      AND (p_languages IS NULL OR f.language_code = ANY(p_languages))
      AND to_tsvector('simple', f.question || ' ' || f.answer)
          @@ plainto_tsquery('simple', coalesce(p_query, ''))
    ORDER BY
      ts_rank(
          to_tsvector('simple', f.question || ' ' || f.answer),
          plainto_tsquery('simple', coalesce(p_query, ''))
      ) DESC,
      f.display_order,
      f.id
    LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.search_scheme_faqs(UUID, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_scheme_faqs(UUID, TEXT, TEXT[]) TO anon, authenticated;

COMMIT;

-- ===========================================================================
-- 2. peer_intel_reviews: public access becomes READ-ONLY, approved rows only.
--    Drops both the base (SUPABASE_SETUP.sql) and 001 tightened write policies,
--    whichever are installed, then revokes all write privileges.
-- ===========================================================================
BEGIN;

DROP POLICY IF EXISTS "Anyone can submit peer review"         ON public.peer_intel_reviews;
DROP POLICY IF EXISTS "Anyone can upvote peer review"         ON public.peer_intel_reviews;
DROP POLICY IF EXISTS "Anyone can submit bounded peer review" ON public.peer_intel_reviews;
DROP POLICY IF EXISTS "Peer reviews viewable by anyone"       ON public.peer_intel_reviews;
DROP POLICY IF EXISTS "Approved scheme reviews are readable"  ON public.peer_intel_reviews;

-- The old upvote function could still increment rows (SECURITY DEFINER); remove it.
DROP FUNCTION IF EXISTS public.upvote_peer_review(UUID);

ALTER TABLE public.peer_intel_reviews ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.peer_intel_reviews FROM anon, authenticated;
GRANT SELECT ON public.peer_intel_reviews TO anon, authenticated;

CREATE POLICY "Approved scheme reviews are readable"
    ON public.peer_intel_reviews FOR SELECT
    USING (scheme_id IS NOT NULL AND verified_by_moderator = TRUE);

COMMIT;

-- ===========================================================================
-- 3. Seed maintained FAQs for the five live PMC schemes.
--    Every answer is derived ONLY from the scheme's own stored fields
--    (description, eligibility_text, required_documents, benefit_amount,
--    deadline, income_limit_formatted, official_form_url). No invented rules.
--    Idempotent via uq_scheme_faqs_scheme_lang_question.
-- ===========================================================================
BEGIN;

INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, v.language_code, v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('What is this scheme?',
     'Financial assistance for meritorious students who passed Class 10 (SSC) and are admitted to Junior College (Class 11) or a recognised diploma course within Pune municipal limits.',
     'en', 1),
    ('Who is eligible?',
     'Passed Class 10 (SSC) and admitted to Class 11 or a recognised diploma course. Minimum 80% marks in Class 10 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar.',
     'en', 2),
    ('How much is the benefit?',
     'Rs. 15,000, paid as a one-time Direct Bank Transfer (DBT) to the student''s bank account.',
     'en', 3),
    ('Which documents are required?',
     'Attested copy of Class 10 (SSC) marksheet; Tahsildar Family Income Certificate (FY 2025-26); student bank passbook copy with active IFSC; student Aadhaar card; current-year Junior College or Diploma fee receipt or bonafide; proof of 3-year continuous residence in PMC limits; and a signed Small Family Undertaking Declaration.',
     'en', 4),
    ('What is the application deadline?',
     'The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling.',
     'en', 5),
    ('Where do I submit the application?',
     'Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk), Monday to Friday, 10:30 AM to 03:30 PM. The official form is available from the PMC DBT portal.',
     'en', 6)
) AS v(question, answer, language_code, display_order)
WHERE s.slug = 'pmc-azad-class10'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();

COMMIT;

BEGIN;
INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, v.language_code, v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('What is this scheme?',
     'One-time cash assistance grant for Pune students who cleared Class 12 (HSC) and enrolled into higher degree programs (Engineering, Medical, Commerce, Science, Arts, IT).',
     'en', 1),
    ('Who is eligible?',
     'Passed Class 12 (HSC) and admitted to a degree course. Minimum 80% marks in Class 12 (open category); 70% for backward-class students of state-government or PMC-aided schools; 65% for children of waste-pickers, construction or unorganised workers; 45% for students with more than 40% disability. Resident within Pune Municipal Corporation limits. Bank account in a nationalised bank, linked to Aadhaar.',
     'en', 2),
    ('How much is the benefit?',
     'Rs. 25,000, paid as a one-time Direct Bank Transfer (DBT) to the student''s bank account.',
     'en', 3),
    ('Which documents are required?',
     'Attested copy of Class 12 (HSC) marksheet; degree college bonafide certificate or first-term fee receipt; Tahsildar Family Income Certificate; student bank passbook copy; student Aadhaar card; and proof of 3 years Pune domicile.',
     'en', 4),
    ('Where do I submit the application?',
     'Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk). The official form is available from the PMC DBT portal.',
     'en', 5)
) AS v(question, answer, language_code, display_order)
WHERE s.slug = 'pmc-sathe-class12'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, v.language_code, v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('What is this scheme?',
     'Financial assistance toward technical training, nursing diplomas, and computer certification fees for female students residing in Pune municipal corporation wards.',
     'en', 1),
    ('Who is eligible?',
     'Girl student enrolled in an ITI, polytechnic, nursing or computer diploma course. Family annual income under Rs. 2,50,000 (waived for orphans). Resident within Pune Municipal Corporation limits.',
     'en', 2),
    ('How much is the benefit?',
     'Rs. 10,000 to Rs. 20,000 as financial assistance toward course fees.',
     'en', 3),
    ('Which documents are required?',
     'Admission fee receipt from an accredited Technical or ITI institute; Class 10 or 12 marksheet copy; Tahsildar income certificate; student bank passbook copy; and student Aadhaar card.',
     'en', 4),
    ('What is the application deadline?',
     'The published deadline for this scheme is October 31, 2026. Confirm the current window at the ward office before travelling.',
     'en', 5),
    ('Where do I submit the application?',
     'Submit at the Kothrud - Bawdhan Ward Office No. 14, Counter No. 3 (Samaj Vikas DBT Desk).',
     'en', 6)
) AS v(question, answer, language_code, display_order)
WHERE s.slug = 'pmc-savitribai-girls'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, v.language_code, v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('What is this scheme?',
     'Shahari Garib Arogya Yojana (SGAY) provides 100% free treatment at municipal civic hospitals and 50% direct concession on CGHS billing rates across 50+ empaneled private hospitals in Pune. It covers general inpatient hospitalization, nephrology dialysis, and chemotherapy.',
     'en', 1),
    ('Who is eligible?',
     'Family annual income below Rs. 1,60,000. Resident within Pune Municipal Corporation limits. Yellow or Orange ration card holder. Annual membership renewal required.',
     'en', 2),
    ('How much is the benefit?',
     'Rs. 1,00,000 to Rs. 2,00,000 in medical cover, with 100% free treatment at municipal hospitals and 50% concession at empaneled private hospitals.',
     'en', 3),
    ('Which documents are required?',
     'Copy of Yellow (BPL) or Orange (APL Low-Income) ration card; Tahsildar Family Income Certificate (under Rs. 1,60,000); head of family and patient Aadhaar cards; proof of 3 years residence in PMC limits (property tax or election card); doctor''s treatment estimation certificate or admission advice; and two passport-size photographs of the patient.',
     'en', 4),
    ('What is the application deadline?',
     'This scheme is open round the year with an annual membership. Confirm renewal at the ward office.',
     'en', 5),
    ('Where do I submit the application?',
     'Submit at the Kothrud - Bawdhan Ward Office No. 14 health desk. The official form is available from the SGAY PMC portal.',
     'en', 6)
) AS v(question, answer, language_code, display_order)
WHERE s.slug = 'pmc-sgay-health'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();
COMMIT;

BEGIN;
INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, v.language_code, v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('What is this scheme?',
     'PM SVANidhi provides working capital loans to street vendors who sell fresh farm produce, fruits, vegetables, and dairy in Pune municipal weekly markets (Athawadi Bajar) and roadside haats.',
     'en', 1),
    ('Who is eligible?',
     'Street vendor selling in Pune municipal limits (vegetables, fruit, flowers, produce, dairy). Holds a Vending Certificate or Identity Card, or appears in the ward vendor survey, or has a recommendation letter from the Town Vending Committee or ward office. The next loan tranche is available only after repaying the previous one.',
     'en', 2),
    ('How much is the loan?',
     '1st tranche: Rs. 10,000; 2nd tranche: Rs. 20,000; 3rd tranche: Rs. 50,000.',
     'en', 3),
    ('Which documents are required?',
     'Vendor identification card (vending certificate or ward survey slip); bank passbook copy with active UPI QR linkage; Aadhaar card copy; and a recommendation letter from the local ward hawkers committee or market supervisor.',
     'en', 4),
    ('What is the application deadline?',
     'This scheme is open round the year.',
     'en', 5)
) AS v(question, answer, language_code, display_order)
WHERE s.slug = 'pmc-svanidhi-hawker'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();
COMMIT;



