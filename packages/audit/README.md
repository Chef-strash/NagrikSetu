# @nagriksetu/audit

The citizen document audit. Bytes in, masked JSON out:

```
POST /extract                    upload (memory only)
    |
    v
pages.ts      magic-byte type -> PDF text + rendered PNGs, or one image page
              (10 MB cap, first 3 pages, the page cap applied BEFORE rendering)
    |
    v
ocr.ts        tesseract.js eng+hin+mar ......... corroboration only
    |
    v
agent/        one Cline SDK session: page images (unless a page shows an
              ID/account number) + text layer + OCR text, with three tools
              over one draft store: record_field . flag_issue . submit_extraction
    |
    v
verify/       per-field grounding (text layer > OCR > vision) + code-side
              validators: Aadhaar checksum, malformed PAN/IFSC, merged-bank
              prefix, past validity date, missing signature/seal
    |
    v
verify/mask   masking LAST: Aadhaar XXXX-XXXX-NNNN, account and PAN last 4
    |
    v
store.ts      masked JSON only, when Supabase is configured
    |
    v
response      proven clean before it leaves: a payload that still holds an
              unmasked shape throws instead of being returned
```

It runs on `@nagriksetu/agents` (session runner, model choice, tool helpers) and
`@nagriksetu/documents` (PDF reading, rendering, masking) — no copy of either.

**Fields are dynamic.** There is no per-document-type schema: the agent
records whatever facts the document contains under whatever clear snake_case
keys fit. `SUGGESTED_FIELD_KEYS` is a naming convention offered in the prompt so
the same fact tends to get the same key across documents; an agent may invent a
key for anything the list does not cover.

## HTTP contract

```
POST /extract                          multipart/form-data
  file          document bytes         PDF | JPEG | PNG, <= 10 MB
  session_id    citizen session id
  document_id   document id in session
  header: x-audit-token                required; value = AUDIT_SERVICE_TOKEN

200 application/json
  { document_type_guess, language, issuer, has_signature, has_seal,
    pages_read, pages_total, needs_review, model,
    fields: [ { key, label, value, normalized, type, page, handwritten,
                grounding } ],
    flags:  [ { kind, detail, field_key? } ],
    notices: [ string ] }
  every value masked

GET /health  ->  { ok, database: "supabase" | "in-memory", model }
```

Statuses: `400` missing/empty form field or unreadable upload, `401` bad or
missing token, `413` body over the cap, `415` not a PDF/JPEG/PNG (checked by
content, not file name) or not multipart, `429` too many concurrent runs,
`500 masking_failed` when the response did not pass the zero-PII check,
`503 service_token_unconfigured` when `AUDIT_SERVICE_TOKEN` is unset.

Deliberate hardening (an open port lets anyone spend ClinePass quota on 40-60
second agent calls):

- binds **loopback** only (`AUDIT_HOST`, default `127.0.0.1`);
- requires `AUDIT_SERVICE_TOKEN`, and refuses to run at all without it;
- caps the request body, concurrent runs (`2`) and run wall-clock time (120 s);
- never logs a request body: only `method path -> status`, bytes and duration.

## Models

| Variable | Default | When used |
| :--- | :--- | :--- |
| `AUDIT_PROVIDER_ID` | `cline-pass` | always |
| `AUDIT_MODEL_ID` | `cline-pass/glm-5.3` | text-only runs (no page image attached) |
| `AUDIT_VISION_MODEL_ID` | `cline-pass/qwen3.7-plus` | whenever a page image rides the turn |

`cline-pass/qwen3.7-plus` is the only vision-capable ClinePass model as of
2026-10-04. **Text-only mode is an outcome, not a setting**: it is active for a
run exactly when no page image was attached — every page was withheld,
every page carried usable text and had no renderer, or the upload was empty of
images. The response then carries a notice saying so, and the run uses the text
model rather than switching provider silently.

Auth: `AUDIT_API_KEY`, else `CLINE_API_KEY`, else the Cline OAuth token in
`~/.cline/data/settings/providers.json`. No Anthropic key is required.

## Zero-PII (`.clinerules/03-zero-pii-security.md`)

- Uploads, page images and text layers live in RAM only; nothing is written to
  disk, and the agent harness's own session store is redirected to a volatile
  per-run directory and purged (see `@nagriksetu/agents`).
- Masking runs **last**, over every field value, flag detail and notice, keyed by
  pattern before field name. `runAudit` then re-scans the whole payload
  (`findUnmaskedPii`) and throws `AuditMaskingError` instead of returning it.
- `store.ts` writes only the masked JSON with the session id, document id, model
  id and timestamps; there is no column for a file, an image, a text layer or an
  unmasked value. `docs/migrations/004_document_extractions.sql` is RLS-locked,
  service-role only, with CHECK constraints that reject a row holding an Aadhaar,
  account or PAN shape.
- A page whose **text layer or OCR text** carries an Aadhaar- or
  account-shaped number is never sent as an image; its text is sent instead. The
  test covers both sources, so a scanned ID (no text layer at all) is withheld
  too. Such a document is at most `needs_review`.

