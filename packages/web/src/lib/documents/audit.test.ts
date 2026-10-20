import test from "node:test";
import assert from "node:assert/strict";
import { auditDocument, auditUploadedDocuments, type AuditableDocument } from "./audit.ts";

function doc(partial: Partial<AuditableDocument> & { id: string; name: string }): AuditableDocument {
  return {
    isUploaded: false,
    isVerified: false,
    ...partial
  };
}

process.env.NEXT_PUBLIC_DEMO_AUDIT = "true";

const OPTIONS = {
  beneficiaryName: "Pooja Ramesh Patil",
  counterLocation: "Kothrud - Bawdhan Ward Office No. 14, Counter No. 3"
};

const DOCS: AuditableDocument[] = [
  doc({ id: "d1", name: "Attested copy of Class 10 (SSC) Marksheet", isUploaded: true }),
  doc({ id: "d2", name: "Student Bank Passbook Copy (with active IFSC)", isUploaded: true }),
  doc({ id: "d3", name: "Student Aadhaar Card", isUploaded: true }),
  doc({ id: "d4", name: "Tahsildar Family Income Certificate (Financial Year 2025-26)" })
];

test("one audit pass verifies every uploaded document", () => {
  const result = auditUploadedDocuments(DOCS, OPTIONS);

  assert.equal(result.audited, 3);
  assert.equal(result.findings.length, 3);
  assert.deepEqual(
    result.findings.map((f) => f.docId).sort(),
    ["d1", "d2", "d3"]
  );
});

test("a document that was never uploaded is reported as pending, not silently skipped", () => {
  const result = auditUploadedDocuments(DOCS, OPTIONS);

  assert.equal(result.pending, 1);
  assert.equal(result.notUploaded, 1);
  assert.match(result.summary, /1 still pending \(1 not uploaded yet\)/);
});

test("the bank passbook resolves the merged Syndicate IFSC to Canara", () => {
  const result = auditUploadedDocuments(DOCS, OPTIONS);
  const bank = result.findings.find((f) => f.docId === "d2");

  assert.equal(bank?.patch.ifscCode, "CNRB0005012");
  assert.equal(bank?.patch.originalIfsc, "SYNB0005012");
  assert.match(bank?.note ?? "", /auto-updated to the active Canara Bank code/);
});

test("the Aadhaar number comes back masked and never fully exposed", () => {
  const result = auditUploadedDocuments(DOCS, OPTIONS);
  const aadhaar = result.findings.find((f) => f.docId === "d3");

  assert.equal(aadhaar?.patch.aadhaarMasked, "XXXX-XXXX-4912");
  assert.doesNotMatch(JSON.stringify(result), /\b\d{12}\b/);
});

test("every finding records the holder's name and marks the document verified", () => {
  const result = auditUploadedDocuments(DOCS, OPTIONS);
  for (const finding of result.findings) {
    assert.equal(finding.patch.isVerified, true);
    assert.equal(finding.patch.nameOnDocument, "Pooja Ramesh Patil");
  }
});

test("re-running the audit leaves already-verified documents alone", () => {
  const verified = DOCS.map((d) => ({ ...d, isUploaded: true, isVerified: true }));
  const result = auditUploadedDocuments(verified, OPTIONS);

  assert.equal(result.audited, 0);
  assert.match(result.summary, /Every uploaded document has already been checked/);
});

test("a mixed state names what is checked and what is still missing", () => {
  const mixed = DOCS.map((d) => ({ ...d, isVerified: d.isUploaded }));
  const result = auditUploadedDocuments(mixed, OPTIONS);

  assert.equal(result.audited, 0);
  assert.match(result.summary, /All 3 uploaded documents are already checked/);
  assert.match(result.summary, /1 document still not uploaded/);
});

test("auditing with nothing uploaded explains what to do next", () => {
  const none = DOCS.map((d) => ({ ...d, isUploaded: false }));
  const result = auditUploadedDocuments(none, OPTIONS);

  assert.equal(result.audited, 0);
  assert.equal(result.notUploaded, 4);
  assert.match(result.summary, /Nothing to audit yet/);
});

test("a completed audit points at the counter for submission", () => {
  const all = DOCS.map((d) => ({ ...d, isUploaded: true }));
  const result = auditUploadedDocuments(all, OPTIONS);

  assert.equal(result.pending, 0);
  assert.match(result.summary, /take your papers to Kothrud - Bawdhan Ward Office No\. 14/);
});

test("auditDocument on a plain certificate marks it clear", () => {
  const finding = auditDocument(doc({ id: "x", name: "Student Aadhaar Card" }), "");
  assert.match(finding.note, /applicant/);
});

test("without demo flag the audit is honest and verifies nothing", () => {
  process.env.NEXT_PUBLIC_DEMO_AUDIT = "false";
  try {
    const result = auditUploadedDocuments(DOCS, OPTIONS);
    assert.equal(result.audited, 0);
    assert.equal(result.findings.length, 0);
    assert.match(result.summary, /offline - nothing was verified/);
  } finally {
    process.env.NEXT_PUBLIC_DEMO_AUDIT = "true";
  }
});
