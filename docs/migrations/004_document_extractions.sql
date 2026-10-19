-- 004_document_extractions.sql
-- Masked citizen-document audit results (R14, KTD8).
--
-- Zero-PII (DPDP Act 2023, .clinerules/03-zero-pii-security.md):
--   * There is NO column for an upload, a page image, a text layer, an OCR
--     string or any unmasked value. The only payload is `result`, the already
--     masked JSON response.
--   * The CHECK constraints below reject a row whose masked JSON still holds an
--     Aadhaar, account or PAN shape, so a client-side masking bug cannot land
--     here either. They are a backstop, not the control: the control is that
--     `runAudit` proves the response clean before anything is stored.
--   * Service-role only. RLS is enabled with no policy, and anon/authenticated
--     are revoked, so only a service-role key can read or write.
--   * Rows are disposable: the citizen-facing docket purge (24h TTL) is handled
--     by the storage layer; these rows hold no documents.

CREATE TABLE IF NOT EXISTS public.document_extractions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id           TEXT        NOT NULL,
    document_id          TEXT        NOT NULL,
    model_id             TEXT        NOT NULL,
    document_type_guess  TEXT        NOT NULL DEFAULT '',
    needs_review         BOOLEAN     NOT NULL DEFAULT true,
    pages_read           INT         NOT NULL DEFAULT 0,
    pages_total          INT         NOT NULL DEFAULT 0,
    -- The masked response, exactly as returned to the caller.
    result               JSONB       NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Reject an unmasked 12-digit Aadhaar shape (optionally 4-4-4 spaced).
    CONSTRAINT document_extractions_no_aadhaar CHECK (
        (result::text !~ '[0-9]{12}') AND
        (result::text !~ '[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}')
    ),
    -- Reject an unmasked account-shaped run (9-18 digits).
    CONSTRAINT document_extractions_no_account CHECK (
        result::text !~ '[0-9]{9,}'
    ),
    -- Reject an unmasked PAN (masked PANs keep only four trailing characters).
    CONSTRAINT document_extractions_no_pan CHECK (
        result::text !~ '[A-Z]{5}[0-9]{4}[A-Z]'
    )
);

COMMENT ON TABLE public.document_extractions IS
    'Masked document-audit results only (R11/R14). No uploads, no page images, no unmasked values.';
COMMENT ON COLUMN public.document_extractions.result IS
    'The masked audit response (Aadhaar XXXX-XXXX-NNNN; account and PAN last 4).';

CREATE INDEX IF NOT EXISTS document_extractions_session_idx
    ON public.document_extractions (session_id, created_at DESC);

-- Service-role only: RLS on, no policy, no table privileges for the API roles.
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_extractions FROM anon, authenticated;

-- No `FORCE ROW LEVEL SECURITY`: the service_role bypasses RLS by design, and
-- the gateway (FastAPI) never talks to this table directly.
