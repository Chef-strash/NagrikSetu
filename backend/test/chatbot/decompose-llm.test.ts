// Tests for LLM query decomposition (with an injected fake completer).

import test from "node:test";
import assert from "node:assert/strict";
import { decomposeWithLlm, normaliseDecomposition } from "../../src/features/chatbot/decompose-llm.ts";

const GOOD = {
  intent: "DISCOVER_SCHEMES",
  scheme_query: null,
  scheme_category: "education",
  pillar: "EDUCATION",
  semantic_query: "scholarship to support studies after 12th",
  applicant_facts: {
    age: 22,
    gender: "female",
    class_level: "12TH_PASS",
    income: null,
    category: null
  },
  location: { explicitly_stated: null }
};

test("uses the LLM when a completer is provided and validates the output", async () => {
  const result = await decomposeWithLlm("anything", {}, { complete: async () => GOOD });
  assert.equal(result.source, "llm");
  assert.equal(result.decomposition.schemeCategory, "education");
  assert.equal(result.decomposition.pillar, "EDUCATION");
  assert.equal(result.decomposition.applicantFacts.age, 22);
  assert.equal(result.decomposition.applicantFacts.gender, "female");
  assert.equal(result.decomposition.applicantFacts.classLevel, "12TH_PASS");
  assert.ok(result.decomposition.unknownFacts.includes("income"));
});

test("falls back to the rule-based decomposer when the LLM throws", async () => {
  const result = await decomposeWithLlm("scholarship for 12th standard studies", {}, {
    complete: async () => {
      throw new Error("provider down");
    }
  });
  assert.equal(result.source, "rules");
  assert.equal(result.decomposition.schemeCategory, "education");
});

test("an unknown category from the LLM is discarded, not trusted", async () => {
  const result = await decomposeWithLlm("i need hospital dialysis help", {}, {
    complete: async () => ({ ...GOOD, scheme_category: "made-up", pillar: "NOPE" })
  });
  assert.equal(result.decomposition.schemeCategory, "healthcare");
  assert.equal(result.decomposition.pillar, "HEALTHCARE");
});

test("enum values are normalised case-insensitively", async () => {
  const result = await decomposeWithLlm("x", {}, {
    complete: async () => ({ ...GOOD, applicant_facts: { ...GOOD.applicant_facts, gender: "Female" } })
  });
  assert.equal(result.decomposition.applicantFacts.gender, "female");
});

test("normaliseDecomposition computes unknowns from validated facts", () => {
  const d = normaliseDecomposition(GOOD, "x");
  assert.deepEqual(d.unknownFacts.sort(), ["category", "domicileYears", "income", "marksPercent"]);
});