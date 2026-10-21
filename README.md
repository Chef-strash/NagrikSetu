# NagrikSetu

**Municipal welfare discovery, pre-audit and ingestion for India's Urban Local Bodies.**

A citizen describes their situation in plain English or Marathi. NagrikSetu finds the municipal and
central schemes they appear to qualify for, quotes the official eligibility text behind every
match, tells them which ward counter to visit and what to carry, and audits their documents before
they join the queue.

Two things separate this from a scheme-search website.

- **The scheme registry is not typed in by hand.** It is maintained by Cline SDK agents that read
  Pune Municipal Corporation's own listing APIs, circulars and scanned Marathi PDFs, then write
  validated rows into the database with provenance attached.
- **Documents are read for defects, not just stored.** Aadhaar numbers, bank account numbers and PAN
  are masked inside the processing pipeline, and raw document images never reach disk.

Repository: `NagrikSetu_WhiteBox`. Team: Whitebox.

---

## The problem

India delivers welfare through two systems, and only one of them is searchable.

National aggregators such as `myScheme.gov.in` index central and state schemes well. They do not
cover Urban Local Bodies: across the 4,400 or more municipal bodies in the country, municipal
scheme coverage is effectively zero. Municipal welfare is published instead on individual
corporation portals, one city at a time, as scanned regional-language circulars.

That leaves four failure points between a citizen and money that has already been allocated.

1. **Digitally buried.** Scheme details live in scanned Marathi and Hindi PDFs with no
   machine-readable index. A citizen cannot search for what they do not know exists.
2. **Arbitrary filing windows.** Applications open and close on windows of roughly 15 to 45 days,
   announced on paper, with no notification mechanism.
3. **Counter opacity.** Which counter, which officer, which documents and which photocopies are
   required is unwritten local knowledge held by clerks and repeat visitors.
4. **Clerical rejection.** Applications are discarded for a misspelled name, a merged-bank IFSC
   code, an expired income certificate or a missing signature. All of those are cheap to catch
   before submission and expensive to fix afterwards.

The result is a spending gap rather than an eligibility gap. Across the municipal policies we
studied, aggregate actual spending falls far short of stated allocation, and in Pune the lapsed and
unspent balances are large. Roughly one application in three is discarded for a paperwork defect
rather than for genuine ineligibility.

The research behind those figures, including sources and method, is in
[docs/research/](docs/research/). The pitch deck is at
[docs/NagrikSetu_deck.pdf](docs/NagrikSetu_deck.pdf).

NagrikSetu attacks all four failure points without asking a citizen to understand any of them.

---

## What NagrikSetu does

A walkthrough of the citizen journey:

1. **Sign in.** An email one-time code. The profile carries the ward, category and household facts.
2. **Describe the situation.** Typed or spoken, in English or Marathi. For example: "I need a
   scholarship for my daughter's college fees."
3. **Get matched schemes.** The request is decomposed into a structured search object and matched
   against the registry. Each match shows the exact lines of official eligibility text it relied
   on, and which profile facts are still missing.
4. **Read the counter guidance.** For the chosen scheme, the assistant answers questions about
   counters, timings, documents and amounts, drawing on maintained scheme FAQs and on what other
   citizens reported at that counter.
5. **Audit the documents.** Aadhaar, passbook, marksheet and income certificate are uploaded and
   read. The report lists every field extracted, whether the value matched the profile, and every
   defect detected.
6. **Walk in prepared.** The report ends with where to submit and what to carry.

Eligibility output is always labelled guidance, never a decision. The assistant is instructed to
compare the citizen's profile against the scheme's official `eligibility_text`, to return only
conditions written in that text, to quote the lines it used, and to name any profile facts it still
needs. The final call belongs to the ward office, and the product says so on screen.

---

## Architecture

NagrikSetu is three services and four shared packages, all Node.js and TypeScript.

