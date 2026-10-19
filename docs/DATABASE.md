# Database setup

## Apply

Fresh Supabase project, either:

- **Script:** `DATABASE_URL=postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres node scripts/db-setup.mjs`
  (applies `docs/demo-setup.sql` then `docs/seed.sql`, one transaction per file, prints row counts; re-runnable).
- **Paste:** SQL editor -> run `docs/demo-setup.sql`, then `docs/seed.sql` (kept separate, ~128 KB).

Then check through the API: `NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/db-verify.mjs`.

`demo-setup.sql` = `SUPABASE_SETUP.sql` + migrations 001, 002, 003 (feedback), 003 (harvester constraints), 004 (extractions), 004 (marathi faqs), 005, 006, concatenated in that fixed order.
Regenerate it by re-concatenating when a source file changes.

## Seed (`docs/seed.sql`, snapshot from `scripts/export-seed.mjs`)

ward_offices 19, bank_merger_map 8, empaneled_hospitals 80 (+ migration-seeded rows), schemes 21,
scheme_documents 69, scheme_faqs 30, peer_intel_reviews 21. All inserts are `ON CONFLICT DO NOTHING`.

## RLS summary

- Public read: schemes, scheme_criteria_rules, scheme_faqs, ward_offices, empaneled_hospitals, bank_merger_map, scraper_logs.
- peer_intel_reviews: anon reads approved (`verified_by_moderator`) rows only; writes only via the service-role API; upvote via RPC `upvote_peer_review`.
- user_profiles / active_sessions: authenticated users see and write only rows where `user_id = auth.uid()`; anon nothing.
- document_extractions, application_dockets, storage buckets: service role only.

## Validation (PGlite, Postgres 16 in WASM)

Run with Supabase stand-ins (roles anon/authenticated/service_role, `auth.users`, `auth.uid()`, `storage.buckets/objects`).
Whole sequence applied twice: zero errors, also as `demo-setup.sql` + `seed.sql`, also with BEGIN/COMMIT stripped (as db-setup.mjs does).
28 assertions pass: every column the web/backend code selects or writes exists; both RPCs exist; anon/authenticated RLS behaves as above.

Bugs fixed: seed `schemes.source_doc_id` pointed at unexported `source_documents` (FK failure) - nulled, exporter fixed;
seed `scheme_documents` has duplicate (scheme_id, doc_key) - now `ON CONFLICT DO NOTHING` without a target;
SUPABASE_SETUP policies were not re-runnable - DROP POLICY IF EXISTS added; pg_cron extension made optional;
`documents` storage bucket (used by upload route) was never created - added in 006;
`mapHospitalRows` read nonexistent `type` - now uses `hospital_type`/`concession_percentage`; wards prefer `ward_name`.

Not verifiable here: real Supabase (network blocked), pg_cron scheduling, pgcrypto/pgvector (pgcrypto stubbed; vector loaded; `gen_random_uuid` is built in), hosted storage policies, PostgREST behaviour.
