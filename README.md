# NagrikSetu

**Municipal welfare discovery, pre-audit and ingestion for India's Urban Local Bodies.**

A citizen describes their situation in English or Marathi. NagrikSetu matches them against municipal
and central schemes, quotes the official eligibility text behind every match, says which ward counter
to visit and what to carry, and reads their documents for defects before they join the queue.

Municipal welfare is published as scanned regional-language circulars on individual corporation
portals: not searchable, with filing windows of 15 to 45 days, unwritten counter requirements, and
roughly one application in three discarded for a paperwork defect. NagrikSetu closes that gap. Two
things separate it from a scheme-search website:

- **The scheme registry is not typed in by hand.** Cline SDK agents read Pune Municipal Corporation's
  listing APIs, circulars and scanned Marathi PDFs, then write validated rows with provenance.
- **Documents are read for defects, not just stored.** Aadhaar, bank account numbers and PAN are
  masked inside the processing pipeline, and raw document images never reach disk.

Repository `NagrikSetu_WhiteBox` · team Whitebox.

---

## What it does

1. **Sign in** with an email one-time code. The profile carries ward, category and household facts.
2. **Describe the situation** — typed or spoken, English or Marathi.
3. **Get matched schemes.** Each match quotes the official eligibility text it used and names the
   profile facts still missing.
4. **Read counter guidance.** Counters, timings, documents and amounts, from maintained scheme FAQs
   and from what other citizens reported at that counter.
5. **Audit the documents.** Aadhaar, passbook, marksheet and income certificate are read and checked
   for defects before submission.
6. **Walk in prepared** — where to submit, what to carry.

Eligibility output is guidance, never a decision. The ward office makes the final call, and the
product says so on screen.

---

## Architecture

Three services and four shared packages, all Node.js and TypeScript. The one-page diagram is at
[docs/architecture/NagrikSetu_architecture.svg](docs/architecture/NagrikSetu_architecture.svg).

| Component | Port | Role |
| :--- | :--- | :--- |
| `packages/web` | 3000 | Next.js 14 citizen app, bilingual, proxies all API calls |
| `backend` | 8000 | Express API: scheme matching, FAQ answers, citizen reviews |
| `packages/audit` | 8787 (loopback) | Document audit agent: extraction, validation, PII masking |
| `packages/harvester` | — | Cline SDK ingestion agents that maintain the scheme registry |
| Supabase | hosted | Postgres + row-level security + storage |

```
   citizen ──▶ web :3000 ──/api/v1──▶ backend :8000 ──▶ Supabase (Postgres + RLS)
                    │                       │
                    └──/api/v1/audit──▶ audit :8787      packages/harvester (Cline agents)
                                                        PMC portals ──▶ scheme registry
```

The browser never holds a privileged key: service-role keys live in route handlers and in the
backend. With no Supabase and no keys configured, everything runs offline from bundled fixtures.


---

## Running it

Two ways, and both give you the whole application — web, backend and audit service. Nothing is
required to start: with no `.env` file the stack runs offline from bundled fixtures and answers with
deterministic (non-LLM) logic.

**Requirements**

| Path | Needs |
| :--- | :--- |
| Docker | Docker Desktop or Docker Engine v24+ with the Compose plugin |
| Without Docker | Node.js **22.18 or newer** (24 LTS recommended; `.nvmrc` pins it) and npm 10+ |

### Option 1 — Docker

```bash
docker compose up --build
```

| Service | URL | Check |
| :--- | :--- | :--- |
| web | <http://localhost:3000> | the citizen app |
| backend | <http://localhost:8000/health> | `{"status":"ok"}` |
| audit | <http://127.0.0.1:8787/health> | loopback only; `{"ok":true}` |

Sign in at <http://localhost:3000/auth/signin> with **any email and any code of 6 digits or more** —
demo sign-in is enabled by default in Compose, and no mail is sent.

Day-to-day commands:

```bash
docker compose up -d --build     # run in the background
docker compose logs -f           # follow logs (add a service name for one)
docker compose ps                # status and health
docker compose restart backend   # restart one service
docker compose down              # stop
docker compose down -v           # stop and drop volumes (e.g. cached OCR language data)
```

To turn on a real database, a language model or voice, copy `.env.example` to `.env`, fill in what
you want and run `docker compose up --build` again. Next.js inlines `NEXT_PUBLIC_*` variables at
build time, so **rebuild after changing any of them**. Every variable is documented in
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

### Option 2 — without Docker

```bash
npm ci                        # installs every workspace from the root lockfile

npm run start:backend         # terminal 1 — API on http://localhost:8000
npm run dev:web               # terminal 2 — web app on http://localhost:3000
```

Terminal 3, only for the document audit page (everything else works without it):

