# NagrikSetu demo recording script (3-4 minutes)

## Pre-flight checklist (do this before pressing record)

1. `cp .env.demo.example .env.demo`, fill in every key (Supabase URL/anon/service role, `DATABASE_URL`, `SARVAM_API_KEY`, `CLINE_API_KEY`), then `npm run demo:setup`.
2. `npm install` once, then `npm run demo:start`. Wait for the three `ok` lines (audit, backend, web). Logs are in `.demo-logs/`.
3. In a second terminal: `npm run demo:otp -- you@example.com --profile`. It prints a sign-in code and fills the demo profile (Ramesh Patil, Kothrud ward). Codes expire, so generate it right before the take.
4. Open `http://localhost:3000/auth/signin` in Chrome. Allow the microphone for localhost (lock icon, Site settings, Microphone, Allow). Test one voice clip off camera.
5. Have the synthetic Aadhaar and passbook samples ready in a Finder window (use the synthetic Aadhaar/passbook samples).
6. Check the language toggle in the header switches English and Marathi, then leave it on English.
7. Hide bookmarks, close notifications, zoom the browser to 110 percent.

## Script

| Time | Do | Say |
|------|----|-----|
| 0:00 | Sign-in page. Enter the email, click send code, type the code from the terminal. | "Getting a welfare scheme in a ward office means the right papers, the right counter, and no second trip. NagrikSetu guides you through it." |
| 0:25 | Home page. Profile is already filled (ward, category). Click the mic, say "I need a scholarship for my daughter's college fees". | "I just talk to it. Voice runs on Sarvam, in my own language." |
| 0:50 | Two matched schemes appear. Click "Choose this scheme" on the best one. | "It shows only schemes I may match, and quotes the official eligibility text. It never decides for me." |
| 1:15 | Read the opening message. Click Listen. Then ask "What is the counter timing?". | "Answers come from maintained scheme FAQs and what other citizens reported at this counter." |
| 1:45 | Toggle to Marathi, ask any short question. Toggle back. | "Same assistant in Marathi." |
| 2:00 | Upload the synthetic Aadhaar and the passbook into their rows. Click Audit. | "Documents are read in memory only. Nothing is stored except masked fields." |
| 2:30 | Watch progress lines stream into chat, then the report: matches, mismatches, flagged IFSC. | "It caught the merged-bank IFSC and the name spelling clerks reject on sight, before I stand in the queue." |
| 3:00 | Tips from other citizens appear as an assistant message. Point at them. | "And it adds crowd-sourced counter tips for exactly this scheme." |
| 3:20 | Show the Where to Submit card and the form checklist. | "I walk in with the right papers, at the right counter." |
| 3:40 | End on the assistant page. | "NagrikSetu: guidance only, never a decision, and your documents never leave memory." |

## Fallbacks

- Sign-in code rejected: run the otp command again and use the newest code.
- Mic blocked or no transcript: type the question; the voice path is a convenience.
- Audit says the reader is offline: check `.demo-logs/audit.log`, confirm `AUDIT_SERVICE_TOKEN` matches in `packages/web/.env.local` and `packages/audit/.env` (rerun `npm run demo:setup`, then restart).
- Slow LLM answer: pause, keep talking about the card on screen, cut in edit.
- Assistant seems generic: confirm profile shows a ward under Profile, and `backend/.env` has `NAGRIKSETU_DISABLE_LLM=0`.
- Last resort for a dead network only: set `NEXT_PUBLIC_DEMO_AUDIT=true` in `packages/web/.env.local` and restart web. That check is a placeholder, not real verification; say so on camera or do not use it.
