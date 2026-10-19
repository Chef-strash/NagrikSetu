# Dependencies

NagrikSetu is **all Node.js / TypeScript**. There is no Python in the project (the only non-JS files
are shell helpers such as `scripts/capture-fixtures.sh`), so there is no `requirements.txt` and
`pip freeze` does not apply. The equivalent is the committed npm lockfile.

## Source of truth

- **`package-lock.json` at the repository root** pins every dependency of every workspace
  (`backend`, `packages/*`). Install with `npm ci`, which fails if the lockfile and the
  `package.json` files disagree. Verified: `npm ci` on a clean `git archive` of HEAD succeeds.
- `packages/web/package-lock.json`, `packages/harvester/package-lock.json` and
  `backend/package-lock.json` are leftovers from before the workspace layout. They are ignored when
  installing from the root; do not run `npm install` inside those folders.

## Runtime

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | **>= 22.18** (24 LTS recommended; `.nvmrc` = 24) | Enforced via `engines` in the root `package.json`. The backend runs `.ts` directly via Node's built-in type stripping (default from 22.18). Docker images use `node:24-bookworm-slim`. |
| npm | 10+ (bundled with Node) | Workspaces. |
| Docker + Compose plugin | optional | Only for `docker compose up --build`. |
| Supabase CLI | optional | Only for `scripts/local-db.sh` (local database). |

## System dependencies

None required to run the app.

- **PDF / image handling** uses npm packages only (`unpdf`, `@napi-rs/canvas`, prebuilt binaries for
  Linux glibc/macOS/Windows). No `poppler`, `ghostscript` or other CLI is spawned; there is no
  `child_process` use in the source.
- **OCR (document audit)** uses `tesseract.js` (WASM). Language data for `eng+hin+mar` is
  **downloaded from the tesseract.js CDN on first OCR use** and cached in
  `$TMPDIR/nagriksetu-tessdata` (`AUDIT_TESSDATA_CACHE_DIR`). Offline options: set
  `AUDIT_TESSDATA_DIR` to a directory of plain `<lang>.traineddata` files
  (from `tesseract-ocr/tessdata_fast`), or build the Docker image with `BAKE_TESSDATA=true`.
  The rest of the app (and audit with `AUDIT_TEXT_ONLY=1`, text-layer PDFs) needs no network.

## Ports

| Service | Port | Start |
| --- | --- | --- |
| Web (Next.js) | 3000 | `npm run dev:web` / `npm run build:web` then `next start` |
| Backend (Express) | 8000 | `npm run start:backend` |
| Audit service | 8787 (binds `127.0.0.1`; `AUDIT_HOST=0.0.0.0` in containers) | `node packages/audit/dist/cli.js serve` |
| Local Supabase (optional) | 54321 API, 54322 Postgres, 54323 Studio, 54324 mail | `scripts/local-db.sh` |

## External services (all optional)

| Service | Used for | Without it |
| --- | --- | --- |
| Supabase (hosted or local) | Scheme data, auth, reviews, sessions | Bundled fixtures; demo sign-in when `NEXT_PUBLIC_DEMO_AUTH=true` |
| Cline API (`CLINE_API_KEY`) or Anthropic/OpenAI key | Chatbot decomposition, audit extraction, harvester | Deterministic backend logic; audit reports the model as unavailable |
| Sarvam AI (`SARVAM_API_KEY`) | Voice STT/TTS | `/api/v1/voice/*` returns `{"error":"not_configured"}` |
| tesseract.js CDN | OCR language data | Use `AUDIT_TESSDATA_DIR` / `BAKE_TESSDATA` |

## Environment variables

`Required?` is "no" for everything: with no `.env` the stack runs offline. "Needed for" says when
a variable becomes necessary. Web variables live in `packages/web/.env.local` when running without
Docker; the backend and docker compose read the root `.env`.

