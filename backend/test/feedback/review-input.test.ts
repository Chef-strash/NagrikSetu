// Unit tests for review submission validation/sanitisation.

import test from "node:test";
import assert from "node:assert/strict";
import { validateReview } from "../../src/features/feedback/review-input.ts";

test("accepts a normal review and applies defaults", () => {
  const result = validateReview({ text: "The clerk asked for 2 passport photos with a paperclip." });
  assert.equal(result.ok, true);
  assert.equal(result.value?.author, "Citizen Applicant");
  assert.equal(result.value?.counter, "Citizen-reported");
  assert.equal(result.value?.severityLevel, "MEDIUM");
  assert.equal(result.value?.frictionTag, null);
});

test("rejects too-short and too-long text", () => {
  assert.equal(validateReview({ text: "short" }).ok, false);
  assert.equal(validateReview({ text: "x".repeat(1001) }).ok, false);
});

test("rejects Aadhaar-style numbers and long digit runs", () => {
  assert.equal(validateReview({ text: "My aadhaar is 1234 5678 9012 please note it." }).ok, false);
  assert.equal(validateReview({ text: "Call me on 9822012345 for details about the counter." }).ok, false);
});

test("rejects links and emails", () => {
  assert.equal(validateReview({ text: "See https://spam.example.com for more tips here." }).ok, false);
  assert.equal(validateReview({ text: "Email me at spam@example.com about the counter timings." }).ok, false);
});

test("keeps the reporter location and normalises the friction tag", () => {
  const result = validateReview({
    text: "Bring an extra photocopy of the income certificate to this counter.",
    ward: "Kothrud Ward 14, Counter 3",
    frictionTag: "photocopy demand",
    severityLevel: "high"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value?.counter, "Kothrud Ward 14, Counter 3");
  assert.equal(result.value?.frictionTag, "PHOTOCOPYDEMAND");
  assert.equal(result.value?.severityLevel, "HIGH");
});