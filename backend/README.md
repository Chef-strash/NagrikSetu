# NagrikSetu backend

The NagrikSetu backend, written in **TypeScript** on Node.js.
It currently owns the **read-only citizen feedback API** (maintained scheme FAQs +
approved scheme reviews) and the **chatbot** (query decomposition → scheme discovery → FAQs).
It is the intended home for the rest of the NagrikSetu backend (eligibility assessor,
pre-audit, docket generation) as those land.

> The OCR and pre-audit pipeline runs as a separate service in `packages/audit`,
> not in this process. This service is the citizen-facing HTTP/API layer.

## Endpoints

| Method | Path | Behaviour |
| :--- | :--- | :--- |
| `GET` | `/health` | Liveness check. |
| `GET` | `/api/v1/schemes/:slug/faqs?lang=en` | Published FAQs, language-preferred. |
| `GET` | `/api/v1/schemes/:slug/reviews?limit=20` | Approved reviews. No location filter. |
| `POST` | `/api/v1/schemes/:slug/reviews` | Body `{ text, author?, role?, counter?, ward?, frictionTag?, severityLevel? }` → validates + saves a citizen review (service-role write). |
| `POST` | `/api/v1/schemes/:slug/faq-answer` | Body `{ question, lang?, ward? }` → answer for that scheme. **FAQ-first**, general-intelligence fallback, plus location-matched reviews. |
| `POST` | `/api/v1/chatbot/session` | Body `{ query, lang?, profile?, profileWard?, ulbCode? }` → decomposes once, returns ranked schemes. |
| `GET` | `/api/v1/chatbot/session/:id` | The stored session (decomposition + candidates + selection + history). |
| `POST` | `/api/v1/chatbot/session/:id/select` | Body `{ schemeSlug, lang? }` → selected scheme + its published FAQs **+ an eligibility check**. |
| `POST` | `/api/v1/chatbot/session/:id/ask` | Body `{ question, lang? }` → grounded FAQ answer for the selected scheme. |
| `POST` | `/api/v1/chatbot/session/:id/message` | Body `{ text, lang? }` → unified message. **After selection, always scheme-info on the selected scheme.** |

### Reviews (read + write)
- `GET /schemes/:slug/reviews` returns approved reviews (scheme-wide).
- `POST /schemes/:slug/reviews` submits a citizen review. It is **validated first**
  (`review-input.ts`): 10–1000 chars, and **rejected** if it contains Aadhaar-style
  numbers, long digit runs, emails, or links. Writes go through the **service role**
  (the anon role is read-only), and the review is published after validation.
  Without a database write path the endpoint returns `503`.

### Eligibility check (on selection)
When a scheme is selected, the LLM is given the scheme's **official `eligibility_text`**
plus the **decomposed applicant facts**, and returns:
```json
{ "verdict": "likely_eligible | not_eligible | need_more_info",
  "reasons": [...], "quoted_lines": [...], "missing_info": [...], "questions": [...] }
```
`quoted_lines` is code-filtered so a quote must actually appear in `eligibility_text`
(anti-hallucination). Missing facts drive the **clarifying questions**; answering them
via `/message` merges new facts (`mergeFacts`) and **re-checks eligibility**.
Deterministic `assessScheme` is the fallback when no LLM is configured.

### Selected-scheme rule
Once a scheme is `select`ed in a session, **every subsequent message is answered as
scheme-info about that scheme** — the normal intent classification is overridden
(`forcedIntent: true`). The user cannot switch schemes or trigger discovery
mid-session; they must start a new session. Before a selection, `/message` behaves
normally (discovery/questions).

Response shapes match the existing Next.js routes in `packages/web/src/app/api/v1/...`,
so a client can switch between them without changes.

## Run

```bash
cd backend
npm install
npm run dev        # watch mode
npm start          # once
npm test           # unit + API tests (node --test)
npm run typecheck  # tsc --noEmit
```

The server reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `backend/.env` first,
then the repository-root `.env`, so the shared Supabase project is reused without
duplicating secrets. Set `NAGRIKSETU_DISABLE_DB=1` to force the offline fixtures.

## Layout

Backend code is **feature-modular**: every feature lives in its own folder under
`src/features/`, shared infrastructure lives in `src/core/`, and `src/app.ts` only
mounts feature routers.