```
                        Citizen
                           |
                  typed text / voice (Sarvam STT)
                           |
                           v
   +-------------------+           +---------------------------+
   |  web  :3000       |   proxy   |  backend  :8000           |
   |  Next.js 14 PWA   | --------> |  Express + TypeScript     |
   |  English/Marathi  |  /api/v1  |  chatbot + feedback       |
   +-------------------+           +---------------------------+
             |                                   |
             | proxy /api/v1/audit               | model route
             v                                   v
   +-------------------+           +---------------------------+
   |  audit  :8787     |           |  Cline model gateway      |
   |  document audit   |           |  (OAuth or CLINE_API_KEY) |
   |  loopback only    |           +---------------------------+
   +-------------------+
             |
             v
   +-----------------------------------------------------------+
   |  Supabase: Postgres + RLS + Storage + pgvector            |
   |  schemes | scheme_faqs | ward_offices | agent_runs | ...  |
   +-----------------------------------------------------------+
             ^
             | validated writes, with provenance
   +-----------------------------------------------------------+
   |  packages/harvester: Cline SDK ingestion agents           |
   |  PMC listing API -> circular PDFs -> scheme rows          |
   +-----------------------------------------------------------+
```

| Component | Port | Stack | Role |
| :--- | :--- | :--- | :--- |
| `packages/web` | 3000 | Next.js 14 App Router | Citizen interface, bilingual, proxies API calls |
| `backend` | 8000 | Express, TypeScript run directly by Node | Chatbot matching and feedback API |
| `packages/audit` | 8787, loopback | Node service | Citizen document audit agent |
| Supabase | hosted | Postgres + RLS | Registry, FAQs, reviews, sessions, run logs |

The web app never talks to Postgres directly for chatbot or FAQ data. Those reads go through the
backend, which keeps the service-role key on the server.

---

## The client-facing product

### Web application (`packages/web`)

- Next.js 14 App Router, TypeScript, Tailwind CSS, bilingual English and Marathi, using the design
  tokens and typography described in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).
- Pages: home and search, scheme list, scheme detail, assistant, document audit, citizen reviews,
  FAQs, profile, sessions, and email-code sign-in.
- Route handlers under `src/app/api/v1/` proxy to the backend and the audit service. They hold the
  server-side keys; the browser never receives them.
- Voice uses Sarvam AI for speech-to-text and text-to-speech through `/api/v1/voice/stt` and
  `/api/v1/voice/tts`. Read-aloud splits long replies into chunks and prefetches the next chunk
  while the current one plays.
- Offline behaviour is deliberate: with no Supabase and no keys configured, the interface runs from
  bundled fixtures in `src/lib/data/`, so the product does not collapse when the network does.

### Backend API (`backend`)

- Express, with TypeScript executed directly by Node's built-in type stripping, so there is no build
  step. This requires Node 22.18 or newer.
- Two feature modules, each self-contained under `src/features/`:
  - **chatbot**: decomposes a free-text request into a typed search object, retrieves candidate
    schemes, and produces a grounded eligibility assessment.
  - **feedback**: scheme FAQ answers and citizen counter reviews, including PII rejection on
    submitted text.
- The model call is optional at every step. When no key is configured, or when the model returns
  unusable output, the code falls back to a deterministic path. Responses carry a source field
  (`llm` or `rules`) so the caller can always tell which path answered.

### Document audit service (`packages/audit`)

Bytes in, masked JSON out:

```
POST /extract
   pages.ts     magic-byte type check -> text layer plus rendered page PNGs
                (10 MB cap, first 3 pages, page cap applied before rendering)
   ocr.ts       tesseract.js eng+hin+mar, used for corroboration only
   agent/       one Cline SDK session: page images + text layer + OCR text,
                with three tools over one draft store:
                record_field . flag_issue . submit_extraction
   verify/      per-field grounding (text layer > OCR > vision) plus code-side
                validators: Aadhaar checksum, malformed PAN or IFSC, merged-bank
                prefix, expired validity date, missing signature or seal
   verify/mask  masking applied last: Aadhaar XXXX-XXXX-NNNN, account and PAN last four
   store.ts     masked JSON only, and only when Supabase is configured
   response     the payload is scanned again before it leaves; a payload that
                still contains an unmasked shape throws instead of being returned
```

