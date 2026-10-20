// Sends a finished audit to the chatbot session so the assistant can answer with
// crowd-sourced counter tips. Zero-PII: only labels, statuses and scrubbed reasons
// are sent - never a field value, name or number.

import type { AuditResult } from "./types.ts";

export interface AuditChatPayload {
  documents: Array<{
    name: string;
    status: string;
    rows: Array<{ label: string; status: string; reason: string }>;
  }>;
  summary: AuditResult["summary"];
}

const MAX_REASON = 160;

/** Defensive scrub: drop quoted text and digit runs in case a reason echoes a value. */
export function scrubReason(reason: string): string {
  return reason
    .replace(/["'“”‘’][^"'“”‘’]*["'“”‘’]/g, "[value]")
    .replace(/\d[\d\s-]{2,}\d/g, "[number]")
    .slice(0, MAX_REASON);
}

export function buildAuditChatPayload(audit: AuditResult): AuditChatPayload {
  const documents: AuditChatPayload["documents"] = audit.requiredDocuments.map((doc) => ({
    name: doc.name,
    status: doc.status,
    rows: []
  }));
  if (audit.fieldChecks.length > 0) {
    documents.push({
      name: "Application Form",
      status: audit.fieldChecks.some((c) => c.status === "MISMATCH") ? "NEEDS_REVIEW" : "UPLOADED",
      rows: audit.fieldChecks.map((c) => ({
        label: c.formLabel,
        status: c.status,
        reason: scrubReason(c.reason)
      }))
    });
  }
  return { documents, summary: audit.summary };
}

export const auditChatEndpoint = (chatSessionId: string) =>
  `/api/v1/chatbot/session/${encodeURIComponent(chatSessionId)}/audit`;

/** Fire-and-forget friendly: never throws. Returns tips text or null. */
export async function postAuditToChat(
  chatSessionId: string,
  audit: AuditResult,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(auditChatEndpoint(chatSessionId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAuditChatPayload(audit))
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { tips?: unknown };
    const tips = Array.isArray(data.tips)
      ? data.tips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).join("\n- ")
      : typeof data.tips === "string"
        ? data.tips.trim()
        : "";
    if (!tips) return null;
    return `Before you go to the counter - tips from other citizens: ${Array.isArray(data.tips) ? "\n- " : ""}${tips}`;
  } catch {
    return null;
  }
}