## Commands

```bash
npm install
npm run build                     # tsc -p tsconfig.json -> dist/
npm test                          # vitest run (offline: fake OCR engine, mocked core)
npx tsc --noEmit                  # type check

# One document, end to end, masked JSON on stdout and notes on stderr:
node dist/cli.js extract <file.pdf|file.jpg|file.png> [--document-id=..] [--no-ocr]

# Serve the HTTP contract (needs AUDIT_SERVICE_TOKEN):
node dist/cli.js serve

# Score the synthetic corpus (needs the untracked corpus and a provider key):
node dist/cli.js eval <samples/synthetic> [--limit=N]
```

`--no-ocr` skips OCR entirely; corroboration is then text-layer only, and the
response says so in `notices`.

### OCR

`tesseract.js` runs with `eng+hin+mar` and is **corroboration only**: the
model reads the page, OCR confirms a value, and the stronger source wins
(`text layer > OCR > vision`). A page whose text layer already counts as real
text is never OCR'd. Point `AUDIT_TESSDATA_DIR` at a directory of decompressed
`<lang>.traineddata` files (`eng`, `hin`, `mar`) and a demo needs no network;
without it tesseract.js downloads from the CDN and caches in
`AUDIT_TESSDATA_CACHE_DIR` (the OS temp directory by default, never the working
directory). If OCR cannot run, the run **degrades loudly**: a notice names the
error and the page is recorded as skipped — it never crashes and never pretends
a value was cross-checked.

```bash
AUDIT_TESSDATA_DIR=/path/to/tessdata npx vitest run src/ocr.test.ts   # live OCR tests
```

### Evaluation

`eval` scores each corpus file against `ground_truth.json` on the shared keys and
prints percent correct per variant, the defect flags hit and missed, and a pass
or fail line for "no unmasked numbers". Three things about the corpus shape it:

1. **Reference values are unmasked**, so the reference is masked the same way the
   response was before anything is compared (`maskReference` → `maskValue`);
   otherwise every ID and account field would score as a miss.
2. **The defects are mixed.** `name_mismatch` and `income_above_typical_limit`
   belong to the deferred cross-document checks, so they are excluded from the
   pass condition (`DEFERRED_DEFECTS`) instead of counted as misses.
3. **121 files at 30-60 s per live call.** `--limit=N` caps the runs
   (`DEFAULT_EVAL_LIMIT` is 6) and the report always prints the full-set
   expectation, so a green gate names the subset it actually scored:
   `full set: 121 runs at ~45000ms/run ~ 90.8 minutes (measured over N run(s))`.

A run that errors is reported as an error case, and a variant file that is absent
is reported as skipped — neither crashes the run. An errored run is **not**
counted as a masking failure: it returned no payload at all, so counting it would
make the zero-PII gate meaningless (the error is counted on its own).

Observed on a live subset run: the `__phone` photo variant failed once with
`agent session … ended without calling the completion tool "submit_extraction"`
and passed on the next attempt. There is no automatic retry (a deliberate plan
decision): the caller gets an error naming the missing submission and can re-run.

## `serverless-host limit`

The audit is a **Node process, not a serverless route**. A run is one resident
process holding a Tesseract wasm worker plus a 40-60 second agent call, with
native binaries (`@napi-rs/canvas`) and per-request state; a serverless host caps
the request at a few seconds and gives no writable state. That, plus zero-PII
(no temp files, an inspectable process boundary), is why `serve` exists instead
of a Next.js route.

## Tests

170 tests across 13 files (168 offline, plus 2 that run real Tesseract OCR with
`AUDIT_TESSDATA_DIR` set). Notable ones:

| File | Proves |
| :--- | :--- |
| `pages.test.ts` | magic-byte detection, 10 MB and 3-page caps, text/mojibake/scan routing, no temp file created |
| `ocr.test.ts` | page selection, degradation notices, live tesseract with local language data |
| `agent/tools.test.ts` | the three tools, dynamic keys, schema rejection of an empty key/value |
| `agent/extractor.test.ts` | a mocked session's draft, image withholding, a run that never submits |
| `verify/validators.test.ts` | each validator: Aadhaar checksum, PAN, IFSC, merged bank, expiry |
| `verify/verify.test.ts` | grounding tiers, `1500` vs `15000`, handwritten and withheld forcing review |
| `verify/mask.test.ts` | masking last, and the whole-payload scan for unmasked shapes |
| `extract.test.ts` | the pipeline end to end over real PDFs, plus the payload scan |
| `server.test.ts` | every status in the contract, the token, the caps, and "no body in the log" |
| `store.test.ts` | masked-only writes, refusal to store a leaking record, merger fallback |
| `eval.test.ts` | 2-of-3 = 67%, reference masking, unmasked-fails, missing variant skipped |
| `cli.test.ts` | argument parsing, exit codes, and `serve` staying up until told to stop |