The service binds loopback only, requires a shared token, and caps body size, concurrent runs and
wall-clock time. It never logs a request body.

---

## The Cline agents that maintain the database

This is the part of NagrikSetu that does not exist without Cline, and it is the reason the scheme
registry can be trusted.

### Why an agent, and why Cline specifically

Municipal scheme data is not an API problem. It is a reading problem.

PMC publishes welfare circulars through a listing API that returns Marathi titles, dates and links.
The documents behind those links are frequently scanned images with no text layer, and the numbers
that matter, such as benefit amounts, income ceilings and validity windows, are stated in prose.
Portal layouts and circular formats change without notice, and a small team does not have someone
whose job is maintaining a parser.

A hardcoded scraper cannot do this. It can follow links and it can guess at CSS selectors, but it
cannot read a Marathi circular and decide that `15000` is the annual benefit amount while `1,80,000`
is an income ceiling, and it cannot refuse to guess when a page is illegible.

So the ingestion path is built as a Cline SDK agent session with a narrow contract: read the
official source, fill in a scheme profile, call `submit_profile` exactly once, and never invent a
number that is not in the text it quoted. Everything around that agent, including discovery,
validation, persistence and provenance, stays deterministic code.

### `packages/agents`: the shared Cline SDK platform

All Cline SDK usage in the repository goes through this package, so the harvester and the citizen
document audit share one implementation instead of drifting apart.

- **Provider authentication.** `resolveProviderKey` resolves credentials in a fixed order: a
  workflow-specific key such as `HARVESTER_API_KEY` or `AUDIT_API_KEY`, then the Cline OAuth token
  stored by a local Cline sign-in, then `CLINE_API_KEY`, then a provider-specific key. ClinePass
  models need only a Cline token, so the platform runs without an Anthropic account.
- **Model choice by input, not by code path.** Text-only runs use `cline-pass/glm-5.3`. Any run that
  attaches page images switches to the vision-capable `cline-pass/qwen3.7-plus`. The switch is one
  function over the input, so a scanned page needs no second code path.
- **One session runner.** `runAgentSession` wraps `ClineCore.create`, `start` and `subscribe`, with
  built-in tools, agent spawning and team spawning disabled, the workflow's own tools passed as
  `extraTools`, and the run ended through the single tool carrying `lifecycle.completesRun`. A run
  that settles without calling that tool raises a named error rather than returning a half-finished
  result.
- **Run logging.** `agent_runs` rows record status, items seen, new and changed, failures, and a
  coverage summary, either in memory or in Supabase.
- **The zero-PII mechanism.** The Cline SDK's local backend persists every session to disk under
  its data directory, including the full prompt and any attached images as base64. For a citizen
  document audit, that would mean an Aadhaar photograph written to persistent storage.
  `runAgentSession` therefore points `CLINE_DATA_DIR`, `CLINE_SESSION_DATA_DIR` and
  `CLINE_DB_DATA_DIR` at a fresh directory under the OS temp directory before creating the core,
  and deletes it in a `finally` block once the run ends. The delete is verified rather than assumed:
  the SDK persists messages fire-and-forget, so the purge retries, and it throws if the directory
  survives. A test drives the real SDK and asserts that the prompt and image were present in the
  volatile directory during the run, and that nothing matching that marker remains anywhere
  afterwards.

### `packages/harvester`: the ingestion fleet

The CLI is `nagriksetu-harvest`. It runs three stages, together or separately.

