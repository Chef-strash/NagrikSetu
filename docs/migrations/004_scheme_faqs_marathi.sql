-- 004_scheme_faqs_marathi.sql
-- Adds the Marathi FAQ rows that exist in the app fixtures
-- (packages/web/src/lib/data/faqs.ts and
--  backend/src/features/feedback/fixtures.ts) but were missing from the 003 seed.
-- Without these, the FAQ portal's `lang=mr` request silently falls back to English.
-- Idempotent: safe to re-run (unique key on scheme_id + language_code + question).

BEGIN;

INSERT INTO public.scheme_faqs (scheme_id, question, answer, language_code, display_order, status, published_at)
SELECT s.id, v.question, v.answer, 'mr', v.display_order, 'PUBLISHED', NOW()
FROM public.schemes s
CROSS JOIN (VALUES
    ('ही योजना काय आहे?',
     'पुणे महानगरपालिका हद्दीतील इयत्ता 10 वी (एसएससी) उत्तीर्ण व अकरावी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश घेतलेल्या गुणवंत विद्यार्थ्यांसाठी आर्थिक सहाय्य.',
     1),
    ('पात्रता निकष काय आहेत?',
     'इयत्ता 10 वी (एसएससी) उत्तीर्ण व 11 वी किंवा मान्यताप्राप्त डिप्लोमा अभ्यासक्रमात प्रवेश; खुल्या प्रवर्गासाठी किमान 80% गुण; पुणे महानगरपालिका हद्दीत रहिवासी; राष्ट्रीयीकृत बँकेत आधार जोडलेले खाते.',
     2)
) AS v(question, answer, display_order)
WHERE s.slug = 'pmc-azad-class10'
ON CONFLICT (scheme_id, language_code, question)
DO UPDATE SET answer = EXCLUDED.answer, display_order = EXCLUDED.display_order,
              status = 'PUBLISHED', published_at = NOW(), updated_at = NOW();

COMMIT;