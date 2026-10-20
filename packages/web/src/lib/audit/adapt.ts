// Adapter: the audit service's `AuditResponse` -> this app's `AuditDocument`.
//
// Two facts about the real `/extract` contract (packages/audit/src) shape this file:
//
// 1. `AuditField` carries NO numeric confidence. It carries `grounding`
//    ("text" | "ocr" | "vision") and `handwritten`. The service's own R9 table
//    says a value seen only by the model, or marked handwritten, forces review.
//    We mirror that by deriving the confidence gate from grounding, so a value
//    that the service itself would not stand behind becomes MANUAL_CHECK here.
//
// 2. `value` and `normalized` leave the service ALREADY MASKED — masking runs
//    last and is proven by `findUnmaskedPii`. Aadhaar and long account numbers
//    therefore arrive as `XXXX-XXXX-1234` (at most 4 trailing digits survive).
//    Comparing those values still works as an agreement check on the trailing
//    digits — which is what a human verifies anyway — but two different numbers
//    sharing the same last four digits would compare equal. That is a deliberate,
//    documented v0 limitation; the fix is a salted comparison key from the
//    service, never raw values in the browser.

import { DOCUMENT_TYPES } from "./rules.ts";
import type { AuditDocument, DocumentRole, ExtractedField } from "./types.ts";

/** The slice of `AuditResponse` this app consumes (structurally compatible). */
export interface ExtractField {
  key: string;
  label: string;
  value: string;
  normalized: string;
  type: string;
  page: number;
  handwritten: boolean;
  grounding: "text" | "ocr" | "vision" | string;
}

export interface ExtractResponse {
  document_type_guess: string;
  language: string;
  issuer: string;
  has_signature: boolean | null;
  has_seal: boolean | null;
  pages_read: number;
  pages_total: number;
  needs_review: boolean;
  model: string;
  fields: ExtractField[];
  flags: Array<{ kind: string; detail: string; field_key?: string }>;
  notices: string[];
}

/**
 * Grounding -> confidence. `text` (read from the PDF text layer) clears the 0.9
 * gate; `ocr` just clears it; `vision` (the model's word alone) does not, so it
 * lands on MANUAL_CHECK — matching the service's own review rule.
 */
export const GROUNDING_CONFIDENCE: Record<string, number> = {
  text: 0.97,
  ocr: 0.9,
  vision: 0.6
};

/** A hand-written value is never trusted for an automatic verdict. */
export const HANDWRITTEN_CONFIDENCE = 0.5;

const KNOWN_TYPES = new Set<string>(DOCUMENT_TYPES);

/** Synonyms the model realistically emits -> this app's document vocabulary. */
const TYPE_SYNONYMS: Array<{ match: RegExp; type: string }> = [
  { match: /aadhaar|aadhar|uidai/, type: "AADHAAR" },
  { match: /pan\b|permanent account/, type: "PAN" },
  { match: /income/, type: "INCOME_CERTIFICATE" },
  { match: /passbook|bank|account|cheque/, type: "BANK_PROOF" },
  { match: /marksheet|mark sheet|marks memo|ssc|class\s*(10|x)\b/, type: "MARKSHEET" },
  { match: /fee receipt|receipt|bonafide/, type: "FEE_RECEIPT" },
  { match: /domicile|residence/, type: "DOMICILE_PROOF" },
  { match: /declaration|undertaking|affidavit/, type: "DECLARATION" },
  { match: /vending|vendor/, type: "VENDING_CERTIFICATE" },
  { match: /recommendation|\blor\b/, type: "RECOMMENDATION_LETTER" },
  { match: /\bcov\b|certificate of vending/, type: "COV" },
  { match: /application form|application\b/, type: "APPLICATION_FORM" }
];

/**
 * Map the service's free-text `document_type_guess` onto our vocabulary.
 * Unknown guesses become `UNKNOWN`, which the verifier treats as NEEDS_REVIEW
 * rather than silently satisfying a requirement.
 */
export function guessDocumentType(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "UNKNOWN";

  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (KNOWN_TYPES.has(normalized)) return normalized;

  const collapsed = normalized.replace(/ /g, "");
  for (const type of DOCUMENT_TYPES) {
    if (collapsed === type) return type;
  }

  for (const synonym of TYPE_SYNONYMS) {
    if (synonym.match.test(value.toLowerCase())) return synonym.type;
  }

  return "UNKNOWN";
}

function toExtractedField(field: ExtractField): ExtractedField {
  const base = GROUNDING_CONFIDENCE[field.grounding] ?? 0.6;
  const confidence = field.handwritten ? Math.min(base, HANDWRITTEN_CONFIDENCE) : base;

  return {
    key: field.key,
    label: field.label,
    // Prefer the service's comparison-normalised value when it has one.
    value: field.normalized?.trim() ? field.normalized : field.value,
    normalized: field.normalized,
    confidence,
    page: field.page
  };
}

/** Build one `AuditDocument` from one `/extract` response. */
export function toAuditDocument(input: {
  id: string;
  role: DocumentRole;
  response: ExtractResponse;
  fileName?: string;
  documentType?: string;
}): AuditDocument {
  const { id, role, response, fileName, documentType } = input;

  return {
    id,
    role,
    documentType: documentType ?? guessDocumentType(response.document_type_guess),
    ...(fileName ? { fileName } : {}),
    fields: (response.fields ?? []).map(toExtractedField)
  };
}

/**
 * Operator-readable reasons why a document should be looked at, from the
 * service's own flags and review verdict. Shown alongside the checklist so a
 * `needs_review` document is never silently trusted.
 */
export function documentWarnings(response: ExtractResponse): string[] {
  const warnings = (response.flags ?? []).map((flag) => flag.detail).filter(Boolean);
  if (response.needs_review) {
    warnings.unshift("The extraction service flagged this document for manual review.");
  }
  if (response.has_signature === false) warnings.push("No signature was visible on this document.");
  if (response.has_seal === false) warnings.push("No seal or stamp was visible on this document.");
  return warnings;
}