| Stage | What it does |
| :--- | :--- |
| `reference` | Loads ward offices and empanelled hospitals from PMC. Verified at 15 wards and 74 hospitals against the live source. |
| `discover` | Sweeps the PMC listing API by title term, filters to scheme circulars and records source documents. Verified at 911 documents fetched and 718 candidates. |
| `profile` | Reads each circular and asks the Cline agent to produce a scheme profile. |

What the `profile` stage enforces:

- **Allowlisted hosts only.** Fetches are refused before any request unless the host is a PMC host,
  the central SVANidhi host, or the PMC backend IP.
- **Official text or an image, never a guess.** A page with a real text layer is handed to the agent
  as tool-readable source text. A page whose text layer is empty, or is legacy-font mojibake, is
  rasterised and attached to the turn as an image. The agent's standing instruction is to prefer
  `unknown` over guessing and to quote numbers only when they appear in the source it read.
- **Validation before any write.** The submitted profile is parsed and validated against a Zod
  contract. Failures are counted and reported, never written.
- **Provenance on every row.** Writes carry `verification_status`, `source_url`, `last_verified_at`,
  `source_hash` and `source_doc_id`, so a row can always be traced back to the document it came from.
- **Change history, not silent overwrites.** Rows are diffed on their natural key. A first run
  inserts; an identical re-run is a no-op; a changed field emits exactly one change event carrying
  the old and new value. Coverage gaps mark the row `needs_review` and are returned in the run log.
- **Fixtures for offline runs.** `--offline` runs the same stages against recorded fixtures with no
  network, which is what the test suite and any demo without venue Wi-Fi use.

Two safety rules matter for a live database. A run that would write fixture or demo data into a live
database is refused unless it is explicitly allowed, and synthetic demo change events are never
written to a live database.

### `packages/documents`: the shared document layer

PDF reading, page rendering and PII masking live here, so the harvester and the audit do not
duplicate a PDF reader. One detail is worth knowing: `unpdf` detaches the caller's byte buffer
during text extraction, so rendering has to work from an independent copy, otherwise the second
render throws. Masking is pattern-first and value-second, so an Aadhaar-shaped number is masked even
when it appears under an unrelated field name, while an amount such as `1,80,000` or an IFSC such as
`HDFC0001234` is left intact.

### The audit agent

The same session runner drives the citizen document audit. A page that shows an ID or account number
is deliberately withheld from the vision model and read through its text layer instead, so an
identity document image is not sent to the model when it does not need to be. Field values are
recorded dynamically rather than against a fixed per-document schema, because a municipal
requirement set is open-ended. Grounding is tiered, and a value that only the vision model supports
is marked as such rather than presented as confirmed.

### The backend's model route

The backend reaches the same Cline account through `@cline/llms`, using the locally authenticated
Cline OAuth token when present and `CLINE_API_KEY` otherwise. The package is imported dynamically
and only when the Cline route is switched on, so a deployment without it still starts. The model
produces only the structured search object and the assessment; the result is validated and
normalised through the same typed schema the deterministic path uses, so an invalid model output
degrades to the rules path instead of reaching the user.

### Designed but not built

Stated plainly, because the difference matters:

- **Autonomous scraper self-healing.** The design is for the agent to diagnose a broken selector
  from a DOM diff, write the patch, run the regression test and commit the fix. This is not
  implemented. The harvester currently fails loudly on a changed layout and needs a human patch.
- **An MCP sync server.** A Model Context Protocol server exposing scheme validation and upsert as
  tools was designed and is not implemented.
- **Docket generation.** The database schema defines the application docket table, its 24-hour
  expiry default and the `purge_expired_application_dockets()` function, scheduled through `pg_cron`
  where it is available. The application does not yet generate dockets, so that path is dormant in
  practice.

---

## Zero-PII design

The DPDP Act 2023 sets the standard. The engineering decisions follow from it, and the guarantees
below are enforced in code rather than merely intended.

