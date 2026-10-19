// LLM-written summary of a completed document audit.
//
// The audit ITSELF stays deterministic (the web app's `lib/audit` decides every
// MATCH / MISMATCH / MANUAL_CHECK in code). This module only turns that finished
// result into plain language a citizen can act on, so the chat shows a sentence
// rather than a machine-readable dump.
//
// Zero-PII by construction: the prompt carries NO field VALUES -- no masked Aadhaar,
// no account numbers, no names. Only labels, statuses and reasons are sent, because
// a useful summary needs to know THAT a field mismatched, not what the value was.
// Names are the applicant's personal data, so keeping them out of the model request
// is the cheapest way to hold the line the DPDP rules and the audit plan draw.
//
// With no LLM configured (or on any failure) this returns null and the caller keeps
// its deterministic report, so the offline demo never depends on a provider.

import { isLlmConfigured, llmComplete, type LlmMessage } from "../../core/llm.ts";

/** Hard cap so a runaway model reply cannot flood the chat thread. */
export const MAX_AUDIT_SUMMARY_CHARS = 900;

const MAX_ROWS = 25;
const MAX_NAME_CHARS = 160;
const MAX_LABEL_CHARS = 80;
const MAX_REASON_CHARS = 200;

export interface AuditSummaryDocument {
  name: string;
  /** UPLOADED | MISSING | NEEDS_REVIEW */
  status: string;
}

export interface AuditSummaryField {
  label: string;
  /** MATCH | MISMATCH | MANUAL_CHECK */
  status: string;
  reason?: string;
}

export interface AuditSummaryInput {
  schemeName: string;
  language: string | null;
  documents: AuditSummaryDocument[];
  fields: AuditSummaryField[];
  /** Files the reader refused. */
  failedCount: number;
  /** True when no application form was uploaded, so no fields could be compared. */
  missingForm: boolean;
  counterLocation: string;
}

export type TextCompleter = (messages: LlmMessage[]) => Promise<string>;

export interface AuditSummaryOptions {
  /** Inject a completer (tests). Otherwise the real client is used if configured. */
  complete?: TextCompleter;
}

const STATUS_WORD: Record<string, string> = {
  UPLOADED: "found",
  MISSING: "NOT found",
  NEEDS_REVIEW: "found but needs a closer look",
  MATCH: "matches the document",
  MISMATCH: "does NOT match the document",
  MANUAL_CHECK: "could not be confirmed automatically"
};

const SYSTEM_PROMPT = `You are NagrikSetu's document-check assistant for Pune municipal welfare schemes.

You are given the result of an automatic check of a citizen's application form against their supporting documents. Write a short, calm summary they can act on.

RULES:
- Report ONLY what the result says. Never invent a document, a field, or an outcome.
- Never claim the application will be accepted, and never state an eligibility decision.
- Lead with anything that needs fixing (missing documents, mismatches).
- Then say plainly what is fine.
- Use short lines. No markdown headings, no bullet characters, no preamble like "Here is".
- Address the citizen as "you". Keep it under 120 words.
- End with one clear next step.`;

