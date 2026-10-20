// Per-scheme audit configuration: which documents the scheme requires, and how
// each application-form field is checked against them.
//
// The plan is explicit that these are NOT global rules — "Avoid hard-coding
// 'name always comes from Aadhaar' across all schemes." Each scheme names its own
// accepted evidence. Kept as configuration (not DB rows) for v0; the plan's
// `scheme_audit_field_rules` table is the eventual home.

import type { FieldRule, RequiredDocumentSpec } from "./types";

/** Document types the audit understands. Anything else → UNKNOWN → NEEDS_REVIEW. */
export const DOCUMENT_TYPES = [
  "APPLICATION_FORM",
  "AADHAAR",
  "PAN",
  "MARKSHEET",
  "INCOME_CERTIFICATE",
  "BANK_PROOF",
  "FEE_RECEIPT",
  "DOMICILE_PROOF",
  "DECLARATION",
  "VENDING_CERTIFICATE",
  "RECOMMENDATION_LETTER",
  "COV",
  "LOR",
  "UNKNOWN"
] as const;

export interface SchemeAuditConfig {
  /** Mirrors the scheme's own required-documents list (order preserved). */
  requiredDocuments: RequiredDocumentSpec[];
  rules: FieldRule[];
}

export const SCHEME_AUDIT_CONFIG: Record<string, SchemeAuditConfig> = {
  // PMC Maulana Azad — Class 10 (SSC) educational grant.
  // Requirement names are copied verbatim from packages/web/src/lib/data/schemes.ts.
  "pmc-azad-class10": {
    requiredDocuments: [
      { name: "Attested copy of Class 10 (SSC) Marksheet", acceptedDocTypes: ["MARKSHEET"] },
      { name: "Tahsildar Family Income Certificate (Financial Year 2025-26)", acceptedDocTypes: ["INCOME_CERTIFICATE"] },
      { name: "Student Bank Passbook Copy (with active IFSC)", acceptedDocTypes: ["BANK_PROOF"] },
      { name: "Student Aadhaar Card", acceptedDocTypes: ["AADHAAR"] },
      { name: "Current Year Junior College / Diploma Fee Receipt or Bonafide", acceptedDocTypes: ["FEE_RECEIPT"] },
      { name: "Proof of 3-Year Continuous Residence in Pune Municipal Limits", acceptedDocTypes: ["DOMICILE_PROOF"] },
      { name: "Small Family Undertaking Declaration Form", acceptedDocTypes: ["DECLARATION"] }
    ],
    rules: [
      {
        fieldKey: "applicant_name",
        formLabel: "Name of Applicant",
        acceptedDocTypes: ["AADHAAR", "MARKSHEET"],
        comparisonRule: "NORMALIZED_TEXT",
        instructions: "Check that the spelling matches your Aadhaar exactly."
      },
      {
        fieldKey: "date_of_birth",
        formLabel: "Date of Birth",
        acceptedDocTypes: ["AADHAAR", "MARKSHEET"],
        comparisonRule: "DATE"
      },
      {
        fieldKey: "aadhaar_number",
        formLabel: "Aadhaar Number",
        acceptedDocTypes: ["AADHAAR"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "bank_account_number",
        formLabel: "Student Bank Account Number",
        acceptedDocTypes: ["BANK_PROOF"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "ifsc_code",
        formLabel: "Bank IFSC Code",
        acceptedDocTypes: ["BANK_PROOF"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "annual_income",
        formLabel: "Family Annual Income",
        acceptedDocTypes: ["INCOME_CERTIFICATE"],
        comparisonRule: "IDENTIFIER"
      }
    ]
  },

  // PM SVANidhi — street vendor working-capital loan (the scheme in the screenshot).
  "pmc-svanidhi-hawker": {
    requiredDocuments: [
      { name: "Vendor Identification Card (Vending Certificate or Ward Survey Slip)", acceptedDocTypes: ["VENDING_CERTIFICATE", "COV"] },
      { name: "Bank Passbook Copy with active UPI QR linkage", acceptedDocTypes: ["BANK_PROOF"] },
      { name: "Aadhaar Card Copy", acceptedDocTypes: ["AADHAAR"] },
      { name: "Recommendation Letter from Local Ward Hawkers Committee or Market Supervisor", acceptedDocTypes: ["RECOMMENDATION_LETTER", "LOR"] }
    ],
    rules: [
      {
        fieldKey: "applicant_name",
        formLabel: "Name of Applicant",
        acceptedDocTypes: ["AADHAAR", "VENDING_CERTIFICATE", "COV"],
        comparisonRule: "NORMALIZED_TEXT",
        instructions: "Check that the spelling matches your Aadhaar exactly."
      },
      {
        fieldKey: "aadhaar_number",
        formLabel: "Aadhaar Number",
        acceptedDocTypes: ["AADHAAR"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "vendor_certificate_number",
        formLabel: "Vending Certificate / Vendor ID Number",
        acceptedDocTypes: ["VENDING_CERTIFICATE", "COV"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "bank_account_number",
        formLabel: "Bank Account Number",
        acceptedDocTypes: ["BANK_PROOF"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "ifsc_code",
        formLabel: "Bank IFSC Code",
        acceptedDocTypes: ["BANK_PROOF"],
        comparisonRule: "IDENTIFIER"
      },
      {
        fieldKey: "date_of_birth",
        formLabel: "Date of Birth",
        acceptedDocTypes: ["AADHAAR"],
        comparisonRule: "DATE"
      }
    ]
  }
};

/** Config for a scheme, or null when none is authored yet. */
export function auditConfigFor(schemeId: string): SchemeAuditConfig | null {
  return SCHEME_AUDIT_CONFIG[schemeId] ?? null;
}