| Guarantee | Where it is enforced |
| :--- | :--- |
| Document images are never written to disk by the audit pipeline | Page bytes are processed in memory; the pipeline writes no temp file, and its tests assert this |
| The Cline SDK's own session store never retains a citizen image | `runAgentSession` redirects the harness data directory to volatile storage and purges it after every run, verified against the real SDK |
| Aadhaar is masked to `XXXX-XXXX-1234` before serialisation | Masking runs last in the pipeline, after extraction, with its own tests |
| A response cannot leave with an unmasked identity number | The finished payload is scanned for unmasked shapes; a hit raises `masking_failed` instead of returning |
| Uploads are not stored | `DOCUMENT_STORAGE_ENABLED` defaults to `false`, and the upload route responds `204` having persisted nothing |
| The audit process cannot be reached from the network | It binds loopback, requires a shared token, and refuses to start without one |
| The service-role key never reaches the browser | All privileged reads and writes happen in route handlers and in the backend |

What is not claimed: masking is pattern matching, not authentication. A number split across lines or
written with unusual separators is not detected, and the account-number rule deliberately errs
toward masking, so a bare ten-digit mobile number is masked as an account number. There is no
Aadhaar checksum in the masking layer; that check lives in the audit's validators, where it belongs.

---

## Repository layout

```
.
|-- README.md
|-- docker-compose.yml          three services, offline defaults
|-- package.json                npm workspaces plus demo scripts
|-- backend/                    Express API: chatbot and feedback
|-- packages/
|   |-- agents/                 shared Cline SDK platform
|   |-- audit/                  citizen document audit service
|   |-- documents/              PDF reading and PII masking
|   |-- harvester/              Cline SDK ingestion agents for PMC
|   `-- web/                    Next.js 14 citizen application
|-- scripts/                    database setup, demo, fixture capture
|-- supabase/                   local Supabase configuration
`-- docs/                       architecture, data, design and research
```

---

## Running it locally

Two paths, and neither needs an account, a key or a database to start.

### With Docker

Requires Docker Desktop or Docker Engine (v24+) with the Compose plugin (`docker compose`).

#### 1. Quickstart (Offline / Zero-Config Stack)

Run a single command from the repository root:

```bash
docker compose up --build
```

This starts all three services in dependency order:
- **`web`** (Next.js 14 citizen interface) at <http://localhost:3000>
- **`backend`** (Express API) at <http://localhost:8000> (healthcheck: <http://localhost:8000/health>)
- **`audit`** (Document audit service) at <http://127.0.0.1:8787> (bound to localhost only; healthcheck: <http://127.0.0.1:8787/health>)

With no `.env` file present:
- The stack runs **entirely offline** from bundled fixtures in `packages/web/src/lib/data/`.
- The backend answers with deterministic, rule-based logic (`NAGRIKSETU_DISABLE_DB=1`, `NAGRIKSETU_DISABLE_LLM=1`). No external database, LLM provider, or API key is required.
- **Demo authentication** is enabled automatically (`NEXT_PUBLIC_DEMO_AUTH=true`). Open <http://localhost:3000/auth/signin> and enter any email and any code of 6 digits or more to sign in immediately.

#### 2. Running with Live Supabase, LLMs, and Voice

To connect the container stack to a real database, model provider, or voice API:

1. Create a `.env` file from the provided template:
   ```bash
   cp .env.example .env
   ```