```bash
npm run build:audit                                   # shared packages + audit service
AUDIT_SERVICE_TOKEN=local-token node packages/audit/dist/cli.js serve    # bash
$env:AUDIT_SERVICE_TOKEN='local-token'; node packages/audit/dist/cli.js serve  # PowerShell
```

The audit service refuses to start without `AUDIT_SERVICE_TOKEN` by design. Without it running, the
audit page reports the service as offline.

### Signing in

Sign-in is configured explicitly; it is not on by itself.

- **Demo mode, no Supabase.** Put `NEXT_PUBLIC_DEMO_AUTH=true` in `packages/web/.env.local` and
  restart `npm run dev:web` (Compose sets this for you). Any email and any code of 6 digits or more
  signs you in.
- **A real Supabase project.** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  and sign-in switches to an email one-time code. `npm run demo:otp -- you@example.com` mints a code
  without needing a mailbox.

### Using your own Supabase project

```bash
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres node scripts/db-setup.mjs
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/db-verify.mjs
```

`db-setup.mjs` applies the schema and the seed data and prints row counts; `db-verify.mjs` checks
the expected counts and that row-level security actually blocks anonymous access. Schema, seed and
the RLS summary are in [docs/DATABASE.md](docs/DATABASE.md); the live walkthrough is
[docs/RUN_LIVE_SUPABASE.md](docs/RUN_LIVE_SUPABASE.md).


---

## Tests

```bash
npm test            # every workspace
npm run typecheck   # TypeScript across every workspace
```

Both build the two shared library packages first, because the audit and harvester packages import
their built output. Two live OCR tests skip unless Tesseract language data is supplied:

```bash
cd packages/audit
AUDIT_TESSDATA_DIR=/path/to/tessdata npx vitest run src/ocr.test.ts
```

One caveat, stated because it touches a privacy guarantee: on some machines (Windows included) the
residue check in `packages/agents/src/session.test.ts` fails with *"leaves nothing behind"*. The
purge of the agent's volatile session directory is delete-and-verify, and this is the loud failure
that design prefers over silent retention — see the *Honest limits* note in
[packages/agents/README.md](packages/agents/README.md).

---

## Repository layout

```
.
|-- docker-compose.yml          three services, offline defaults
|-- backend/                    Express API: scheme matching, FAQs, reviews
|-- packages/
|   |-- web/                    Next.js 14 citizen application
|   |-- audit/                  citizen document audit service
|   |-- harvester/              Cline SDK ingestion agents for PMC
|   |-- agents/                 shared Cline SDK platform
|   `-- documents/              PDF reading and PII masking
|-- scripts/                    database setup, demo and OTP helpers
`-- docs/                       architecture, data, design and research
```

Each package has its own README covering its internals and test suite.

---

## Known limitations

- **One city, one language pair.** Ingestion is verified against Pune Municipal Corporation; the
  product is bilingual English and Marathi. The design extends further, the implementation does not.
- **Self-healing scrapers are designed, not built.** A changed portal layout fails loudly and needs a
  human patch.
- **Voice needs a Sarvam key.** Without `SARVAM_API_KEY` the voice endpoints return `not_configured`.
- **Answers are guidance, not decisions.** Eligibility is derived from official eligibility text and
  must be confirmed at the ward office.
- **Offline fixtures are a sample**, smaller than the harvested dataset, and OCR needs Tesseract
  language data on first use.

---

## Documentation

| Document | Contents |
| :--- | :--- |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Runtime versions, ports, every environment variable |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, seed, RLS summary |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Start order and the smoke-test checklist |
| [docs/RUN_LIVE_SUPABASE.md](docs/RUN_LIVE_SUPABASE.md) | Running against a live Supabase project |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | The recorded walkthrough and its fallbacks |
| [docs/SCHEME_DATA_SPEC.md](docs/SCHEME_DATA_SPEC.md) | The scheme data contract |
| [docs/FRONTEND_DATA_CONTRACT.md](docs/FRONTEND_DATA_CONTRACT.md) | What the web app expects from the API |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Design tokens and bilingual typography |
| [docs/UI_SPECIFICATION.md](docs/UI_SPECIFICATION.md) | Screen-by-screen interface specification |
| [docs/VOICE_AND_TONE.md](docs/VOICE_AND_TONE.md) | Citizen-facing language rules |
| [docs/architecture/NagrikSetu_architecture.svg](docs/architecture/NagrikSetu_architecture.svg) | One-page system diagram |

---

## Research

The analysis behind the problem statement, with sources and method, is in
[docs/research/](docs/research/) (municipal welfare delivery, the last-mile fracture, product
architecture, and the Cline agent analysis). The pitch deck is at
[docs/NagrikSetu_deck.pdf](docs/NagrikSetu_deck.pdf).

