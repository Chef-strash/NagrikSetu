import test from "node:test";
import assert from "node:assert/strict";
import { runWebAudit, summarizeWebAudit, type AuditCandidate, type WebAuditResult } from "./run.ts";
import { displayFieldsFor, specsFromSession } from "./session.ts";
import { toAuditDocument, type ExtractField, type ExtractResponse } from "./adapt.ts";
import type { ExtractOutcome } from "./service-client.ts";

const PDF = { bytes: new Uint8Array([1, 2, 3]), fileName: "scan.pdf", mimeType: "application/pdf" };

function field(partial: Partial<ExtractField> & { key: string; value: string }): ExtractField {
  return {
    label: partial.key,
    normalized: "",
    type: "text",
    page: 1,
    handwritten: false,
    grounding: "text",
    ...partial
  };
}

function response(partial: Partial<ExtractResponse> = {}): ExtractResponse {
  return {
    document_type_guess: "Aadhaar Card",
    language: "en",
    issuer: "",
    has_signature: null,
    has_seal: null,
    pages_read: 1,
    pages_total: 1,
    needs_review: false,
    model: "test",
    fields: [],
    flags: [],
    notices: [],
    ...partial
  };
}

const ok = (r: ExtractResponse): ExtractOutcome => ({ available: true, ok: true, response: r });
const offline: ExtractOutcome = { available: false, reason: "unreachable", detail: "ECONNREFUSED" };

test("an unreachable service stops the run so the caller can fall back", async () => {
  const candidates: AuditCandidate[] = [
    { id: "aad", name: "Student Aadhaar Card", role: "SUPPORTING", file: PDF }
  ];

  const result = await runWebAudit(
    { sessionId: "s1", schemeId: "pmc-azad-class10", candidates },
    { extract: async () => offline }
  );

  assert.equal(result.serviceUnavailable, true);
  assert.equal(result.patches.length, 0);
  assert.equal(result.audit.fieldChecks.length, 0);
  assert.match(summarizeWebAudit(result, "Ward 14"), /offline/);
});

test("a full run extracts, verifies, and patches the documents", async () => {
  const candidates: AuditCandidate[] = [
    { id: "form", name: "Application Form", role: "APPLICATION_FORM", file: PDF },
    { id: "aad", name: "Student Aadhaar Card", role: "SUPPORTING", file: PDF }
  ];

  const responses: Record<string, ExtractResponse> = {
    form: response({
      document_type_guess: "Application Form",
      fields: [field({ key: "applicant_name", label: "Name of Applicant", value: "Ramesh Dnyaneshwar Patil" })]
    }),
    aad: response({
      document_type_guess: "Aadhaar Card",
      fields: [
        field({ key: "name", label: "Name", value: "Patil Ramesh Dnyaneshwar" }),
        field({ key: "aadhaar_number", value: "XXXX-XXXX-9012" })
      ]
    })
  };

  const result = await runWebAudit(
    { sessionId: "s1", schemeId: "pmc-azad-class10", candidates },
    { extract: async ({ documentId }) => ok(responses[documentId]) }
  );

  assert.equal(result.serviceUnavailable, false);

  const nameCheck = result.audit.fieldChecks.find((check) => check.fieldKey === "applicant_name");
  assert.equal(nameCheck?.status, "MATCH");
  assert.equal(result.audit.requiredDocuments[0].status, "UPLOADED");

  const patch = result.patches.find((entry) => entry.documentId === "aad");
  assert.equal(patch?.isVerified, true);
  assert.equal(patch?.fields.aadhaarMasked, "XXXX-XXXX-9012");
});

test("a document the service flags for review is never marked verified", async () => {
  const candidates: AuditCandidate[] = [
    { id: "aad", name: "Student Aadhaar Card", role: "SUPPORTING", file: PDF }
  ];

  const result = await runWebAudit(
    { sessionId: "s1", schemeId: "pmc-azad-class10", candidates },
    {
      extract: async () =>
        ok(response({ needs_review: true, fields: [field({ key: "name", value: "Someone", grounding: "vision" })] }))
    }
  );

  const patch = result.patches[0];
  assert.equal(patch.isVerified, false);
  assert.equal(patch.needsReview, true);
  assert.ok(patch.warnings.length > 0);
});

test("a refused file is reported as failed and does not stop the others", async () => {
  const candidates: AuditCandidate[] = [
    { id: "bad", name: "Student Aadhaar Card", role: "SUPPORTING", file: PDF },
    { id: "good", name: "Student Bank Passbook Copy (with active IFSC)", role: "SUPPORTING", file: PDF }
  ];

  const result = await runWebAudit(
    { sessionId: "s1", schemeId: "pmc-azad-class10", candidates },
    {
      extract: async ({ documentId }) =>
        documentId === "bad"
          ? { available: true, ok: false, status: 415, error: "unsupported_media_type" }
          : ok(
              response({
                document_type_guess: "Bank Passbook",
                fields: [field({ key: "ifsc", value: "CNRB0005012" })]
              })
            )
    }
  );

  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].documentId, "bad");
  assert.equal(result.patches.length, 1, "the readable document is still audited");
});