2. Configure the desired services in `.env`:
   - **Database (Supabase):** Set `NAGRIKSETU_DISABLE_DB=0` and provide `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
   - **Language Model:** Set `NAGRIKSETU_DISABLE_LLM=0` and configure Cline (`LLM_PROVIDER=cline`, `CLINE_API_KEY=...`) or provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
   - **Voice (Sarvam):** Set `SARVAM_API_KEY=...` to enable speech-to-text and text-to-speech.
   - **Pre-baked OCR data:** Set `BAKE_TESSDATA=true` to download English, Hindi, and Marathi Tesseract models during image build, avoiding runtime downloads.

> [!IMPORTANT]
> **Rebuilds and `NEXT_PUBLIC_*` Variables:**
> Next.js inlines variables prefixed with `NEXT_PUBLIC_*` into the browser bundle at **build time**. If you add or modify any `NEXT_PUBLIC_*` variables in `.env`, you must rebuild the containers:
> ```bash
> docker compose up --build
> ```

#### 3. Common Docker Operations

- **Run in the background (detached):**
  ```bash
  docker compose up -d --build
  ```
- **View live container logs:**
  ```bash
  docker compose logs -f
  # Or inspect a specific service:
  docker compose logs -f web
  docker compose logs -f backend
  docker compose logs -f audit
  ```
- **Check service health and running status:**
  ```bash
  docker compose ps
  ```
- **Restart a single service:**
  ```bash
  docker compose restart backend
  ```
- **Stop all containers:**
  ```bash
  docker compose down
  ```
- **Stop and remove named volumes (e.g. cached OCR language data):**
  ```bash
  docker compose down -v
  ```

#### 4. Building Individual Docker Images (Optional)

Because NagrikSetu is organized as an npm workspace with shared packages (`@nagriksetu/agents`, `@nagriksetu/documents`), individual container builds **must use the repository root** as the build context:

```bash
# Backend API image
docker build -f backend/Dockerfile -t nagriksetu-backend .

# Next.js web application image
docker build -f packages/web/Dockerfile -t nagriksetu-web .

# Document audit service image (optional: --build-arg BAKE_TESSDATA=true)
docker build -f packages/audit/Dockerfile -t nagriksetu-audit .
```

### Without Docker

Requires Node.js 22.18 or newer. Node 24 LTS is recommended, and `.nvmrc` pins it. The backend runs
TypeScript directly, which needs Node's built-in type stripping, so an older Node fails with a
syntax error rather than a helpful message.

```bash
npm ci                       # installs every workspace from the root lockfile

# Terminal 1 - API on http://localhost:8000
npm run start:backend

# Demo sign-in, for the no-Supabase path. Docker Compose sets this for you; here it is by hand.
# Any email plus any code of 6 digits or more signs you in. NEXT_PUBLIC_* is inlined at build
# time, so restart the dev server after changing it.
printf 'NEXT_PUBLIC_DEMO_AUTH=true\n' > packages/web/.env.local

# Terminal 2 - web app on http://localhost:3000
npm run dev:web

