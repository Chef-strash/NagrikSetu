# Runbook

## Start (three terminals)
1. Audit service (8787): `cd packages/audit && npm run build && AUDIT_SERVICE_TOKEN=<secret> npm run serve` (see packages/audit/README.md for the port flag and model keys)
2. Backend (8000): `cd backend && npm run dev`
3. Web (3000): `cd packages/web && npm run dev` with `AUDIT_SERVICE_URL=http://localhost:8787`, the same `AUDIT_SERVICE_TOKEN`, and `NAGRIKSETU_API_URL=http://localhost:8000` in `.env.local`.

## Smoke test
- [ ] http://localhost:3000 loads; schemes list renders
- [ ] Backend and audit service respond on 8000 / 8787
- [ ] Assistant: ask a scheme question, get a reply, choose a scheme
- [ ] Audit page: upload a document, press Audit, see per-field results
- [ ] Stop the audit service: Audit shows "Document audit service is offline - nothing was verified." and no document is marked verified
- [ ] Reviews: submit a review (shows "published", or "awaiting review" if `REVIEWS_AUTO_PUBLISH=false`); fixture reviews show no Helpful button; switching language refetches
- [ ] Footer: no placeholder email; grievance link only if `NEXT_PUBLIC_SUPPORT_EMAIL` is set
- [ ] `POST /api/v1/documents/upload` returns 204 with default env (zero-PII)
- [ ] `cd packages/web && npx tsc --noEmit && npm test && npx next lint`