test("a row whose bytes are gone is reported, never treated as checked", async () => {
  const candidates: AuditCandidate[] = [
    { id: "gone", name: "Student Aadhaar Card", role: "SUPPORTING" }
  ];

  const result = await runWebAudit(
    { sessionId: "s1", schemeId: "pmc-azad-class10", candidates },
    { extract: async () => ok(response()) }
  );

  assert.deepEqual(result.unavailable, [{ documentId: "gone", name: "Student Aadhaar Card" }]);
  assert.equal(result.patches.length, 0);
});

test("progress is reported per file, in order", async () => {
  const seen: string[] = [];
  const candidates: AuditCandidate[] = [
    { id: "a", name: "Student Aadhaar Card", role: "SUPPORTING", file: PDF },
    { id: "b", name: "Student Bank Passbook Copy (with active IFSC)", role: "SUPPORTING", file: PDF }
  ];

  await runWebAudit(
    {
      sessionId: "s1",
      schemeId: "pmc-azad-class10",
      candidates,
      onProgress: (p) => seen.push(`${p.documentId}:${p.state}`)
    },
    { extract: async () => ok(response()) }
  );

  assert.deepEqual(seen, ["a:running", "a:done", "b:running", "b:done"]);
});

// --- session mapping --------------------------------------------------------

test("specsFromSession uses the authored config, else infers from the wording", () => {
  const specs = specsFromSession(
    [{ name: "Student Aadhaar Card" }, { name: "Weird Unmapped Paperwork" }],
    "pmc-azad-class10"
  );
  assert.deepEqual(specs[0].acceptedDocTypes, ["AADHAAR"]);
  assert.deepEqual(specs[1].acceptedDocTypes, []);
});

test("displayFieldsFor pulls masked identity values out of extracted fields", () => {
  const doc = toAuditDocument({
    id: "d",
    role: "SUPPORTING",
    response: response({
      fields: [
        field({ key: "holder_name", value: "RAMESH PATIL" }),
        field({ key: "account_number", value: "XXXX XXXX 4912" }),
        field({ key: "ifsc", value: "CNRB0005012" }),
        field({ key: "father_name", value: "DNYANESHWAR PATIL" })
      ]
    })
  });

  const display = displayFieldsFor(doc.fields);
  assert.equal(display.nameOnDocument, "RAMESH PATIL", "must not pick the father's name");
  assert.equal(display.accountNumber, "XXXX XXXX 4912");
  assert.equal(display.ifscCode, "CNRB0005012");
});

// --- the chat report --------------------------------------------------------

test("the chat report lists each document and each field check on its own line", () => {
  const result = {
    serviceUnavailable: false,
    documents: [],
    patches: [],
    unavailable: [],
    failed: [],
    audit: {
      requiredDocuments: [
        { name: "Student Aadhaar Card", status: "UPLOADED", reason: "matched" },
        { name: "Student Bank Passbook Copy", status: "MISSING", reason: "none" }
      ],
      fieldChecks: [
        { fieldKey: "applicant_name", formLabel: "Name of Applicant", status: "MATCH", formValue: "X", reason: "Matches after ignoring case." },
        { fieldKey: "date_of_birth", formLabel: "Date of Birth", status: "MISMATCH", formValue: "X", reason: "The dates are different days." }
      ],
      summary: { matches: 1, mismatches: 1, manualChecks: 0, uploaded: 1, missing: 1, needsReview: 0 }
    }
  } as unknown as WebAuditResult;

  const report = summarizeWebAudit(result, "Ward 14");
  const lines = report.split("\n");

  // The bubble renders with whitespace-pre-line, so the line structure must be real.
  assert.ok(lines.length >= 6, `expected a multi-line report, got ${lines.length} lines`);
  assert.ok(lines.some((line) => line.startsWith("✓ Student Aadhaar Card")));
  assert.ok(lines.some((line) => line.startsWith("✗ Student Bank Passbook Copy")));
  assert.ok(lines.some((line) => line.startsWith("✓ Name of Applicant")));
  assert.ok(lines.some((line) => line.startsWith("✗ Date of Birth")));
  assert.match(report, /Ward 14/);
  assert.match(report, /guidance only/);
});

test("the report says so when no form was uploaded, instead of implying a pass", () => {
  const result = {
    serviceUnavailable: false,
    documents: [],
    patches: [],
    unavailable: [],
    failed: [],
    audit: {
      requiredDocuments: [{ name: "Student Aadhaar Card", status: "UPLOADED", reason: "matched" }],
      fieldChecks: [],
      summary: { matches: 0, mismatches: 0, manualChecks: 0, uploaded: 1, missing: 0, needsReview: 0 }
    }
  } as unknown as WebAuditResult;

  assert.match(summarizeWebAudit(result, "Ward 14"), /No application form was uploaded/);
});
