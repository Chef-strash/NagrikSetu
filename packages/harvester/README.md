# NagrikSetu Harvester (`@nagriksetu/harvester`)

Official-source PMC scheme profiler on the Cline SDK.

- Contracts: `docs/SCHEME_DATA_SPEC.md`, `docs/SUPABASE_SETUP.sql`, `docs/migrations/002_schema_v2.sql`.

## Env

Copy `.env.example` to `.env` (never commit secrets; keys via env only):

```sh
cp .env.example .env
```

| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live writes via the service-role client passed in (`getSupabaseClient()` returns `null` when absent → fully keyless fixture/mock path). |
| `ANTHROPIC_API_KEY` | Profiler model. Absent → offline/fixture path. |
| `SCRAPER_MODE` | `fixture` (default, no network) or `live`. |

Without Supabase keys everything still runs: `createInMemoryDb()` / `createInMemoryRuns()` back the apply/report stages and all tests run keyless.

## Commands

```sh
npm install
npm run build            # tsc -> dist/
npm test                 # vitest run (src/**/*.test.ts, co-located)
./node_modules/.bin/tsc --noEmit
npm run harvest -- harvest --stage all --offline
```

CLI (`src/cli.ts`, bin `nagriksetu-harvest`):

```sh
node dist/cli.js harvest [--stage reference|discover|profile|all] [--scheme slug] [--offline] [--demo] [--dry-run]
```

- `--stage` selects pipeline stages (default `all`); each stage failure prints `harvest FAILED at stage <name>` and exits non-zero.
- `--scheme slug` profiles only fixtures whose filename contains `slug` (unknown slug → exit 1).
- `--offline` forces fixture-only mode (no network; `SCRAPER_MODE=fixture` does the same).
- `--demo` = `--offline` plus one **LABELLed synthetic change event** (`synthetic: true`, note `"LABELLed synthetic change event (demo only, not from an official source)"`, `applied: false`). Never written from an official source.
- `--dry-run` diffs without writing (no upserts, no change events).

## Offline demo path (venue Wi-Fi down)

```sh
npm run build
node dist/cli.js harvest --stage all --offline     # fixture parity: same rows, no network
node dist/cli.js harvest --stage profile --demo    # adds the one LABELLed synthetic event
SCRAPER_MODE=fixture npm test
```

Fixtures (`fixtures/`): recorded agent outputs — `listing-circular-p1.json`, `listing-ward_offices-p1.json`, `listing-pmc_hospitals-p1.json`, `profile-savitribai-girls.json`. Re-capture live (allowlist-guarded, curl-based) via repo-root `scripts/capture-fixtures.sh`:

```sh
SCRAPER_MODE=live ./scripts/capture-fixtures.sh   # default fixture mode is a no-op
```

Only official hosts are ever fetched (`isAllowlistedUrl`: `webadmin.pmc.gov.in`, `www.pmc.gov.in`, `pmc.gov.in`, `dbt.pmc.gov.in`, backend IP, `pmsvanidhi.mohua.gov.in`); anything else is refused before any request.

## Pipeline notes

- **Apply** (`src/apply/apply.ts`): `buildSchemeRow` fills computed X columns via `src/apply/coverage.ts` + provenance (`verification_status`, `source_url`, `last_verified_at`, `source_hash`, `source_doc_id`); `diffScheme` diffs on natural key `slug`; first run inserts (`created`), identical re-run is a no-op (`verified` event only), changed fields emit one `updated` event per field with old/new values. Coverage gaps → `verification_status='needs_review'` and the gaps are returned for `agent_runs.details.coverage`. Writes go through the `DbPort` seam (`createSupabaseDb(client)` idempotent upserts on `slug` / `(scheme_id, doc_key)`; `createInMemoryDb()` keyless fake).
- **Report** (`src/report/runs.ts`): open/close `agent_runs` with `items_seen/new/changed/failed` + `details.coverage`; `statusFor` maps totals to `succeeded|partial|failed`.
- **Run history**: every run opens and closes an `agent_runs` row, visible in Supabase and through `RunsPort.list()` in memory mode.


## Acceptance (Mac, real keys)

Prerequisites:
1. Apply the SQL migrations to the target Supabase project, in order: `docs/SUPABASE_SETUP.sql`, `docs/migrations/002_schema_v2.sql`, then `docs/migrations/003_harvester_constraints.sql` (003 replaces the partial unique indexes with the full unique constraints the reference upserts need).
2. `cp packages/harvester/.env.example packages/harvester/.env` and fill:
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role — the harvester is the only writer),
   - `ANTHROPIC_API_KEY` (the agent profile stage),
   - leave `SCRAPER_MODE=live`.

Run (from `packages/harvester`):

```bash
npm ci && npm run build
node --env-file=.env dist/cli.js harvest --stage reference          # ward_offices = 15, empaneled_hospitals = 74
node --env-file=.env dist/cli.js harvest --stage discover --dry-run  # prints real candidate circulars
node --env-file=.env dist/cli.js harvest --stage profile --scheme pmc-svanidhi-hawker --dry-run  # diff: 10000 -> 15000
node --env-file=.env dist/cli.js harvest --stage profile --scheme pmc-svanidhi-hawker
```

Then confirm in Supabase: the `pmc-svanidhi-hawker` row updated with `verification_status` + `source_doc_id`; one `scheme_change_events` row per changed field; the fetched `source_documents`; and an `agent_runs` row with its counts. Open the scheme page in the app to see the new values.

Safety: a run that would write fixture/demo data to a **live** database is refused unless `--allow-fixture-writes` is passed; synthetic demo events are never written to a live database.

### Live facts verified (2026-10-04, from this environment, no keys)

- `reference --dry-run` (live): **wards=15 hospitals=74**.
- `discover --dry-run` (live): **fetched=911 candidates=718** real circulars with absolute URLs.
- Live PDF read of the SVANidhi guideline (`www.mohua.gov.in/.../bde957bc3a87fb001c05ddd09484edda.pdf`): **15 text pages, "15000" present**.
- The listing API honours `limit=` and `title=`; it **ignores** `page` and caps unfiltered results — discovery therefore sweeps `title=<term>`.

