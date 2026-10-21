# Running the stack against a live Supabase project

This is the full setup used to run NagrikSetu end to end against a real Supabase project, a Cline
account and Sarvam voice, with no Docker.

## What you need

- Node 22.18 or newer. `.nvmrc` pins 24.
- A Supabase project.
- A Cline account or API key, which the chatbot and the document audit both use.
- A Sarvam API key for voice. This one is optional: without it the voice endpoints report
  `not_configured` and everything else works.
- Synthetic sample documents to upload. Do not use real Aadhaar or passbook scans.

## Secrets

Put every key in `.env.demo` at the repository root. It is gitignored and must never be committed or
printed. `.env.demo.example` lists the variables it expects.

## Steps

1. `node -v` must report 22.18 or newer. Then run `npm install` at the repository root.
2. Run `npm run demo:setup`. This writes `packages/web/.env.local`, `backend/.env` and
   `packages/audit/.env` from `.env.demo`, applies `docs/demo-setup.sql` and then `docs/seed.sql`
   through `DATABASE_URL`, and runs the verification step. Expect roughly 21 schemes, 30 FAQs,
   19 ward offices and 80 hospitals.
   - A "tenant or user not found" error means the pooler host or region in `DATABASE_URL` is wrong.
     Copy the exact session pooler string from Supabase, under Project Settings, Database, and keep
     the password URL-encoded.
   - If the database cannot be reached at all, paste `docs/demo-setup.sql` and then `docs/seed.sql`
     into the Supabase SQL editor instead.
3. In the Supabase dashboard, under Authentication and then Providers, confirm that Email is enabled
   with OTP codes, and that the email template contains `{{ .Token }}`.
4. Run `npm run demo:start`. This builds and starts the audit service, the backend and the web app,
   and writes logs to `.demo-logs/`. Confirm that `http://localhost:8000/health`,
   `http://127.0.0.1:8787/health` and `http://localhost:3000` all respond.
5. Run `npm run demo:otp -- you@example.com --profile`. This prints a sign-in code without sending
   any email, and `--profile` also writes a filled demo profile. The code is always eight digits,
   because it comes from the admin API rather than from the configured email template; the sign-in
   form accepts six to eight digits so that a normally emailed code works too. Codes last about an
   hour, so generate one just before you sign in.
6. Sign in at `http://localhost:3000/auth/signin` with that email and code.
7. Work through the flow described in [DEMO_SCRIPT.md](DEMO_SCRIPT.md): sign in, ask the assistant a
   question and switch to Marathi, use voice input and read-aloud, choose a scheme, upload the
   synthetic documents and run the audit, then post a review and reload to confirm that the session
   is restored.

## Notes

- The voice output speaker is `shubh`, falling back to the model default if the API rejects it. The
  text model is `cline-pass/glm-5.3` and the vision model is `cline-pass/qwen3.7-plus`.
- Voice input needs the browser to hold microphone permission for `localhost`. Grant it at the
  prompt, or from the site settings, before recording. Without it the assistant says the permission
  was denied and typed input still works.
- Document files stay in RAM, because `DOCUMENT_STORAGE_ENABLED` defaults to `false`. That is the
  zero-PII default described in the root README.
- Rotate every key used here once the evaluation is over.