# Terminal 3 - optional document audit service on http://127.0.0.1:8787
npm run build:audit
AUDIT_SERVICE_TOKEN=local-token node packages/audit/dist/cli.js serve
```

Without the audit service the audit page reports that the service is offline; everything else works.

### Signing in

Sign-in needs one of two modes configured. It is not on by itself.

- **Demo mode, no Supabase.** Set `NEXT_PUBLIC_DEMO_AUTH=true` in `packages/web/.env.local`, as the
  command above does. Docker Compose sets it for you (`NEXT_PUBLIC_DEMO_AUTH` defaults to `true`
  there). Any email and any code of 6 digits or more signs you in, and no mail is sent. Without the
  variable sign-in stops at *"Sign-in is not configured on this deployment."*
- **A real Supabase project.** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  and sign-in switches to an email one-time code. `npm run demo:otp -- you@example.com` mints a code
  without needing a mailbox. The admin API issues an 8-digit code, so the form accepts 6 to 8.

`NEXT_PUBLIC_*` values are inlined at build time, so changing one needs a rebuild or a dev-server
restart.

---

## Testing it at your end

Follow these in order. The first two need no accounts, keys or network.

### 1. Offline smoke test, no keys required

Using Docker (single command):
```bash
docker compose up --build
```

Or without Docker:
```bash
npm ci
npm run start:backend      # terminal 1
npm run dev:web            # terminal 2
```

Open <http://localhost:3000> and confirm:

- the scheme list renders from the bundled fixtures;
- the assistant answers a question and names the schemes it matched;
- the audit page reports the audit service as offline, and marks nothing as verified.

Then start the audit service as shown in [Running it locally](#without-docker) and confirm a
document upload produces a field-level report with masked values.

### 2. Run the test suites

```bash
npm test                   # every workspace
npm run typecheck          # TypeScript across every workspace
```

Measured on this checkout: **590 tests pass, 2 skip, 0 fail**, exit code 0, across six workspaces.

Both scripts compile the two shared library packages first, because the audit and harvester packages
import their built output. Nothing else needs a build step before testing.

| Workspace | Tests | What the suite covers |
| :--- | :--- | :--- |
| `packages/agents` | 36 | Provider auth, model choice, the session runner, tool completion, and a test that drives the real Cline SDK to prove the volatile session store is purged |
| `packages/audit` | 170 | 168 pass, 2 skip. Page detection and caps, OCR degradation, the three agent tools, every validator, tiered grounding, masking, the HTTP contract, and the no-body-in-the-log rule |
| `packages/documents` | 30 | Masking rules and PDF reading, including the detach-and-render case |
| `packages/harvester` | 115 | Config, source allowlisting, discovery parsing, reference mapping, Zod validation, apply and change events, coverage and run reporting, all offline |
| `packages/web` | 140 | Assistant flow, audit adapters and comparison, voice helpers and chunking, feedback, auth and session models |
| `backend` | 101 | Query decomposition with its rules fallback, retrieval, session context, grounded eligibility, FAQ answers, and PII rejection on review submissions |

The two skipped audit tests are live Tesseract OCR tests that need local language data. To run them:

```bash
cd packages/audit
AUDIT_TESSDATA_DIR=/path/to/tessdata npx vitest run src/ocr.test.ts
```

### 3. Connect a real Supabase project

1. Create a Supabase project.
2. Apply the schema and the seed data:
   ```bash
   DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres node scripts/db-setup.mjs
   ```
   This applies `docs/demo-setup.sql` and then `docs/seed.sql`, one transaction per file, and prints
   row counts. It is re-runnable.
3. Verify through the API rather than by eye:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/db-verify.mjs
   ```
   This checks the expected row counts and confirms that row-level security actually blocks
   anonymous access to `user_profiles` and `active_sessions`.

Schema, seed contents and the RLS summary are in [docs/DATABASE.md](docs/DATABASE.md).

### 4. Run the ingestion agents

The harvester runs offline first, which is the fastest way to see it work end to end:

```bash
cd packages/harvester
npm run build
node dist/cli.js harvest --stage all --offline --dry-run
```

To run it against the live PMC source, copy `.env.example` to `.env`, set the Supabase service-role
keys and a Cline or Anthropic key, then:

```bash
node --env-file=.env dist/cli.js harvest --stage reference          # wards and hospitals
node --env-file=.env dist/cli.js harvest --stage discover --dry-run # candidate circulars
node --env-file=.env dist/cli.js harvest --stage profile --dry-run  # diffs, writes nothing
```

Then confirm in Supabase that the updated scheme row carries `verification_status` and
`source_doc_id`, that each changed field produced one `scheme_change_events` row, that the fetched
documents appear in `source_documents`, and that the run closed an `agent_runs` row with its counts.
The `--dry-run` flag is there so the first live attempt cannot write anything by accident.

### 5. Verify the zero-PII behaviour

- Upload a document and read the returned JSON: Aadhaar appears as `XXXX-XXXX-1234`, and account
  numbers and PAN keep only their last four digits.
- Confirm no temp file is produced. The pipeline writes none, and
  `packages/audit/src/extract.test.ts` asserts it.
- Confirm the volatile purge. `packages/agents/src/session.test.ts` runs the real Cline SDK and
  asserts the prompt and the attached image are gone afterwards, both from the temp directory and
  from the real `~/.cline/data` tree.
- Run the services with their output visible and confirm no unmasked Aadhaar number appears in any
  log line.

