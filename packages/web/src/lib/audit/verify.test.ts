import test from "node:test";
import assert from "node:assert/strict";
import { verifyApplication } from "./verify.ts";
import { auditConfigFor } from "./rules.ts";
import type { AuditDocument, FieldRule } from "./types.ts";

const NAME_RULE: FieldRule = {
  fieldKey: "applicant_name",
  formLabel: "Name of Applicant",
  acceptedDocTypes: ["AADHAAR"],
  comparisonRule: "NORMALIZED_TEXT"
};

function doc(partial: Partial<AuditDocument> & { id: string }): AuditDocument {
  return { role: "SUPPORTING", documentType: "UNKNOWN", fields: [], ...partial };
}

function run(documents: AuditDocument[], rules: FieldRule[] = [NAME_RULE]) {
  return verifyApplication({
    documents,
    requiredDocuments: [{ name: "Aadhaar Card", acceptedDocTypes: ["AADHAAR"] }],
    rules
  });
}

test("MATCH when the form name equals the Aadhaar name after normalization", () => {
  const result = run([
    doc({
      id: "form",
      role: "APPLICATION_FORM",
      documentType: "APPLICATION_FORM",
      fields: [{ key: "applicant_name", label: "Name of Applicant", value: "Ramesh Dnyaneshwar Patil", confidence: 0.97 }]
    }),
    doc({
      id: "aad",
      documentType: "AADHAAR",
      fields: [{ key: "name", label: "Name", value: "Patil Ramesh Dnyaneshwar", confidence: 0.95 }]
    })
  ]);

  assert.equal(result.fieldChecks[0].status, "MATCH");
  assert.equal(result.fieldChecks[0].evidence?.documentType, "AADHAAR");
  assert.equal(result.summary.matches, 1);
});

test("MISMATCH when the two names genuinely differ", () => {
  const result = run([
    doc({ id: "form", role: "APPLICATION_FORM", fields: [{ key: "applicant_name", value: "Ramesh Patil", confidence: 0.99 }] }),
    doc({ id: "aad", documentType: "AADHAAR", fields: [{ key: "name", value: "Ramesh Patil Kumar", confidence: 0.96 }] })
  ]);

  assert.equal(result.fieldChecks[0].status, "MISMATCH");
  assert.equal(result.summary.mismatches, 1);
});

test("MANUAL_CHECK when no supporting document of an accepted type was uploaded", () => {
  const result = run([
    doc({ id: "form", role: "APPLICATION_FORM", fields: [{ key: "applicant_name", value: "Ramesh Patil", confidence: 0.99 }] })
  ]);

  assert.equal(result.fieldChecks[0].status, "MANUAL_CHECK");
});

test("MANUAL_CHECK when the supporting value was read with low confidence", () => {
  const result = run([
    doc({ id: "form", role: "APPLICATION_FORM", fields: [{ key: "applicant_name", value: "Ramesh Patil", confidence: 0.99 }] }),
    doc({ id: "aad", documentType: "AADHAAR", fields: [{ key: "name", value: "Ramesh Patil", confidence: 0.4 }] })
  ]);

  assert.equal(result.fieldChecks[0].status, "MANUAL_CHECK");
});

test("MANUAL_CHECK when the form has no such field at all", () => {
  const result = run([
    doc({ id: "form", role: "APPLICATION_FORM", fields: [{ key: "something_else", value: "x" }] }),
    doc({ id: "aad", documentType: "AADHAAR", fields: [{ key: "name", value: "Ramesh Patil" }] })
  ]);

  assert.equal(result.fieldChecks[0].status, "MANUAL_CHECK");
  assert.match(result.fieldChecks[0].reason, /not found on the uploaded application form/);
});

test("every detected form field gets a status — unruled fields are MANUAL_CHECK, not dropped", () => {
  const result = run([
    doc({
      id: "form",
      role: "APPLICATION_FORM",
      fields: [
        { key: "applicant_name", value: "Ramesh Patil", confidence: 0.99 },
        { key: "some_other_field", label: "Ward Name", value: "Kothrud", confidence: 0.99 }
      ]
    }),
    doc({ id: "aad", documentType: "AADHAAR", fields: [{ key: "name", value: "Ramesh Patil" }] })
  ]);

  assert.equal(result.fieldChecks.length, 2);
  const other = result.fieldChecks.find((check) => check.fieldKey === "some_other_field");
  assert.equal(other?.status, "MANUAL_CHECK");
  assert.match(other?.reason ?? "", /No comparison rule is configured/);
});

test("required documents are marked UPLOADED / MISSING", () => {
  assert.equal(run([doc({ id: "aad", documentType: "AADHAAR" })]).requiredDocuments[0].status, "UPLOADED");

  const missing = verifyApplication({
    documents: [],
    requiredDocuments: [{ name: "Income Certificate", acceptedDocTypes: ["INCOME_CERTIFICATE"] }],
    rules: []
  });
  assert.equal(missing.requiredDocuments[0].status, "MISSING");
  assert.equal(missing.summary.missing, 1);
});

test("NEEDS_REVIEW when an uploaded file could not be classified", () => {
  const result = verifyApplication({
    documents: [doc({ id: "u", documentType: "UNKNOWN" })],
    requiredDocuments: [{ name: "Aadhaar Card", acceptedDocTypes: ["AADHAAR"] }],
    rules: []
  });

  assert.equal(result.requiredDocuments[0].status, "NEEDS_REVIEW");
  assert.equal(result.summary.needsReview, 1);
});

test("one uploaded file cannot satisfy two required documents", () => {
  const result = verifyApplication({
    documents: [doc({ id: "aad", documentType: "AADHAAR" })],
    requiredDocuments: [
      { name: "Aadhaar Card", acceptedDocTypes: ["AADHAAR"] },
      { name: "Identity Proof", acceptedDocTypes: ["AADHAAR"] }
    ],
    rules: []
  });

  assert.equal(result.requiredDocuments[0].status, "UPLOADED");
  assert.equal(result.requiredDocuments[1].status, "NEEDS_REVIEW");
});

test("the authored scheme config matches the scheme's own requirement lists", () => {
  const azad = auditConfigFor("pmc-azad-class10");
  assert.ok(azad);
  assert.equal(azad.requiredDocuments.length, 7);
  assert.ok(azad.rules.some((rule) => rule.fieldKey === "applicant_name"));

  const svanidhi = auditConfigFor("pmc-svanidhi-hawker");
  assert.ok(svanidhi);
  assert.equal(svanidhi.requiredDocuments.length, 4);

  assert.equal(auditConfigFor("pmc-does-not-exist"), null);
});
