// Asks the Layer-2 backend to phrase a finished audit for the chat thread.
//
// The audit DECISION stays in this app (lib/audit/verify.ts). This module only
// builds the request that gets that result summarised in plain language.
//
// Zero-PII: `buildAuditSummaryRequest` deliberately whitelists name / status /
// label / reason and DROPS every value. The backend's prompt therefore never sees
// a masked Aadhaar, an account number or a holder name. A useful summary only needs
// to know THAT a field mismatched, not what the value was.

import type { WebAuditResult } from "./run.ts";

export const AUDIT_SUMMARY_ENDPOINT = "/api/v1/chatbot/audit-summary";

export interface AuditSummaryRequest {
  schemeName: string;
  lang: string;
  documents: Array<{ name: string; status: string }>;
  fields: Array<{ label: string; status: string; reason: string }>;
  failedCount: number;
  missingForm: boolean;
  counterLocation: string;
}

/** Map an audit result onto the backend's values-free summariser payload. */
export function buildAuditSummaryRequest(
  result: WebAuditResult,
  meta: { schemeName: string; language?: string; counterLocation: string }
): AuditSummaryRequest {
  return {
    schemeName: meta.schemeName,
    lang: meta.language ?? "en",
    documents: result.audit.requiredDocuments.map((row) => ({
      name: row.name,
      status: row.status
    })),
    fields: result.audit.fieldChecks.map((check) => ({
      label: check.formLabel,
      status: check.status,
      reason: check.reason
    })),
    failedCount: result.failed.length,
    missingForm: !result.documents.some((doc) => doc.role === "APPLICATION_FORM"),
    counterLocation: meta.counterLocation
  };
}

/**
 * Ask the backend to summarise. Returns null whenever the service is offline, the
 * provider is unconfigured, or the reply is unusable — the caller then keeps its
 * own deterministic report, so the chat is never left empty.
 */
export async function fetchAuditSummary(
  payload: AuditSummaryRequest,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(AUDIT_SUMMARY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const data = (await response.json()) as { summary?: unknown };
    return typeof data.summary === "string" && data.summary.trim() ? data.summary : null;
  } catch {
    return null;
  }
}
