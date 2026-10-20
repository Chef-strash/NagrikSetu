import test from "node:test";
import assert from "node:assert/strict";
import {
  documentWarnings,
  guessDocumentType,
  toAuditDocument,
  type ExtractField,
  type ExtractResponse
} from "./adapt.ts";
import { verifyApplication } from "./verify.ts";
import { auditConfigFor } from "./rules.ts";

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
    document_type_guess: "UNKNOWN",
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

test("guessDocumentType maps the model's free text onto the document vocabulary", () => {
  assert.equal(guessDocumentType("Aadhaar Card"), "AADHAAR");
  assert.equal(guessDocumentType("AADHAAR"), "AADHAAR");
  assert.equal(guessDocumentType("Bank Passbook"), "BANK_PROOF");
  assert.equal(guessDocumentType("SSC Marksheet"), "MARKSHEET");
  assert.equal(guessDocumentType("Vending Certificate"), "VENDING_CERTIFICATE");
  assert.equal(guessDocumentType("Tahsildar Income Certificate"), "INCOME_CERTIFICATE");
  assert.equal(guessDocumentType("Recommendation Letter"), "RECOMMENDATION_LETTER");
  assert.equal(guessDocumentType("some random page"), "UNKNOWN");
  assert.equal(guessDocumentType(""), "UNKNOWN");
});

test("grounding decides confidence, and handwritten values are never trusted", () => {
  const build = (f: ExtractField) =>
    toAuditDocument({
      id: "d",
      role: "SUPPORTING",
      response: response({ fields: [f] })
    }).fields[0];

  assert.equal(build(field({ key: "name", value: "A", grounding: "text" })).confidence, 0.97);
  assert.equal(build(field({ key: "name", value: "A", grounding: "vision" })).confidence, 0.6);
  assert.equal(
    build(field({ key: "name", value: "A", grounding: "text", handwritten: true })).confidence,
    0.5
  );
});

test("the adapter prefers the service's comparison-normalised value", () => {
  const doc = toAuditDocument({
    id: "d",
    role: "SUPPORTING",
    response: response({ fields: [field({ key: "dob", value: "12/01/1998", normalized: "1998-01-12" })] })
  });
  assert.equal(doc.fields[0].value, "1998-01-12");
});

test("documentWarnings surfaces the service's review verdict and flags", () => {
  const warnings = documentWarnings(
    response({
      needs_review: true,
      has_signature: false,
      flags: [{ kind: "agent_flagged", detail: "The date column is crossed out" }]
    })
  );
  assert.match(warnings.join(" | "), /flagged this document for manual review/);
  assert.match(warnings.join(" | "), /crossed out/);
  assert.match(warnings.join(" | "), /No signature/);
});

// --- the whole pipeline, wired together ------------------------------------

test("end-to-end: /extract output -> adapter -> verifier produces MATCH", () => {
  const config = auditConfigFor("pmc-azad-class10");
  assert.ok(config);

  const form = toAuditDocument({
    id: "form",
    role: "APPLICATION_FORM",
    response: response({
      document_type_guess: "Application Form",
      fields: [
        field({ key: "applicant_name", label: "Name of Applicant", value: "Ramesh Dnyaneshwar Patil" })
      ]
    })
  });

  const aadhaar = toAuditDocument({
    id: "aad",
    role: "SUPPORTING",
    response: response({
      document_type_guess: "Aadhaar Card",
      fields: [field({ key: "name", label: "Name", value: "Patil Ramesh Dnyaneshwar" })]
    })
  });

  assert.equal(form.documentType, "APPLICATION_FORM");
  assert.equal(aadhaar.documentType, "AADHAAR");

  const result = verifyApplication({
    documents: [form, aadhaar],
    requiredDocuments: config.requiredDocuments,
    rules: config.rules
  });

  const nameCheck = result.fieldChecks.find((check) => check.fieldKey === "applicant_name");
  assert.equal(nameCheck?.status, "MATCH");
  assert.equal(result.requiredDocuments.find((d) => d.name.includes("Aadhaar"))?.status, "UPLOADED");
});

test("end-to-end: a model-only (vision) read becomes MANUAL_CHECK, not a verdict", () => {
  const config = auditConfigFor("pmc-azad-class10");
  assert.ok(config);

  const form = toAuditDocument({
    id: "form",
    role: "APPLICATION_FORM",
    response: response({
      fields: [field({ key: "applicant_name", value: "Ramesh Patil", grounding: "text" })]
    })
  });
  const aadhaar = toAuditDocument({
    id: "aad",
    role: "SUPPORTING",
    response: response({
      document_type_guess: "Aadhaar Card",
      needs_review: true,
      fields: [field({ key: "name", value: "Ramesh Patil", grounding: "vision" })]
    })
  });

  const result = verifyApplication({
    documents: [form, aadhaar],
    requiredDocuments: config.requiredDocuments,
    rules: config.rules
  });

  assert.equal(
    result.fieldChecks.find((check) => check.fieldKey === "applicant_name")?.status,
    "MANUAL_CHECK"
  );
});

test("KNOWN LIMITATION: masked identifiers compare on their surviving digits", () => {
  const config = auditConfigFor("pmc-azad-class10");
  assert.ok(config);
  const rule = config.rules.filter((candidate) => candidate.fieldKey === "aadhaar_number");

  const run = (formValue: string, docValue: string) =>
    verifyApplication({
      documents: [
        toAuditDocument({
          id: "form",
          role: "APPLICATION_FORM",
          response: response({ fields: [field({ key: "aadhaar_number", value: formValue })] })
        }),
        toAuditDocument({
          id: "aad",
          role: "SUPPORTING",
          response: response({
            document_type_guess: "Aadhaar Card",
            fields: [field({ key: "aadhaar", value: docValue })]
          })
        })
      ],
      requiredDocuments: config.requiredDocuments,
      rules: rule
    }).fieldChecks[0].status;

  // Same trailing 4 digits -> MATCH (this is the whole point of the masker).
  assert.equal(run("XXXX-XXXX-9012", "XXXX-XXXX-9012"), "MATCH");
  // Different trailing digits -> MISMATCH, still caught.
  assert.equal(run("XXXX-XXXX-9012", "XXXX-XXXX-1234"), "MISMATCH");
});
