-- 005_auth_user_link.sql
-- Links user_profiles and active_sessions to Supabase Auth users and enables
-- per-user RLS. Idempotent: safe to run more than once.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query -> paste this whole
-- file -> Run. Also enable Authentication -> Providers -> Email (Email OTP) and
-- make the "Magic Link"/"Confirm signup" email templates include {{ .Token }}.

-- ---------------------------------------------------------------- user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS ward text,
  ADD COLUMN IF NOT EXISTS income numeric,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS ration_card text,
  ADD COLUMN IF NOT EXISTS has_produce_vendor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS empaneled_hospitals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dbt_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS disability_status text DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS domicile_years integer;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key
  ON public.user_profiles (user_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE cmd text;
BEGIN
  FOREACH cmd IN ARRAY ARRAY['select','insert','update','delete'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "user_profiles_own_%s" ON public.user_profiles', cmd);
  END LOOP;
END $$;

CREATE POLICY "user_profiles_own_select" ON public.user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_profiles_own_insert" ON public.user_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_profiles_own_update" ON public.user_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_profiles_own_delete" ON public.user_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- --------------------------------------------------------------- active_sessions
-- Original schema had active_sessions.user_id -> user_profiles(id). Re-point it at auth.users
-- so it holds auth.uid(). Existing rows (starter data) have no matching auth user, so null them.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.active_sessions'::regclass AND contype = 'f'
      AND confrelid = 'public.user_profiles'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.active_sessions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
UPDATE public.active_sessions SET user_id = NULL
  WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM auth.users);
ALTER TABLE public.active_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS scheme_id text,
  ADD COLUMN IF NOT EXISTS scheme_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_name text,
  ADD COLUMN IF NOT EXISTS target_benefit text,
  ADD COLUMN IF NOT EXISTS counter_location text,
  ADD COLUMN IF NOT EXISTS counter_hours text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS documents_left integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity text,
  ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conversation jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chat_session_id text,
  ADD COLUMN IF NOT EXISTS scheme_chosen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS candidates jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'active_sessions_auth_user_fkey') THEN
    ALTER TABLE public.active_sessions
      ADD CONSTRAINT active_sessions_auth_user_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS active_sessions_user_id_idx ON public.active_sessions (user_id);

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE cmd text;
BEGIN
  FOREACH cmd IN ARRAY ARRAY['select','insert','update','delete'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "active_sessions_own_%s" ON public.active_sessions', cmd);
  END LOOP;
END $$;

CREATE POLICY "active_sessions_own_select" ON public.active_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "active_sessions_own_insert" ON public.active_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "active_sessions_own_update" ON public.active_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "active_sessions_own_delete" ON public.active_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ------------------------------------------------------------ upvote_peer_review
-- SECURITY DEFINER with a pinned search_path, so it keeps working under RLS
-- without granting anyone UPDATE on peer_intel_reviews. It can only bump one
-- counter by one; callable by signed-in and anonymous visitors.
CREATE OR REPLACE FUNCTION public.upvote_peer_review(review_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.peer_intel_reviews
     SET helpful_count = COALESCE(helpful_count, 0) + 1
   WHERE id = review_id;
$$;
REVOKE ALL ON FUNCTION public.upvote_peer_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upvote_peer_review(uuid) TO anon, authenticated;
