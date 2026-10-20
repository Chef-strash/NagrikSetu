import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditSummaryRequest, fetchAuditSummary } from "./summary.ts";
import type { WebAuditResult } from "./run.ts";

const RESULT = {
  serviceUnavailable: false,
  documents: [
    {
      id: "form",
      role: "APPLICATION_FORM",
      documentType: "APPLICATION_FORM",
      fields: [{ key: "applicant_name", value: "RAMESH PATIL" }]
    },
    {
      id: "aad",
      role: "SUPPORTING",
      documentType: "AADHAAR",
      fields: [{ key: "aadhaar_number", value: "XXXX-XXXX-9012" }]
    }
  ],
  patches: [],
  unavailable: [],
  failed: [],
  audit: {
    requiredDocuments: [
      { name: "Student Aadhaar Card", status: "UPLOADED", reason: "Matched by document type AADHAAR." },
      { name: "Income Certificate", status: "MISSING", reason: "No uploaded document matched." }
    ],
    fieldChecks: [
      {
        fieldKey: "date_of_birth",
        formLabel: "Date of Birth",
        status: "MISMATCH",
        formValue: "12/01/1998",
        evidence: { documentId: "aad", documentType: "AADHAAR", value: "13/01/1998" },
        reason: "The dates are different days."
      }
    ],
    summary: { matches: 0, mismatches: 1, manualChecks: 0, uploaded: 1, missing: 1, needsReview: 0 }
  }
} as unknown as WebAuditResult;

const META = { schemeName: "Maulana Azad Class 10 Grant", language: "en", counterLocation: "Ward 14, Counter 5" };

test("PRIVACY: the payload carries statuses and reasons but NO values", () => {
  const payload = buildAuditSummaryRequest(RESULT, META);
  const serialized = JSON.stringify(payload);

  assert.ok(!serialized.includes("XXXX-XXXX-9012"), "a masked Aadhaar must never be sent");
  assert.ok(!serialized.includes("RAMESH PATIL"), "a holder name must never be sent");
  assert.ok(!serialized.includes("12/01/1998"), "a form value must never be sent");
  assert.ok(!serialized.includes("13/01/1998"), "an evidence value must never be sent");

  // ...but it still says enough to write a useful summary.
  assert.match(serialized, /Student Aadhaar Card/);
  assert.match(serialized, /MISSING/);
  assert.match(serialized, /The dates are different days\./);
});

test("the payload reports whether an application form was uploaded", () => {
  assert.equal(buildAuditSummaryRequest(RESULT, META).missingForm, false);

  const noForm = { ...RESULT, documents: [] } as unknown as WebAuditResult;
  assert.equal(buildAuditSummaryRequest(noForm, META).missingForm, true);
});

test("the payload counts unreadable files", () => {
  const withFailure = {
    ...RESULT,
    failed: [{ documentId: "x", name: "Income Certificate", reason: "unsupported_media_type" }]
  } as unknown as WebAuditResult;

  assert.equal(buildAuditSummaryRequest(withFailure, META).failedCount, 1);
});

test("a usable summary is returned", async () => {
  const summary = await fetchAuditSummary(buildAuditSummaryRequest(RESULT, META), (async () =>
    new Response(JSON.stringify({ summary: "Your income certificate is missing.", source: "llm" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as unknown as typeof fetch);

  assert.equal(summary, "Your income certificate is missing.");
});

test("everything that is not a usable summary falls back to null", async () => {
  const payload = buildAuditSummaryRequest(RESULT, META);

  // No LLM configured on the backend.
  assert.equal(
    await fetchAuditSummary(payload, (async () =>
      new Response(JSON.stringify({ summary: null, source: "unavailable" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch),
    null
  );

  // Backend unreachable.
  assert.equal(
    await fetchAuditSummary(payload, (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch),
    null
  );

  // Backend error.
  assert.equal(
    await fetchAuditSummary(payload, (async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 502 })) as unknown as typeof fetch),
    null
  );

  // A whitespace-only summary is not usable either.
  assert.equal(
    await fetchAuditSummary(payload, (async () =>
      new Response(JSON.stringify({ summary: "   " }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as unknown as typeof fetch),
    null
  );
});
