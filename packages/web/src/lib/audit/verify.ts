// The audit itself: compare an uploaded application form against the supporting
// documents, per scheme rules, and return the two checklists the plan asks for.
//
// Guarantees taken straight from the plan:
//  - every rule produces exactly one status; nothing is skipped
//  - "no evidence found" / unreadable / low confidence ALWAYS becomes MANUAL_CHECK
//  - MATCH/MISMATCH come only from `compareValues` (deterministic), never a model
//  - one uploaded file cannot satisfy two required documents unless allowed

import { compareValues, normalizeText } from "./compare.ts";
import type {
  AuditDocument,
  AuditResult,
  ExtractedField,
  FieldCheckResult,
  FieldRule,
  RequiredDocumentResult,
  RequiredDocumentSpec
} from "./types";

/** Minimum score for a document field to be considered the rule's field. */
const MIN_FIELD_MATCH = 50;
const DEFAULT_MIN_CONFIDENCE = 0.9;

/**
 * How well an extracted field corresponds to a configured rule.
 * Exact key → 100, exact label → 95, otherwise a share of the rule's tokens.
 */
export function fieldMatchScore(field: ExtractedField, rule: FieldRule): number {
  const key = normalizeText(field.key);
  const label = normalizeText(field.label ?? "");
  const ruleKey = normalizeText(rule.fieldKey);
  const ruleLabel = normalizeText(rule.formLabel);

  if (key && ruleKey && key === ruleKey) return 100;
  if (label && ruleLabel && label === ruleLabel) return 95;

  const ruleTokens = new Set(
    `${ruleKey} ${ruleLabel}`.split(" ").filter((token) => token.length > 2)
  );
  if (ruleTokens.size === 0) return 0;

  const fieldTokens = new Set(
    `${key} ${label}`.split(" ").filter((token) => token.length > 2)
  );
  if (fieldTokens.size === 0) return 0;

  let hits = 0;
  for (const token of ruleTokens) if (fieldTokens.has(token)) hits += 1;
  if (hits === 0) return 0;

  // Coverage of the SHORTER side, so a document field keyed simply "name" still
  // matches a rule for "applicant_name" (documents rarely use our exact keys).
  const coverage = hits / Math.min(ruleTokens.size, fieldTokens.size);
  return Math.round(coverage * 80);
}

/** The field on `doc` that best answers `rule`, or undefined when none is close enough. */
export function findField(doc: AuditDocument, rule: FieldRule): ExtractedField | undefined {
  let best: ExtractedField | undefined;
  let bestScore = 0;

  for (const field of doc.fields) {
    const score = fieldMatchScore(field, rule);
    if (score > bestScore) {
      bestScore = score;
      best = field;
    }
  }

  return bestScore >= MIN_FIELD_MATCH ? best : undefined;
}

function isLowConfidence(field: ExtractedField, threshold: number): boolean {
  return typeof field.confidence === "number" && field.confidence < threshold;
}

function manualCheck(rule: FieldRule, formValue: string | null, reason: string): FieldCheckResult {
  return {
    fieldKey: rule.fieldKey,
    formLabel: rule.formLabel,
    status: "MANUAL_CHECK",
    formValue,
    reason: rule.instructions ? `${reason} ${rule.instructions}` : reason
  };
}

function buildRequiredDocuments(
  specs: RequiredDocumentSpec[],
  supporting: AuditDocument[]
): RequiredDocumentResult[] {
  const consumed = new Set<string>();

  return specs.map((spec) => {
    const direct = supporting.find(
      (doc) => spec.acceptedDocTypes.includes(doc.documentType) && !consumed.has(doc.id)
    );

    if (direct) {
      consumed.add(direct.id);
      return {
        name: spec.name,
        status: "UPLOADED" as const,
        matchedDocumentId: direct.id,
        reason: `Matched by document type ${direct.documentType}.`
      };
    }

    const alreadyUsed = supporting.find((doc) => spec.acceptedDocTypes.includes(doc.documentType));
    if (alreadyUsed) {
      return {
        name: spec.name,
        status: "NEEDS_REVIEW" as const,
        reason: "A file of this type was uploaded, but it is already counted for another requirement."
      };
    }

    const unclassified = supporting.find((doc) => doc.documentType === "UNKNOWN");
    if (unclassified) {
      return {
        name: spec.name,
        status: "NEEDS_REVIEW" as const,
        reason: "An uploaded file could not be classified, so it may be this document."
      };
    }

    return {
      name: spec.name,
      status: "MISSING" as const,
      reason: `No uploaded document matched ${spec.acceptedDocTypes.join(" / ") || "this requirement"}.`
    };
  });
}

