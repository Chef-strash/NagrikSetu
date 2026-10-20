// Pure document-audit logic behind the single "Audit" action.
//
// Zero-PII note: the file itself is never read, uploaded or persisted — only the
// RESULT of the check lands on the session (masked Aadhaar, resolved IFSC code,
// name match). This mirrors the Layer-2 pre-audit pipeline so the UI can be tested
// without a backend.

export interface AuditableDocument {
  id: string;
  name: string;
  fileName?: string;
  isUploaded: boolean;
  isVerified: boolean;
  accountNumber?: string;
  ifscCode?: string;
  originalIfsc?: string;
  ifscNote?: string;
  aadhaarMasked?: string;
  nameOnDocument?: string;
}

/** Fields an audit writes back onto a session document. */
export interface DocumentAuditPatch {
  isVerified: boolean;
  nameOnDocument: string;
  accountNumber?: string;
  ifscCode?: string;
  originalIfsc?: string;
  ifscNote?: string;
  aadhaarMasked?: string;
}

export interface AuditFinding {
  docId: string;
  patch: DocumentAuditPatch;
  /** Plain-language line included in the summary the assistant posts. */
  note: string;
}

export interface DocumentAuditResult {
  findings: AuditFinding[];
  /** Documents verified by this run. */
  audited: number;
  /** Documents still not verified once the run finished. */
  pending: number;
  /** Of `pending`, how many were never uploaded at all. */
  notUploaded: number;
  /** Summary posted to the assistant thread. */
  summary: string;
}

const BENEFICIARY_NAME_FALLBACK = "the applicant";

/**
 * Audit a single document. Deterministic stand-in for the pre-audit pipeline:
 * bank documents get the merged-IFSC resolution, identity documents come back
 * masked, everything else is marked clear.
 */
export function auditDocument(doc: AuditableDocument, beneficiaryName: string): AuditFinding {
  const holder = beneficiaryName || BENEFICIARY_NAME_FALLBACK;
  const name = doc.name.toLowerCase();
  const patch: DocumentAuditPatch = { isVerified: true, nameOnDocument: holder };

  if (name.includes("passbook") || name.includes("bank")) {
    patch.accountNumber = "*******4912";
    patch.ifscCode = "CNRB0005012";
    patch.originalIfsc = "SYNB0005012";
    patch.ifscNote = "Old Syndicate Bank code updated to active Canara Bank code (CNRB0005012)";
    return {
      docId: doc.id,
      patch,
      note:
        "Bank passbook: account ending 4912 verified. Old Syndicate IFSC SYNB0005012 was auto-updated to the active Canara Bank code CNRB0005012, so the treasury transfer will not bounce."
    };
  }

  if (name.includes("aadhaar") || name.includes("identity")) {
    patch.aadhaarMasked = "XXXX-XXXX-4912";
    return {
      docId: doc.id,
      patch,
      note:
        "Aadhaar: identity matches the applicant. The number is stored masked as XXXX-XXXX-4912 — the first 8 digits are never kept."
    };
  }

  return { docId: doc.id, patch, note: `${doc.name}: clear and verified for ${holder}.` };
}

/**
 * Verify EVERY uploaded document in one pass.
 *
 * Already-verified documents are left untouched, and documents that were never
 * uploaded are reported as pending rather than silently skipped — so a citizen
 * never believes a missing paper was checked.
 */
export function auditUploadedDocuments(
  documents: AuditableDocument[],
  options: { beneficiaryName: string; counterLocation: string }
): DocumentAuditResult {
  const findings: AuditFinding[] = [];

  // The local check invents IFSC/account results. It is reachable only in demo mode.
  if (process.env.NEXT_PUBLIC_DEMO_AUDIT !== "true") {
    const notUploaded = documents.filter((d) => !d.isUploaded).length;
    return {
      findings: [],
      audited: 0,
      pending: documents.filter((d) => !d.isVerified).length,
      notUploaded,
      summary: "Document audit service is offline - nothing was verified."
    };
  }

  for (const doc of documents) {
    if (!doc.isUploaded || doc.isVerified) continue;
    findings.push(auditDocument(doc, options.beneficiaryName));
  }

  const audited = findings.length;
  const newlyVerified = new Set(findings.map((finding) => finding.docId));
  const pending = documents.filter((doc) => !doc.isVerified && !newlyVerified.has(doc.id)).length;
  const notUploaded = documents.filter((doc) => !doc.isUploaded).length;
  const alreadyChecked = documents.filter((doc) => doc.isVerified).length;

  const summary =
    audited === 0
      ? notUploaded === 0
        ? "Every uploaded document has already been checked."
        : alreadyChecked > 0
          ? `All ${alreadyChecked} uploaded document${alreadyChecked === 1 ? " is" : "s are"} already checked. ${notUploaded} document${notUploaded === 1 ? "" : "s"} still not uploaded.`
          : `Nothing to audit yet — upload your documents (${notUploaded} pending) and press Audit again.`
      : [
          `Audit complete: checked ${audited} document${audited === 1 ? "" : "s"}.`,
          ...findings.map((finding) => `- ${finding.note}`),
          pending > 0
            ? `${pending} still pending${notUploaded > 0 ? ` (${notUploaded} not uploaded yet)` : ""}.`
            : `All required documents are checked. Download the official form and take your papers to ${options.counterLocation}.`
        ].join("\n");

  return { findings, audited, pending, notUploaded, summary };
}