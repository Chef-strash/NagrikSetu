-- 003_harvester_constraints.sql
-- Reference-loader constraints for the harvester (review fix 5).
--
-- 002 created PARTIAL unique indexes (`... WHERE external_id IS NOT NULL`) on
-- ward_offices / empaneled_hospitals. Supabase's PostgREST `onConflict` cannot
-- target a partial index, so the reference upserts fail. This migration drops
-- those partial indexes and adds equivalent FULL unique constraints, which
-- `onConflict: "ulb_code,external_id"` can target.
--
-- The live PMC listing feed carries no ward number and sometimes no address, so
-- the deterministic loader writes those columns only when known. The original
-- NOT NULL constraints on those seeded-detail columns would reject a real feed
-- row; relax them (002 already relaxed counter_number / clerk_role / pincode).
--
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Drop the partial unique indexes from 002.
DROP INDEX IF EXISTS public.uq_ward_offices_external;
DROP INDEX IF EXISTS public.uq_hospitals_external;

-- 2. Add FULL unique constraints (idempotent via pg_constraint check).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_ward_offices_ulb_external'
  ) THEN
    ALTER TABLE public.ward_offices
      ADD CONSTRAINT uq_ward_offices_ulb_external UNIQUE (ulb_code, external_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_hospitals_ulb_external'
  ) THEN
    ALTER TABLE public.empaneled_hospitals
      ADD CONSTRAINT uq_hospitals_ulb_external UNIQUE (ulb_code, external_id);
  END IF;
END $$;

-- 3. The deterministic loader may not know these seeded detail columns.
ALTER TABLE public.ward_offices ALTER COLUMN ward_number DROP NOT NULL;
ALTER TABLE public.ward_offices ALTER COLUMN physical_address DROP NOT NULL;

COMMIT;
