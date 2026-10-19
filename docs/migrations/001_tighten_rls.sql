-- 001_tighten_rls.sql
-- NOT YET APPLIED to live project slqtpxocaphvwdkivkfj. Run in the Supabase SQL editor.
--
-- Why: the anon key ships to every browser, so RLS is the only barrier. The original
-- policies in SUPABASE_SETUP.sql let anyone holding that key:
--   * read, edit and DELETE every row of user_profiles and active_sessions (citizen PII)
--   * read every row of application_dockets
--   * rewrite any field of any peer_intel_reviews row (UPDATE USING true)
-- This contradicts the Zero-PII promise in AGENTS.md / .clinerules/03.
--
-- Effect on the app: AppContext falls back to bundled fixtures for profile and sessions
-- (it already does this on error), and nothing in the app writes these tables today.
-- Public read of schemes, ward_offices, hospitals, peer reviews and scraper_logs is unchanged.
-- The service role (scraper-agent) bypasses RLS and is unaffected.

-- 1. Citizen data: no anon/authenticated access at all (service role only).
DROP POLICY IF EXISTS "Public profile access" ON public.user_profiles;
DROP POLICY IF EXISTS "Public active sessions access" ON public.active_sessions;
DROP POLICY IF EXISTS "Anon can create draft docket" ON public.application_dockets;
DROP POLICY IF EXISTS "Users can view own docket" ON public.application_dockets;

-- 2. Peer reviews: keep anonymous submit, but bound it and stop arbitrary edits.
DROP POLICY IF EXISTS "Anyone can submit peer review" ON public.peer_intel_reviews;
DROP POLICY IF EXISTS "Anyone can upvote peer review" ON public.peer_intel_reviews;

-- Added for re-runnability: this policy may already exist on a configured project.
DROP POLICY IF EXISTS "Anyone can submit bounded peer review" ON public.peer_intel_reviews;
CREATE POLICY "Anyone can submit bounded peer review" ON public.peer_intel_reviews
  FOR INSERT WITH CHECK (
    char_length(tip) BETWEEN 5 AND 600
    AND helpful_count = 1
    AND verified_by_moderator = false
  );

-- Upvotes go through a function that can only increment one counter.
CREATE OR REPLACE FUNCTION public.upvote_peer_review(review_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.peer_intel_reviews
     SET helpful_count = helpful_count + 1
   WHERE id = review_id;
$$;
REVOKE ALL ON FUNCTION public.upvote_peer_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upvote_peer_review(UUID) TO anon, authenticated;