function checkOneField(
  rule: FieldRule,
  form: AuditDocument | undefined,
  supporting: AuditDocument[],
  defaultMinConfidence: number
): FieldCheckResult {
  const threshold = rule.minConfidence ?? defaultMinConfidence;

  if (!form) {
    return manualCheck(rule, null, "No application form was uploaded, so this field cannot be checked.");
  }

  const formField = findField(form, rule);
  if (!formField) {
    return manualCheck(rule, null, "This field was not found on the uploaded application form.");
  }
  if (isLowConfidence(formField, threshold)) {
    return manualCheck(rule, formField.value, "The value on the form was read with low confidence.");
  }

  const formValue = (formField.value ?? "").trim();
  if (!formValue) {
    return manualCheck(rule, null, "The field is present on the form but appears to be blank.");
  }

  const candidates = supporting.filter((doc) => rule.acceptedDocTypes.includes(doc.documentType));
  if (candidates.length === 0) {
    return manualCheck(
      rule,
      formValue,
      `No supporting document of type ${rule.acceptedDocTypes.join(" / ") || "(none configured)"} was uploaded to compare against.`
    );
  }

  let firstMismatch:
    | { outcome: ReturnType<typeof compareValues>; doc: AuditDocument; field: ExtractedField }
    | null = null;

  for (const doc of candidates) {
    const evidenceField = findField(doc, rule);
    if (!evidenceField || isLowConfidence(evidenceField, threshold)) continue;

    const outcome = compareValues(rule.comparisonRule, formValue, evidenceField.value);
    if (outcome.equal === null) continue;

    if (outcome.equal) {
      return {
        fieldKey: rule.fieldKey,
        formLabel: rule.formLabel,
        status: "MATCH",
        formValue,
        evidence: {
          documentId: doc.id,
          documentType: doc.documentType,
          value: evidenceField.value,
          page: evidenceField.page
        },
        reason: outcome.detail
      };
    }

    if (!firstMismatch) firstMismatch = { outcome, doc, field: evidenceField };
  }

  if (firstMismatch) {
    return {
      fieldKey: rule.fieldKey,
      formLabel: rule.formLabel,
      status: "MISMATCH",
      formValue,
      evidence: {
        documentId: firstMismatch.doc.id,
        documentType: firstMismatch.doc.documentType,
        value: firstMismatch.field.value,
        page: firstMismatch.field.page
      },
      reason: firstMismatch.outcome.detail
    };
  }

  return manualCheck(
    rule,
    formValue,
    `A ${candidates.map((doc) => doc.documentType).join(" / ")} document was uploaded, but this value could not be read from it reliably.`
  );
}

/** Run the whole audit: supporting-document checklist + per-field checks. */
export function verifyApplication(input: {
  documents: AuditDocument[];
  requiredDocuments: RequiredDocumentSpec[];
  rules: FieldRule[];
  minConfidence?: number;
}): AuditResult {
  const { documents, requiredDocuments, rules, minConfidence = DEFAULT_MIN_CONFIDENCE } = input;

  const form = documents.find((doc) => doc.role === "APPLICATION_FORM");
  const supporting = documents.filter((doc) => doc.role === "SUPPORTING");

  const requiredResults = buildRequiredDocuments(requiredDocuments, supporting);

  // Which form field each rule consumed, so extra form fields can be reported.
  const claimedFieldKeys = new Set<string>();
  const ruledChecks = rules.map((rule) => {
    const check = checkOneField(rule, form, supporting, minConfidence);
    if (form) {
      const claimed = findField(form, rule);
      if (claimed) claimedFieldKeys.add(claimed.key);
    }
    return check;
  });

  // Plan: "Create one checklist result for every detected form field, including
  // fields without a configured comparison rule." No form field is omitted — an
  // unruled field is a MANUAL_CHECK, never dropped.
  const unruledChecks: FieldCheckResult[] = form
    ? form.fields
        .filter((field) => !claimedFieldKeys.has(field.key))
        .map((field) => ({
          fieldKey: field.key,
          formLabel: field.label ?? field.key,
          status: "MANUAL_CHECK" as const,
          formValue: field.value || null,
          reason: "No comparison rule is configured for this field yet, so please check it manually."
        }))
    : [];

  const fieldChecks = [...ruledChecks, ...unruledChecks];

  return {
    requiredDocuments: requiredResults,
    fieldChecks,
    summary: {
      matches: fieldChecks.filter((check) => check.status === "MATCH").length,
      mismatches: fieldChecks.filter((check) => check.status === "MISMATCH").length,
      manualChecks: fieldChecks.filter((check) => check.status === "MANUAL_CHECK").length,
      uploaded: requiredResults.filter((doc) => doc.status === "UPLOADED").length,
      missing: requiredResults.filter((doc) => doc.status === "MISSING").length,
      needsReview: requiredResults.filter((doc) => doc.status === "NEEDS_REVIEW").length
    }
  };
}
