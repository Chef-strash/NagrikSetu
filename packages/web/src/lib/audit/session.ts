// Bridges the audit engine's output back onto the app's existing session model.
//
// The audit page already renders `SessionDocument` (masked Aadhaar, account,
// IFSC, name match). Rather than redesign that UI, this module maps the REAL
// extraction + verification results onto exactly those fields, so the existing
// checklist lights up with real data and nothing downstream has to change.

import type { ExtractResponse } from "./adapt.ts";
import { guessDocumentType } from "./adapt.ts";
import { auditConfigFor } from "./rules.ts";
import type { AuditDocument, AuditResult, ExtractedField, FieldRule, RequiredDocumentSpec } from "./types.ts";

/**
 * Build the required-document checklist from the session's own document rows,
 * so the checklist always matches what the citizen sees on screen.
 *
 * Accepted types come from the authored scheme config when the requirement name
 * matches; otherwise they are inferred from the requirement's own wording
 * (e.g. "Vendor Identification Card (Vending Certificate…)" -> VENDING_CERTIFICATE).
 * An un-inferrable requirement gets no accepted types, which surfaces as MISSING
 * rather than silently passing.
 */
export function specsFromSession(
  documents: ReadonlyArray<{ name: string }>,
  schemeId: string | undefined
): RequiredDocumentSpec[] {
  const config = schemeId ? auditConfigFor(schemeId) : null;

  return documents.map((doc) => {
    const configured = config?.requiredDocuments.find((req) => req.name === doc.name);
    if (configured) return configured;

    const guessed = guessDocumentType(doc.name);
    return { name: doc.name, acceptedDocTypes: guessed === "UNKNOWN" ? [] : [guessed] };
  });
}

/** The comparison rules for a scheme, or none when the scheme is not authored yet. */
export function rulesForScheme(schemeId: string | undefined): FieldRule[] {
  return (schemeId ? auditConfigFor(schemeId)?.rules : undefined) ?? [];
}

const FAILED_LOOKUP = /father|mother|spouse|guardian|husband|wife|nominee/;

function pickField(fields: ExtractedField[], pattern: RegExp, exclude?: RegExp): ExtractedField | undefined {
  return fields.find((field) => {
    // Underscores become spaces so key-style names ("holder_name") match the same
    // word-boundary patterns as label-style names ("Name of Applicant"). Without
    // this, `\bname\b` can never match "holder_name": `_` is a word character, so
    // there is no boundary before "name".
    const haystack = `${field.key} ${field.label ?? ""}`.toLowerCase().replace(/_+/g, " ");
    if (exclude && exclude.test(haystack)) return false;
    return pattern.test(haystack);
  });
}

/** The masked/valuable fields the existing document checklist knows how to show. */
export interface DocumentDisplayFields {
  aadhaarMasked?: string;
  accountNumber?: string;
  ifscCode?: string;
  nameOnDocument?: string;
}

/**
 * Pull the display values out of a document's extracted fields.
 * Values are whatever the service returned — already masked, so an Aadhaar
 * arrives as `XXXX-XXXX-1234` and is stored exactly as received.
 */
export function displayFieldsFor(fields: ExtractedField[]): DocumentDisplayFields {
  const result: DocumentDisplayFields = {};

  const aadhaar = pickField(fields, /aadhaar|aadhar|uidai|\buid\b/);
  if (aadhaar?.value) result.aadhaarMasked = aadhaar.value;

  const ifsc = pickField(fields, /ifsc/);
  if (ifsc?.value) result.ifscCode = ifsc.value;

  const account = pickField(fields, /account|passbook|\ba\/c\b/);
  if (account?.value) result.accountNumber = account.value;

  const name = pickField(fields, /\bname\b/, FAILED_LOOKUP);
  if (name?.value) result.nameOnDocument = name.value;

  return result;
}

/** A document the service singled out as a merged/converted bank branch. */
export function mergedBankNote(response: ExtractResponse): string | undefined {
  const flag = response.flags?.find((candidate) => candidate.kind === "ifsc_merged_bank");
  return flag?.detail;
}

/** One document's display patch, derived only from real service output. */
export interface DocumentAuditPatch {
  documentId: string;
  isVerified: boolean;
  needsReview: boolean;
  warnings: string[];
  fields: DocumentDisplayFields;
  ifscNote?: string;
}

/**
 * Turn a finished audit into per-document patches.
 *
 * `isVerified` is deliberately strict: a document only counts as checked when it
 * satisfied a requirement AND the service did not flag it for review. An absence
 * of evidence is never a pass.
 */
export function toDocumentPatches(input: {
  documents: AuditDocument[];
  extracts: Map<string, ExtractResponse>;
  result: AuditResult;
}): DocumentAuditPatch[] {
  const { documents, extracts, result } = input;

  return documents
    .filter((doc) => doc.role === "SUPPORTING")
    .map((doc) => {
      const response = extracts.get(doc.id);
      const reqRow = result.requiredDocuments.find((row) => row.matchedDocumentId === doc.id);
      const satisfied = reqRow?.status === "UPLOADED";
      const needsReview = response?.needs_review ?? true;
      const warnings = response ? collectWarnings(response) : ["No extraction result was available."];

      const patch: DocumentAuditPatch = {
        documentId: doc.id,
        isVerified: satisfied && !needsReview,
        needsReview,
        warnings,
        fields: displayFieldsFor(doc.fields)
      };

      const note = response ? mergedBankNote(response) : undefined;
      if (note) patch.ifscNote = note;

      return patch;
    });
}

function collectWarnings(response: ExtractResponse): string[] {
  const warnings = (response.flags ?? []).map((flag) => flag.detail).filter(Boolean);
  if (response.needs_review && warnings.length === 0) {
    warnings.push("The extraction service flagged this document for manual review.");
  }
  return warnings;
}