function clip(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function rowString(value: unknown, max: number): string {
  return typeof value === "string" ? clip(value, max) : "";
}

/**
 * Validate an incoming request body into a bounded `AuditSummaryInput`.
 * Returns null when the shape is unusable, so the route can 400 instead of
 * feeding the model something arbitrary.
 */
export function normaliseAuditSummaryRequest(body: unknown): AuditSummaryInput | null {
  const obj = asRecord(body);
  if (!obj) return null;

  const documentsRaw = Array.isArray(obj.documents) ? obj.documents : null;
  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : null;
  if (!documentsRaw && !fieldsRaw) return null;

  const documents: AuditSummaryDocument[] = [];
  for (const entry of (documentsRaw ?? []).slice(0, MAX_ROWS)) {
    const row = asRecord(entry);
    if (!row) continue;
    const name = rowString(row.name, MAX_NAME_CHARS);
    const status = rowString(row.status, 24);
    if (name && status) documents.push({ name, status });
  }

  const fields: AuditSummaryField[] = [];
  for (const entry of (fieldsRaw ?? []).slice(0, MAX_ROWS)) {
    const row = asRecord(entry);
    if (!row) continue;
    const label = rowString(row.label, MAX_LABEL_CHARS);
    const status = rowString(row.status, 24);
    if (!label || !status) continue;
    const reason = rowString(row.reason, MAX_REASON_CHARS);
    fields.push(reason ? { label, status, reason } : { label, status });
  }

  if (documents.length === 0 && fields.length === 0) return null;

  return {
    schemeName: rowString(obj.schemeName, MAX_NAME_CHARS) || "your scheme",
    language: typeof obj.lang === "string" ? clip(obj.lang, 8) : null,
    documents,
    fields,
    failedCount: Number.isFinite(Number(obj.failedCount)) ? Math.max(0, Number(obj.failedCount)) : 0,
    missingForm: obj.missingForm === true,
    counterLocation: rowString(obj.counterLocation, MAX_NAME_CHARS)
  };
}

/** The model prompt. Note there is no field VALUE anywhere in here. */
export function buildAuditSummaryPrompt(input: AuditSummaryInput): LlmMessage[] {
  const needsWork = input.documents.filter((row) => row.status !== "UPLOADED").length;
  const problemFields = input.fields.filter((row) => row.status !== "MATCH").length;

  const docLines = input.documents.map(
    (row) => `- ${row.name}: ${STATUS_WORD[row.status] ?? row.status}`
  );
  const fieldLines = input.fields.map(
    (row) =>
      `- ${row.label}: ${STATUS_WORD[row.status] ?? row.status}${row.reason ? ` (${row.reason})` : ""}`
  );

  const user = [
    `Scheme: ${input.schemeName}`,
    `Citizen language: ${input.language ?? "en"}`,
    "",
    `DOCUMENTS (${input.documents.length} checked, ${needsWork} need attention):`,
    docLines.length > 0 ? docLines.join("\n") : "- (none)",
    "",
    `FORM FIELDS vs DOCUMENTS (${input.fields.length} checked, ${problemFields} need attention):`,
    input.missingForm
      ? "- No application form was uploaded, so no fields could be compared."
      : fieldLines.length > 0
        ? fieldLines.join("\n")
        : "- (none)",
    input.failedCount > 0 ? `\n${input.failedCount} file(s) could not be read at all.` : "",
    input.counterLocation ? `\nSubmission counter: ${input.counterLocation}` : "",
    "",
    "Write the citizen's summary now."
  ]
    .filter((line) => line !== "")
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user }
  ];
}

/** Trim a model reply into a chat-safe summary, or null when there is nothing usable. */
export function normaliseAuditSummaryText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const unfenced = raw.replace(/```[a-z]*\n?/gi, "").trim();
  if (!unfenced) return null;

  const collapsed = unfenced
    .split("\n")
    .map((line) => line.replace(/^[-•]\s*/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (collapsed.length < 20) return null;
  return collapsed.length <= MAX_AUDIT_SUMMARY_CHARS
    ? collapsed
    : `${collapsed.slice(0, MAX_AUDIT_SUMMARY_CHARS - 1).trimEnd()}…`;
}

/**
 * Ask the model for the summary. Returns null when no provider is configured or the
 * call/parse fails, so the caller falls back to its deterministic report.
 */
export async function writeAuditSummary(
  input: AuditSummaryInput,
  options: AuditSummaryOptions = {}
): Promise<string | null> {
  const completer: TextCompleter | null =
    options.complete ??
    (isLlmConfigured() ? (messages) => llmComplete(messages, { temperature: 0 }) : null);

  if (!completer) return null;

  try {
    return normaliseAuditSummaryText(await completer(buildAuditSummaryPrompt(input)));
  } catch {
    return null;
  }
}