---

## Configuration

Every environment variable, per service, with its default and what happens when it is absent, is in
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). Nothing is required to start: with no `.env` file the
stack runs offline from fixtures.

Two conventions are worth remembering. Web variables beginning with `NEXT_PUBLIC_` are inlined at
build time, so changing one requires a rebuild. In Docker Compose the services find each other by
service name (`http://backend:8000`, `http://audit:8787`), not by `localhost`.

---

## Known limitations

- **Ingestion covers one city.** The harvester is verified against Pune Municipal Corporation. The
  design extends to other Urban Local Bodies; the implementation does not yet.
- **Self-healing scrapers are designed, not built.** A changed portal layout currently fails loudly
  and needs a human patch.
- **One city, one language pair.** The citizen product is bilingual English and Marathi.
- **Voice needs a Sarvam key.** Without `SARVAM_API_KEY` there is no speech input or output, and the
  voice endpoints return `not_configured`.
- **The offline fixture set is a sample.** It is smaller than the harvested dataset.
- **OCR needs language data.** The first real OCR run downloads Tesseract data unless it is supplied
  locally.
- **Answers are guidance, not decisions.** Eligibility results are produced from official
  eligibility text and must be confirmed at the ward office.
- **Built in a short sprint.** The scope above reflects what a small team completed quickly. The
  limitations are listed rather than papered over.

---

## Documentation

| Document | Contents |
| :--- | :--- |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Runtime versions, ports, system dependencies, every environment variable |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, seed, RLS summary and how the SQL was validated |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Start order and the smoke-test checklist |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | The recorded walkthrough and its fallbacks |
| [docs/RUN_LIVE_SUPABASE.md](docs/RUN_LIVE_SUPABASE.md) | Running the whole stack against a live Supabase project |
| [docs/SCHEME_DATA_SPEC.md](docs/SCHEME_DATA_SPEC.md) | The scheme data contract |
| [docs/FRONTEND_DATA_CONTRACT.md](docs/FRONTEND_DATA_CONTRACT.md) | The shapes the web app expects from the API |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Design tokens, bilingual typography and component rules |
| [docs/UI_SPECIFICATION.md](docs/UI_SPECIFICATION.md) | Screen-by-screen interface specification |
| [docs/VOICE_AND_TONE.md](docs/VOICE_AND_TONE.md) | Citizen-facing language rules |
| [docs/MUNICIPAL_SCHEME_RESEARCH.md](docs/MUNICIPAL_SCHEME_RESEARCH.md) | Scheme and portal research |
| [docs/THREE_PILLARS_RESEARCH.md](docs/THREE_PILLARS_RESEARCH.md) | The education, healthcare and livelihood analysis |
| [docs/PMC_LIVE_SCRAPING_VERIFICATION.md](docs/PMC_LIVE_SCRAPING_VERIFICATION.md) | What was verified against the live PMC source |
| [docs/PMC_SOURCE_VERIFICATION_2026-10-04.md](docs/PMC_SOURCE_VERIFICATION_2026-10-04.md) | Source-by-source verification record |

Each package also carries its own README covering its internals and its test suite: `packages/agents`,
`packages/audit`, `packages/documents`, `packages/harvester`, `packages/web` and `backend`.

---

## Research

The analysis behind the problem statement, including sources and method, is in
[docs/research/](docs/research/):

- `municipal_welfare_delivery_empirical_analysis.md`
- `The Last Mile Fracture_ How Fiscal Strain and Administrative Burden Undermine Municipal Welfare Delivery in India.md`
- `NAGRIKSETU_MASTER_RESEARCH_AND_DATA.md`
- `NAGRIKSETU_PRODUCT_ARCHITECTURE_AND_COMPONENTS.md`
- `civic_intelligence_cline_analysis.md`

The pitch deck is at [docs/NagrikSetu_deck.pdf](docs/NagrikSetu_deck.pdf).
