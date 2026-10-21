// Tests for the LLM eligibility check (with an injected fake completer).

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkEligibilityWithLlm,
  normaliseEligibility,
  type EligibilityContext
} from "../../src/features/chatbot/eligibility-llm.ts";
import { EMPTY_FACTS } from "../../src/features/chatbot/types.ts";

const ELIGIBILITY_TEXT = [
  "Passed Class 12 (HSC) and admitted to a degree course.",
  "Minimum 80% marks in Class 12 (open category).",
  "Resident within Pune Municipal Corporation limits."
].join("\n");

const CONTEXT: EligibilityContext = {
  schemeName: "Lokshahir Annabhau Sathe Educational Assistance Scheme",
  eligibilityText: ELIGIBILITY_TEXT,
  benefitAmount: "Rs. 25,000",
  incomeLimit: 250000,
  cutoff: "Minimum 80% in Class 12",
  domicileYears: 3,
  facts: { ...EMPTY_FACTS, classLevel: "12TH_PASS", gender: "female" },
  rawQuery: "i passed 12th and want a scholarship"
};

test("parses a valid verdict and keeps only grounded quotes", () => {
  const result = normaliseEligibility(
    {
      verdict: "need_more_info",
      reasons: ["Income not known"],
      quoted_lines: [
        "Minimum 80% marks in Class 12 (open category).",
        "THIS LINE IS NOT IN THE TEXT"
      ],
      missing_info: ["marksPercent", "income"],
      questions: ["What percentage did you score in Class 12?"]
    },
    ELIGIBILITY_TEXT
  );
  assert.equal(result?.verdict, "need_more_info");
  assert.deepEqual(result?.quotedLines, ["Minimum 80% marks in Class 12 (open category)."]);
  assert.deepEqual(result?.missingInfo, ["marksPercent", "income"]);
  assert.equal(result?.source, "llm");
});

test("rejects an unknown verdict", () => {
  assert.equal(normaliseEligibility({ verdict: "maybe" }, ELIGIBILITY_TEXT), null);
});

test("returns the LLM result when a completer is provided", async () => {
  const result = await checkEligibilityWithLlm(CONTEXT, {
    complete: async () => ({
      verdict: "likely_eligible",
      reasons: ["Class 12 requirement met"],
      quoted_lines: ["Passed Class 12 (HSC) and admitted to a degree course."],
      missing_info: ["income"],
      questions: ["What is your family's annual income?"]
    })
  });
  assert.equal(result?.verdict, "likely_eligible");
  assert.equal(result?.quotedLines.length, 1);
});

test("returns null when the completer throws (caller falls back to rules)", async () => {
  const result = await checkEligibilityWithLlm(CONTEXT, {
    complete: async () => {
      throw new Error("provider down");
    }
  });
  assert.equal(result, null);
});

test("returns null when the model output is unusable", async () => {
  const result = await checkEligibilityWithLlm(CONTEXT, {
    complete: async () => ({ verdict: 42 })
  });
  assert.equal(result, null);
});