// Shared types for the application-form audit (see my_plans/audit_system.md).

/** What a file IS in the audit. */
export type DocumentRole = "APPLICATION_FORM" | "SUPPORTING";

/** How two values may be compared. Deliberately closed — no ad-hoc logic. */
export type ComparisonRule = "EXACT" | "NORMALIZED_TEXT" | "DATE" | "IDENTIFIER";

/** Status of one field on the application form. One of these ALWAYS applies. */
export type FieldCheckStatus = "MATCH" | "MISMATCH" | "MANUAL_CHECK";

/** Status of one required supporting document. */
export type DocCheckStatus = "MISSING" | "UPLOADED" | "NEEDS_REVIEW";

/** One value read out of one document by the extraction service. */
export interface ExtractedField {
  /** Key as returned by the extractor (agent-invented — there is no fixed schema). */
  key: string;
  label?: string;
  value: string;
  normalized?: string;
  confidence?: number;
  page?: number;
}

export interface AuditDocument {
  id: string;
  role: DocumentRole;
  /** e.g. AADHAAR | PAN | INCOME_CERTIFICATE | BANK_PROOF | APPLICATION_FORM | UNKNOWN */
  documentType: string;
  fileName?: string;
  fields: ExtractedField[];
}

/** Per-scheme rule: which form field to check, against which documents, how. */
export interface FieldRule {
  /** Stable key used in results, e.g. "applicant_name". */
  fieldKey: string;
  /** Label as printed on the form, e.g. "Name of Applicant". */
  formLabel: string;
  /** Document types allowed as evidence. Never a single universal source. */
  acceptedDocTypes: string[];
  comparisonRule: ComparisonRule;
  /** Minimum extraction confidence; below this → MANUAL_CHECK. Default 0.9. */
  minConfidence?: number;
  /** Optional wording shown when a manual check is needed. */
  instructions?: string;
}

export interface RequiredDocumentSpec {
  name: string;
  /** Document types that satisfy this requirement. */
  acceptedDocTypes: string[];
}

export interface RequiredDocumentResult {
  name: string;
  status: DocCheckStatus;
  /** Which uploaded document satisfied it, when one did. */
  matchedDocumentId?: string;
  reason: string;
}

export interface FieldCheckResult {
  fieldKey: string;
  formLabel: string;
  status: FieldCheckStatus;
  /** Value as it appeared on the form (already masked by the caller when needed). */
  formValue: string | null;
  /** Where the evidence came from. */
  evidence?: {
    documentId: string;
    documentType: string;
    value: string;
    page?: number;
  };
  /** Plain-language reason, safe to display. */
  reason: string;
}

export interface AuditResult {
  requiredDocuments: RequiredDocumentResult[];
  fieldChecks: FieldCheckResult[];
  summary: {
    matches: number;
    mismatches: number;
    manualChecks: number;
    uploaded: number;
    missing: number;
    needsReview: number;
  };
}