| Variable | Service | Needed for | Default |
| --- | --- | --- | --- |
| `PORT` | backend | custom port | `8000` |
| `NAGRIKSETU_DISABLE_DB` | backend | `0` to use Supabase | `1` (compose) / unset |
| `NAGRIKSETU_DISABLE_LLM` | backend | `0` to use a model | `1` (compose) / unset |
| `LLM_PROVIDER`, `CLINE_PROVIDER_ID`, `CLINE_MODEL_ID` | backend | model selection | empty |
| `CLINE_API_KEY` | backend, audit, harvester | Cline model access (when no local Cline sign-in) | empty |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | backend (audit/harvester for Anthropic) | alternative providers | empty |
| `NEXT_PUBLIC_SUPABASE_URL` | web (build time), backend | any Supabase use; also controls the auth-cookie check in `middleware.ts` | empty |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web (build time), backend | any Supabase use | empty |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server), backend, audit | review writes, audit persistence; never expose to the browser | empty |
| `SUPABASE_URL` | audit | audit persistence (compose maps it from `NEXT_PUBLIC_SUPABASE_URL`) | empty (in-memory) |
| `NAGRIKSETU_API_URL` (alias `BACKEND_API_URL`) | web (server) | backend location | `http://localhost:8000` (`http://backend:8000` in compose) |
| `AUDIT_SERVICE_URL` | web (server) | audit location | `http://127.0.0.1:8787` (`http://audit:8787` in compose) |
| `AUDIT_SERVICE_TOKEN` | web (server), audit | audit `POST /extract` (service refuses without it) | compose: `nagriksetu-local-audit-token`; otherwise none |
| `NEXT_PUBLIC_DEMO_AUTH` | web (build time) | demo sign-in; only effective while `NEXT_PUBLIC_SUPABASE_URL` is empty | compose: `true`; otherwise unset (off) |
| `NEXT_PUBLIC_DEMO_AUDIT` | web (build time) | `true` shows the FAKE local audit (demo only) | `false` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | web (build time) | footer grievance link | empty (hidden) |
| `REVIEWS_AUTO_PUBLISH` | web (server) | `false` to moderate reviews | `true` |
| `DOCUMENT_STORAGE_ENABLED` | web (server) | `true` stores uploads in Supabase Storage | `false` (RAM only) |
| `SARVAM_API_KEY` | web (server) | voice | empty |
| `SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER` | web (server) | voice overrides | library defaults |
| `AUDIT_HOST`, `AUDIT_PORT` | audit | container binding | `127.0.0.1`, `8787` (image: `0.0.0.0`) |
| `AUDIT_API_KEY`, `AUDIT_PROVIDER_ID`, `AUDIT_MODEL_ID`, `AUDIT_VISION_MODEL_ID` | audit | audit model (falls back to `CLINE_API_KEY`, default `cline-pass/glm-5.3`) | empty |
| `AUDIT_TEXT_ONLY` | audit | `1` skips OCR/vision | unset |
| `AUDIT_TESSDATA_DIR`, `AUDIT_TESSDATA_CACHE_DIR` | audit | offline OCR data / cache location | download on demand; `$TMPDIR/nagriksetu-tessdata` |
| `AUDIT_MAX_UPLOAD_BYTES`, `AUDIT_MAX_PAGES`, `AUDIT_MAX_CONCURRENT_RUNS`, `AUDIT_RUN_TIMEOUT_MS` | audit | limits | built-in |
| `HARVESTER_API_KEY`, `HARVESTER_PROVIDER_ID`, `HARVESTER_MODEL_ID`, `HARVESTER_VISION_MODEL_ID`, `SCRAPER_MODE` | harvester | ingestion CLI | see `.env.example` |
| `CLINE_DATA_DIR`, `CLINE_SESSION_DATA_DIR`, `CLINE_DB_DATA_DIR` | agents | where the Cline SDK keeps sessions | `~/.cline/data` |
| `TAVILY_API_KEY`, `SERPER_API_KEY`, `BRAVE_API_KEY` | agents | optional web-search tools for ingestion | empty |