```
backend/
├── src/
│   ├── index.ts                 # server entrypoint (listen)
│   ├── app.ts                   # express app factory; mounts feature routers
│   ├── core/                    # shared infrastructure (not feature-specific)
│   │   ├── config.ts            # env loading + settings
│   │   ├── supabase.ts          # anon + service-role clients
│   │   └── schemes.ts           # scheme repository (shared domain data)
│   └── features/
│       ├── feedback/            # feature: read-only FAQs + reviews
│       │   ├── index.ts         # barrel: exports the feature router
│       │   ├── routes.ts        # HTTP endpoints
│       │   ├── service.ts       # DB-or-fixture orchestration
│       │   ├── answer.ts        # pure, extractive retrieval/answer engine
│       │   ├── fixtures.ts      # offline FAQ/review fixtures
│       │   └── types.ts         # feature types
│       └── chatbot/             # feature: query decomposition + discovery + FAQs
│           ├── index.ts
│           ├── routes.ts        # POST /chatbot/query
│           ├── service.ts       # intent routing + orchestration
│           ├── decompose.ts     # pure: free text -> structured search object
│           ├── retrieve.ts      # pure: structured + lexical scheme ranking
│           ├── assess.ts        # pure: soft eligibility signal
│           └── types.ts
└── test/
    ├── feedback/                # tests mirror the feature folders
    └── chatbot/
```

### Adding a feature

1. Create `src/features/<name>/` with `routes.ts`, `service.ts`, and `types.ts`.
2. Export a router from `src/features/<name>/index.ts`.
3. Mount it in `src/app.ts`: `app.use("/api/v1", <name>Router);`.
4. Add tests in `test/<name>/`.

## Data access

Two Supabase clients (`src/core/supabase.ts`):

- `getAnonClient()` — public key; reads are **RLS-enforced**.
- `getAdminClient()` — `SUPABASE_SERVICE_ROLE_KEY`; trusted writes, bypasses RLS.
- `getReadClient()` — for public reads: prefers anon (keeps RLS in force), falls
  back to the service role when no anon key is configured.

## LLM (query decomposition + FAQ answering)

Two interchangeable routes, selected in `src/core/llm.ts`:

**1. Cline SDK (recommended — no provider API key).** `src/core/cline-llm.ts` calls
the Cline model gateway via `@cline/llms`, using the Cline account that is already
signed in on the machine (`~/.cline/data/settings/providers.json`). Enable with:
```env
LLM_PROVIDER=cline
CLINE_PROVIDER_ID=cline              # or "cline-pass"
CLINE_MODEL_ID=cline-pass/deepseek-v4.1-flash
```
`@cline/llms` is imported **dynamically** (it is heavy), and any failure — package
missing, not signed in, gateway `Unauthorized` — falls back automatically.

**2. Provider API key.** `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (plus optional
`OPENAI_BASE_URL`/`OPENAI_MODEL` for any OpenAI-compatible endpoint).

### FAQ answer policy (feedback)
`getFaqAnswer(slug, question, lang, { location })` follows a strict order:

1. **FAQ-first.** If the scheme's maintained FAQs cover the question, the answer is
   produced **only** from those FAQs (strict system prompt; no outside knowledge).
2. **General fallback.** If no FAQ covers it, the model may use general knowledge
   (still not inventing scheme figures), and says so when a figure is unpublished.
3. **Location-matched reviews.** Reviews for **the same scheme** are included in the
   prompt **only when the reviewer's location matches the citizen's** (`ward` /
   `location` in the body). Reviews are labelled as citizen-reported experiences, not
   official policy.

The reply reports `answerSource: "faq" | "review" | "general" | "none"`,
`reviews[]` (used, ≤3) and `locationMatched`.

Either route drives:
- **Decomposition** (`features/chatbot/decompose-llm.ts`) — LLM output is
  **validated/normalised** through the typed schema; invalid output or a provider
  error falls back to the deterministic `decompose()`.
- **FAQ answering** (`features/feedback/answer-llm.ts`) — the policy above; the
  extractive FAQ answer is used when no LLM is configured.

With no LLM enabled the service runs fully on the deterministic/extractive paths, so
tests and offline demos never break. `POST /chatbot/session` reports
`decompositionSource: "llm" | "rules"`. Set `NAGRIKSETU_DISABLE_LLM=1` to force the
offline paths (the test suite does).

## Guarantees

- **Read-only.** The public surface never writes; RLS grants `SELECT` only
  (see `docs/migrations/003_feedback_system.sql`).
- **Grounded answers.** `answer.ts` is extractive: it returns the stored FAQ text
  verbatim, so it can never invent eligibility criteria. No match → it says so.
- **Offline-resilient.** Every read falls back to fixtures when the DB is absent.